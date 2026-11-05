import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getPool } from "@/db";
import { eventTypeSchema } from "@/lib/validations";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

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
           duration_minutes = $3,
           capacity = $4,
           buffer_before = $5,
           buffer_after = $6,
           minimum_notice_minutes = $7,
           booking_horizon_days = $8
       WHERE id = $9 AND host_id = $10
       RETURNING id, name, slug, duration_minutes as "durationMinutes", capacity, 
                 buffer_before as "bufferBefore", buffer_after as "bufferAfter", 
                 minimum_notice_minutes as "minimumNoticeMinutes", 
                 booking_horizon_days as "bookingHorizonDays", created_at as "createdAt"`,
      [
        validated.name,
        validated.slug,
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

    return apiSuccess({ eventType: res.rows[0] });
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
    const res = await pool.query(
      "DELETE FROM event_types WHERE id = $1 AND host_id = $2 RETURNING id",
      [params.id, session.id]
    );

    if (res.rows.length === 0) {
      throw new AppError("NOT_FOUND", 404, "Event type not found");
    }

    return apiSuccess({ message: "Event type deleted successfully" });
  } catch (err) {
    return apiError(err);
  }
}
