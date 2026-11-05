import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getPool, withTransaction } from "@/db";
import { isValidIanaZone } from "@/lib/timezone";
import { availabilityRuleSchema, dateOverrideSchema } from "@/lib/validations";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateAvailabilitySchema = z.object({
  homeTimezone: z.string().optional(),
  rules: z.array(availabilityRuleSchema),
  overrides: z.array(dateOverrideSchema),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      throw new AppError("UNAUTHORIZED", 401, "Not authenticated");
    }

    const pool = getPool();

    // 1. Host info
    const hostRes = await pool.query(
      "SELECT home_timezone as \"homeTimezone\" FROM hosts WHERE id = $1",
      [session.id]
    );

    // 2. Rules
    const rulesRes = await pool.query(
      `SELECT id, weekday, start_time::text as "startTime", end_time::text as "endTime"
       FROM availability_rules
       WHERE host_id = $1
       ORDER BY weekday ASC, start_time ASC`,
      [session.id]
    );

    // 3. Overrides
    const overridesRes = await pool.query(
      `SELECT id, override_date::text as "overrideDate", is_available as "isAvailable", 
              custom_start_time::text as "customStartTime", custom_end_time::text as "customEndTime"
       FROM date_overrides
       WHERE host_id = $1
       ORDER BY override_date ASC`,
      [session.id]
    );

    return apiSuccess({
      homeTimezone: hostRes.rows[0]?.homeTimezone || "UTC",
      rules: rulesRes.rows,
      overrides: overridesRes.rows,
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      throw new AppError("UNAUTHORIZED", 401, "Not authenticated");
    }

    const rawBody = await request.json();
    const validated = updateAvailabilitySchema.parse(rawBody);

    if (validated.homeTimezone && !isValidIanaZone(validated.homeTimezone)) {
      throw new AppError("INVALID_TIMEZONE", 400, `Invalid IANA timezone: ${validated.homeTimezone}`);
    }

    const pool = getPool();

    await withTransaction(pool, async (client) => {
      // 1. Update timezone if provided
      if (validated.homeTimezone) {
        await client.query("UPDATE hosts SET home_timezone = $1 WHERE id = $2", [
          validated.homeTimezone,
          session.id,
        ]);
      }

      // 2. Replace availability rules
      await client.query("DELETE FROM availability_rules WHERE host_id = $1", [session.id]);
      for (const rule of validated.rules) {
        await client.query(
          `INSERT INTO availability_rules (host_id, weekday, start_time, end_time)
           VALUES ($1, $2, $3::time, $4::time)`,
          [session.id, rule.weekday, rule.startTime, rule.endTime]
        );
      }

      // 3. Replace date overrides
      await client.query("DELETE FROM date_overrides WHERE host_id = $1", [session.id]);
      for (const o of validated.overrides) {
        await client.query(
          `INSERT INTO date_overrides (host_id, override_date, is_available, custom_start_time, custom_end_time)
           VALUES ($1, $2::date, $3, $4::time, $5::time)`,
          [
            session.id,
            o.overrideDate,
            o.isAvailable,
            o.customStartTime || null,
            o.customEndTime || null,
          ]
        );
      }
    });

    return apiSuccess({ message: "Availability updated successfully" });
  } catch (err) {
    return apiError(err);
  }
}
