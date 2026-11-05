import { getPool } from "@/db";
import { apiSuccess, apiError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pool = getPool();
    const result = await pool.query("SELECT clock_timestamp() as db_time, 1 as healthy");

    return apiSuccess({
      status: "healthy",
      database: "connected",
      dbTime: result.rows[0].db_time,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return apiError(err);
  }
}
