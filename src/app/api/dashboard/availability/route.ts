import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getPool, withTransaction } from "@/db";
import { isValidIanaZone } from "@/lib/timezone";
import { availabilityRuleSchema, dateOverrideSchema } from "@/lib/validations";
import { NotificationService } from "@/lib/notification-service";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateAvailabilitySchema = z.object({
  homeTimezone: z.string().optional(),
  rules: z.array(availabilityRuleSchema),
  overrides: z.array(dateOverrideSchema),
  confirmCancellation: z.boolean().optional(),
  cancellationReason: z.string().optional(),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      throw new AppError("UNAUTHORIZED", 401, "Not authenticated");
    }

    const pool = getPool();

    // 1. Host info
    const hostRes = await pool.query(
      "SELECT home_timezone as \"homeTimezone\" FROM hosts WHERE id = $1",
      [session.id]
    );

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

    return apiSuccess({
      homeTimezone: hostRes.rows[0]?.homeTimezone || "UTC",
      rules: rulesRes.rows,
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
    const validated = updateAvailabilitySchema.parse(rawBody);

    if (validated.homeTimezone && !isValidIanaZone(validated.homeTimezone)) {
      throw new AppError("INVALID_TIMEZONE", 400, `Invalid IANA timezone: ${validated.homeTimezone}`);
    }

    const pool = getPool();

    // Find all unavailable overrides (days off)
    const unavailableDates = validated.overrides
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

    // If bookings are scheduled on days off and confirmation not provided, warn host
    if (affectedBookings.length > 0 && !validated.confirmCancellation) {
      return apiSuccess({
        requiresConfirmation: true,
        affectedBookingsCount: affectedBookings.length,
        affectedBookings: affectedBookings.map((b) => ({
          id: b.id,
          guestName: b.guest_name,
          guestEmail: b.guest_email,
          startAt: b.start_at,
          eventName: b.event_name,
        })),
        message: `You have ${affectedBookings.length} confirmed booking(s) scheduled on dates you marked as unavailable. Please confirm if you wish to cancel them and notify guests.`,
      }, 200);
    }

    await withTransaction(pool, async (client) => {
      // 1. Update timezone if provided
      if (validated.homeTimezone) {
        await client.query("UPDATE hosts SET home_timezone = $1 WHERE id = $2", [
          validated.homeTimezone,
          session.id,
        ]);
      }

      // 2. Cancel affected bookings if confirmed
      if (affectedBookings.length > 0 && validated.confirmCancellation) {
        const cancelReason = validated.cancellationReason || "Host is unavailable on this date";
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
              eventType: "BOOKING_CANCELLED",
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
              },
            });
          }
        }
      }

      // 3. Replace availability rules
      await client.query("DELETE FROM availability_rules WHERE host_id = $1", [session.id]);
      for (const rule of validated.rules) {
        await client.query(
          `INSERT INTO availability_rules (host_id, weekday, start_time, end_time)
           VALUES ($1, $2, $3::time, $4::time)`,
          [session.id, rule.weekday, rule.startTime, rule.endTime]
        );
      }

      // 4. Replace date overrides
      await client.query("DELETE FROM date_overrides WHERE host_id = $1", [session.id]);
      for (const o of validated.overrides) {
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
    });

    NotificationService.processOutbox().catch((e) =>
      console.error("Outbox process error:", e.message)
    );

    return apiSuccess({
      message: "Availability schedule and overrides updated successfully",
      affectedBookingsCancelled: affectedBookings.length,
    });
  } catch (err) {
    return apiError(err);
  }
}
