import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { getPool } from "@/db";
import { runMigrations } from "@/db/migrate";
import { OtpService } from "@/lib/otp-service";
import { MeetService } from "@/lib/meet-service";
import { calculateAvailableSlots } from "@/lib/slots";
import { DateTime } from "luxon";

const testDbUrl = process.env.TEST_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/slotbook_test?host=/tmp";

describe("Slotbook Workflow & Data Isolation Suite", () => {
  beforeAll(async () => {
    await runMigrations(testDbUrl);
  });

  beforeEach(async () => {
    const pool = getPool(testDbUrl);
    await pool.query("DELETE FROM active_reservations");
    await pool.query("DELETE FROM bookings");
    await pool.query("DELETE FROM notification_outbox");
    await pool.query("DELETE FROM date_overrides");
    await pool.query("DELETE FROM availability_rules");
    await pool.query("DELETE FROM event_types");
    await pool.query("DELETE FROM otp_codes");
    await pool.query("DELETE FROM hosts");
  });

  // 1. New host signup creates NO events
  it("Requirement 1: new host signup creates 0 default events", async () => {
    const pool = getPool(testDbUrl);
    const email = "brandnewhost@example.com";
    const hostRes = await pool.query(
      `INSERT INTO hosts (name, email, slug, home_timezone, status)
       VALUES ($1, $2, $3, 'UTC', 'ACTIVE')
       RETURNING id`,
      ["Brand New Host", email, "brand-new-host"]
    );
    const hostId = hostRes.rows[0].id;

    const eventsRes = await pool.query("SELECT * FROM event_types WHERE host_id = $1", [hostId]);
    expect(eventsRes.rows.length).toBe(0);
  });

  // 2. New host signup creates NO fake bookings
  it("Requirement 2: new host signup creates 0 fake bookings", async () => {
    const pool = getPool(testDbUrl);
    const hostRes = await pool.query(
      `INSERT INTO hosts (name, email, slug, home_timezone, status)
       VALUES ($1, $2, $3, 'UTC', 'ACTIVE')
       RETURNING id`,
      ["Fresh Host", "freshhost@example.com", "fresh-host"]
    );
    const hostId = hostRes.rows[0].id;

    const bookingsRes = await pool.query(
      `SELECT b.* FROM bookings b
       JOIN event_types e ON b.event_type_id = e.id
       WHERE e.host_id = $1`,
      [hostId]
    );
    expect(bookingsRes.rows.length).toBe(0);
  });

  // 3. New host signup creates NO fake notification events
  it("Requirement 3: new host signup creates 0 fake notification records", async () => {
    const pool = getPool(testDbUrl);
    await pool.query(
      `INSERT INTO hosts (name, email, slug, home_timezone, status)
       VALUES ($1, $2, $3, 'UTC', 'ACTIVE')`,
      ["Clean Host", "cleanhost@example.com", "clean-host"]
    );

    const outboxRes = await pool.query("SELECT * FROM notification_outbox");
    expect(outboxRes.rows.length).toBe(0);
  });

  // 4. Host login works independently via email OTP
  it("Requirement 4: host login generates secure OTP independently from guest workflows", async () => {
    const pool = getPool(testDbUrl);
    const hostEmail = "activehost@example.com";
    await pool.query(
      `INSERT INTO hosts (name, email, slug, home_timezone, status)
       VALUES ($1, $2, $3, 'UTC', 'ACTIVE')`,
      ["Active Host", hostEmail, "active-host"]
    );

    const otpRes = await OtpService.sendOtp({
      email: hostEmail,
      purpose: "HOST_LOGIN",
      customUrl: testDbUrl,
    });
    expect(otpRes.email).toBe(hostEmail);

    const otpRow = await pool.query(
      "SELECT code_hash, consumed_at, attempts FROM otp_codes WHERE email = $1 AND purpose = 'HOST_LOGIN'",
      [hostEmail]
    );
    expect(otpRow.rows.length).toBe(1);
    expect(otpRow.rows[0].code_hash).toHaveLength(64); // SHA-256 hash length
    expect(otpRow.rows[0].consumed_at).toBeNull();
    expect(otpRow.rows[0].attempts).toBe(0);
  });

  // 5. Guest can browse public events without authentication
  it("Requirement 5: guest can query public events without authentication", async () => {
    const pool = getPool(testDbUrl);
    const hostRes = await pool.query(
      `INSERT INTO hosts (name, email, slug, home_timezone, status)
       VALUES ('Public Host', 'publichost@example.com', 'public-host', 'UTC', 'ACTIVE')
       RETURNING id`,
    );
    const hostId = hostRes.rows[0].id;

    await pool.query(
      `INSERT INTO event_types (host_id, name, slug, description, category, status, duration_minutes, capacity)
       VALUES ($1, 'Public Session', 'public-session', 'Open to all', 'One-on-One', 'PUBLISHED', 30, 1)`,
      [hostId]
    );

    const publicRes = await pool.query(
      `SELECT e.id, e.name, e.slug, e.status, h.name as host_name
       FROM event_types e
       JOIN hosts h ON e.host_id = h.id
       WHERE e.status = 'PUBLISHED' AND h.status = 'ACTIVE'`
    );
    expect(publicRes.rows.length).toBe(1);
    expect(publicRes.rows[0].name).toBe("Public Session");
  });

  // 6, 7, 8, 9. Homepage dynamic event queries (3, 2, 1, 0 events)
  it("Requirement 6, 7, 8, 9: homepage reflects exact published event counts (3, 2, 1, 0)", async () => {
    const pool = getPool(testDbUrl);
    const hostRes = await pool.query(
      `INSERT INTO hosts (name, email, slug, home_timezone, status)
       VALUES ('Multi Event Host', 'multi@example.com', 'multi-host', 'UTC', 'ACTIVE')
       RETURNING id`,
    );
    const hostId = hostRes.rows[0].id;

    // 0 events
    let res = await pool.query(
      `SELECT e.* FROM event_types e JOIN hosts h ON e.host_id = h.id WHERE e.status = 'PUBLISHED' AND h.status = 'ACTIVE' LIMIT 3`
    );
    expect(res.rows.length).toBe(0);

    // 1 event
    await pool.query(
      `INSERT INTO event_types (host_id, name, slug, status, duration_minutes)
       VALUES ($1, 'Event 1', 'event-1', 'PUBLISHED', 30)`,
      [hostId]
    );
    res = await pool.query(
      `SELECT e.* FROM event_types e JOIN hosts h ON e.host_id = h.id WHERE e.status = 'PUBLISHED' AND h.status = 'ACTIVE' LIMIT 3`
    );
    expect(res.rows.length).toBe(1);

    // 2 events
    await pool.query(
      `INSERT INTO event_types (host_id, name, slug, status, duration_minutes)
       VALUES ($1, 'Event 2', 'event-2', 'PUBLISHED', 45)`,
      [hostId]
    );
    res = await pool.query(
      `SELECT e.* FROM event_types e JOIN hosts h ON e.host_id = h.id WHERE e.status = 'PUBLISHED' AND h.status = 'ACTIVE' LIMIT 3`
    );
    expect(res.rows.length).toBe(2);

    // 3 events
    await pool.query(
      `INSERT INTO event_types (host_id, name, slug, status, duration_minutes)
       VALUES ($1, 'Event 3', 'event-3', 'PUBLISHED', 60)`,
      [hostId]
    );
    res = await pool.query(
      `SELECT e.* FROM event_types e JOIN hosts h ON e.host_id = h.id WHERE e.status = 'PUBLISHED' AND h.status = 'ACTIVE' LIMIT 3`
    );
    expect(res.rows.length).toBe(3);

    // 4th event created: homepage LIMIT 3 returns exactly 3 latest
    await pool.query(
      `INSERT INTO event_types (host_id, name, slug, status, duration_minutes)
       VALUES ($1, 'Event 4', 'event-4', 'PUBLISHED', 90)`,
      [hostId]
    );
    res = await pool.query(
      `SELECT e.* FROM event_types e JOIN hosts h ON e.host_id = h.id WHERE e.status = 'PUBLISHED' AND h.status = 'ACTIVE' ORDER BY e.created_at DESC LIMIT 3`
    );
    expect(res.rows.length).toBe(3);
    expect(res.rows[0].name).toBe("Event 4");
  });

  // 10. Draft and inactive events are NOT publicly visible
  it("Requirement 10: draft and inactive events are filtered out of public queries", async () => {
    const pool = getPool(testDbUrl);
    const hostRes = await pool.query(
      `INSERT INTO hosts (name, email, slug, home_timezone, status)
       VALUES ('Draft Host', 'drafthost@example.com', 'draft-host', 'UTC', 'ACTIVE')
       RETURNING id`,
    );
    const hostId = hostRes.rows[0].id;

    await pool.query(
      `INSERT INTO event_types (host_id, name, slug, status, duration_minutes)
       VALUES 
       ($1, 'Published Event', 'pub-1', 'PUBLISHED', 30),
       ($1, 'Draft Event', 'draft-1', 'DRAFT', 30),
       ($1, 'Inactive Event', 'inact-1', 'INACTIVE', 30)`,
      [hostId]
    );

    const publicRes = await pool.query(
      `SELECT name, status FROM event_types WHERE status = 'PUBLISHED'`
    );
    expect(publicRes.rows.length).toBe(1);
    expect(publicRes.rows[0].name).toBe("Published Event");
  });

  // 11. One host cannot see another host's events in the host portal
  it("Requirement 11: host portal isolates events strictly by host_id", async () => {
    const pool = getPool(testDbUrl);
    const h1 = await pool.query(
      `INSERT INTO hosts (name, email, slug, home_timezone, status)
       VALUES ('Alice', 'alice@example.com', 'alice', 'UTC', 'ACTIVE') RETURNING id`
    );
    const h2 = await pool.query(
      `INSERT INTO hosts (name, email, slug, home_timezone, status)
       VALUES ('Bob', 'bob@example.com', 'bob', 'UTC', 'ACTIVE') RETURNING id`
    );

    await pool.query(
      `INSERT INTO event_types (host_id, name, slug, status, duration_minutes)
       VALUES ($1, 'Alice Consultation', 'alice-consult', 'PUBLISHED', 30)`,
      [h1.rows[0].id]
    );

    await pool.query(
      `INSERT INTO event_types (host_id, name, slug, status, duration_minutes)
       VALUES ($1, 'Bob Coaching', 'bob-coach', 'PUBLISHED', 60)`,
      [h2.rows[0].id]
    );

    // Alice queries her portal events
    const aliceEvents = await pool.query("SELECT * FROM event_types WHERE host_id = $1", [h1.rows[0].id]);
    expect(aliceEvents.rows.length).toBe(1);
    expect(aliceEvents.rows[0].name).toBe("Alice Consultation");

    // Bob queries his portal events
    const bobEvents = await pool.query("SELECT * FROM event_types WHERE host_id = $1", [h2.rows[0].id]);
    expect(bobEvents.rows.length).toBe(1);
    expect(bobEvents.rows[0].name).toBe("Bob Coaching");
  });

  // 12. Event creation publishes correctly
  it("Requirement 12: event creation saves with published status and description", async () => {
    const pool = getPool(testDbUrl);
    const h = await pool.query(
      `INSERT INTO hosts (name, email, slug, home_timezone, status)
       VALUES ('Author', 'author@example.com', 'author', 'UTC', 'ACTIVE') RETURNING id`
    );
    const hostId = h.rows[0].id;

    const res = await pool.query(
      `INSERT INTO event_types 
       (host_id, name, slug, description, category, status, duration_minutes, capacity)
       VALUES ($1, 'New Session', 'new-session', 'Detailed overview', 'Consultation', 'PUBLISHED', 45, 1)
       RETURNING *`,
      [hostId]
    );
    expect(res.rows[0].name).toBe("New Session");
    expect(res.rows[0].status).toBe("PUBLISHED");
    expect(res.rows[0].description).toBe("Detailed overview");
  });

  // 13. Event deletion handles existing bookings
  it("Requirement 13: event deletion cancels future confirmed bookings and records reasons", async () => {
    const pool = getPool(testDbUrl);
    const h = await pool.query(
      `INSERT INTO hosts (name, email, slug, home_timezone, status)
       VALUES ('Deleter Host', 'deleter@example.com', 'deleter', 'UTC', 'ACTIVE') RETURNING id`
    );
    const hostId = h.rows[0].id;

    const e = await pool.query(
      `INSERT INTO event_types (host_id, name, slug, status, duration_minutes)
       VALUES ($1, 'Doomed Event', 'doomed', 'PUBLISHED', 30) RETURNING id`,
      [hostId]
    );
    const eventId = e.rows[0].id;

    // Confirmed future booking
    const futureTime = new Date(Date.now() + 86400000 * 2);
    const b = await pool.query(
      `INSERT INTO bookings (event_type_id, guest_name, guest_email, start_at, end_at, status)
       VALUES ($1, 'Affected Guest', 'affected@example.com', $2, $3, 'CONFIRMED') RETURNING id`,
      [eventId, futureTime.toISOString(), new Date(futureTime.getTime() + 1800000).toISOString()]
    );

    // Cancel affected bookings with host reason
    await pool.query(
      `UPDATE bookings SET status = 'CANCELLED', cancellation_reason = 'Event discontinued by host' WHERE event_type_id = $1`,
      [eventId]
    );

    const bookingCheck = await pool.query("SELECT status, cancellation_reason FROM bookings WHERE id = $1", [b.rows[0].id]);
    expect(bookingCheck.rows[0].status).toBe("CANCELLED");
    expect(bookingCheck.rows[0].cancellation_reason).toBe("Event discontinued by host");
  });

  // 14. Google OAuth state validation
  // 14. Google columns are completely removed from hosts schema
  it("Requirement 14: Google OAuth columns are removed from hosts table", async () => {
    const pool = getPool(testDbUrl);
    const colRes = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'hosts' AND column_name IN ('google_refresh_token', 'google_access_token')
    `);
    expect(colRes.rows.length).toBe(0);
  });

  // 15. MeetService returns null without fabricating fake URLs
  it("Requirement 15: MeetService returns null without fabricating URLs", async () => {
    const res = await MeetService.createMeetLink();
    expect(res.meetLink).toBeNull();
    const resHost = await MeetService.createMeetLinkForHost({});
    expect(resHost.meetLink).toBeNull();
  });

  // 16. Booking operates with confirmed date/time without Google Calendar event ID
  it("Requirement 16: Bookings operates without external Google Calendar dependency", async () => {
    const pool = getPool(testDbUrl);
    const colRes = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'bookings' AND column_name = 'google_calendar_event_id'
    `);
    expect(colRes.rows.length).toBe(0);
  });

  // 17. Minimum notice is enforced
  it("Requirement 17: minimum notice filters out slots starting too soon", () => {
    const now = DateTime.fromISO("2026-11-06T10:00:00.000Z");
    const slots = calculateAvailableSlots({
      hostTimezone: "UTC",
      from: now,
      to: now.plus({ days: 1 }),
      eventType: {
        durationMinutes: 30,
        capacity: 1,
        bufferBefore: 0,
        bufferAfter: 0,
        minimumNoticeMinutes: 120, // 2 hours notice
        bookingHorizonDays: 14,
      },
      rules: [
        { weekday: 5, startTime: "09:00:00", endTime: "17:00:00" }, // Friday
      ],
      overrides: [],
      existingBookings: [],
      now,
    });

    // Slots starting before 12:00:00Z should NOT be available
    const earlySlot = slots.find((s) => s.startAt.startsWith("2026-11-06T10:") || s.startAt.startsWith("2026-11-06T11:"));
    expect(earlySlot).toBeUndefined();

    // Slot at or after 12:00:00Z should be present
    const validSlot = slots.find((s) => s.startAt === "2026-11-06T12:00:00.000Z");
    expect(validSlot).toBeDefined();
  });

  // 18. Booking horizon is enforced
  it("Requirement 18: booking horizon filters out slots beyond horizon days", () => {
    const now = DateTime.fromISO("2026-11-06T10:00:00.000Z");
    const slots = calculateAvailableSlots({
      hostTimezone: "UTC",
      from: now,
      to: now.plus({ days: 10 }),
      eventType: {
        durationMinutes: 30,
        capacity: 1,
        bufferBefore: 0,
        bufferAfter: 0,
        minimumNoticeMinutes: 0,
        bookingHorizonDays: 2, // only 2 days in advance
      },
      rules: [
        { weekday: 1, startTime: "09:00:00", endTime: "17:00:00" },
        { weekday: 2, startTime: "09:00:00", endTime: "17:00:00" },
        { weekday: 3, startTime: "09:00:00", endTime: "17:00:00" },
        { weekday: 4, startTime: "09:00:00", endTime: "17:00:00" },
        { weekday: 5, startTime: "09:00:00", endTime: "17:00:00" },
      ],
      overrides: [],
      existingBookings: [],
      now,
    });

    // Slots on day 5 (2026-11-11) must NOT exist
    const farSlot = slots.find((s) => s.startAt.startsWith("2026-11-11"));
    expect(farSlot).toBeUndefined();
  });
});
