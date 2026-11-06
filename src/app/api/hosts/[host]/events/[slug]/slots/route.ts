import { NextRequest } from "next/server";
import { DateTime } from "luxon";
import { getPool } from "@/db";
import { calculateAvailableSlots } from "@/lib/slots";
import { isValidIanaZone } from "@/lib/timezone";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { host: string; slug: string } }
) {
  try {
    const { host: hostParam, slug: eventSlug } = params;
    const { searchParams } = new URL(request.url);

    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const guestTz = searchParams.get("tz") || "UTC";

    if (!isValidIanaZone(guestTz)) {
      throw new AppError("INVALID_TIMEZONE", 400, `Invalid IANA timezone: ${guestTz}`);
    }

    const pool = getPool();

    // 1. Fetch host (by slug, email, id, or case-insensitive email)
    const hostRes = await pool.query(
      `SELECT id, name, email, slug, home_timezone 
       FROM hosts 
       WHERE slug = $1 OR email = $1 OR id::text = $1 OR LOWER(email) = LOWER($1)
       LIMIT 1`,
      [decodeURIComponent(hostParam)]
    );

    if (hostRes.rows.length === 0) {
      throw new AppError("HOST_NOT_FOUND", 404, "Host not found");
    }
    const host = hostRes.rows[0];

    // 2. Fetch event type
    const eventRes = await pool.query(
      `SELECT id, host_id, name, slug, duration_minutes, capacity, buffer_before, buffer_after, minimum_notice_minutes, booking_horizon_days
       FROM event_types
       WHERE host_id = $1 AND slug = $2`,
      [host.id, eventSlug]
    );

    if (eventRes.rows.length === 0) {
      throw new AppError("EVENT_NOT_FOUND", 404, "Event type not found for this host");
    }
    const event = eventRes.rows[0];

    // 3. Define time window (default: next 30 days)
    const now = DateTime.utc();
    const from = fromParam
      ? DateTime.fromISO(fromParam, { zone: "utc" })
      : now;
    const to = toParam
      ? DateTime.fromISO(toParam, { zone: "utc" })
      : now.plus({ days: event.booking_horizon_days || 30 });

    if (!from.isValid || !to.isValid || from >= to) {
      throw new AppError("INVALID_DATE_RANGE", 400, "Invalid from/to date range");
    }

    // 4. Fetch availability rules
    const rulesRes = await pool.query(
      `SELECT weekday, start_time::text as "startTime", end_time::text as "endTime"
       FROM availability_rules
       WHERE host_id = $1`,
      [host.id]
    );

    // 5. Fetch date overrides
    const overridesRes = await pool.query(
      `SELECT override_date::text as "overrideDate", is_available as "isAvailable", 
              custom_start_time::text as "customStartTime", custom_end_time::text as "customEndTime"
       FROM date_overrides
       WHERE host_id = $1`,
      [host.id]
    );

    // 6. Expire stale holds first to make sure slot calculation observes fresh availability
    await pool.query(`
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

    // 7. Fetch active bookings (HELD not expired, or CONFIRMED)
    const bookingsRes = await pool.query(
      `SELECT b.event_type_id, b.start_at, b.end_at, e.buffer_before, e.buffer_after
       FROM bookings b
       JOIN event_types e ON b.event_type_id = e.id
       WHERE e.host_id = $1
         AND b.status IN ('HELD', 'CONFIRMED')
         AND (b.hold_expires_at IS NULL OR b.hold_expires_at > clock_timestamp())
         AND (b.end_at + (e.buffer_after || ' minutes')::interval) >= $2::timestamptz
         AND (b.start_at - (e.buffer_before || ' minutes')::interval) <= $3::timestamptz`,
      [host.id, from.toISO(), to.toISO()]
    );

    const existingBookings = bookingsRes.rows.map((r) => ({
      eventTypeId: r.event_type_id,
      startAt: new Date(r.start_at),
      endAt: new Date(r.end_at),
      bufferBefore: r.buffer_before,
      bufferAfter: r.buffer_after,
    }));

    // 8. Calculate available slots
    const slots = calculateAvailableSlots({
      hostTimezone: host.home_timezone,
      from,
      to,
      eventType: {
        id: event.id,
        durationMinutes: event.duration_minutes,
        capacity: event.capacity,
        bufferBefore: event.buffer_before,
        bufferAfter: event.buffer_after,
        minimumNoticeMinutes: event.minimum_notice_minutes,
        bookingHorizonDays: event.booking_horizon_days,
      },
      rules: rulesRes.rows,
      overrides: overridesRes.rows,
      existingBookings,
      now,
    });

    return apiSuccess({
      host: {
        id: host.id,
        name: host.name,
        email: host.email,
        timezone: host.home_timezone,
      },
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug,
        durationMinutes: event.duration_minutes,
        capacity: event.capacity,
      },
      timeRange: {
        from: from.toISO(),
        to: to.toISO(),
        guestTimezone: guestTz,
      },
      slots,
    });
  } catch (err) {
    return apiError(err);
  }
}
