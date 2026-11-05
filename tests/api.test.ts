import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPool } from "@/db";
import { runMigrations } from "@/db/migrate";
import { BookingService } from "@/lib/booking-service";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/slotbook_test";

describe("Slotbook API Service Integration", () => {
  let pool = getPool(TEST_DB_URL);
  let hostId: string;
  let eventTypeId: string;

  beforeAll(async () => {
    await runMigrations(TEST_DB_URL);
    pool = getPool(TEST_DB_URL);

    // Create host and event
    const hostRes = await pool.query(
      `INSERT INTO hosts (name, email, password_hash, home_timezone)
       VALUES ('API Tester', 'apitester@slotbook.dev', 'hash', 'UTC')
       RETURNING id`
    );
    hostId = hostRes.rows[0].id;

    const eventRes = await pool.query(
      `INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity)
       VALUES ($1, 'API Test Event', 'api-test-event', 30, 1)
       RETURNING id`,
      [hostId]
    );
    eventTypeId = eventRes.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("handles full lifecycle: hold -> confirm -> reschedule -> cancel", async () => {
    const slotStart = "2027-08-10T10:00:00.000Z";

    // 1. Create Hold
    const holdRes = await BookingService.createHold({
      eventTypeId,
      startAt: slotStart,
      idempotencyKey: "lifecycle-hold-key-1",
      requestPayload: { eventTypeId, startAt: slotStart },
      customUrl: TEST_DB_URL,
    });
    expect(holdRes.status).toBe(201);
    expect(holdRes.data.status).toBe("HELD");

    // 2. Confirm Hold
    const confirmRes = await BookingService.confirmHold({
      holdId: holdRes.data.id,
      guestName: "John Doe",
      guestEmail: "john@example.com",
      customUrl: TEST_DB_URL,
    });
    expect(confirmRes.status).toBe("CONFIRMED");
    expect(confirmRes.guestName).toBe("John Doe");
    expect(confirmRes.manageToken).toBeDefined();

    // Verify Notification Outbox has BOOKING_CONFIRMED
    const outboxConfirm = await pool.query(
      "SELECT event_type, delivery_status FROM notification_outbox WHERE booking_id = $1 AND event_type = 'BOOKING_CONFIRMED'",
      [holdRes.data.id]
    );
    expect(outboxConfirm.rows.length).toBe(1);
    expect(outboxConfirm.rows[0].delivery_status).toBe("PENDING");

    // 3. Reschedule
    const newSlotStart = "2027-08-10T11:00:00.000Z";
    const rescheduleRes = await BookingService.rescheduleBooking({
      rawToken: confirmRes.manageToken!,
      newStartAt: newSlotStart,
      customUrl: TEST_DB_URL,
    });
    expect(rescheduleRes.status).toBe("CONFIRMED");
    expect(rescheduleRes.startAt).toBe(newSlotStart);

    // Verify Notification Outbox has BOOKING_RESCHEDULED
    const outboxResched = await pool.query(
      "SELECT event_type FROM notification_outbox WHERE booking_id = $1 AND event_type = 'BOOKING_RESCHEDULED'",
      [holdRes.data.id]
    );
    expect(outboxResched.rows.length).toBe(1);

    // 4. Cancel
    const cancelRes = await BookingService.cancelBooking({
      rawToken: confirmRes.manageToken!,
      reason: "Conflict with another meeting",
      customUrl: TEST_DB_URL,
    });
    expect(cancelRes.status).toBe("CANCELLED");
    expect(cancelRes.cancellationReason).toBe("Conflict with another meeting");

    // Verify Notification Outbox has BOOKING_CANCELLED
    const outboxCancel = await pool.query(
      "SELECT event_type FROM notification_outbox WHERE booking_id = $1 AND event_type = 'BOOKING_CANCELLED'",
      [holdRes.data.id]
    );
    expect(outboxCancel.rows.length).toBe(1);
  });
});
