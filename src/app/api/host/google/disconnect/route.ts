import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getPool } from "@/db";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      throw new AppError("UNAUTHORIZED", 401, "Host authentication required");
    }

    const pool = getPool();

    // 1. Fetch current token to attempt revocation with Google
    const hostRes = await pool.query(
      `SELECT google_access_token, google_refresh_token FROM hosts WHERE id = $1`,
      [session.id]
    );

    if (hostRes.rows.length > 0) {
      const token = hostRes.rows[0].google_refresh_token || hostRes.rows[0].google_access_token;
      if (token) {
        try {
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          });
        } catch (revokeErr) {
          console.warn("[Google OAuth] Revocation request completed or timed out:", revokeErr);
        }
      }
    }

    // 2. Clear Google OAuth columns in PostgreSQL
    await pool.query(
      `UPDATE hosts
       SET google_refresh_token = NULL,
           google_access_token = NULL,
           google_token_expiry = NULL,
           google_email = NULL,
           google_connected_at = NULL
       WHERE id = $1`,
      [session.id]
    );

    return apiSuccess({
      success: true,
      message: "Google Calendar account disconnected successfully.",
    });
  } catch (err) {
    return apiError(err);
  }
}
