import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getPool } from "@/db";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      throw new AppError("UNAUTHORIZED", 401, "Host authentication required");
    }

    const pool = getPool();
    const res = await pool.query(
      `SELECT google_refresh_token, google_email, google_connected_at, google_token_expiry
       FROM hosts
       WHERE id = $1`,
      [session.id]
    );

    if (res.rows.length === 0) {
      throw new AppError("NOT_FOUND", 404, "Host not found");
    }

    const row = res.rows[0];
    const connected = Boolean(row.google_refresh_token);

    return apiSuccess({
      connected,
      googleEmail: row.google_email,
      connectedAt: row.google_connected_at,
      tokenExpiry: row.google_token_expiry,
    });
  } catch (err) {
    return apiError(err);
  }
}
