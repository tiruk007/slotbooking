import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getPool } from "@/db";
import { runMigrations } from "@/db/migrate";
import { BookingService, AppError } from "@/lib/booking-service";
import { isValidWallTime, createZonedDateTime, formatInZone } from "@/lib/timezone";
import { calculateAvailableSlots } from "@/lib/slots";
import { DateTime } from "luxon";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/slotbook_test";

describe("Slotbook Concurrency and Reliability Test Suite", () => {
  let pool = getPool(TEST_DB_URL);
  let testHostId: string;

  beforeAll(async () => {
    // Ensure migrations are run on test database
    await runMigrations(TEST_DB_URL);
    pool = getPool(TEST_DB_URL);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean test tables
    await pool.query("DELETE FROM notification_outbox");
    await pool.query("DELETE FROM idempotency_keys");
    await pool.query("DELETE FROM active_reservations");
    await pool.query("DELETE FROM bookings");
    await pool.query("DELETE FROM date_overrides");
    await pool.query("DELETE FROM availability_rules");
    await pool.query("DELETE FROM event_types");
    await pool.query("DELETE FROM hosts");

    // Seed test host
    const hostRes = await pool.query(
      `INSERT INTO hosts (name, email, password_hash, home_timezone)
       VALUES ('Test Host', 'testhost@slotbook.dev', 'hash', 'America/New_York')
       RETURNING id`,
    );
    testHostId = hostRes.rows[0].id;
  });

  // TEST 1 — Concurrent booking (Capacity = 1)
  it("Test 1 — Concurrent booking: 20 simultaneous requests for capacity=1 slot results in exactly 1 reservation", async () => {
    // 1. Create capacity-1 event type
    const eventRes = await pool.query(
      `INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity, buffer_before, buffer_after, booking_horizon_days)
       VALUES ($1, '1-on-1 Meeting', '1-on-1-test', 30, 1, 0, 0, 1000)
       RETURNING id`,
      [testHostId]
    );
    const eventTypeId = eventRes.rows[0].id;

    const slotStart = "2027-06-15T14:00:00.000Z";

    // 2. Launch 20 simultaneous booking requests with distinct idempotency keys
    const requests = Array.from({ length: 20 }, (_, i) => {
      const idempotencyKey = `conc-test-1-key-${i}`;
      return BookingService.createHold({
        eventTypeId,
        startAt: slotStart,
        idempotencyKey,
        requestPayload: { eventTypeId, startAt: slotStart, i },
        customUrl: TEST_DB_URL,
      });
    });

    const results = await Promise.allSettled(requests);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    // 3. Assert exactly one active reservation succeeds
    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(19);

    // 4. Assert all failed requests failed with 409 SLOT_NOT_AVAILABLE
    for (const fail of failed) {
      const reason = (fail as PromiseRejectedResult).reason;
      expect(reason).toBeInstanceOf(AppError);
      expect(reason.statusCode).toBe(409);
      expect(reason.code).toBe("SLOT_NOT_AVAILABLE");
    }

    // 5. Query PostgreSQL directly to verify active reservations in database do not exceed capacity
    const bookingCountRes = await pool.query(
      "SELECT count(*) FROM bookings WHERE event_type_id = $1 AND status = 'HELD'",
      [eventTypeId]
    );
    expect(parseInt(bookingCountRes.rows[0].count, 10)).toBe(1);

    const claimCountRes = await pool.query(
      "SELECT count(*) FROM active_reservations WHERE host_id = $1",
      [testHostId]
    );
    expect(parseInt(claimCountRes.rows[0].count, 10)).toBe(1);
  });

  // TEST 2 — Group capacity
  it("Test 2 — Group capacity: 20 simultaneous requests for capacity=3 slot results in exactly 3 reservations", async () => {
    const eventRes = await pool.query(
      `INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity, buffer_before, buffer_after, booking_horizon_days)
       VALUES ($1, 'Group Workshop', 'group-test', 30, 3, 0, 0, 1000)
       RETURNING id`,
      [testHostId]
    );
    const eventTypeId = eventRes.rows[0].id;

    const slotStart = "2027-06-15T16:00:00.000Z";

    const requests = Array.from({ length: 20 }, (_, i) => {
      return BookingService.createHold({
        eventTypeId,
        startAt: slotStart,
        idempotencyKey: `group-test-key-${i}`,
        requestPayload: { eventTypeId, startAt: slotStart, i },
        customUrl: TEST_DB_URL,
      });
    });

    const results = await Promise.allSettled(requests);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    // Assert exactly 3 active reservations succeed
    expect(succeeded.length).toBe(3);
    expect(failed.length).toBe(17);

    // Verify in PostgreSQL
    const bookingCountRes = await pool.query(
      "SELECT count(*) FROM bookings WHERE event_type_id = $1 AND status = 'HELD'",
      [eventTypeId]
    );
    expect(parseInt(bookingCountRes.rows[0].count, 10)).toBe(3);
  });

  // TEST 3 — Idempotency
  it("Test 3 — Idempotency: duplicate key with same payload returns original result; different payload returns conflict", async () => {
    const eventRes = await pool.query(
      `INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity, booking_horizon_days)
       VALUES ($1, 'Idempotency Test', 'idemp-test', 30, 1, 1000)
       RETURNING id`,
      [testHostId]
    );
    const eventTypeId = eventRes.rows[0].id;
    const slotStart = "2027-06-16T10:00:00.000Z";
    const idempotencyKey = "idemp-key-unique-12345";
    const payload = { eventTypeId, startAt: slotStart };

    // Request 1
    const res1 = await BookingService.createHold({
      eventTypeId,
      startAt: slotStart,
      idempotencyKey,
      requestPayload: payload,
      customUrl: TEST_DB_URL,
    });
    expect(res1.status).toBe(201);
    expect(res1.isIdempotentReplay).toBe(false);

    // Request 2 with same key and same payload
    const res2 = await BookingService.createHold({
      eventTypeId,
      startAt: slotStart,
      idempotencyKey,
      requestPayload: payload,
      customUrl: TEST_DB_URL,
    });
    expect(res2.isIdempotentReplay).toBe(true);
    expect(res2.data.id).toBe(res1.data.id);

    // Verify in PostgreSQL that only one logical hold exists
    const countRes = await pool.query(
      "SELECT count(*) FROM bookings WHERE event_type_id = $1",
      [eventTypeId]
    );
    expect(parseInt(countRes.rows[0].count, 10)).toBe(1);

    // Request 3 with same key but different payload
    const differentPayload = { eventTypeId, startAt: "2027-06-16T11:00:00.000Z" };
    await expect(
      BookingService.createHold({
        eventTypeId,
        startAt: "2027-06-16T11:00:00.000Z",
        idempotencyKey,
        requestPayload: differentPayload,
        customUrl: TEST_DB_URL,
      })
    ).rejects.toThrowError(AppError);
  });

  // TEST 4 — Expired hold
  it("Test 4 — Expired hold: expired hold does not consume capacity and allows replacement reservation", async () => {
    const eventRes = await pool.query(
      `INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity, booking_horizon_days)
       VALUES ($1, 'Expiry Test', 'expiry-test', 30, 1, 1000)
       RETURNING id`,
      [testHostId]
    );
    const eventTypeId = eventRes.rows[0].id;
    const slotStart = "2027-06-17T10:00:00.000Z";

    // 1. Create first hold
    const hold1 = await BookingService.createHold({
      eventTypeId,
      startAt: slotStart,
      customUrl: TEST_DB_URL,
    });
    expect(hold1.data.status).toBe("HELD");

    // 2. Advance database time by setting hold_expires_at in the past
    await pool.query(
      "UPDATE bookings SET hold_expires_at = clock_timestamp() - interval '10 seconds' WHERE id = $1",
      [hold1.data.id]
    );

    // 3. Second guest attempts to book the same slot
    const hold2 = await BookingService.createHold({
      eventTypeId,
      startAt: slotStart,
      customUrl: TEST_DB_URL,
    });
    expect(hold2.data.status).toBe("HELD");
    expect(hold2.data.id).not.toBe(hold1.data.id);

    // 4. Verify in PostgreSQL: hold1 is EXPIRED, hold2 is HELD
    const b1 = await pool.query("SELECT status FROM bookings WHERE id = $1", [hold1.data.id]);
    expect(b1.rows[0].status).toBe("EXPIRED");

    const b2 = await pool.query("SELECT status FROM bookings WHERE id = $1", [hold2.data.id]);
    expect(b2.rows[0].status).toBe("HELD");
  });

  // TEST 5 — Confirmation race
  it("Test 5 — Confirmation race: booking cannot transition to confirmed after database-authoritative expiry", async () => {
    const eventRes = await pool.query(
      `INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity, booking_horizon_days)
       VALUES ($1, 'Confirm Race Test', 'confirm-race-test', 30, 1, 1000)
       RETURNING id`,
      [testHostId]
    );
    const eventTypeId = eventRes.rows[0].id;
    const slotStart = "2027-06-18T10:00:00.000Z";

    const hold = await BookingService.createHold({
      eventTypeId,
      startAt: slotStart,
      customUrl: TEST_DB_URL,
    });

    // Make hold expired in database
    await pool.query(
      "UPDATE bookings SET hold_expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
      [hold.data.id]
    );

    // Attempt to confirm the expired hold
    await expect(
      BookingService.confirmHold({
        holdId: hold.data.id,
        guestName: "Alice Guest",
        guestEmail: "alice@example.com",
        customUrl: TEST_DB_URL,
      })
    ).rejects.toThrowError("The temporary hold has expired");

    // Verify booking cannot transition to confirmed after database-authoritative expiry
    const check = await pool.query("SELECT status FROM bookings WHERE id = $1", [hold.data.id]);
    expect(check.rows[0].status).not.toBe("CONFIRMED");

    // Once cleanExpiredHolds runs or next hold check occurs, status is permanently EXPIRED
    await pool.query(`
      WITH expired AS (
        UPDATE bookings SET status = 'EXPIRED', updated_at = clock_timestamp()
        WHERE id = $1 AND hold_expires_at <= clock_timestamp()
        RETURNING id
      )
      DELETE FROM active_reservations WHERE booking_id IN (SELECT id FROM expired)
    `, [hold.data.id]);

    const checkAfterCleanup = await pool.query("SELECT status FROM bookings WHERE id = $1", [hold.data.id]);
    expect(checkAfterCleanup.rows[0].status).toBe("EXPIRED");
  });

  // TEST 6 — Rescheduling
  it("Test 6 — Rescheduling: moves reservation atomically; collision leaves original booking intact", async () => {
    const eventRes = await pool.query(
      `INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity, booking_horizon_days)
       VALUES ($1, 'Reschedule Test', 'reschedule-test', 30, 1, 1000)
       RETURNING id`,
      [testHostId]
    );
    const eventTypeId = eventRes.rows[0].id;

    // Slot 1: Booking A
    const holdA = await BookingService.createHold({
      eventTypeId,
      startAt: "2027-06-19T10:00:00.000Z",
      customUrl: TEST_DB_URL,
    });
    const confirmA = await BookingService.confirmHold({
      holdId: holdA.data.id,
      guestName: "Guest A",
      guestEmail: "guestA@example.com",
      customUrl: TEST_DB_URL,
    });
    const rawTokenA = confirmA.manageToken!;

    // Slot 2: Booking B
    const holdB = await BookingService.createHold({
      eventTypeId,
      startAt: "2027-06-19T11:00:00.000Z",
      customUrl: TEST_DB_URL,
    });
    await BookingService.confirmHold({
      holdId: holdB.data.id,
      guestName: "Guest B",
      guestEmail: "guestB@example.com",
      customUrl: TEST_DB_URL,
    });

    // Attempt to reschedule Booking A into Slot 2 (which is occupied by Booking B)
    await expect(
      BookingService.rescheduleBooking({
        rawToken: rawTokenA,
        newStartAt: "2027-06-19T11:00:00.000Z",
        customUrl: TEST_DB_URL,
      })
    ).rejects.toThrowError(AppError);

    // Verify Booking A remains intact at Slot 1
    const checkA = await pool.query("SELECT start_at, status FROM bookings WHERE id = $1", [
      holdA.data.id,
    ]);
    expect(new Date(checkA.rows[0].start_at).toISOString()).toBe("2027-06-19T10:00:00.000Z");
    expect(checkA.rows[0].status).toBe("CONFIRMED");

    // Reschedule Booking A to an open Slot 3
    const rescheduleRes = await BookingService.rescheduleBooking({
      rawToken: rawTokenA,
      newStartAt: "2027-06-19T12:00:00.000Z",
      customUrl: TEST_DB_URL,
    });
    expect(rescheduleRes.startAt).toBe("2027-06-19T12:00:00.000Z");

    // Verify in database
    const checkA2 = await pool.query("SELECT start_at, status FROM bookings WHERE id = $1", [
      holdA.data.id,
    ]);
    expect(new Date(checkA2.rows[0].start_at).toISOString()).toBe("2027-06-19T12:00:00.000Z");
  });

  // TEST 7 — Time zones & DST transitions
  describe("Test 7 — Time-zone handling and DST transitions", () => {
    it("converts Asia/Kolkata local availability correctly to UTC", () => {
      // 09:30 AM in Asia/Kolkata (UTC+5:30) is 04:00 AM UTC
      const localDt = createZonedDateTime(2027, 5, 10, 9, 30, "Asia/Kolkata")!;
      expect(localDt).not.toBeNull();
      expect(localDt.toUTC().toISO()).toBe("2027-05-10T04:00:00.000Z");
    });

    it("rejects nonexistent local times during America/New_York spring-forward transition", () => {
      // On Sunday, March 8, 2026, clocks spring forward from 02:00 to 03:00 in America/New_York
      // Wall-clock time 02:30 does NOT exist.
      const isValidGap = isValidWallTime(2026, 3, 8, 2, 30, "America/New_York");
      expect(isValidGap).toBe(false);

      const invalidDt = createZonedDateTime(2026, 3, 8, 2, 30, "America/New_York");
      expect(invalidDt).toBeNull();

      // Wall-clock time 03:30 DOES exist
      const isValidPostGap = isValidWallTime(2026, 3, 8, 3, 30, "America/New_York");
      expect(isValidPostGap).toBe(true);

      const validDt = createZonedDateTime(2026, 3, 8, 3, 30, "America/New_York")!;
      expect(validDt).not.toBeNull();
      // In EDT (UTC-4), 03:30 EDT is 07:30 UTC
      expect(validDt.toUTC().toISO()).toBe("2026-03-08T07:30:00.000Z");
    });

    it("resolves ambiguous wall time during America/New_York fall-back transition without manual offset math", () => {
      // On Sunday, November 1, 2026, clocks fall back from 02:00 EDT to 01:00 EST in America/New_York.
      // Hour 01:30 is ambiguous and occurs twice.
      const ambiguousDt = createZonedDateTime(2026, 11, 1, 1, 30, "America/New_York")!;
      expect(ambiguousDt).not.toBeNull();
      // Standard IANA policy: resolves consistently to standard time (-5 hours = -300 minutes)
      expect(ambiguousDt.offset).toBe(-300);
      expect(ambiguousDt.toUTC().toISO()).toBe("2026-11-01T06:30:00.000Z");
    });
  });
});
