import { getSession } from "@/lib/auth";
import { getPool } from "@/db";
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
      `SELECT b.id, b.guest_name as "guestName", b.guest_email as "guestEmail",
              b.start_at as "startAt", b.end_at as "endAt", b.status,
              b.cancellation_reason as "cancellationReason", b.created_at as "createdAt",
              e.id as "eventTypeId", e.name as "eventName", e.slug as "eventSlug"
       FROM bookings b
       JOIN event_types e ON b.event_type_id = e.id
       WHERE e.host_id = $1
       ORDER BY b.start_at DESC`,
      [session.id]
    );

    return apiSuccess({ bookings: res.rows });
  } catch (err) {
    return apiError(err);
  }
}
