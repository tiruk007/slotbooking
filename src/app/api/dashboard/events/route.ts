import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getPool } from "@/db";
import { eventTypeSchema } from "@/lib/validations";
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
      `SELECT id, name, slug, duration_minutes as "durationMinutes", capacity, 
              buffer_before as "bufferBefore", buffer_after as "bufferAfter", 
              minimum_notice_minutes as "minimumNoticeMinutes", 
              booking_horizon_days as "bookingHorizonDays", created_at as "createdAt"
       FROM event_types
       WHERE host_id = $1
       ORDER BY created_at ASC`,
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
       (host_id, name, slug, duration_minutes, capacity, buffer_before, buffer_after, minimum_notice_minutes, booking_horizon_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, slug, duration_minutes as "durationMinutes", capacity, 
                 buffer_before as "bufferBefore", buffer_after as "bufferAfter", 
                 minimum_notice_minutes as "minimumNoticeMinutes", 
                 booking_horizon_days as "bookingHorizonDays", created_at as "createdAt"`,
      [
        session.id,
        validated.name,
        validated.slug,
        validated.durationMinutes,
        validated.capacity,
        validated.bufferBefore,
        validated.bufferAfter,
        validated.minimumNoticeMinutes,
        validated.bookingHorizonDays,
      ]
    );

    return apiSuccess({ eventType: res.rows[0] }, 201);
  } catch (err) {
    return apiError(err);
  }
}
