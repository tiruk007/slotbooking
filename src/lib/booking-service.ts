import crypto from "crypto";
import { Pool, PoolClient } from "pg";
import { getPool, withTransaction } from "@/db";

export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function hashManageToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function hashPayload(payload: any): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload || {})).digest("hex");
}

export interface CreateHoldParams {
  eventTypeId: string;
  startAt: string; // ISO
  idempotencyKey?: string;
  requestPayload?: any;
  customUrl?: string;
}

export interface ConfirmHoldParams {
  holdId: string;
  guestName: string;
  guestEmail: string;
  customUrl?: string;
}

export interface RescheduleBookingParams {
  rawToken: string;
  newStartAt: string;
  customUrl?: string;
}

export interface CancelBookingParams {
  rawToken: string;
  reason?: string;
  customUrl?: string;
}

export interface HostCancelBookingParams {
  hostId: string;
  bookingId: string;
  reason?: string;
  customUrl?: string;
}

export class BookingService {
  /**
   * Creates a 5-minute temporary hold with transactional concurrency safety.
   */
  static async createHold(params: CreateHoldParams) {
    const { eventTypeId, startAt, idempotencyKey, requestPayload, customUrl } = params;
    const pool = getPool(customUrl);

    // 1. Idempotency Check (if header was provided)
    let requestHash: string | null = null;
    if (idempotencyKey) {
      requestHash = hashPayload(requestPayload);
      const existingKeyRes = await pool.query(
        "SELECT request_hash, response_payload, response_status FROM idempotency_keys WHERE key = $1",
        [idempotencyKey]
      );

      if (existingKeyRes.rows.length > 0) {
        const stored = existingKeyRes.rows[0];
        if (stored.request_hash === requestHash) {
          // Idempotent retry: return exact stored response
          return {
            status: stored.response_status,
            data: stored.response_payload,
            isIdempotentReplay: true,
          };
        } else {
          // Key reused with different payload
          throw new AppError(
            "IDEMPOTENCY_CONFLICT",
            409,
            "Idempotency key mismatch: request payload differs from original request"
          );
        }
      }
    }

    // 2. Transactional Hold Creation
    return await withTransaction(pool, async (client: PoolClient) => {
      // Step A: Acquire exclusive row-level lock on event_type to serialize concurrent group capacity checks
      const eventRes = await client.query(
        `SELECT id, host_id, name, slug, duration_minutes, capacity, buffer_before, buffer_after, minimum_notice_minutes, booking_horizon_days
         FROM event_types
         WHERE id = $1
         FOR UPDATE`,
        [eventTypeId]
      );

      if (eventRes.rows.length === 0) {
        throw new AppError("NOT_FOUND", 404, "Event type not found");
      }
      const event = eventRes.rows[0];

      // Step B: Expire stale holds using PostgreSQL database time (clock_timestamp())
      await client.query(`
        WITH expired_holds AS (
          UPDATE bookings
          SET status = 'EXPIRED', updated_at = clock_timestamp()
          WHERE status = 'HELD' 
            AND hold_expires_at <= clock_timestamp()
          RETURNING id
        )
        DELETE FROM active_reservations
        WHERE booking_id IN (SELECT id FROM expired_holds)
      `);

      // Step C: Calculate slot interval and buffered interval
      const startDate = new Date(startAt);
      const durationMillis = event.duration_minutes * 60 * 1000;
      const endDate = new Date(startDate.getTime() + durationMillis);

      const bufStartMillis = startDate.getTime() - event.buffer_before * 60 * 1000;
      const bufEndMillis = endDate.getTime() + event.buffer_after * 60 * 1000;
      const bufStartDate = new Date(bufStartMillis);
      const bufEndDate = new Date(bufEndMillis);

      // Step D: Capacity and overlap verification
      if (event.capacity === 1) {
        // One-on-one booking: check if active reservation intersects buffered range
        const conflictRes = await client.query(
          `SELECT count(*) FROM active_reservations
           WHERE host_id = $1 
             AND buffered_range && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
          [event.host_id, bufStartDate.toISOString(), bufEndDate.toISOString()]
        );

        if (parseInt(conflictRes.rows[0].count, 10) > 0) {
          throw new AppError("SLOT_NOT_AVAILABLE", 409, "The requested slot is no longer available");
        }
      } else {
        // Group booking: count active held and confirmed bookings at this exact slot
        const groupCountRes = await client.query(
          `SELECT count(*) FROM bookings
           WHERE event_type_id = $1
             AND status IN ('HELD', 'CONFIRMED')
             AND start_at = $2::timestamptz
             AND (hold_expires_at IS NULL OR hold_expires_at > clock_timestamp())`,
          [eventTypeId, startDate.toISOString()]
        );

        const currentActive = parseInt(groupCountRes.rows[0].count, 10);
        if (currentActive >= event.capacity) {
          throw new AppError(
            "SLOT_NOT_AVAILABLE",
            409,
            "The requested slot has reached maximum capacity"
          );
        }
      }

      // Step E: Insert the hold into bookings with 5-minute database expiry
      const bookingRes = await client.query(
        `INSERT INTO bookings (event_type_id, start_at, end_at, status, hold_expires_at)
         VALUES ($1, $2::timestamptz, $3::timestamptz, 'HELD', clock_timestamp() + interval '5 minutes')
         RETURNING id, event_type_id, start_at, end_at, status, hold_expires_at, created_at`,
        [eventTypeId, startDate.toISOString(), endDate.toISOString()]
      );
      const booking = bookingRes.rows[0];

      // Step F: For capacity = 1, insert into active_reservations protected by GiST exclusion constraint
      if (event.capacity === 1) {
        try {
          await client.query(
            `INSERT INTO active_reservations (host_id, event_type_id, booking_id, buffered_range)
             VALUES ($1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz, '[)'))`,
            [
              event.host_id,
              eventTypeId,
              booking.id,
              bufStartDate.toISOString(),
              bufEndDate.toISOString(),
            ]
          );
        } catch (err: any) {
          // PostgreSQL exclusion constraint violation error code 23P01
          if (err.code === "23P01") {
            throw new AppError(
              "SLOT_NOT_AVAILABLE",
              409,
              "The requested slot was reserved by another guest (exclusion violation)"
            );
          }
          throw err;
        }
      }

      // Step G: Prepare response payload
      const responseData = {
        id: booking.id,
        eventTypeId: booking.event_type_id,
        startAt: booking.start_at.toISOString(),
        endAt: booking.end_at.toISOString(),
        status: booking.status,
        holdExpiresAt: booking.hold_expires_at.toISOString(),
      };

      // Step H: Persist idempotency record within the same atomic transaction
      if (idempotencyKey && requestHash) {
        try {
          await client.query(
            `INSERT INTO idempotency_keys (key, request_hash, response_payload, response_status)
             VALUES ($1, $2, $3, 201)`,
            [idempotencyKey, requestHash, JSON.stringify(responseData)]
          );
        } catch (err: any) {
          if (err.code === "23505") {
            // Concurrent race on same idempotency key
            throw new AppError(
              "IDEMPOTENCY_CONFLICT",
              409,
              "Concurrent request with same idempotency key detected"
            );
          }
          throw err;
        }
      }

      return {
        status: 201,
        data: responseData,
        isIdempotentReplay: false,
      };
    });
  }

  /**
   * Confirms an active hold and issues a private booking management URL.
   */
  static async confirmHold(params: ConfirmHoldParams) {
    const { holdId, guestName, guestEmail, customUrl } = params;
    const pool = getPool(customUrl);

    return await withTransaction(pool, async (client: PoolClient) => {
      // 1. Expire stale holds
      await client.query(`
        WITH expired_holds AS (
          UPDATE bookings
          SET status = 'EXPIRED', updated_at = clock_timestamp()
          WHERE status = 'HELD' 
            AND hold_expires_at <= clock_timestamp()
          RETURNING id
        )
        DELETE FROM active_reservations
        WHERE booking_id IN (SELECT id FROM expired_holds)
      `);

      // 2. Fetch booking with row lock
      const bRes = await client.query(
        `SELECT b.*, e.name as event_name, e.slug as event_slug, h.name as host_name, h.email as host_email, h.home_timezone
         FROM bookings b
         JOIN event_types e ON b.event_type_id = e.id
         JOIN hosts h ON e.host_id = h.id
         WHERE b.id = $1
         FOR UPDATE`,
        [holdId]
      );

      if (bRes.rows.length === 0) {
        throw new AppError("NOT_FOUND", 404, "Booking hold not found");
      }
      const booking = bRes.rows[0];

      // Safe confirmation retry: if already confirmed for this guest, return existing confirmation
      if (booking.status === "CONFIRMED" && booking.guest_email === guestEmail) {
        return {
          id: booking.id,
          status: "CONFIRMED",
          startAt: booking.start_at.toISOString(),
          endAt: booking.end_at.toISOString(),
          guestName: booking.guest_name,
          guestEmail: booking.guest_email,
          manageToken: null, // Token not re-exposed if already hashed
          message: "Booking is already confirmed",
        };
      }

      if (booking.status === "EXPIRED") {
        throw new AppError(
          "HOLD_EXPIRED",
          410,
          "The temporary hold has expired. Please select a new slot."
        );
      }

      if (booking.status !== "HELD") {
        throw new AppError(
          "INVALID_STATE",
          400,
          `Cannot confirm booking in state: ${booking.status}`
        );
      }

      // 3. Verify hold has not expired against database clock
      const timeCheck = await client.query(
        "SELECT (clock_timestamp() <= $1::timestamptz) as is_valid",
        [booking.hold_expires_at]
      );
      if (!timeCheck.rows[0].is_valid) {
        // Mark expired now
        await client.query("UPDATE bookings SET status = 'EXPIRED' WHERE id = $1", [holdId]);
        await client.query("DELETE FROM active_reservations WHERE booking_id = $1", [holdId]);
        throw new AppError(
          "HOLD_EXPIRED",
          410,
          "The temporary hold has expired. Please select a new slot."
        );
      }

      // 4. Generate cryptographically secure management token (64 hex characters)
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashManageToken(rawToken);

      // 5. Update booking to CONFIRMED and clear hold expiry
      const updateRes = await client.query(
        `UPDATE bookings
         SET guest_name = $1,
             guest_email = $2,
             status = 'CONFIRMED',
             hold_expires_at = NULL,
             manage_token_hash = $3,
             updated_at = clock_timestamp()
         WHERE id = $4
         RETURNING *`,
        [guestName, guestEmail, tokenHash, holdId]
      );
      const updatedBooking = updateRes.rows[0];

      // 6. Record notification into transactional outbox
      await client.query(
        `INSERT INTO notification_outbox (booking_id, event_type, payload, delivery_status)
         VALUES ($1, 'BOOKING_CONFIRMED', $2, 'PENDING')`,
        [
          holdId,
          JSON.stringify({
            bookingId: holdId,
            eventName: booking.event_name,
            hostName: booking.host_name,
            guestName,
            guestEmail,
            startAt: updatedBooking.start_at.toISOString(),
            endAt: updatedBooking.end_at.toISOString(),
          }),
        ]
      );

      return {
        id: updatedBooking.id,
        status: updatedBooking.status,
        startAt: updatedBooking.start_at.toISOString(),
        endAt: updatedBooking.end_at.toISOString(),
        guestName: updatedBooking.guest_name,
        guestEmail: updatedBooking.guest_email,
        manageToken: rawToken,
        manageUrl: `/bookings/${rawToken}`,
      };
    });
  }

  /**
   * Reschedules an existing confirmed booking to a new start time atomically.
   */
  static async rescheduleBooking(params: RescheduleBookingParams) {
    const { rawToken, newStartAt, customUrl } = params;
    const pool = getPool(customUrl);
    const tokenHash = hashManageToken(rawToken);

    return await withTransaction(pool, async (client: PoolClient) => {
      // 1. Fetch booking with lock
      const bRes = await client.query(
        `SELECT b.*, e.duration_minutes, e.capacity, e.buffer_before, e.buffer_after, e.host_id, e.name as event_name, h.name as host_name
         FROM bookings b
         JOIN event_types e ON b.event_type_id = e.id
         JOIN hosts h ON e.host_id = h.id
         WHERE b.manage_token_hash = $1
         FOR UPDATE`,
        [tokenHash]
      );

      if (bRes.rows.length === 0) {
        throw new AppError("NOT_FOUND", 404, "Booking not found or invalid management token");
      }
      const booking = bRes.rows[0];

      if (booking.status !== "CONFIRMED") {
        throw new AppError(
          "INVALID_STATE",
          400,
          `Cannot reschedule booking with status: ${booking.status}`
        );
      }

      // 2. Lock event type to serialize group capacity
      await client.query("SELECT id FROM event_types WHERE id = $1 FOR UPDATE", [
        booking.event_type_id,
      ]);

      // 3. Expire stale holds
      await client.query(`
        WITH expired_holds AS (
          UPDATE bookings
          SET status = 'EXPIRED', updated_at = clock_timestamp()
          WHERE status = 'HELD' 
            AND hold_expires_at <= clock_timestamp()
          RETURNING id
        )
        DELETE FROM active_reservations
        WHERE booking_id IN (SELECT id FROM expired_holds)
      `);

      // 4. Calculate new slot interval and buffered range
      const newStartDate = new Date(newStartAt);
      const durationMillis = booking.duration_minutes * 60 * 1000;
      const newEndDate = new Date(newStartDate.getTime() + durationMillis);

      const bufStartMillis = newStartDate.getTime() - booking.buffer_before * 60 * 1000;
      const bufEndMillis = newEndDate.getTime() + booking.buffer_after * 60 * 1000;
      const bufStartDate = new Date(bufStartMillis);
      const bufEndDate = new Date(bufEndMillis);

      // 5. Verify availability for the new slot
      if (booking.capacity === 1) {
        // Check if any other active reservation intersects the new buffered range
        const conflictRes = await client.query(
          `SELECT count(*) FROM active_reservations
           WHERE host_id = $1 
             AND booking_id != $2
             AND buffered_range && tstzrange($3::timestamptz, $4::timestamptz, '[)')`,
          [booking.host_id, booking.id, bufStartDate.toISOString(), bufEndDate.toISOString()]
        );

        if (parseInt(conflictRes.rows[0].count, 10) > 0) {
          throw new AppError(
            "SLOT_NOT_AVAILABLE",
            409,
            "The target reschedule slot is not available"
          );
        }

        // Update active reservation range (GiST exclusion will catch any collision)
        try {
          await client.query(
            `UPDATE active_reservations
             SET buffered_range = tstzrange($1::timestamptz, $2::timestamptz, '[)')
             WHERE booking_id = $3`,
            [bufStartDate.toISOString(), bufEndDate.toISOString(), booking.id]
          );
        } catch (err: any) {
          if (err.code === "23P01") {
            throw new AppError(
              "SLOT_NOT_AVAILABLE",
              409,
              "The target slot conflicts with another reservation (exclusion collision)"
            );
          }
          throw err;
        }
      } else {
        // Group booking capacity check
        const groupCountRes = await client.query(
          `SELECT count(*) FROM bookings
           WHERE event_type_id = $1
             AND id != $2
             AND status IN ('HELD', 'CONFIRMED')
             AND start_at = $3::timestamptz
             AND (hold_expires_at IS NULL OR hold_expires_at > clock_timestamp())`,
          [booking.event_type_id, booking.id, newStartDate.toISOString()]
        );

        const currentCount = parseInt(groupCountRes.rows[0].count, 10);
        if (currentCount >= booking.capacity) {
          throw new AppError(
            "SLOT_NOT_AVAILABLE",
            409,
            "The target slot has reached maximum group capacity"
          );
        }
      }

      // 6. Update booking
      const updateRes = await client.query(
        `UPDATE bookings
         SET start_at = $1::timestamptz,
             end_at = $2::timestamptz,
             updated_at = clock_timestamp()
         WHERE id = $3
         RETURNING *`,
        [newStartDate.toISOString(), newEndDate.toISOString(), booking.id]
      );
      const updated = updateRes.rows[0];

      // 7. Write transactional outbox notification
      await client.query(
        `INSERT INTO notification_outbox (booking_id, event_type, payload, delivery_status)
         VALUES ($1, 'BOOKING_RESCHEDULED', $2, 'PENDING')`,
        [
          booking.id,
          JSON.stringify({
            bookingId: booking.id,
            eventName: booking.event_name,
            hostName: booking.host_name,
            guestEmail: booking.guest_email,
            previousStartAt: booking.start_at.toISOString(),
            newStartAt: updated.start_at.toISOString(),
            newEndAt: updated.end_at.toISOString(),
          }),
        ]
      );

      return {
        id: updated.id,
        status: updated.status,
        startAt: updated.start_at.toISOString(),
        endAt: updated.end_at.toISOString(),
        guestName: updated.guest_name,
        guestEmail: updated.guest_email,
        message: "Booking rescheduled successfully",
      };
    });
  }

  /**
   * Cancels an existing booking via private management token.
   */
  static async cancelBooking(params: CancelBookingParams) {
    const { rawToken, reason, customUrl } = params;
    const pool = getPool(customUrl);
    const tokenHash = hashManageToken(rawToken);

    return await withTransaction(pool, async (client: PoolClient) => {
      const bRes = await client.query(
        `SELECT b.*, e.name as event_name, h.name as host_name
         FROM bookings b
         JOIN event_types e ON b.event_type_id = e.id
         JOIN hosts h ON e.host_id = h.id
         WHERE b.manage_token_hash = $1
         FOR UPDATE`,
        [tokenHash]
      );

      if (bRes.rows.length === 0) {
        throw new AppError("NOT_FOUND", 404, "Booking not found or invalid management token");
      }
      const booking = bRes.rows[0];

      // Idempotent cancellation
      if (booking.status === "CANCELLED") {
        return {
          id: booking.id,
          status: "CANCELLED",
          message: "Booking is already cancelled",
        };
      }

      if (booking.status !== "CONFIRMED" && booking.status !== "HELD") {
        throw new AppError(
          "INVALID_STATE",
          400,
          `Cannot cancel booking with status: ${booking.status}`
        );
      }

      // Remove from active_reservations so slot becomes immediately available
      await client.query("DELETE FROM active_reservations WHERE booking_id = $1", [booking.id]);

      // Update status to CANCELLED
      const updateRes = await client.query(
        `UPDATE bookings
         SET status = 'CANCELLED',
             cancellation_reason = $1,
             updated_at = clock_timestamp()
         WHERE id = $2
         RETURNING *`,
        [reason || "Cancelled by guest", booking.id]
      );
      const updated = updateRes.rows[0];

      // Record notification into outbox
      await client.query(
        `INSERT INTO notification_outbox (booking_id, event_type, payload, delivery_status)
         VALUES ($1, 'BOOKING_CANCELLED', $2, 'PENDING')`,
        [
          booking.id,
          JSON.stringify({
            bookingId: booking.id,
            eventName: booking.event_name,
            hostName: booking.host_name,
            guestEmail: booking.guest_email,
            startAt: booking.start_at.toISOString(),
            cancellationReason: updated.cancellation_reason,
          }),
        ]
      );

      return {
        id: updated.id,
        status: updated.status,
        cancellationReason: updated.cancellation_reason,
        message: "Booking cancelled successfully",
      };
    });
  }

  /**
   * Allows the authenticated host to cancel any upcoming booking from the dashboard.
   */
  static async hostCancelBooking(params: HostCancelBookingParams) {
    const { hostId, bookingId, reason, customUrl } = params;
    const pool = getPool(customUrl);

    return await withTransaction(pool, async (client: PoolClient) => {
      const bRes = await client.query(
        `SELECT b.*, e.name as event_name, h.name as host_name
         FROM bookings b
         JOIN event_types e ON b.event_type_id = e.id
         JOIN hosts h ON e.host_id = h.id
         WHERE b.id = $1 AND e.host_id = $2
         FOR UPDATE`,
        [bookingId, hostId]
      );

      if (bRes.rows.length === 0) {
        throw new AppError("NOT_FOUND", 404, "Booking not found under host");
      }
      const booking = bRes.rows[0];

      if (booking.status === "CANCELLED") {
        return {
          id: booking.id,
          status: "CANCELLED",
          message: "Booking is already cancelled",
        };
      }

      await client.query("DELETE FROM active_reservations WHERE booking_id = $1", [booking.id]);

      const updateRes = await client.query(
        `UPDATE bookings
         SET status = 'CANCELLED',
             cancellation_reason = $1,
             updated_at = clock_timestamp()
         WHERE id = $2
         RETURNING *`,
        [reason || "Cancelled by host", booking.id]
      );
      const updated = updateRes.rows[0];

      await client.query(
        `INSERT INTO notification_outbox (booking_id, event_type, payload, delivery_status)
         VALUES ($1, 'BOOKING_CANCELLED', $2, 'PENDING')`,
        [
          booking.id,
          JSON.stringify({
            bookingId: booking.id,
            eventName: booking.event_name,
            guestEmail: booking.guest_email,
            startAt: booking.start_at.toISOString(),
            cancellationReason: updated.cancellation_reason,
          }),
        ]
      );

      return {
        id: updated.id,
        status: updated.status,
        cancellationReason: updated.cancellation_reason,
        message: "Booking cancelled by host",
      };
    });
  }

  /**
   * Retrieves booking details by private management token.
   */
  static async getBookingByToken(rawToken: string, customUrl?: string) {
    const pool = getPool(customUrl);
    const tokenHash = hashManageToken(rawToken);

    const res = await pool.query(
      `SELECT b.id, b.guest_name, b.guest_email, b.start_at, b.end_at, b.status, b.cancellation_reason, b.created_at,
              e.id as event_type_id, e.name as event_name, e.slug as event_slug, e.duration_minutes,
              h.name as host_name, h.email as host_email, h.home_timezone
       FROM bookings b
       JOIN event_types e ON b.event_type_id = e.id
       JOIN hosts h ON e.host_id = h.id
       WHERE b.manage_token_hash = $1`,
      [tokenHash]
    );

    if (res.rows.length === 0) {
      throw new AppError("NOT_FOUND", 404, "Booking not found");
    }

    const row = res.rows[0];
    return {
      id: row.id,
      guestName: row.guest_name,
      guestEmail: row.guest_email,
      startAt: row.start_at.toISOString(),
      endAt: row.end_at.toISOString(),
      status: row.status,
      cancellationReason: row.cancellation_reason,
      createdAt: row.created_at.toISOString(),
      event: {
        id: row.event_type_id,
        name: row.event_name,
        slug: row.event_slug,
        durationMinutes: row.duration_minutes,
      },
      host: {
        name: row.host_name,
        email: row.host_email,
        timezone: row.home_timezone,
      },
    };
  }
}
