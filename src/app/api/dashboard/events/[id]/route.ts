import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getPool, withTransaction } from "@/db";
import { eventTypeSchema } from "@/lib/validations";
import { NotificationService } from "@/lib/notification-service";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      throw new AppError("UNAUTHORIZED", 401, "Not authenticated");
    }

    const pool = getPool();
    const res = await pool.query(
      `SELECT id, name, slug, description, category, status,
              duration_minutes as "durationMinutes", capacity, 
              buffer_before as "bufferBefore", buffer_after as "bufferAfter", 
              minimum_notice_minutes as "minimumNoticeMinutes", 
              booking_horizon_days as "bookingHorizonDays", created_at as "createdAt"
       FROM event_types
       WHERE id = $1 AND host_id = $2`,
      [params.id, session.id]
    );

    if (res.rows.length === 0) {
      throw new AppError("NOT_FOUND", 404, "Event type not found");
    }

    return apiSuccess({ eventType: res.rows[0] });
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      throw new AppError("UNAUTHORIZED", 401, "Not authenticated");
    }

    const rawBody = await request.json();
    const validated = eventTypeSchema.parse(rawBody);
    const pool = getPool();

    // Verify ownership
    const checkRes = await pool.query(
      "SELECT id FROM event_types WHERE id = $1 AND host_id = $2",
      [params.id, session.id]
    );
    if (checkRes.rows.length === 0) {
      throw new AppError("NOT_FOUND", 404, "Event type not found");
    }

    // Check slug collision with other event types
    const slugCheck = await pool.query(
      "SELECT id FROM event_types WHERE host_id = $1 AND slug = $2 AND id != $3",
      [session.id, validated.slug, params.id]
    );
    if (slugCheck.rows.length > 0) {
      throw new AppError("SLUG_EXISTS", 409, "Another event type already uses this slug");
    }

    const res = await pool.query(
      `UPDATE event_types
       SET name = $1,
           slug = $2,
           description = $3,
           category = $4,
           status = $5,
           duration_minutes = $6,
           capacity = $7,
           buffer_before = $8,
           buffer_after = $9,
           minimum_notice_minutes = $10,
           booking_horizon_days = $11
       WHERE id = $12 AND host_id = $13
       RETURNING id, name, slug, description, category, status,
                 duration_minutes as "durationMinutes", capacity, 
                 buffer_before as "bufferBefore", buffer_after as "bufferAfter", 
                 minimum_notice_minutes as "minimumNoticeMinutes", 
                 booking_horizon_days as "bookingHorizonDays", created_at as "createdAt"`,
      [
        validated.name,
        validated.slug,
        validated.description || "",
        validated.category || "One-on-One",
        validated.status || "PUBLISHED",
        validated.durationMinutes,
        validated.capacity,
        validated.bufferBefore,
        validated.bufferAfter,
        validated.minimumNoticeMinutes,
        validated.bookingHorizonDays,
        params.id,
        session.id,
      ]
    );

    const updatedEvent = res.rows[0];

    // Notify host about event configuration update
    const client = await pool.connect();
    try {
      await NotificationService.enqueue(client, {
        eventType: "EVENT_UPDATED",
        recipientEmail: session.email,
        relatedHostId: session.id,
        subject: "Your Slotbook event has been updated",
        payload: {
          eventName: updatedEvent.name,
          hostName: session.name,
          hostEmail: session.email,
          updatedAt: new Date().toISOString(),
        },
      });
      NotificationService.processOutbox().catch((e) =>
        console.error("Outbox process error:", e.message)
      );
    } finally {
      client.release();
    }

    return apiSuccess({ eventType: updatedEvent });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      throw new AppError("UNAUTHORIZED", 401, "Not authenticated");
    }

    const pool = getPool();

    // Verify ownership
    const eventRes = await pool.query(
      "SELECT id, name FROM event_types WHERE id = $1 AND host_id = $2",
      [params.id, session.id]
    );
    if (eventRes.rows.length === 0) {
      throw new AppError("NOT_FOUND", 404, "Event type not found");
    }
    const event = eventRes.rows[0];

    // Check url search params or json body for confirmation/reason
    let confirm = false;
    let reason = "Event discontinued by host";
    try {
      const body = await request.json();
      confirm = !!body.confirm;
      if (body.reason) reason = body.reason;
    } catch {
      const { searchParams } = new URL(request.url);
      confirm = searchParams.get("confirm") === "true";
      if (searchParams.get("reason")) reason = searchParams.get("reason")!;
    }

    // Check future confirmed bookings
    const futureBookingsRes = await pool.query(
      `SELECT b.id, b.guest_email, b.guest_name, b.start_at
       FROM bookings b
       WHERE b.event_type_id = $1
         AND b.status = 'CONFIRMED'
         AND b.start_at >= clock_timestamp()`,
      [params.id]
    );

    if (futureBookingsRes.rows.length > 0 && !confirm) {
      return apiSuccess({
        requiresConfirmation: true,
        affectedBookingsCount: futureBookingsRes.rows.length,
        message: `This event has ${futureBookingsRes.rows.length} upcoming confirmed booking(s). Deleting it will cancel these bookings and notify the guests.`,
      }, 200);
    }

    // Transactionally cancel affected bookings, notify affected guests, delete event, and notify host
    await withTransaction(pool, async (client) => {
      let notifiedCount = 0;
      for (const booking of futureBookingsRes.rows) {
        await client.query(
          `UPDATE bookings
           SET status = 'CANCELLED',
               cancellation_reason = $1,
               updated_at = clock_timestamp()
           WHERE id = $2`,
          [reason, booking.id]
        );

        await client.query("DELETE FROM active_reservations WHERE booking_id = $1", [booking.id]);

        if (booking.guest_email) {
          notifiedCount++;
          await NotificationService.enqueue(client, {
            bookingId: booking.id,
            relatedHostId: session.id,
            eventType: "EVENT_CANCELLED",
            recipientEmail: booking.guest_email,
            subject: "Your Slotbook appointment has been cancelled",
            payload: {
              bookingId: booking.id,
              bookingReference: booking.id,
              eventName: event.name,
              hostName: session.name,
              guestName: booking.guest_name,
              guestEmail: booking.guest_email,
              startAt: booking.start_at.toISOString(),
              cancellationReason: reason,
              cancelledBy: "Host",
              status: "CANCELLED",
            },
          });
        }
      }

      await client.query(
        "DELETE FROM event_types WHERE id = $1 AND host_id = $2",
        [params.id, session.id]
      );

      // Dedicated notification to host regarding event deletion
      await NotificationService.enqueue(client, {
        eventType: "EVENT_DELETED",
        recipientEmail: session.email,
        relatedHostId: session.id,
        subject: "Your Slotbook event has been deleted",
        payload: {
          eventName: event.name,
          hostName: session.name,
          deletedAt: new Date().toISOString(),
          reason,
          affectedBookingsCount: futureBookingsRes.rows.length,
          guestsNotifiedCount: notifiedCount,
          status: "DELETED",
        },
      });
    });

    NotificationService.processOutbox().catch((e) =>
      console.error("Outbox process error:", e.message)
    );

    return apiSuccess({
      message: "Event type deleted successfully",
      affectedBookingsCancelled: futureBookingsRes.rows.length,
    });
  } catch (err) {
    return apiError(err);
  }
}
