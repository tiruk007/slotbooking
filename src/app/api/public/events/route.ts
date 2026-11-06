import { NextRequest } from "next/server";
import { getPool } from "@/db";
import { apiSuccess, apiError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const pool = getPool();

    const res = await pool.query(
      `SELECT e.id, e.name, e.slug, e.description, e.category, e.status,
              e.duration_minutes, e.capacity, e.buffer_before, e.buffer_after,
              e.minimum_notice_minutes, e.booking_horizon_days, e.created_at,
              h.id as host_id, h.name as host_name, h.email as host_email,
              COALESCE(h.slug, h.email) as host_slug, h.home_timezone as host_timezone
       FROM event_types e
       JOIN hosts h ON e.host_id = h.id
       WHERE e.status = 'PUBLISHED' 
         AND h.status = 'ACTIVE'
       ORDER BY e.created_at DESC
       LIMIT $1`,
      [limit]
    );

    const events = res.rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description || "Introductory appointment or consultation.",
      category: row.category || "One-on-One",
      status: row.status,
      durationMinutes: row.duration_minutes,
      capacity: row.capacity,
      bufferBefore: row.buffer_before,
      bufferAfter: row.buffer_after,
      minimumNoticeMinutes: row.minimum_notice_minutes,
      bookingHorizonDays: row.booking_horizon_days,
      createdAt: row.created_at,
      host: {
        id: row.host_id,
        name: row.host_name,
        email: row.host_email,
        slug: row.host_slug,
        timezone: row.host_timezone,
      },
    }));

    return apiSuccess({ events });
  } catch (err) {
    return apiError(err);
  }
}
