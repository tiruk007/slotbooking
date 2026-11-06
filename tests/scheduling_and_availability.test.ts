import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getPool } from "@/db";
import { runMigrations } from "@/db/migrate";
import { BookingService, AppError } from "@/lib/booking-service";
import { NotificationService } from "@/lib/notification-service";
import { calculateAvailableSlots } from "@/lib/slots";
import { DateTime } from "luxon";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/slotbook_test?host=/tmp";

describe("Part 9: Scheduling, Availability, Horizon & Notifications Test Suite", () => {
  let pool = getPool(TEST_DB_URL);
  let hostId: string;
  const hostEmail = "host.scheduling@slotbook.dev";
  const hostTimezone = "Asia/Kolkata";

  let event15Id: string;
  let event30Id: string;

  beforeAll(async () => {
    await runMigrations(TEST_DB_URL);
    pool = getPool(TEST_DB_URL);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM notification_outbox");
    await pool.query("DELETE FROM otp_codes");
    await pool.query("DELETE FROM idempotency_keys");
    await pool.query("DELETE FROM active_reservations");
    await pool.query("DELETE FROM bookings");
    await pool.query("DELETE FROM date_overrides");
    await pool.query("DELETE FROM availability_rules");
    await pool.query("DELETE FROM event_types");
    await pool.query("DELETE FROM hosts WHERE email = $1", [hostEmail]);

    // Seed test host in Asia/Kolkata
    const hostRes = await pool.query(
      `INSERT INTO hosts (name, email, home_timezone, status)
       VALUES ('Kolkata Host', $1, $2, 'ACTIVE')
       RETURNING id`,
      [hostEmail, hostTimezone]
    );
    hostId = hostRes.rows[0].id;

    // Seed 15 Min Event with 10m before and 15m after buffer, 120m notice, 14 days horizon
    const e1 = await pool.query(
      `INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity, buffer_before, buffer_after, minimum_notice_minutes, booking_horizon_days)
       VALUES ($1, 'Quick Sync', 'quick-sync', 15, 1, 10, 15, 120, 14)
       RETURNING id`,
      [hostId]
    );
    event15Id = e1.rows[0].id;

    // Seed 30 Min Event with 0 buffer, 0 notice, 30 days horizon
    const e2 = await pool.query(
      `INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity, buffer_before, buffer_after, minimum_notice_minutes, booking_horizon_days)
       VALUES ($1, 'Standard 30', 'standard-30', 30, 1, 0, 0, 0, 30)
       RETURNING id`,
      [hostId]
    );
    event30Id = e2.rows[0].id;
  });

  // ==========================================
  // 1. WEEKLY AVAILABILITY TESTS
  // ==========================================
  describe("1. Weekly Availability & Database Persistence", () => {
    it("persists single window per day and multiple windows per day correctly in database", async () => {
      // Monday: 2 windows (09:00-11:30 and 13:30-18:00)
      // Tuesday: 1 window (09:00-17:00)
      // Wednesday to Sunday: Days off (no rows)
      await pool.query(
        `INSERT INTO availability_rules (host_id, weekday, start_time, end_time) VALUES
         ($1, 1, '09:00:00', '11:30:00'),
         ($1, 1, '13:30:00', '18:00:00'),
         ($1, 2, '09:00:00', '17:00:00')`,
        [hostId]
      );

      const rulesRes = await pool.query(
        "SELECT weekday, start_time::text, end_time::text FROM availability_rules WHERE host_id = $1 ORDER BY weekday, start_time",
        [hostId]
      );
      expect(rulesRes.rows.length).toBe(3);
      expect(rulesRes.rows[0]).toEqual({ weekday: 1, start_time: "09:00:00", end_time: "11:30:00" });
      expect(rulesRes.rows[1]).toEqual({ weekday: 1, start_time: "13:30:00", end_time: "18:00:00" });
      expect(rulesRes.rows[2]).toEqual({ weekday: 2, start_time: "09:00:00", end_time: "17:00:00" });
    });

    it("verifies days off have zero availability rules and generate zero slots", () => {
      const now = DateTime.fromISO("2026-11-09T00:00:00.000", { zone: "Asia/Kolkata" }); // Monday
      const wednesday = now.plus({ days: 2 }); // Wednesday

      const slots = calculateAvailableSlots({
        hostTimezone: "Asia/Kolkata",
        from: wednesday.startOf("day"),
        to: wednesday.endOf("day"),
        eventType: {
          durationMinutes: 30,
          capacity: 1,
          bufferBefore: 0,
          bufferAfter: 0,
          minimumNoticeMinutes: 0,
          bookingHorizonDays: 14,
        },
        rules: [
          { weekday: 1, startTime: "09:00:00", endTime: "17:00:00" }, // Only Monday is working
        ],
        overrides: [],
        existingBookings: [],
        now,
      });

      expect(slots.length).toBe(0);
    });

    it("enforces start_time < end_time database constraint on availability_rules", async () => {
      await expect(
        pool.query(
          "INSERT INTO availability_rules (host_id, weekday, start_time, end_time) VALUES ($1, 1, '15:00:00', '09:00:00')",
          [hostId]
        )
      ).rejects.toThrow();
    });
  });

  // ==========================================
  // 2. BUFFER TIME ENFORCEMENT
  // ==========================================
  describe("2. Buffer Time Enforcement Across Scheduling Touchpoints", () => {
    it("ensures buffer-before and buffer-after confine meetings strictly inside host availability windows", () => {
      // Host window: 09:00 to 11:30 IST
      // Event: duration 30m, bufferBefore 10m, bufferAfter 15m
      // Earliest valid slot start: 09:00 + 10m = 09:10
      // Latest valid slot start: 11:30 - 30m - 15m = 10:45
      const now = DateTime.fromISO("2026-11-09T00:00:00.000", { zone: "Asia/Kolkata" });

      const slots = calculateAvailableSlots({
        hostTimezone: "Asia/Kolkata",
        from: now.startOf("day"),
        to: now.endOf("day"),
        eventType: {
          durationMinutes: 30,
          capacity: 1,
          bufferBefore: 10,
          bufferAfter: 15,
          minimumNoticeMinutes: 0,
          bookingHorizonDays: 14,
        },
        rules: [
          { weekday: 1, startTime: "09:00:00", endTime: "11:30:00" },
        ],
        overrides: [],
        existingBookings: [],
        now,
      });

      // No slot can start at 09:00 because bufferBefore (10m) would extend to 08:50 (outside operating hours)
      const slotAt0900 = slots.find((s) => DateTime.fromISO(s.startAt).setZone("Asia/Kolkata").toFormat("HH:mm") === "09:00");
      expect(slotAt0900).toBeUndefined();

      // No slot can start at 11:00 because meeting ends at 11:30 and bufferAfter (15m) extends to 11:45
      const slotAt1100 = slots.find((s) => DateTime.fromISO(s.startAt).setZone("Asia/Kolkata").toFormat("HH:mm") === "11:00");
      expect(slotAt1100).toBeUndefined();

      // Slot at 09:10 (buffered 09:00-09:55) is inside [09:00, 11:30)
      const slotAt0910 = slots.find((s) => DateTime.fromISO(s.startAt).setZone("Asia/Kolkata").toFormat("HH:mm") === "09:10");
      expect(slotAt0910).toBeDefined();

      // Slot at 10:05 (buffered 09:55-10:50) is inside [09:00, 11:30)
      const slotAt1005 = slots.find((s) => DateTime.fromISO(s.startAt).setZone("Asia/Kolkata").toFormat("HH:mm") === "10:05");
      expect(slotAt1005).toBeDefined();

      // Total slots for 09:00-11:30 with 30m duration + 10m before + 15m after (55m step) is exactly 2 slots: 09:10, 10:05
      expect(slots.length).toBe(2);
    });

    it("generates strictly non-overlapping buffered slots using Duration + BufferBefore + BufferAfter step interval", () => {
      // Prompt specification: 09:00-12:00 window, 30m duration, 10m buffer before, 10m buffer after
      // Step = 30 + 10 + 10 = 50m. Expected starts: 09:10, 10:00, 10:50. (11:40 discarded because 12:10 + 10m > 12:00)
      const testNow = DateTime.fromISO("2026-11-09T00:00:00.000Z").setZone("Asia/Kolkata");
      const slots = calculateAvailableSlots({
        hostTimezone: "Asia/Kolkata",
        from: testNow.startOf("day"),
        to: testNow.endOf("day"),
        eventType: {
          durationMinutes: 30,
          capacity: 1,
          bufferBefore: 10,
          bufferAfter: 10,
          minimumNoticeMinutes: 0,
          bookingHorizonDays: 14,
        },
        rules: [
          { weekday: 1, startTime: "09:00:00", endTime: "12:00:00" },
        ],
        overrides: [],
        existingBookings: [],
        now: testNow,
      });

      const startTimes = slots.map((s) =>
        DateTime.fromISO(s.startAt).setZone("Asia/Kolkata").toFormat("HH:mm")
      );
      expect(startTimes).toEqual(["09:10", "10:00", "10:50"]);
    });

    it("prevents booking an adjacent slot when buffer time intersects existing booking", async () => {
      // Event: duration 15m, bufferBefore 10m, bufferAfter 15m
      // Book Slot 1: 04:00 UTC (09:30 IST) to 04:15 UTC (09:45 IST)
      // Reserved host interval: [03:50 UTC, 04:30 UTC)
      const slot1 = "2026-11-10T04:00:00.000Z";
      const hold1 = await BookingService.createHold({
        eventTypeId: event15Id,
        startAt: slot1,
        customUrl: TEST_DB_URL,
      });
      expect(hold1.status).toBe(201);

      // Attempt adjacent slot at 04:15 UTC (bufferBefore extends to 04:05 UTC, colliding with hold1's reserved range)
      const collidingAdjacentSlot = "2026-11-10T04:15:00.000Z";
      await expect(
        BookingService.createHold({
          eventTypeId: event15Id,
          startAt: collidingAdjacentSlot,
          customUrl: TEST_DB_URL,
        })
      ).rejects.toThrow("The requested slot is no longer available due to existing bookings or buffer times");
    });
  });

  // ==========================================
  // 3. MINIMUM NOTICE ENFORCEMENT
  // ==========================================
  describe("3. Database-Authoritative Minimum Notice Enforcement", () => {
    it("filters out candidate slots starting within the minimum notice period", () => {
      // Current simulated time: 10:00 IST
      // Minimum notice: 120 minutes (2 hours)
      // Earliest allowable slot start: 12:00 IST
      const now = DateTime.fromISO("2026-11-09T10:00:00.000", { zone: "Asia/Kolkata" });

      const slots = calculateAvailableSlots({
        hostTimezone: "Asia/Kolkata",
        from: now.startOf("day"),
        to: now.endOf("day"),
        eventType: {
          durationMinutes: 30,
          capacity: 1,
          bufferBefore: 0,
          bufferAfter: 0,
          minimumNoticeMinutes: 120,
          bookingHorizonDays: 14,
        },
        rules: [
          { weekday: 1, startTime: "09:00:00", endTime: "18:00:00" },
        ],
        overrides: [],
        existingBookings: [],
        now,
      });

      const slotAt1030 = slots.find((s) => DateTime.fromISO(s.startAt).setZone("Asia/Kolkata").toFormat("HH:mm") === "10:30");
      expect(slotAt1030).toBeUndefined();

      const slotAt1130 = slots.find((s) => DateTime.fromISO(s.startAt).setZone("Asia/Kolkata").toFormat("HH:mm") === "11:30");
      expect(slotAt1130).toBeUndefined();

      const slotAt1200 = slots.find((s) => DateTime.fromISO(s.startAt).setZone("Asia/Kolkata").toFormat("HH:mm") === "12:00");
      expect(slotAt1200).toBeDefined();
    });

    it("rejects direct booking API attempt for a slot violating minimum notice with 400", async () => {
      // event15Id has minimum_notice_minutes = 120
      // Requesting a slot 30 minutes from now must be rejected
      const tooSoon = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      await expect(
        BookingService.createHold({
          eventTypeId: event15Id,
          startAt: tooSoon,
          customUrl: TEST_DB_URL,
        })
      ).rejects.toThrow("This time slot does not meet the minimum booking notice requirement.");
    });
  });

  // ==========================================
  // 4. STRICT BOOKING HORIZON ENFORCEMENT
  // ==========================================
  describe("4. Host-Local Calendar Day Booking Horizon Enforcement", () => {
    it("generates slots up to the end of the horizon calendar day (23:59:59 in host timezone)", () => {
      // Host timezone: Asia/Kolkata
      // Booking horizon: 2 calendar days
      // Today is 2026-11-09. Horizon includes Day 0, Day 1, and Day 2 (up to 2026-11-11 23:59:59 IST)
      const now = DateTime.fromISO("2026-11-09T08:00:00.000", { zone: "Asia/Kolkata" });

      const slots = calculateAvailableSlots({
        hostTimezone: "Asia/Kolkata",
        from: now.startOf("day"),
        to: now.plus({ days: 7 }),
        eventType: {
          durationMinutes: 30,
          capacity: 1,
          bufferBefore: 0,
          bufferAfter: 0,
          minimumNoticeMinutes: 0,
          bookingHorizonDays: 2,
        },
        rules: [
          { weekday: 1, startTime: "09:00:00", endTime: "17:00:00" },
          { weekday: 2, startTime: "09:00:00", endTime: "17:00:00" },
          { weekday: 3, startTime: "09:00:00", endTime: "17:00:00" },
          { weekday: 4, startTime: "09:00:00", endTime: "17:00:00" },
        ],
        overrides: [],
        existingBookings: [],
        now,
      });

      // Day 2 (Nov 11) slots MUST exist
      const day2Slot = slots.find((s) => s.startAt.startsWith("2026-11-11"));
      expect(day2Slot).toBeDefined();

      // Day 3 (Nov 12) slots MUST NOT exist
      const day3Slot = slots.find((s) => s.startAt.startsWith("2026-11-12"));
      expect(day3Slot).toBeUndefined();
    });

    it("rejects direct booking API attempt for a slot beyond the booking horizon with 400", async () => {
      // event15Id has booking_horizon_days = 14
      // Attempting to book 20 days in advance must be rejected with OUTSIDE_BOOKING_HORIZON
      const farFuture = DateTime.now().setZone("Asia/Kolkata").plus({ days: 20 }).set({ hour: 10, minute: 0 }).toJSDate().toISOString();

      await expect(
        BookingService.createHold({
          eventTypeId: event15Id,
          startAt: farFuture,
          customUrl: TEST_DB_URL,
        })
      ).rejects.toThrow("This date is outside the allowed booking horizon.");
    });
  });

  // ==========================================
  // 5. CROSS-TIMEZONE BOOKING & PRESENTATION
  // ==========================================
  describe("5. Cross-Timezone Booking & Accuracy", () => {
    it("maps Asia/Kolkata working hours (09:00-17:00 IST) correctly to America/New_York (22:30 EDT prev day to 06:30 EDT)", () => {
      // 09:00 IST (UTC+5:30) is 03:30 UTC. In America/New_York (EDT, UTC-4), 03:30 UTC is 23:30 (11:30 PM) on previous day.
      // In EST (UTC-5), 03:30 UTC is 22:30 (10:30 PM) on previous day.
      const now = DateTime.fromISO("2026-11-09T00:00:00.000", { zone: "Asia/Kolkata" });

      const slots = calculateAvailableSlots({
        hostTimezone: "Asia/Kolkata",
        from: now.startOf("day"),
        to: now.endOf("day"),
        eventType: {
          durationMinutes: 30,
          capacity: 1,
          bufferBefore: 0,
          bufferAfter: 0,
          minimumNoticeMinutes: 0,
          bookingHorizonDays: 14,
        },
        rules: [
          { weekday: 1, startTime: "09:00:00", endTime: "17:00:00" },
        ],
        overrides: [],
        existingBookings: [],
        now,
      });

      expect(slots.length).toBe(16); // 30-minute consecutive meeting slots between 09:00 and 16:30 (8 hours = 16 meetings)

      // First slot in IST is 09:00:00 IST -> 03:30:00.000Z
      expect(slots[0].startAt).toBe("2026-11-09T03:30:00.000Z");

      // Verify how this slot displays in America/New_York
      const nyTime = DateTime.fromISO(slots[0].startAt).setZone("America/New_York");
      // On Nov 9, NY is in EST (UTC-5): 03:30Z - 5 hours = 22:30 on Nov 8 (10:30 PM)
      expect(nyTime.hour).toBe(22);
      expect(nyTime.minute).toBe(30);
      expect(nyTime.day).toBe(8);
    });
  });

  // ==========================================
  // 6. DATE OVERRIDES
  // ==========================================
  describe("6. Date Overrides (Days Off & Custom Hours)", () => {
    it("blocks slot generation on date overrides marked as unavailable (day off)", async () => {
      // Mark 2026-11-10 as day off
      await pool.query(
        `INSERT INTO date_overrides (host_id, override_date, is_available)
         VALUES ($1, '2026-11-10', false)`,
        [hostId]
      );

      const dayOff = DateTime.fromISO("2026-11-10T00:00:00.000", { zone: "Asia/Kolkata" });

      const slots = calculateAvailableSlots({
        hostTimezone: "Asia/Kolkata",
        from: dayOff.startOf("day"),
        to: dayOff.endOf("day"),
        eventType: {
          durationMinutes: 30,
          capacity: 1,
          bufferBefore: 0,
          bufferAfter: 0,
          minimumNoticeMinutes: 0,
          bookingHorizonDays: 14,
        },
        rules: [
          { weekday: 2, startTime: "09:00:00", endTime: "17:00:00" },
        ],
        overrides: [
          { overrideDate: "2026-11-10", isAvailable: false },
        ],
        existingBookings: [],
        now: dayOff.minus({ days: 1 }),
      });

      expect(slots.length).toBe(0);
    });

    it("rejects booking attempts on date overrides marked as unavailable with 409", async () => {
      await pool.query(
        `INSERT INTO date_overrides (host_id, override_date, is_available)
         VALUES ($1, '2026-11-12', false)`,
        [hostId]
      );

      const slotOnDayOff = DateTime.fromISO("2026-11-12T10:00:00.000", { zone: "Asia/Kolkata" }).toUTC().toISO()!;

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
  // 7. EMAIL NOTIFICATIONS & TEMPLATES
  // ==========================================
  describe("7. Recipient-Aware Email Notifications", () => {
    it("enqueues recipient-aware emails for guest and host upon booking confirmation", async () => {
      // 1. Create and confirm a booking
      const slotTime = DateTime.now().plus({ days: 2 }).set({ hour: 10, minute: 0, second: 0, millisecond: 0 }).toUTC().toISO()!;
      const hold = await BookingService.createHold({
        eventTypeId: event30Id,
        startAt: slotTime,
        guestEmail: "guest.test@example.com",
        guestName: "Alice Guest",
        meetingPurpose: "Consultation",
        customUrl: TEST_DB_URL,
      });

      await BookingService.confirmHold({
        holdId: hold.data.id,
        guestName: "Alice Guest",
        guestEmail: "guest.test@example.com",
        meetingPurpose: "Consultation",
        customUrl: TEST_DB_URL,
      });

      // 2. Inspect notification outbox
      const outboxRes = await pool.query(
        "SELECT event_type, recipient_email, subject, payload FROM notification_outbox WHERE booking_id = $1 ORDER BY id ASC",
        [hold.data.id]
      );

      expect(outboxRes.rows.length).toBe(2);

      // Guest notification
      const guestEmailRow = outboxRes.rows.find((r) => r.recipient_email === "guest.test@example.com");
      expect(guestEmailRow).toBeDefined();
      expect(guestEmailRow.subject).toBe("Confirmed: Standard 30 with Kolkata Host");
      expect(guestEmailRow.payload.recipientRole).toBe("GUEST");
      expect(guestEmailRow.payload.manageUrl).toBeDefined();

      // Host notification
      const hostEmailRow = outboxRes.rows.find((r) => r.recipient_email === hostEmail);
      expect(hostEmailRow).toBeDefined();
      expect(hostEmailRow.subject).toBe("New Appointment: Alice Guest — Standard 30");
      expect(hostEmailRow.payload.recipientRole).toBe("HOST");
      // Guest management URL must NOT be exposed to host
      expect(hostEmailRow.payload.manageUrl).toBeUndefined();
    });

    it("enqueues cancellation notifications with correct subjects and reasons for guest and host", async () => {
      const slotTime = DateTime.now().plus({ days: 3 }).set({ hour: 11, minute: 0, second: 0, millisecond: 0 }).toUTC().toISO()!;
      const hold = await BookingService.createHold({
        eventTypeId: event30Id,
        startAt: slotTime,
        guestEmail: "cancel.guest@example.com",
        guestName: "Bob Guest",
        meetingPurpose: "Discussion",
        customUrl: TEST_DB_URL,
      });

      const confirmed = await BookingService.confirmHold({
        holdId: hold.data.id,
        guestName: "Bob Guest",
        guestEmail: "cancel.guest@example.com",
        meetingPurpose: "Discussion",
        customUrl: TEST_DB_URL,
      });

      // Clear confirmation outbox records
      await pool.query("DELETE FROM notification_outbox");

      // Guest cancels booking
      await BookingService.cancelBooking({
        rawToken: confirmed.manageToken!,
        reason: "Personal scheduling conflict",
        customUrl: TEST_DB_URL,
      });

      const cancelOutboxRes = await pool.query(
        "SELECT event_type, recipient_email, subject, payload FROM notification_outbox WHERE booking_id = $1",
        [hold.data.id]
      );

      expect(cancelOutboxRes.rows.length).toBe(2);

      const guestCancel = cancelOutboxRes.rows.find((r) => r.recipient_email === "cancel.guest@example.com");
      expect(guestCancel.subject).toBe("Your Slotbook appointment has been cancelled");
      expect(guestCancel.payload.cancellationReason).toBe("Personal scheduling conflict");
      expect(guestCancel.payload.cancelledBy).toBe("Guest");

      const hostCancel = cancelOutboxRes.rows.find((r) => r.recipient_email === hostEmail);
      expect(hostCancel.subject).toBe("Appointment cancellation — Bob Guest");
      expect(hostCancel.payload.cancellationReason).toBe("Personal scheduling conflict");
      expect(hostCancel.payload.cancelledBy).toBe("Guest");
    });
  });
});
