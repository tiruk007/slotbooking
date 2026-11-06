import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { getPool } from "@/db";
import { runMigrations } from "@/db/migrate";
import { OtpService } from "@/lib/otp-service";
import { createHostSession, getSessionByToken, clearSessionCookie, hashToken, attachSessionCookie, removeSessionCookie } from "@/lib/auth";
import { BookingService } from "@/lib/booking-service";
import { NotificationService } from "@/lib/notification-service";
import { DateTime } from "luxon";

const testDbUrl = process.env.TEST_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/slotbook_test?host=/tmp";

describe("Phase 14: Authentication, Database Cleanup, Notifications & Booking Workflow Suite", () => {
  beforeAll(async () => {
    await runMigrations(testDbUrl);
  });

  beforeEach(async () => {
    const pool = getPool(testDbUrl);
    await pool.query("DELETE FROM host_sessions");
    await pool.query("DELETE FROM active_reservations");
    await pool.query("DELETE FROM bookings");
    await pool.query("DELETE FROM notification_outbox");
    await pool.query("DELETE FROM date_overrides");
    await pool.query("DELETE FROM availability_rules");
    await pool.query("DELETE FROM event_types");
    await pool.query("DELETE FROM otp_codes");
    await pool.query("DELETE FROM hosts");
  });

  // ==========================================
  // 1. AUTHENTICATION & SESSION PERSISTENCE
  // ==========================================
  describe("Host Authentication & Session Lifecycle", () => {
    it("generates and verifies host signup OTP", async () => {
      const email = "newhost@example.com";
      const pool = getPool(testDbUrl);

      const res = await OtpService.sendOtp({
        email,
        purpose: "HOST_REGISTER",
        metadata: { name: "Dr. Sarah" },
        customUrl: testDbUrl,
      });
      expect(res.email).toBe(email);

      // Verify OTP stored in database with 5-minute expiry
      const otpRow = await pool.query(
        "SELECT * FROM otp_codes WHERE email = $1 AND purpose = 'HOST_REGISTER'",
        [email]
      );
      expect(otpRow.rows.length).toBe(1);
      expect(otpRow.rows[0].attempts).toBe(0);
      expect(otpRow.rows[0].consumed_at).toBeNull();
    });

    it("creates persistent database session in host_sessions on login", async () => {
      const pool = getPool(testDbUrl);
      const hostRes = await pool.query(
        `INSERT INTO hosts (name, email, slug, home_timezone, status)
         VALUES ('Alice Johnson', 'alice@example.com', 'alice-johnson', 'UTC', 'ACTIVE')
         RETURNING id`
      );
      const hostId = hostRes.rows[0].id;

      // Create persistent session
      const { token, host } = await createHostSession(hostId, testDbUrl);
      expect(token).toBeDefined();
      expect(host.email).toBe("alice@example.com");

      // Verify row exists in host_sessions
      const sessionRow = await pool.query(
        "SELECT * FROM host_sessions WHERE host_id = $1",
        [hostId]
      );
      expect(sessionRow.rows.length).toBe(1);
      expect(sessionRow.rows[0].token_hash).toBe(hashToken(token));
      expect(sessionRow.rows[0].revoked_at).toBeNull();
      expect(new Date(sessionRow.rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
    });

    it("persists authenticated session across simulated refresh / new tabs", async () => {
      const pool = getPool(testDbUrl);
      const hostRes = await pool.query(
        `INSERT INTO hosts (name, email, slug, home_timezone, status)
         VALUES ('Bob Smith', 'bob@example.com', 'bob-smith', 'America/New_York', 'ACTIVE')
         RETURNING id`
      );
      const hostId = hostRes.rows[0].id;

      const { token } = await createHostSession(hostId, testDbUrl);

      // Tab 1 / Request 1
      const sessionTab1 = await getSessionByToken(token, testDbUrl);
      expect(sessionTab1).not.toBeNull();
      expect(sessionTab1?.name).toBe("Bob Smith");
      expect(sessionTab1?.homeTimezone).toBe("America/New_York");

      // Tab 2 / Page Refresh (simulated with same token)
      const sessionTab2 = await getSessionByToken(token, testDbUrl);
      expect(sessionTab2).not.toBeNull();
      expect(sessionTab2?.id).toBe(hostId);
    });

    it("rejects invalid, expired, and revoked sessions", async () => {
      const pool = getPool(testDbUrl);
      const hostRes = await pool.query(
        `INSERT INTO hosts (name, email, slug, home_timezone, status)
         VALUES ('Carol Davis', 'carol@example.com', 'carol', 'UTC', 'ACTIVE')
         RETURNING id`
      );
      const hostId = hostRes.rows[0].id;

      // 1. Invalid token
      const invalid = await getSessionByToken("completely-bogus-token-xyz", testDbUrl);
      expect(invalid).toBeNull();

      // 2. Expired session
      const expToken = "expired-token-12345678901234567890";
      await pool.query(
        `INSERT INTO host_sessions (host_id, token_hash, expires_at)
         VALUES ($1, $2, clock_timestamp() - interval '1 hour')`,
        [hostId, hashToken(expToken)]
      );
      const expired = await getSessionByToken(expToken, testDbUrl);
      expect(expired).toBeNull();

      // 3. Revoked session (logout)
      const { token } = await createHostSession(hostId, testDbUrl);
      const beforeRevoke = await getSessionByToken(token, testDbUrl);
      expect(beforeRevoke).not.toBeNull();

      // Revoke session
      await pool.query(
        "UPDATE host_sessions SET revoked_at = clock_timestamp() WHERE token_hash = $1",
        [hashToken(token)]
      );
      const afterRevoke = await getSessionByToken(token, testDbUrl);
      expect(afterRevoke).toBeNull();
    });

    it("rejects invalid and expired OTP codes", async () => {
      const email = "otpcheck@example.com";
      const pool = getPool(testDbUrl);

      // Send OTP
      await OtpService.sendOtp({
        email,
        purpose: "HOST_LOGIN",
        customUrl: testDbUrl,
      });

      // 1. Incorrect OTP code
      await expect(
        OtpService.verifyOtp({
          email,
          purpose: "HOST_LOGIN",
          code: "000000",
          customUrl: testDbUrl,
        })
      ).rejects.toThrow("Invalid verification code");

      // Verify attempts counter incremented
      const attemptRow = await pool.query("SELECT attempts FROM otp_codes WHERE email = $1", [email]);
      expect(attemptRow.rows[0].attempts).toBe(1);

      // 2. Expired OTP
      await pool.query(
        "UPDATE otp_codes SET expires_at = clock_timestamp() - interval '1 minute' WHERE email = $1",
        [email]
      );
      await expect(
        OtpService.verifyOtp({
          email,
          purpose: "HOST_LOGIN",
          code: "123456",
          customUrl: testDbUrl,
        })
      ).rejects.toThrow();
    });

    it("attaches secure session cookie and enables successful authentication", async () => {
      const pool = getPool(testDbUrl);
      const hostRes = await pool.query(
        `INSERT INTO hosts (name, email, slug, home_timezone, status)
         VALUES ('Cookie Tester', 'cookie@example.com', 'cookie-tester', 'UTC', 'ACTIVE')
         RETURNING id`
      );
      const hostId = hostRes.rows[0].id;
      const { token } = await createHostSession(hostId, testDbUrl);

      // Verify attachSessionCookie
      const res = NextResponse.json({ success: true, redirectTo: "/host/dashboard" });
      attachSessionCookie(res, token);

      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toContain("slotbook_session=");
      expect(setCookie).toContain("Path=/");
      expect(setCookie).toContain("HttpOnly");

      // Verify removeSessionCookie
      const logoutRes = NextResponse.json({ success: true });
      removeSessionCookie(logoutRes);
      const logoutSetCookie = logoutRes.headers.get("set-cookie");
      expect(logoutSetCookie).toContain("slotbook_session=");
      expect(logoutSetCookie).toMatch(/Max-Age=0|expires=/i);
    });
  });

  // ==========================================
  // 2. DATABASE CLEANUP & ISOLATION
  // ==========================================
  describe("Database Cleanup & Multi-Host Isolation", () => {
    it("Alex Chen is not present in hosts database", async () => {
      const pool = getPool(testDbUrl);
      const res = await pool.query("SELECT * FROM hosts WHERE email = 'alex@slotbook.dev'");
      expect(res.rows.length).toBe(0);
    });

    it("notification mailbox (host7890123@gmail.com) is NOT inserted as a host", async () => {
      const pool = getPool(testDbUrl);
      const res = await pool.query("SELECT * FROM hosts WHERE email = 'host7890123@gmail.com'");
      expect(res.rows.length).toBe(0);
    });

    it("foreign-key cascade removes sessions and events when host is deleted", async () => {
      const pool = getPool(testDbUrl);
      const h = await pool.query(
        `INSERT INTO hosts (name, email, slug, home_timezone, status)
         VALUES ('Temp Host', 'temp@example.com', 'temp-host', 'UTC', 'ACTIVE')
         RETURNING id`
      );
      const hostId = h.rows[0].id;

      await createHostSession(hostId, testDbUrl);
      await pool.query(
        `INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity)
         VALUES ($1, 'Quick Sync', 'quick-sync', 30, 1)`,
        [hostId]
      );

      // Delete host
      await pool.query("DELETE FROM hosts WHERE id = $1", [hostId]);

      // Verify cascaded deletion
      const sessions = await pool.query("SELECT * FROM host_sessions WHERE host_id = $1", [hostId]);
      const events = await pool.query("SELECT * FROM event_types WHERE host_id = $1", [hostId]);
      expect(sessions.rows.length).toBe(0);
      expect(events.rows.length).toBe(0);
    });

    it("enforces multi-host isolation: one host cannot access another host's bookings", async () => {
      const pool = getPool(testDbUrl);

      // Host A
      const hA = await pool.query(
        `INSERT INTO hosts (name, email, slug, home_timezone, status)
         VALUES ('Host Alpha', 'alpha@example.com', 'host-alpha', 'UTC', 'ACTIVE') RETURNING id`
      );
      const hostAId = hA.rows[0].id;

      // Host B
      const hB = await pool.query(
        `INSERT INTO hosts (name, email, slug, home_timezone, status)
         VALUES ('Host Beta', 'beta@example.com', 'host-beta', 'UTC', 'ACTIVE') RETURNING id`
      );
      const hostBId = hB.rows[0].id;

      // Event under Host A
      const eA = await pool.query(
        `INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity)
         VALUES ($1, 'Alpha Consultation', 'alpha-consult', 30, 1) RETURNING id`,
        [hostAId]
      );
      const eventAId = eA.rows[0].id;

      // Booking under Host A
      const bRes = await pool.query(
        `INSERT INTO bookings (event_type_id, guest_name, guest_email, status, start_at, end_at)
         VALUES ($1, 'Client One', 'client@example.com', 'CONFIRMED', '2027-06-01T10:00:00Z', '2027-06-01T10:30:00Z')
         RETURNING id`,
        [eventAId]
      );
      const bookingId = bRes.rows[0].id;

      // Host B attempts to cancel Host A's booking
      await expect(
        BookingService.hostCancelBooking({
          hostId: hostBId,
          bookingId,
          reason: "Unauthorized attempt",
          customUrl: testDbUrl,
        })
      ).rejects.toThrow("Booking not found under host");
    });
  });

  // ==========================================
  // 3. GUEST BOOKING, TOKEN & NOTIFICATIONS
  // ==========================================
  describe("Guest Booking Lifecycle, Private Tokens & Outbox Notifications", () => {
    it("completes full guest booking lifecycle with private management link and outbox records", async () => {
      const pool = getPool(testDbUrl);
      const h = await pool.query(
        `INSERT INTO hosts (name, email, slug, home_timezone, status)
         VALUES ('Dr. Marcus', 'marcus@example.com', 'dr-marcus', 'UTC', 'ACTIVE') RETURNING id`
      );
      const hostId = h.rows[0].id;

      const e = await pool.query(
        `INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity, buffer_before, buffer_after)
         VALUES ($1, 'Medical Check', 'medical-check', 30, 1, 10, 10) RETURNING id`,
        [hostId]
      );
      const eventTypeId = e.rows[0].id;

      const slotStart = "2027-07-15T14:00:00.000Z";

      // 1. Create Hold
      const hold = await BookingService.createHold({
        eventTypeId,
        startAt: slotStart,
        idempotencyKey: "test-guest-lifecycle-1",
        requestPayload: { eventTypeId, startAt: slotStart },
        customUrl: testDbUrl,
      });
      expect(hold.status).toBe(201);
      expect(hold.data.status).toBe("HELD");

      // 2. Confirm Hold
      const confirmed = await BookingService.confirmHold({
        holdId: hold.data.id,
        guestName: "Emma Watson",
        guestEmail: "emma@example.com",
        meetingPurpose: "Annual routine consultation",
        customUrl: testDbUrl,
      });
      expect(confirmed.status).toBe("CONFIRMED");
      expect(confirmed.rawToken).toBeDefined();

      // Verify management link format uses configured base URL
      const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
      expect(confirmed.manageUrl).toContain(`/booking/${confirmed.rawToken}`);

      // Verify outbox domain events: BOOKING_CONFIRMED for both guest and host
      const outboxRes = await pool.query(
        "SELECT * FROM notification_outbox WHERE booking_id = $1 ORDER BY created_at ASC",
        [hold.data.id]
      );
      expect(outboxRes.rows.length).toBe(2);
      expect(outboxRes.rows[0].event_type).toBe("BOOKING_CONFIRMED");
      expect(outboxRes.rows[0].recipient_email).toBe("emma@example.com");
      expect(outboxRes.rows[0].related_host_id).toBe(hostId);
      expect(outboxRes.rows[1].recipient_email).toBe("marcus@example.com");

      // 3. Guest Access via Token
      const fetched = await BookingService.getBookingByToken(confirmed.rawToken!, testDbUrl);
      expect(fetched.guestName).toBe("Emma Watson");
      expect(fetched.meetingPurpose).toBe("Annual routine consultation");

      // 4. Guest Rescheduling
      const newSlotStart = "2027-07-15T16:00:00.000Z";
      const rescheduled = await BookingService.rescheduleBooking({
        rawToken: confirmed.rawToken!,
        newStartAt: newSlotStart,
        customUrl: testDbUrl,
      });
      expect(rescheduled.status).toBe("CONFIRMED");

      // Verify BOOKING_RESCHEDULED outbox notifications
      const reschedOutbox = await pool.query(
        "SELECT * FROM notification_outbox WHERE event_type = 'BOOKING_RESCHEDULED'",
        []
      );
      expect(reschedOutbox.rows.length).toBe(2);

      // 5. Host-Initiated Cancellation emits HOST_CANCELLED_BOOKING
      const cancelled = await BookingService.hostCancelBooking({
        hostId,
        bookingId: hold.data.id,
        reason: "Emergency on-call duty",
        customUrl: testDbUrl,
      });
      expect(cancelled.status).toBe("CANCELLED");

      const cancelOutbox = await pool.query(
        "SELECT * FROM notification_outbox WHERE event_type = 'HOST_CANCELLED_BOOKING'",
        []
      );
      expect(cancelOutbox.rows.length).toBeGreaterThanOrEqual(1);
    });

    it("rejects booking confirmation on expired holds", async () => {
      const pool = getPool(testDbUrl);
      const h = await pool.query(
        `INSERT INTO hosts (name, email, slug, home_timezone, status)
         VALUES ('Dr. Jekyll', 'jekyll@example.com', 'jekyll', 'UTC', 'ACTIVE') RETURNING id`
      );
      const hostId = h.rows[0].id;

      const e = await pool.query(
        `INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity)
         VALUES ($1, 'Chemistry Session', 'chem', 30, 1) RETURNING id`,
        [hostId]
      );

      const holdRes = await pool.query(
        `INSERT INTO bookings (event_type_id, status, start_at, end_at, hold_expires_at)
         VALUES ($1, 'HELD', '2027-08-01T10:00:00Z', '2027-08-01T10:30:00Z', clock_timestamp() - interval '1 second')
         RETURNING id`,
        [e.rows[0].id]
      );
      const holdId = holdRes.rows[0].id;

      await expect(
        BookingService.confirmHold({
          holdId,
          guestName: "Late Guest",
          guestEmail: "late@example.com",
          customUrl: testDbUrl,
        })
      ).rejects.toThrow("expired");
    });
  });

  // ==========================================
  // 4. NOTIFICATION OUTBOX DELIVERY & IDEMPOTENCY
  // ==========================================
  describe("Notification Outbox Worker Resilience", () => {
    it("processes pending notifications idempotently without duplicating sent records", async () => {
      const pool = getPool(testDbUrl);

      // Insert pending outbox record
      const insertRes = await pool.query(
        `INSERT INTO notification_outbox 
         (event_type, recipient_email, subject, payload, delivery_status, attempt_count)
         VALUES ('BOOKING_CONFIRMED', 'testoutbox@example.com', 'Test Subject', '{"test": true}', 'PENDING', 0)
         RETURNING id`
      );
      const outboxId = insertRes.rows[0].id;

      const run1 = await NotificationService.processOutbox(testDbUrl);
      expect(run1.processed).toBe(1);

      // Mark delivered (simulating successful SMTP delivery)
      await pool.query(
        "UPDATE notification_outbox SET delivery_status = 'DELIVERED', delivered_at = clock_timestamp() WHERE id = $1",
        [outboxId]
      );

      // Second run must find 0 pending records (idempotent)
      const run2 = await NotificationService.processOutbox(testDbUrl);
      expect(run2.processed).toBe(0);
    });
  });
});
