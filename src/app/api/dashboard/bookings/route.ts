import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getPool } from "@/db";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      throw new AppError("UNAUTHORIZED", 401, "Not authenticated");
    }

    const { searchParams } = new URL(request.url);
    const filterStatus = (searchParams.get("status") || "ALL").toUpperCase();

    const pool = getPool();

    // 1. Authoritative metrics query computed entirely in PostgreSQL
    const statsRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE b.status = 'CONFIRMED' AND b.start_at > clock_timestamp())::int as "upcomingCount",
         COUNT(*) FILTER (WHERE b.status = 'CANCELLED')::int as "cancelledCount",
         COUNT(*) FILTER (WHERE b.status = 'CONFIRMED' AND b.start_at <= clock_timestamp())::int as "pastCount",
         COALESCE(SUM(EXTRACT(EPOCH FROM (b.end_at - b.start_at)) / 3600) FILTER (WHERE b.status = 'CONFIRMED' AND b.start_at > clock_timestamp()), 0)::float as "scheduledHours"
       FROM bookings b
       JOIN event_types e ON b.event_type_id = e.id
       WHERE e.host_id = $1`,
      [session.id]
    );

    const stats = statsRes.rows[0] || {
      upcomingCount: 0,
      cancelledCount: 0,
      pastCount: 0,
      scheduledHours: 0,
    };

    // 2. Query filtered bookings
    let statusFilterClause = "AND b.status IN ('CONFIRMED', 'CANCELLED')";
    let orderClause = "ORDER BY b.start_at DESC";

    if (filterStatus === "UPCOMING") {
      statusFilterClause = "AND b.status = 'CONFIRMED' AND b.start_at > clock_timestamp()";
      orderClause = "ORDER BY b.start_at ASC";
    } else if (filterStatus === "PAST") {
      statusFilterClause = "AND b.status = 'CONFIRMED' AND b.start_at <= clock_timestamp()";
      orderClause = "ORDER BY b.start_at DESC";
    } else if (filterStatus === "CANCELLED") {
      statusFilterClause = "AND b.status = 'CANCELLED'";
      orderClause = "ORDER BY b.updated_at DESC";
    }

    const bookingsRes = await pool.query(
      `SELECT b.id, b.guest_name as "guestName", b.guest_email as "guestEmail",
              b.meeting_purpose as "meetingPurpose", b.meet_link as "meetLink",
              b.start_at as "startAt", b.end_at as "endAt", b.status,
              b.cancellation_reason as "cancellationReason", b.created_at as "createdAt",
              b.updated_at as "updatedAt",
              e.id as "eventTypeId", e.name as "eventName", e.slug as "eventSlug"
       FROM bookings b
       JOIN event_types e ON b.event_type_id = e.id
       WHERE e.host_id = $1 ${statusFilterClause}
       ${orderClause}`,
      [session.id]
    );

    return apiSuccess({ bookings: bookingsRes.rows, stats });
  } catch (err) {
    return apiError(err);
  }
}
