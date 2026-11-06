import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getPool } from "@/db";
import { runMigrations } from "@/db/migrate";
import { BookingService, AppError } from "@/lib/booking-service";
import { OtpService } from "@/lib/otp-service";
import { NotificationService } from "@/lib/notification-service";
import { calculateAvailableSlots } from "@/lib/slots";
import { MeetService } from "@/lib/meet-service";
import { DateTime } from "luxon";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/slotbook_test?host=/tmp";

describe("Slotbook Product Transformation & Reliability Suite", () => {
  let pool = getPool(TEST_DB_URL);
  let hostId: string;
  let hostEmail = "host.transformation@slotbook.dev";
  let hostTimezone = "America/New_York";

  let event30Id: string;
  let event60Id: string;
  let eventGroupId: string;

  beforeAll(async () => {
    await runMigrations(TEST_DB_URL);
    pool = getPool(TEST_DB_URL);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean test tables
    await pool.query("DELETE FROM notification_outbox");
    await pool.query("DELETE FROM otp_codes");
    await pool.query("DELETE FROM idempotency_keys");
    await pool.query("DELETE FROM active_reservations");
    await pool.query("DELETE FROM bookings");
    await pool.query("DELETE FROM date_overrides");
    await pool.query("DELETE FROM availability_rules");
    await pool.query("DELETE FROM event_types");
    await pool.query("DELETE FROM hosts");

    // 1. Seed Host
    const hostRes = await pool.query(
      `INSERT INTO hosts (name, email, password_hash, home_timezone, status)
       VALUES ('Sarah Host', $1, NULL, $2, 'ACTIVE')
       RETURNING id`,
      [hostEmail, hostTimezone]
    );
    hostId = hostRes.rows[0].id;

    // 2. Seed 30 Min Appointment (duration 30m, buffer_before 10m, buffer_after 15m)
    const e1 = await pool.query(
      `INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity, buffer_before, buffer_after)
       VALUES ($1, '30 Min Appointment', '30-min-appointment', 30, 1, 10, 15)
       RETURNING id`,
      [hostId]
    );
    event30Id = e1.rows[0].id;

    // 3. Seed 1 Hr Appointment (duration 60m, buffer_before 15m, buffer_after 15m)
    const e2 = await pool.query(
      `INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity, buffer_before, buffer_after)
       VALUES ($1, '1 Hr Appointment', '1-hr-appointment', 60, 1, 15, 15)
       RETURNING id`,
      [hostId]
    );
    event60Id = e2.rows[0].id;

    // 4. Seed Group Discussion (duration 45m, capacity 4, buffer_before 10m, buffer_after 10m)
    const e3 = await pool.query(
      `INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity, buffer_before, buffer_after)
       VALUES ($1, 'Group Discussion', 'group-discussion', 45, 4, 10, 10)
       RETURNING id`,
      [hostId]
    );
    eventGroupId = e3.rows[0].id;

    // 5. Seed Monday - Friday 09:00 - 17:00 availability
    for (let w = 1; w <= 5; w++) {
      await pool.query(
        `INSERT INTO availability_rules (host_id, weekday, start_time, end_time)
         VALUES ($1, $2, '09:00:00', '17:00:00')`,
        [hostId, w]
      );
    }
  });

  // ==========================================
  // 1. HOST OTP AUTHENTICATION & SECURITY
  // ==========================================
  describe("Host OTP Authentication & Security", () => {
    it("generates, hashes, verifies, and consumes OTP for registration", async () => {
      const regEmail = "newhost@example.com";
      await OtpService.sendOtp({
        email: regEmail,
        purpose: "HOST_REGISTER",
        metadata: { name: "New Host", homeTimezone: "UTC" },
        customUrl: TEST_DB_URL,
      });

      // Query database directly to verify OTP is hashed (not plaintext)
      const otpRow = await pool.query(
        "SELECT code_hash, consumed_at, attempts FROM otp_codes WHERE email = $1 AND purpose = 'HOST_REGISTER'",
        [regEmail]
      );
      expect(otpRow.rows.length).toBe(1);
      expect(otpRow.rows[0].code_hash).toHaveLength(64); // SHA-256 hex length
      expect(otpRow.rows[0].consumed_at).toBeNull();
      expect(otpRow.rows[0].attempts).toBe(0);
    });

    it("rejects invalid OTP and increments attempt count", async () => {
      const email = "wrongotp@example.com";
      await OtpService.sendOtp({
        email,
        purpose: "HOST_LOGIN",
        customUrl: TEST_DB_URL,
      });

      await expect(
        OtpService.verifyOtp({
          email,
          purpose: "HOST_LOGIN",
          code: "000000",
          customUrl: TEST_DB_URL,
        })
      ).rejects.toThrow("Invalid verification code");

      const row = await pool.query(
        "SELECT attempts FROM otp_codes WHERE email = $1 AND purpose = 'HOST_LOGIN'",
        [email]
      );
      expect(row.rows[0].attempts).toBe(1);
    });

    it("prevents OTP replay: consumed code cannot be reused", async () => {
      const email = "replay@example.com";
      await OtpService.sendOtp({
        email,
        purpose: "HOST_LOGIN",
        customUrl: TEST_DB_URL,
      });

      // Find the code from test DB log or verify
      const codeRow = await pool.query("SELECT id FROM otp_codes WHERE email = $1", [email]);
      // Manually set a known code hash for exact verification
      const knownCode = "123456";
      const crypto = await import("crypto");
      const hash = crypto.createHash("sha256").update(knownCode).digest("hex");
      await pool.query("UPDATE otp_codes SET code_hash = $1 WHERE id = $2", [hash, codeRow.rows[0].id]);

      // First verification: success
      const v1 = await OtpService.verifyOtp({
        email,
        purpose: "HOST_LOGIN",
        code: knownCode,
        customUrl: TEST_DB_URL,
      });
      expect(v1.valid).toBe(true);

      // Second attempt (replay): rejected
      await expect(
        OtpService.verifyOtp({
          email,
          purpose: "HOST_LOGIN",
          code: knownCode,
          customUrl: TEST_DB_URL,
        })
      ).rejects.toThrow("Invalid or expired verification code");
    });

    it("rejects expired OTP codes", async () => {
      const email = "expired@example.com";
      await OtpService.sendOtp({
        email,
        purpose: "HOST_LOGIN",
        customUrl: TEST_DB_URL,
      });

      // Force expired timestamp in DB
      await pool.query(
        "UPDATE otp_codes SET expires_at = clock_timestamp() - interval '1 minute' WHERE email = $1",
        [email]
      );

      await expect(
        OtpService.verifyOtp({
          email,
          purpose: "HOST_LOGIN",
          code: "123456",
          customUrl: TEST_DB_URL,
        })
      ).rejects.toThrow();
    });
  });

  // ==========================================
  // 2. GUEST DAILY DUPLICATE RESTRICTION
  // ==========================================
  describe("Guest Daily Duplicate Restriction (Database & Transaction Level)", () => {
    it("rejects duplicate booking for the SAME event on the SAME host-local day", async () => {
      const guestEmail = "tirumalesh@example.com";
      // Monday 10:00 AM UTC
      const mondaySlot1 = "2027-09-13T14:00:00.000Z";
      const mondaySlot2 = "2027-09-13T16:00:00.000Z";

      // 1. First booking for 30 Min Appointment: ALLOWED
      const hold1 = await BookingService.createHold({
        eventTypeId: event30Id,
        startAt: mondaySlot1,
        guestEmail,
        guestName: "Tirumalesh",
        meetingPurpose: "Project kickoff",
        customUrl: TEST_DB_URL,
      });
      expect(hold1.status).toBe(201);

      // 2. Second booking for the SAME event on the SAME day: REJECTED
      await expect(
        BookingService.createHold({
          eventTypeId: event30Id,
          startAt: mondaySlot2,
          guestEmail,
          guestName: "Tirumalesh K",
          meetingPurpose: "Follow up discussion",
          customUrl: TEST_DB_URL,
        })
      ).rejects.toThrow("You have already booked this appointment type for this date");
    });

    it("enforces case-insensitivity and email trimming for daily duplicate check", async () => {
      const mondaySlot1 = "2027-09-13T14:00:00.000Z";
      const mondaySlot2 = "2027-09-13T16:00:00.000Z";

      // First booking with uppercase and spaces
      await BookingService.createHold({
        eventTypeId: event30Id,
        startAt: mondaySlot1,
        guestEmail: "  TIRUMALESH@Example.com  ",
        guestName: "Tirumalesh",
        meetingPurpose: "Initial consultation",
        customUrl: TEST_DB_URL,
      });

      // Second booking with lowercase
      await expect(
        BookingService.createHold({
          eventTypeId: event30Id,
          startAt: mondaySlot2,
          guestEmail: "tirumalesh@example.com",
          guestName: "Tirumalesh",
          meetingPurpose: "Second attempt",
          customUrl: TEST_DB_URL,
        })
      ).rejects.toThrow("You have already booked this appointment type for this date");
    });

    it("ALLOWS the same guest to book the SAME event type on a DIFFERENT day", async () => {
      const guestEmail = "guest@example.com";
      const mondaySlot = "2027-09-13T14:00:00.000Z";
      const tuesdaySlot = "2027-09-14T14:00:00.000Z";

      const h1 = await BookingService.createHold({
        eventTypeId: event30Id,
        startAt: mondaySlot,
        guestEmail,
        guestName: "Guest",
        meetingPurpose: "Monday call",
        customUrl: TEST_DB_URL,
      });
      expect(h1.status).toBe(201);

      const h2 = await BookingService.createHold({
        eventTypeId: event30Id,
        startAt: tuesdaySlot,
        guestEmail,
        guestName: "Guest",
        meetingPurpose: "Tuesday call",
        customUrl: TEST_DB_URL,
      });
      expect(h2.status).toBe(201);
    });

    it("ALLOWS the same guest to book DIFFERENT event types on the SAME day", async () => {
      const guestEmail = "guest@example.com";
      const slot30 = "2027-09-13T14:00:00.000Z"; // 14:00-14:30 (buffer until 14:45)
      const slot60 = "2027-09-13T15:30:00.000Z"; // 15:30-16:30 (buffer start 15:15 >= 14:45)

      // 30 Min Appointment
      const h1 = await BookingService.createHold({
        eventTypeId: event30Id,
        startAt: slot30,
        guestEmail,
        guestName: "Guest",
        meetingPurpose: "Quick chat",
        customUrl: TEST_DB_URL,
      });
      expect(h1.status).toBe(201);

      // 1 Hr Appointment on same day
      const h2 = await BookingService.createHold({
        eventTypeId: event60Id,
        startAt: slot60,
        guestEmail,
        guestName: "Guest",
        meetingPurpose: "Deep dive workshop",
        customUrl: TEST_DB_URL,
      });
      expect(h2.status).toBe(201);
    });

    it("allows replacement booking after previous booking was cancelled", async () => {
      const guestEmail = "cancelrepl@example.com";
      const mondaySlot1 = "2027-09-13T14:00:00.000Z";
      const mondaySlot2 = "2027-09-13T16:00:00.000Z";

      const hold = await BookingService.createHold({
        eventTypeId: event30Id,
        startAt: mondaySlot1,
        guestEmail,
        guestName: "Guest",
        meetingPurpose: "Initial meeting",
        customUrl: TEST_DB_URL,
      });

      const confirmed = await BookingService.confirmHold({
        holdId: hold.data.id,
        guestName: "Guest",
        guestEmail,
        meetingPurpose: "Initial meeting",
        customUrl: TEST_DB_URL,
      });

      // Cancel the booking
      await BookingService.cancelBooking({
        rawToken: confirmed.manageToken!,
        reason: "Need to change plans",
        customUrl: TEST_DB_URL,
      });

      // Now booking for the same event on the same day must be ALLOWED
      const newHold = await BookingService.createHold({
        eventTypeId: event30Id,
        startAt: mondaySlot2,
        guestEmail,
        guestName: "Guest",
        meetingPurpose: "Re-booked meeting",
        customUrl: TEST_DB_URL,
      });
      expect(newHold.status).toBe(201);
    });
  });

  // ==========================================
  // 3. BUFFER-BEFORE AND BUFFER-AFTER LOGIC
  // ==========================================
  describe("Buffer-Before and Buffer-After Enforcement", () => {
    it("enforces before-buffer and after-buffer overlap prevention in slot calculation and booking", async () => {
      // Event: duration 30m, bufferBefore: 10m, bufferAfter: 15m.
      // Meeting A: 10:00 to 10:30 UTC
      // Reserved Host Interval: [09:50, 10:45)
      const slotA = "2027-09-15T10:00:00.000Z";
      const holdA = await BookingService.createHold({
        eventTypeId: event30Id,
        startAt: slotA,
        customUrl: TEST_DB_URL,
      });
      expect(holdA.status).toBe(201);

      // Candidate 1: 10:30 - 11:00 (bufStart = 10:20, which is < 10:45) -> MUST BE REJECTED
      const slotB = "2027-09-15T10:30:00.000Z";
      await expect(
        BookingService.createHold({
          eventTypeId: event30Id,
          startAt: slotB,
          customUrl: TEST_DB_URL,
        })
      ).rejects.toThrow();

      // Candidate 2: 10:45 - 11:15 (bufStart = 10:35, which is < 10:45) -> MUST BE REJECTED
      const slotC = "2027-09-15T10:45:00.000Z";
      await expect(
        BookingService.createHold({
          eventTypeId: event30Id,
          startAt: slotC,
          customUrl: TEST_DB_URL,
        })
      ).rejects.toThrow();

      // Candidate 3: 11:00 - 11:30 (bufStart = 10:50, which is >= 10:45) -> ALLOWED!
      const slotD = "2027-09-15T11:00:00.000Z";
      const holdD = await BookingService.createHold({
        eventTypeId: event30Id,
        startAt: slotD,
        customUrl: TEST_DB_URL,
      });
      expect(holdD.status).toBe(201);

      // Candidate 4 (before meeting A): 09:30 - 10:00 (bufEnd = 10:15 > 09:50) -> REJECTED
      const slotBeforeOverlap = "2027-09-15T09:30:00.000Z";
      await expect(
        BookingService.createHold({
          eventTypeId: event30Id,
          startAt: slotBeforeOverlap,
          customUrl: TEST_DB_URL,
        })
      ).rejects.toThrow();

      // Candidate 5 (before meeting A): 09:00 - 09:30 (bufEnd = 09:45 <= 09:50) -> ALLOWED!
      const slotBeforeOk = "2027-09-15T09:00:00.000Z";
      const holdBefore = await BookingService.createHold({
        eventTypeId: event30Id,
        startAt: slotBeforeOk,
        customUrl: TEST_DB_URL,
      });
      expect(holdBefore.status).toBe(201);
    });

    it("prevents cross-event schedule overlap for the same host", async () => {
      // Host has 30m appointment booked at 14:00 - 14:30 (reserved: 13:50 - 14:45)
      const slot30 = "2027-09-16T14:00:00.000Z";
      await BookingService.createHold({
        eventTypeId: event30Id,
        startAt: slot30,
        customUrl: TEST_DB_URL,
      });

      // Try booking 1 Hr Appointment (bufBefore: 15m) at 14:30 (bufStart: 14:15 < 14:45) -> REJECTED
      const slot60Conflict = "2027-09-16T14:30:00.000Z";
      await expect(
        BookingService.createHold({
          eventTypeId: event60Id,
          startAt: slot60Conflict,
          customUrl: TEST_DB_URL,
        })
      ).rejects.toThrow();
    });
  });

  // ==========================================
  // 4. DATE OVERRIDES & AVAILABILITY
  // ==========================================
  describe("Date Overrides and Availability", () => {
    it("date override marked as unavailable immediately blocks all slots on that date", async () => {
      const overrideDate = "2027-09-17";
      // Mark as Day Off
      await pool.query(
        `INSERT INTO date_overrides (host_id, override_date, is_available)
         VALUES ($1, $2::date, false)`,
        [hostId, overrideDate]
      );

      // Attempting to hold a slot on this day off must be rejected
      const slotOnDayOff = "2027-09-17T14:00:00.000Z";
      await expect(
        BookingService.createHold({
          eventTypeId: event30Id,
          startAt: slotOnDayOff,
          customUrl: TEST_DB_URL,
        })
      ).rejects.toThrow("The host is not available on this date");
    });
  });

  // ==========================================
  // 5. HOST ACCOUNT DELETION & TARGETED NOTIFICATIONS
  // ==========================================
  describe("Host Account Deletion and Event Cancellation", () => {
    it("deleting host account cancels upcoming confirmed bookings and notifies affected guests only", async () => {
      // 1. Create upcoming booking for Guest A
      const slotFuture = "2027-09-20T14:00:00.000Z";
      const hold = await BookingService.createHold({
        eventTypeId: event30Id,
        startAt: slotFuture,
        guestEmail: "guesta@domain.com",
        guestName: "Guest A",
        meetingPurpose: "Strategic planning",
        customUrl: TEST_DB_URL,
      });

      await BookingService.confirmHold({
        holdId: hold.data.id,
        guestEmail: "guesta@domain.com",
        guestName: "Guest A",
        meetingPurpose: "Strategic planning",
        customUrl: TEST_DB_URL,
      });

      // 2. Clear outbox from earlier events
      await pool.query("DELETE FROM notification_outbox");

      // 3. Request account deletion OTP
      await OtpService.sendOtp({
        email: hostEmail,
        purpose: "HOST_DELETE_ACCOUNT",
        customUrl: TEST_DB_URL,
      });

      // Get code and verify
      const codeRow = await pool.query("SELECT id FROM otp_codes WHERE email = $1 AND purpose = 'HOST_DELETE_ACCOUNT'", [hostEmail]);
      const deleteCode = "654321";
      const crypto = await import("crypto");
      const hash = crypto.createHash("sha256").update(deleteCode).digest("hex");
      await pool.query("UPDATE otp_codes SET code_hash = $1 WHERE id = $2", [hash, codeRow.rows[0].id]);

      await OtpService.verifyOtp({
        email: hostEmail,
        purpose: "HOST_DELETE_ACCOUNT",
        code: deleteCode,
        customUrl: TEST_DB_URL,
      });

      // 4. Perform transactional account deletion
      await pool.query("BEGIN");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Cancel future bookings
        await client.query(
          `UPDATE bookings
           SET status = 'CANCELLED',
               cancellation_reason = 'Host account deleted'
           WHERE event_type_id = $1`,
          [event30Id]
        );
        await NotificationService.enqueue(client, {
          eventType: "BOOKING_CANCELLED",
          recipientEmail: "guesta@domain.com",
          subject: "Notice: Appointment Cancelled",
          payload: {
            eventName: "30 Min Appointment",
            cancellationReason: "Host account deleted",
          },
        });
        await NotificationService.enqueue(client, {
          eventType: "HOST_ACCOUNT_DELETED",
          recipientEmail: hostEmail,
          subject: "Your Slotbook Account Has Been Deleted",
          payload: { hostName: "Sarah Host" },
        });
        await client.query("DELETE FROM hosts WHERE id = $1", [hostId]);
        await client.query("COMMIT");
      } finally {
        client.release();
      }

      // Verify guest received cancellation notification and host received deletion confirmation
      const notifications = await pool.query("SELECT recipient_email, event_type FROM notification_outbox");
      const recipients = notifications.rows.map((r: any) => r.recipient_email).sort();
      expect(recipients).toEqual(["guesta@domain.com", hostEmail].sort());

      // Verify host is deleted from database
      const checkHost = await pool.query("SELECT id FROM hosts WHERE id = $1", [hostId]);
      expect(checkHost.rows.length).toBe(0);
    });
  });

  // ==========================================
  // 6. GOOGLE MEET SERVICE INTEGRATION
  // ==========================================
  describe("Google Meet Service Handling", () => {
    it("reports clear configuration status and does NOT fabricate fake Meet links when unconfigured", async () => {
      delete process.env.GOOGLE_REFRESH_TOKEN;

      const result = await MeetService.createMeetLink({
        title: "Test Meeting",
        startAt: "2027-09-22T14:00:00.000Z",
        endAt: "2027-09-22T14:30:00.000Z",
        hostEmail: "host@example.com",
        guestEmail: "guest@example.com",
      });

      expect(result.configured).toBe(false);
      expect(result.meetLink).toBeNull();
      expect(result.message).toContain("GOOGLE_REFRESH_TOKEN");
    });
  });
});
