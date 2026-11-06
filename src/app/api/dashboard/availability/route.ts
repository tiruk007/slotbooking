import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getPool, withTransaction } from "@/db";
import { isValidIanaZone } from "@/lib/timezone";
import { updateAvailabilityInputSchema } from "@/lib/validations";
import { NotificationService } from "@/lib/notification-service";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

export const dynamic = "force-dynamic";

interface NormalizedRule {
  weekday: number;
  startTime: string; // HH:mm:ss
  endTime: string; // HH:mm:ss
}

function normalizeTime(t: string): string {
  const parts = t.trim().split(":");
  if (parts.length === 2) {
    return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}:00`;
  }
  return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}:${(parts[2] || "00").padStart(2, "0")}`;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      throw new AppError("UNAUTHORIZED", 401, "Not authenticated");
    }

    const pool = getPool();

    // 1. Host info
    const hostRes = await pool.query(
      `SELECT home_timezone as "homeTimezone" FROM hosts WHERE id = $1`,
      [session.id]
    );
    const hostTimezone = hostRes.rows[0]?.homeTimezone || "UTC";

    // 2. Rules
    const rulesRes = await pool.query(
      `SELECT id, weekday, start_time::text as "startTime", end_time::text as "endTime"
       FROM availability_rules
       WHERE host_id = $1
       ORDER BY weekday ASC, start_time ASC`,
      [session.id]
    );

    // 3. Overrides
    const overridesRes = await pool.query(
      `SELECT id, override_date::text as "overrideDate", is_available as "isAvailable", 
              custom_start_time::text as "customStartTime", custom_end_time::text as "customEndTime"
       FROM date_overrides
       WHERE host_id = $1
       ORDER BY override_date ASC`,
      [session.id]
    );

    // Group rules by weekday (1..7)
    const groupedWeeklyRules = [1, 2, 3, 4, 5, 6, 7].map((w) => ({
      weekday: w,
      windows: rulesRes.rows
        .filter((r) => r.weekday === w)
        .map((r) => ({
          start: r.startTime.slice(0, 5),
          end: r.endTime.slice(0, 5),
        })),
    }));

    return apiSuccess({
      homeTimezone: hostTimezone,
      timezone: hostTimezone,
      weeklyRules: groupedWeeklyRules,
      rules: rulesRes.rows,
      dateOverrides: overridesRes.rows,
      overrides: overridesRes.rows,
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      throw new AppError("UNAUTHORIZED", 401, "Not authenticated");
    }

    const rawBody = await request.json();
    const validated = updateAvailabilityInputSchema.parse(rawBody);

    const targetTimezone = validated.timezone || validated.homeTimezone;
    if (targetTimezone && !isValidIanaZone(targetTimezone)) {
      throw new AppError("INVALID_TIMEZONE", 400, `Invalid IANA timezone: ${targetTimezone}`);
    }

    // 1. Normalize weekly availability rules
    const normalizedRules: NormalizedRule[] = [];
    const rawWeekly = validated.weeklyRules || validated.rules;

    if (rawWeekly !== undefined) {
      for (const item of rawWeekly) {
        if ("windows" in item && Array.isArray(item.windows)) {
          // Grouped weekday windows
          for (const win of item.windows) {
            normalizedRules.push({
              weekday: item.weekday,
              startTime: normalizeTime(win.start),
              endTime: normalizeTime(win.end),
            });
          }
        } else if ("startTime" in item && "endTime" in item) {
          // Flat rule
          normalizedRules.push({
            weekday: item.weekday,
            startTime: normalizeTime(item.startTime),
            endTime: normalizeTime(item.endTime),
          });
        }
      }

      // Group and validate rules per weekday
      const rulesByDay = new Map<number, NormalizedRule[]>();
      for (const rule of normalizedRules) {
        if (rule.weekday < 1 || rule.weekday > 7) {
          throw new AppError("VALIDATION_ERROR", 400, "Weekday must be between 1 (Monday) and 7 (Sunday)");
        }

        const startMin = timeToMinutes(rule.startTime);
        const endMin = timeToMinutes(rule.endTime);

        if (startMin >= endMin) {
          throw new AppError(
            "INVALID_TIME_RANGE",
            400,
            `Start time (${rule.startTime.slice(0, 5)}) must be earlier than end time (${rule.endTime.slice(0, 5)})`
          );
        }

        const list = rulesByDay.get(rule.weekday) || [];
        list.push(rule);
        rulesByDay.set(rule.weekday, list);
      }

      // Check for duplicate or overlapping windows on the same day
      for (const [day, dayRules] of Array.from(rulesByDay.entries())) {
        for (let i = 0; i < dayRules.length; i++) {
          for (let j = i + 1; j < dayRules.length; j++) {
            const a = dayRules[i];
            const b = dayRules[j];

            const aStart = timeToMinutes(a.startTime);
            const aEnd = timeToMinutes(a.endTime);
            const bStart = timeToMinutes(b.startTime);
            const bEnd = timeToMinutes(b.endTime);

            // Duplicate window check
            if (aStart === bStart && aEnd === bEnd) {
              throw new AppError(
                "DUPLICATE_WINDOW",
                400,
                `Duplicate availability window detected on weekday ${day}: ${a.startTime.slice(0, 5)} - ${a.endTime.slice(0, 5)}`
              );
            }

            // Overlapping window check
            if (aStart < bEnd && bStart < aEnd) {
              throw new AppError(
                "OVERLAPPING_WINDOWS",
                400,
                `Availability windows on weekday ${day} overlap: [${a.startTime.slice(0, 5)}, ${a.endTime.slice(0, 5)}] and [${b.startTime.slice(0, 5)}, ${b.endTime.slice(0, 5)}]`
              );
            }
          }
        }
      }
    }

    // 2. Normalize date overrides
    const rawOverrides = validated.dateOverrides || validated.overrides;
    const normalizedOverrides = (rawOverrides || []).map((o) => {
      let customStart: string | null = null;
      let customEnd: string | null = null;

      if (o.isAvailable && o.customStartTime && o.customEndTime) {
        customStart = normalizeTime(o.customStartTime);
        customEnd = normalizeTime(o.customEndTime);

        if (timeToMinutes(customStart) >= timeToMinutes(customEnd)) {
          throw new AppError(
            "INVALID_TIME_RANGE",
            400,
            `Override custom start time (${customStart.slice(0, 5)}) must be earlier than end time (${customEnd.slice(0, 5)})`
          );
        }
      }

      return {
        overrideDate: o.overrideDate,
        isAvailable: o.isAvailable,
        customStartTime: customStart,
        customEndTime: customEnd,
      };
    });

    const pool = getPool();
    const shouldConfirm = validated.confirmConflicts ?? validated.confirmCancellation ?? false;

    // 3. Find affected bookings if days off were marked
    const unavailableDates = normalizedOverrides
      .filter((o) => !o.isAvailable)
      .map((o) => o.overrideDate);

    let affectedBookings: any[] = [];
    if (unavailableDates.length > 0) {
      const affectedRes = await pool.query(
        `SELECT b.id, b.guest_name, b.guest_email, b.start_at, b.host_local_date, e.name as event_name
         FROM bookings b
         JOIN event_types e ON b.event_type_id = e.id
         WHERE e.host_id = $1
           AND b.status = 'CONFIRMED'
           AND b.start_at >= clock_timestamp()
           AND b.host_local_date = ANY($2::date[])`,
        [session.id, unavailableDates]
      );
      affectedBookings = affectedRes.rows;
    }

    if (affectedBookings.length > 0 && !shouldConfirm) {
      return apiSuccess({
        requiresConfirmation: true,
        affectedBookingsCount: affectedBookings.length,
        conflictingBookings: affectedBookings.map((b) => ({
          id: b.id,
          guestName: b.guest_name,
          guestEmail: b.guest_email,
          startAt: b.start_at,
          eventName: b.event_name,
        })),
        message: `You have ${affectedBookings.length} confirmed booking(s) scheduled on dates you marked as unavailable. Please confirm if you wish to cancel them and notify guests.`,
      }, 200);
    }

    // 4. Transactionally apply changes
    await withTransaction(pool, async (client) => {
      // Timezone
      if (targetTimezone) {
        await client.query("UPDATE hosts SET home_timezone = $1 WHERE id = $2", [
          targetTimezone,
          session.id,
        ]);
      }

      // Cancel affected bookings if confirmed
      if (affectedBookings.length > 0 && shouldConfirm) {
        const cancelReason = validated.cancellationReason || "Host marked date as unavailable";
        for (const b of affectedBookings) {
          await client.query(
            `UPDATE bookings
             SET status = 'CANCELLED',
                 cancellation_reason = $1,
                 updated_at = clock_timestamp()
             WHERE id = $2`,
            [cancelReason, b.id]
          );

          await client.query("DELETE FROM active_reservations WHERE booking_id = $1", [b.id]);

          if (b.guest_email) {
            await NotificationService.enqueue(client, {
              bookingId: b.id,
              relatedHostId: session.id,
              eventType: "HOST_CANCELLED_BOOKING",
              recipientEmail: b.guest_email,
              subject: `Appointment Cancelled: ${b.event_name}`,
              payload: {
                bookingId: b.id,
                eventName: b.event_name,
                hostName: session.name,
                guestName: b.guest_name,
                guestEmail: b.guest_email,
                startAt: new Date(b.start_at).toISOString(),
                cancellationReason: cancelReason,
                cancelledBy: "Host",
              },
            });
          }
        }
      }

      // Replace weekly availability rules (only if provided)
      if (rawWeekly !== undefined) {
        await client.query("DELETE FROM availability_rules WHERE host_id = $1", [session.id]);
        for (const rule of normalizedRules) {
          await client.query(
            `INSERT INTO availability_rules (host_id, weekday, start_time, end_time)
             VALUES ($1, $2, $3::time, $4::time)`,
            [session.id, rule.weekday, rule.startTime, rule.endTime]
          );
        }
      }

      // Replace date overrides (only if provided)
      if (rawOverrides !== undefined) {
        await client.query("DELETE FROM date_overrides WHERE host_id = $1", [session.id]);
        for (const o of normalizedOverrides) {
          await client.query(
            `INSERT INTO date_overrides (host_id, override_date, is_available, custom_start_time, custom_end_time)
             VALUES ($1, $2::date, $3, $4::time, $5::time)`,
            [
              session.id,
              o.overrideDate,
              o.isAvailable,
              o.customStartTime || null,
              o.customEndTime || null,
            ]
          );
        }
      }
    });

    NotificationService.processOutbox().catch((e) =>
      console.error("Outbox process error:", e.message)
    );

    // Group rules for response
    const groupedWeeklyRules = [1, 2, 3, 4, 5, 6, 7].map((w) => ({
      weekday: w,
      windows: normalizedRules
        .filter((r) => r.weekday === w)
        .map((r) => ({
          start: r.startTime.slice(0, 5),
          end: r.endTime.slice(0, 5),
        })),
    }));

    return apiSuccess({
      message: "Weekly availability rules saved successfully!",
      weeklyRules: groupedWeeklyRules,
      rules: normalizedRules,
      dateOverrides: normalizedOverrides,
      affectedBookingsCancelled: affectedBookings.length,
    });
  } catch (err) {
    return apiError(err);
  }
}
