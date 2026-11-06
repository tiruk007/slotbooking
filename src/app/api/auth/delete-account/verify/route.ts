import { NextRequest } from "next/server";
import { getSession, clearSessionCookie } from "@/lib/auth";
import { OtpService } from "@/lib/otp-service";
import { hostDeleteAccountSchema } from "@/lib/validations";
import { getPool, withTransaction } from "@/db";
import { NotificationService } from "@/lib/notification-service";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      throw new AppError("UNAUTHORIZED", 401, "Not authenticated");
    }

    const rawBody = await request.json();
    const validated = hostDeleteAccountSchema.parse(rawBody);

    // 1. Verify OTP
    await OtpService.verifyOtp({
      email: session.email,
      purpose: "HOST_DELETE_ACCOUNT",
      code: validated.code,
    });

    const pool = getPool();

    // 2. Transactionally cancel future bookings, notify guests, and delete account
    await withTransaction(pool, async (client) => {
      // Step A: Find all future confirmed bookings
      const futureBookingsRes = await client.query(
        `SELECT b.id, b.guest_email, b.guest_name, b.start_at, e.name as event_name
         FROM bookings b
         JOIN event_types e ON b.event_type_id = e.id
         WHERE e.host_id = $1
           AND b.status = 'CONFIRMED'
           AND b.start_at >= clock_timestamp()`,
        [session.id]
      );

      // Step B: Cancel future bookings and enqueue notifications for affected guests
      for (const booking of futureBookingsRes.rows) {
        await client.query(
          `UPDATE bookings
           SET status = 'CANCELLED',
               cancellation_reason = 'Host account deleted',
               updated_at = clock_timestamp()
           WHERE id = $1`,
          [booking.id]
        );

        await client.query("DELETE FROM active_reservations WHERE booking_id = $1", [booking.id]);

        if (booking.guest_email) {
          await NotificationService.enqueue(client, {
            bookingId: booking.id,
            eventType: "BOOKING_CANCELLED",
            recipientEmail: booking.guest_email,
            subject: `Notice: Appointment Cancelled — ${booking.event_name}`,
            payload: {
              bookingId: booking.id,
              eventName: booking.event_name,
              hostName: session.name,
              guestName: booking.guest_name,
              guestEmail: booking.guest_email,
              startAt: booking.start_at.toISOString(),
              cancellationReason: "The host's account was permanently closed.",
            },
          });
        }
      }

      // Step C: Enqueue account deletion notice for the host
      await NotificationService.enqueue(client, {
        eventType: "HOST_ACCOUNT_DELETED",
        recipientEmail: session.email,
        subject: "Your Slotbook Account Has Been Deleted",
        payload: {
          hostName: session.name,
          hostEmail: session.email,
        },
      });

      // Step D: Delete host record (cascades to event_types, availability_rules, date_overrides)
      await client.query("DELETE FROM hosts WHERE id = $1", [session.id]);
    });

    // Step E: Clear host session cookie
    await clearSessionCookie();

    // Step F: Process outbox notifications immediately
    NotificationService.processOutbox().catch((e) =>
      console.error("Outbox error after account deletion:", e.message)
    );

    return apiSuccess({ message: "Account and future bookings successfully deleted" }, 200);
  } catch (err) {
    return apiError(err);
  }
}

