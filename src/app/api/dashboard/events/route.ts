import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getPool } from "@/db";
import { eventTypeSchema } from "@/lib/validations";
import { NotificationService } from "@/lib/notification-service";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

export const dynamic = "force-dynamic";

export async function GET() {
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
       WHERE host_id = $1
       ORDER BY created_at DESC`,
      [session.id]
    );

    return apiSuccess({ eventTypes: res.rows });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      throw new AppError("UNAUTHORIZED", 401, "Not authenticated");
    }

    const rawBody = await request.json();
    const validated = eventTypeSchema.parse(rawBody);
    const pool = getPool();

    // Check slug collision for this host
    const slugCheck = await pool.query(
      "SELECT id FROM event_types WHERE host_id = $1 AND slug = $2",
      [session.id, validated.slug]
    );
    if (slugCheck.rows.length > 0) {
      throw new AppError("SLUG_EXISTS", 409, "An event type with this slug already exists");
    }

    const res = await pool.query(
      `INSERT INTO event_types 
       (host_id, name, slug, description, category, status, duration_minutes, capacity, buffer_before, buffer_after, minimum_notice_minutes, booking_horizon_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, name, slug, description, category, status, duration_minutes as "durationMinutes", capacity, 
                 buffer_before as "bufferBefore", buffer_after as "bufferAfter", 
                 minimum_notice_minutes as "minimumNoticeMinutes", 
                 booking_horizon_days as "bookingHorizonDays", created_at as "createdAt"`,
      [
        session.id,
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
      ]
    );

    const newEvent = res.rows[0];

    // Notification: send only to host
    const client = await pool.connect();
    try {
      await NotificationService.enqueue(client, {
        eventType: "EVENT_CREATED",
        recipientEmail: session.email,
        subject: `New Event Created: ${newEvent.name}`,
        payload: {
          eventName: newEvent.name,
          hostName: session.name,
          hostEmail: session.email,
          durationMinutes: newEvent.durationMinutes,
        },
      });
      NotificationService.processOutbox().catch((e) =>
        console.error("Outbox process error:", e.message)
      );
    } finally {
      client.release();
    }

    return apiSuccess({ eventType: newEvent }, 201);
  } catch (err) {
    return apiError(err);
  }
}
