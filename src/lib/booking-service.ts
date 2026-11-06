import crypto from "crypto";
import { Pool, PoolClient } from "pg";
import { DateTime } from "luxon";
import { getPool, withTransaction } from "@/db";
import { NotificationService } from "./notification-service";
import { MeetService } from "./meet-service";
import { parseTimeString } from "./timezone";

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
  guestName?: string;
  guestEmail?: string;
  meetingPurpose?: string;
  idempotencyKey?: string;
  requestPayload?: any;
  customUrl?: string;
}

export interface ConfirmHoldParams {
  holdId: string;
  guestName?: string;
  guestEmail?: string;
  meetingPurpose?: string;
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
   * Creates a 5-minute temporary hold with transactional concurrency safety,
   * daily duplicate restriction, cross-event host buffer enforcement, and availability check.
   */
  static async createHold(params: CreateHoldParams) {
    const {
      eventTypeId,
      startAt,
      guestName,
      guestEmail,
      meetingPurpose,
      idempotencyKey,
      requestPayload,
      customUrl,
    } = params;
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
      // Step A: Acquire exclusive row-level lock on event_type and fetch host details
      const eventRes = await client.query(
        `SELECT e.id, e.host_id, e.name, e.slug, e.duration_minutes, e.capacity,
                e.buffer_before, e.buffer_after, e.minimum_notice_minutes, e.booking_horizon_days,
                h.name as host_name, h.email as host_email, h.home_timezone
         FROM event_types e
         JOIN hosts h ON e.host_id = h.id
         WHERE e.id = $1
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

      // Calculate host-local calendar date
      const hostLocalDate = DateTime.fromISO(startAt, { zone: "utc" })
        .setZone(event.home_timezone || "UTC")
        .toISODate();

      // Step D: Duplicate booking check (one active booking per guest email per event type per host-local day)
      const normalizedEmail = guestEmail ? guestEmail.toLowerCase().trim() : null;
      if (normalizedEmail && hostLocalDate) {
        const dupRes = await client.query(
          `SELECT id, status, start_at FROM bookings
           WHERE event_type_id = $1
             AND LOWER(TRIM(guest_email)) = $2
             AND host_local_date = $3::date
             AND status IN ('HELD', 'CONFIRMED')
             AND (hold_expires_at IS NULL OR hold_expires_at > clock_timestamp())`,
          [eventTypeId, normalizedEmail, hostLocalDate]
        );

        if (dupRes.rows.length > 0) {
          throw new AppError(
            "DUPLICATE_BOOKING",
            409,
            "You have already booked this appointment type for this date. Please choose another date."
          );
        }
      }

      // Step E: Validate availability against Date Overrides and Weekly Rules
      if (hostLocalDate) {
        const overrideRes = await client.query(
          `SELECT is_available, custom_start_time, custom_end_time 
           FROM date_overrides 
           WHERE host_id = $1 AND override_date = $2::date`,
          [event.host_id, hostLocalDate]
        );

        if (overrideRes.rows.length > 0) {
          const override = overrideRes.rows[0];
          if (!override.is_available) {
            throw new AppError("HOST_UNAVAILABLE", 409, "The host is not available on this date");
          }
          if (override.custom_start_time && override.custom_end_time) {
            const startT = parseTimeString(override.custom_start_time);
            const endT = parseTimeString(override.custom_end_time);
            const startLocal = DateTime.fromISO(startAt, { zone: "utc" }).setZone(event.home_timezone || "UTC");
            const endLocal = DateTime.fromISO(endDate.toISOString(), { zone: "utc" }).setZone(event.home_timezone || "UTC");
            if (
              startLocal.hour < startT.hour ||
              (startLocal.hour === startT.hour && startLocal.minute < startT.minute) ||
              endLocal.hour > endT.hour ||
              (endLocal.hour === endT.hour && endLocal.minute > endT.minute)
            ) {
              throw new AppError("OUTSIDE_WORKING_HOURS", 409, "The selected slot falls outside host working hours");
            }
          }
        }
      }

      // Step F: Buffer & Schedule collision checking across ALL host bookings
      const conflictBookingsRes = await client.query(
        `SELECT b.id, b.event_type_id, b.start_at, b.end_at, e.capacity, e.buffer_before, e.buffer_after
         FROM bookings b
         JOIN event_types e ON b.event_type_id = e.id
         WHERE e.host_id = $1
           AND b.status IN ('HELD', 'CONFIRMED')
           AND (b.hold_expires_at IS NULL OR b.hold_expires_at > clock_timestamp())
           AND tstzrange(
             b.start_at - (e.buffer_before || ' minutes')::interval,
             b.end_at + (e.buffer_after || ' minutes')::interval,
             '[)'
           ) && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
        [event.host_id, bufStartDate.toISOString(), bufEndDate.toISOString()]
      );

      let groupSessionBookingsCount = 0;
      for (const b of conflictBookingsRes.rows) {
        const bStart = new Date(b.start_at).getTime();
        // If this booking is for the exact same event type and identical start time
        if (event.capacity > 1 && b.event_type_id === eventTypeId && bStart === startDate.getTime()) {
          groupSessionBookingsCount++;
        } else {
          // Any other booking whose buffered range intersects candidate buffered range is a conflict!
          throw new AppError(
            "SLOT_NOT_AVAILABLE",
            409,
            "The requested slot is no longer available due to existing bookings or buffer times"
          );
        }
      }

      if (event.capacity > 1 && groupSessionBookingsCount >= event.capacity) {
        throw new AppError("SLOT_NOT_AVAILABLE", 409, "The requested slot has reached maximum capacity");
      }

      // Step G: Insert the hold into bookings table with 5-minute database expiry
      let booking: any;
      try {
        const bookingRes = await client.query(
          `INSERT INTO bookings 
           (event_type_id, guest_name, guest_email, meeting_purpose, start_at, end_at, host_local_date, status, hold_expires_at)
           VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::date, 'HELD', clock_timestamp() + interval '5 minutes')
           RETURNING id, event_type_id, guest_name, guest_email, meeting_purpose, start_at, end_at, host_local_date, status, hold_expires_at, created_at`,
          [
            eventTypeId,
            guestName || null,
            normalizedEmail,
            meetingPurpose || "General Appointment",
            startDate.toISOString(),
            endDate.toISOString(),
            hostLocalDate,
          ]
        );
        booking = bookingRes.rows[0];
      } catch (err: any) {
        if (err.code === "23505" && err.constraint === "uq_active_booking_per_guest_event_date") {
          throw new AppError(
            "DUPLICATE_BOOKING",
            409,
            "You have already booked this appointment type for this date. Please choose another date."
          );
        }
        throw err;
      }

      // Step H: For capacity = 1, insert into active_reservations protected by GiST exclusion constraint
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

      // Step I: Prepare response payload
      const responseData = {
        id: booking.id,
        eventTypeId: booking.event_type_id,
        startAt: booking.start_at.toISOString(),
        endAt: booking.end_at.toISOString(),
        status: booking.status,
        guestEmail: booking.guest_email,
        meetingPurpose: booking.meeting_purpose,
        holdExpiresAt: booking.hold_expires_at.toISOString(),
      };

      // Step J: Persist idempotency record within the same atomic transaction
      if (idempotencyKey && requestHash) {
        try {
          await client.query(
            `INSERT INTO idempotency_keys (key, request_hash, response_payload, response_status)
             VALUES ($1, $2, $3, 201)`,
            [idempotencyKey, requestHash, JSON.stringify(responseData)]
          );
        } catch (err: any) {
          if (err.code === "23505") {
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
   * Confirms an active hold, sets meeting purpose, generates secure management token,
   * creates Google Meet link if configured, and records outbox notification.
   */
  static async confirmHold(params: ConfirmHoldParams) {
    const { holdId, guestName, guestEmail, meetingPurpose, customUrl } = params;
    const pool = getPool(customUrl);

    const result = await withTransaction(pool, async (client: PoolClient) => {
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
        `SELECT b.*, e.name as event_name, e.slug as event_slug, e.host_id, h.name as host_name, h.email as host_email, h.home_timezone
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

      const effectiveGuestEmail = (guestEmail || booking.guest_email || "").toLowerCase().trim();
      const effectiveGuestName = guestName || booking.guest_name || "Guest";
      const effectivePurpose = meetingPurpose || booking.meeting_purpose || "General Appointment";

      // Safe confirmation retry: if already confirmed for this guest, return existing confirmation
      if (booking.status === "CONFIRMED" && booking.guest_email === effectiveGuestEmail) {
        return {
          id: booking.id,
          status: "CONFIRMED",
          startAt: booking.start_at.toISOString(),
          endAt: booking.end_at.toISOString(),
          guestName: booking.guest_name,
          guestEmail: booking.guest_email,
          meetingPurpose: booking.meeting_purpose,
          meetLink: booking.meet_link,
          manageToken: null,
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
        await client.query("UPDATE bookings SET status = 'EXPIRED' WHERE id = $1", [holdId]);
        await client.query("DELETE FROM active_reservations WHERE booking_id = $1", [holdId]);
        throw new AppError(
          "HOLD_EXPIRED",
          410,
          "The temporary hold has expired. Please select a new slot."
        );
      }

      // 4. Duplicate daily check for the guest email
      if (effectiveGuestEmail && booking.host_local_date) {
        const dupRes = await client.query(
          `SELECT id FROM bookings
           WHERE event_type_id = $1
             AND LOWER(TRIM(guest_email)) = $2
             AND host_local_date = $3::date
             AND id != $4
             AND status = 'CONFIRMED'`,
          [booking.event_type_id, effectiveGuestEmail, booking.host_local_date, holdId]
        );

        if (dupRes.rows.length > 0) {
          throw new AppError(
            "DUPLICATE_BOOKING",
            409,
            "You have already booked this appointment type for this date. Please choose another date."
          );
        }
      }

      // 5. Generate cryptographically secure management token (64 hex characters)
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashManageToken(rawToken);

      // 6. Attempt Google Meet link generation if configured for this specific host
      let meetLink: string | null = null;
      let calendarEventId: string | null = null;
      try {
        const meetRes = await MeetService.createMeetLinkForHost({
          hostId: booking.host_id,
          title: `${booking.event_name} — ${effectiveGuestName} & ${booking.host_name}`,
          startAt: booking.start_at.toISOString(),
          endAt: booking.end_at.toISOString(),
          hostEmail: booking.host_email,
          guestEmail: effectiveGuestEmail,
          meetingPurpose: effectivePurpose,
        });
        meetLink = meetRes.meetLink;
        calendarEventId = meetRes.eventId || null;
      } catch {
        meetLink = null;
        calendarEventId = null;
      }

      // 7. Update booking to CONFIRMED and clear hold expiry
      let updatedBooking: any;
      try {
        const updateRes = await client.query(
          `UPDATE bookings
           SET guest_name = $1,
               guest_email = $2,
               meeting_purpose = $3,
               status = 'CONFIRMED',
               hold_expires_at = NULL,
               manage_token_hash = $4,
               meet_link = $5,
               google_calendar_event_id = $6,
               updated_at = clock_timestamp()
           WHERE id = $7
           RETURNING *`,
          [
            effectiveGuestName,
            effectiveGuestEmail,
            effectivePurpose,
            tokenHash,
            meetLink,
            calendarEventId,
            holdId,
          ]
        );
        updatedBooking = updateRes.rows[0];
      } catch (err: any) {
        if (err.code === "23505" && err.constraint === "uq_active_booking_per_guest_event_date") {
          throw new AppError(
            "DUPLICATE_BOOKING",
            409,
            "You have already booked this appointment type for this date. Please choose another date."
          );
        }
        throw err;
      }

      // 8. Record notification into transactional outbox for GUEST and HOST
      const outboxPayload = {
        bookingId: holdId,
        eventName: booking.event_name,
        hostName: booking.host_name,
        hostEmail: booking.host_email,
        guestName: effectiveGuestName,
        guestEmail: effectiveGuestEmail,
        meetingPurpose: effectivePurpose,
        startAt: updatedBooking.start_at.toISOString(),
        endAt: updatedBooking.end_at.toISOString(),
        hostTimezone: booking.home_timezone,
        manageUrl: `/booking/${rawToken}`,
        meetLink,
      };

      // Guest confirmation email
      await NotificationService.enqueue(client, {
        bookingId: holdId,
        eventType: "BOOKING_CONFIRMED",
        recipientEmail: effectiveGuestEmail,
        subject: `Confirmed: ${booking.event_name} with ${booking.host_name}`,
        payload: outboxPayload,
      });

      // Host booking notification email
      await NotificationService.enqueue(client, {
        bookingId: holdId,
        eventType: "BOOKING_CONFIRMED",
        recipientEmail: booking.host_email,
        subject: `New Booking: ${effectiveGuestName} — ${booking.event_name}`,
        payload: outboxPayload,
      });

      return {
        id: updatedBooking.id,
        status: updatedBooking.status,
        startAt: updatedBooking.start_at.toISOString(),
        endAt: updatedBooking.end_at.toISOString(),
        guestName: updatedBooking.guest_name,
        guestEmail: updatedBooking.guest_email,
        meetingPurpose: updatedBooking.meeting_purpose,
        manageToken: rawToken,
        manageUrl: `/booking/${rawToken}`,
        meetLink: updatedBooking.meet_link,
      };
    });

    // Asynchronously dispatch notifications without blocking response
    NotificationService.processOutbox(customUrl).catch((e) =>
      console.error("Outbox process error:", e.message)
    );

    return result;
  }

  /**
   * Reschedules an existing confirmed booking to a new start time atomically,
   * validating duplicate bookings on target date and cross-event buffer integrity.
   */
  static async rescheduleBooking(params: RescheduleBookingParams) {
    const { rawToken, newStartAt, customUrl } = params;
    const pool = getPool(customUrl);
    const tokenHash = hashManageToken(rawToken);

    const result = await withTransaction(pool, async (client: PoolClient) => {
      // 1. Fetch booking with lock
      const bRes = await client.query(
        `SELECT b.*, e.duration_minutes, e.capacity, e.buffer_before, e.buffer_after, e.host_id,
                e.name as event_name, h.name as host_name, h.email as host_email, h.home_timezone
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

      // 2. Lock event type
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

      const newHostLocalDate = DateTime.fromISO(newStartAt, { zone: "utc" })
        .setZone(booking.home_timezone || "UTC")
        .toISODate();

      // 5. Daily duplicate restriction check on the target date
      if (booking.guest_email && newHostLocalDate) {
        const dupRes = await client.query(
          `SELECT id FROM bookings
           WHERE event_type_id = $1
             AND LOWER(TRIM(guest_email)) = LOWER(TRIM($2))
             AND host_local_date = $3::date
             AND id != $4
             AND status IN ('HELD', 'CONFIRMED')
             AND (hold_expires_at IS NULL OR hold_expires_at > clock_timestamp())`,
          [booking.event_type_id, booking.guest_email, newHostLocalDate, booking.id]
        );

        if (dupRes.rows.length > 0) {
          throw new AppError(
            "DUPLICATE_BOOKING",
            409,
            "You already have an active booking for this event on this date."
          );
        }
      }

      // 6. Verify cross-event buffer and capacity for the new slot
      const conflictRes = await client.query(
        `SELECT b.id, b.event_type_id, b.start_at, b.end_at, e.capacity, e.buffer_before, e.buffer_after
         FROM bookings b
         JOIN event_types e ON b.event_type_id = e.id
         WHERE e.host_id = $1
           AND b.id != $2
           AND b.status IN ('HELD', 'CONFIRMED')
           AND (b.hold_expires_at IS NULL OR b.hold_expires_at > clock_timestamp())
           AND tstzrange(
             b.start_at - (e.buffer_before || ' minutes')::interval,
             b.end_at + (e.buffer_after || ' minutes')::interval,
             '[)'
           ) && tstzrange($3::timestamptz, $4::timestamptz, '[)')`,
        [booking.host_id, booking.id, bufStartDate.toISOString(), bufEndDate.toISOString()]
      );

      let groupCount = 0;
      for (const row of conflictRes.rows) {
        const rStart = new Date(row.start_at).getTime();
        if (booking.capacity > 1 && row.event_type_id === booking.event_type_id && rStart === newStartDate.getTime()) {
          groupCount++;
        } else {
          throw new AppError("SLOT_NOT_AVAILABLE", 409, "The target reschedule slot is not available");
        }
      }

      if (booking.capacity > 1 && groupCount >= booking.capacity) {
        throw new AppError("SLOT_NOT_AVAILABLE", 409, "The target slot has reached maximum group capacity");
      }

      // 7. Update active reservation range if capacity = 1
      if (booking.capacity === 1) {
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
      }

      // 8. Update booking record
      const updateRes = await client.query(
        `UPDATE bookings
         SET start_at = $1::timestamptz,
             end_at = $2::timestamptz,
             host_local_date = $3::date,
             updated_at = clock_timestamp()
         WHERE id = $4
         RETURNING *`,
        [newStartDate.toISOString(), newEndDate.toISOString(), newHostLocalDate, booking.id]
      );
      const updated = updateRes.rows[0];

      // 9. Write notifications for GUEST and HOST
      const reschedulePayload = {
        bookingId: booking.id,
        eventName: booking.event_name,
        hostName: booking.host_name,
        hostEmail: booking.host_email,
        guestEmail: booking.guest_email,
        guestName: booking.guest_name,
        meetingPurpose: booking.meeting_purpose,
        previousStartAt: booking.start_at.toISOString(),
        newStartAt: updated.start_at.toISOString(),
        newEndAt: updated.end_at.toISOString(),
        manageUrl: `/bookings/${rawToken}`,
        meetLink: booking.meet_link,
      };

      await NotificationService.enqueue(client, {
        bookingId: booking.id,
        eventType: "BOOKING_RESCHEDULED",
        recipientEmail: booking.guest_email,
        subject: `Rescheduled: ${booking.event_name} with ${booking.host_name}`,
        payload: reschedulePayload,
      });

      await NotificationService.enqueue(client, {
        bookingId: booking.id,
        eventType: "BOOKING_RESCHEDULED",
        recipientEmail: booking.host_email,
        subject: `Rescheduled: ${booking.guest_name} — ${booking.event_name}`,
        payload: reschedulePayload,
      });

      return {
        id: updated.id,
        status: updated.status,
        startAt: updated.start_at.toISOString(),
        endAt: updated.end_at.toISOString(),
        guestName: updated.guest_name,
        guestEmail: updated.guest_email,
        meetingPurpose: updated.meeting_purpose,
        meetLink: updated.meet_link,
        message: "Booking rescheduled successfully",
      };
    });

    NotificationService.processOutbox(customUrl).catch((e) =>
      console.error("Outbox process error:", e.message)
    );

    return result;
  }

  /**
   * Cancels an existing booking via private management token.
   */
  static async cancelBooking(params: CancelBookingParams) {
    const { rawToken, reason, customUrl } = params;
    const pool = getPool(customUrl);
    const tokenHash = hashManageToken(rawToken);

    const result = await withTransaction(pool, async (client: PoolClient) => {
      const bRes = await client.query(
        `SELECT b.*, e.name as event_name, h.name as host_name, h.email as host_email
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
      const effectiveReason = reason || "Cancelled by guest";
      const updateRes = await client.query(
        `UPDATE bookings
         SET status = 'CANCELLED',
             cancellation_reason = $1,
             updated_at = clock_timestamp()
         WHERE id = $2
         RETURNING *`,
        [effectiveReason, booking.id]
      );
      const updated = updateRes.rows[0];

      // Enqueue cancellation notification to GUEST and HOST
      const cancelPayload = {
        bookingId: booking.id,
        eventName: booking.event_name,
        hostName: booking.host_name,
        hostEmail: booking.host_email,
        guestEmail: booking.guest_email,
        guestName: booking.guest_name,
        startAt: booking.start_at.toISOString(),
        cancellationReason: effectiveReason,
      };

      if (booking.guest_email) {
        await NotificationService.enqueue(client, {
          bookingId: booking.id,
          eventType: "BOOKING_CANCELLED",
          recipientEmail: booking.guest_email,
          subject: `Cancelled: ${booking.event_name} with ${booking.host_name}`,
          payload: cancelPayload,
        });
      }

      await NotificationService.enqueue(client, {
        bookingId: booking.id,
        eventType: "BOOKING_CANCELLED",
        recipientEmail: booking.host_email,
        subject: `Cancelled by Guest: ${booking.guest_name || "Guest"} — ${booking.event_name}`,
        payload: cancelPayload,
      });

      return {
        id: updated.id,
        status: updated.status,
        cancellationReason: updated.cancellation_reason,
        message: "Booking cancelled successfully",
      };
    });

    NotificationService.processOutbox(customUrl).catch((e) =>
      console.error("Outbox process error:", e.message)
    );

    return result;
  }

  /**
   * Allows the authenticated host to cancel any upcoming booking from the dashboard.
   */
  static async hostCancelBooking(params: HostCancelBookingParams) {
    const { hostId, bookingId, reason, customUrl } = params;
    const pool = getPool(customUrl);

    const result = await withTransaction(pool, async (client: PoolClient) => {
      const bRes = await client.query(
        `SELECT b.*, e.name as event_name, h.name as host_name, h.email as host_email
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

      const effectiveReason = reason || "Cancelled by host";
      const updateRes = await client.query(
        `UPDATE bookings
         SET status = 'CANCELLED',
             cancellation_reason = $1,
             updated_at = clock_timestamp()
         WHERE id = $2
         RETURNING *`,
        [effectiveReason, booking.id]
      );
      const updated = updateRes.rows[0];

      // Enqueue cancellation notification to GUEST and HOST
      const cancelPayload = {
        bookingId: booking.id,
        eventName: booking.event_name,
        hostName: booking.host_name,
        hostEmail: booking.host_email,
        guestEmail: booking.guest_email,
        guestName: booking.guest_name,
        startAt: booking.start_at.toISOString(),
        cancellationReason: effectiveReason,
      };

      if (booking.guest_email) {
        await NotificationService.enqueue(client, {
          bookingId: booking.id,
          eventType: "BOOKING_CANCELLED",
          recipientEmail: booking.guest_email,
          subject: `Appointment Cancelled: ${booking.event_name}`,
          payload: cancelPayload,
        });
      }

      return {
        id: updated.id,
        status: updated.status,
        cancellationReason: updated.cancellation_reason,
        message: "Booking cancelled by host",
      };
    });

    NotificationService.processOutbox(customUrl).catch((e) =>
      console.error("Outbox process error:", e.message)
    );

    return result;
  }

  /**
   * Retrieves booking details by private management token.
   */
  static async getBookingByToken(rawToken: string, customUrl?: string) {
    const pool = getPool(customUrl);
    const tokenHash = hashManageToken(rawToken);

    const res = await pool.query(
      `SELECT b.id, b.guest_name, b.guest_email, b.meeting_purpose, b.start_at, b.end_at,
              b.status, b.cancellation_reason, b.meet_link, b.created_at,
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
      meetingPurpose: row.meeting_purpose,
      startAt: row.start_at.toISOString(),
      endAt: row.end_at.toISOString(),
      status: row.status,
      cancellationReason: row.cancellation_reason,
      meetLink: row.meet_link,
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
