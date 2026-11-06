import { NextRequest } from "next/server";
import { getPool } from "@/db";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    const pool = getPool();

    const res = await pool.query(
      `SELECT e.id, e.name, e.slug, e.description, e.category, e.status,
              e.duration_minutes, e.capacity, e.buffer_before, e.buffer_after,
              e.minimum_notice_minutes, e.booking_horizon_days, e.created_at,
              h.id as host_id, h.name as host_name, h.email as host_email,
              COALESCE(h.slug, h.email) as host_slug, h.home_timezone as host_timezone
       FROM event_types e
       JOIN hosts h ON e.host_id = h.id
       WHERE e.slug = $1 
         AND e.status = 'PUBLISHED' 
         AND h.status = 'ACTIVE'
       ORDER BY e.created_at DESC`,
      [slug]
    );

    if (res.rows.length === 0) {
      throw new AppError("EVENT_NOT_FOUND", 404, "Event not found or not currently published");
    }

    const first = res.rows[0];
    const event = {
      id: first.id,
      name: first.name,
      slug: first.slug,
      description: first.description || "Introductory appointment or consultation.",
      category: first.category || "One-on-One",
      durationMinutes: first.duration_minutes,
      capacity: first.capacity,
      bufferBefore: first.buffer_before,
      bufferAfter: first.buffer_after,
      minimumNoticeMinutes: first.minimum_notice_minutes,
      bookingHorizonDays: first.booking_horizon_days,
      hosts: res.rows.map((row) => ({
        id: row.host_id,
        name: row.host_name,
        email: row.host_email,
        slug: row.host_slug,
        timezone: row.host_timezone,
        eventTypeId: row.id,
      })),
    };

    return apiSuccess({ event });
  } catch (err) {
    return apiError(err);
  }
}
