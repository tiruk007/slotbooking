import { NextRequest } from "next/server";
import { z } from "zod";
import { OtpService } from "@/lib/otp-service";
import { getPool, withTransaction } from "@/db";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

export const dynamic = "force-dynamic";

const verifyRegisterSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const validated = verifyRegisterSchema.parse(rawBody);
    const pool = getPool();
    const normalizedEmail = validated.email.toLowerCase().trim();

    // Verify OTP
    const otpResult = await OtpService.verifyOtp({
      email: normalizedEmail,
      purpose: "HOST_REGISTER",
      code: validated.code,
    });

    const metadata = otpResult.metadata || {};
    const hostName = (metadata.name || "Host").trim();
    const homeTimezone = metadata.homeTimezone || "UTC";

    // Create host and initial configuration in a transaction
    const host = await withTransaction(pool, async (client) => {
      // Re-verify no collision
      const checkRes = await client.query(
        "SELECT id FROM hosts WHERE LOWER(email) = LOWER($1)",
        [normalizedEmail]
      );
      if (checkRes.rows.length > 0) {
        throw new AppError("HOST_ALREADY_EXISTS", 409, "Account already exists");
      }

      // Generate clean unique host slug
      const baseSlug = hostName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "host";
      let hostSlug = baseSlug;
      let counter = 1;
      while (true) {
        const slugCheck = await client.query("SELECT id FROM hosts WHERE slug = $1", [hostSlug]);
        if (slugCheck.rows.length === 0) break;
        hostSlug = `${baseSlug}-${counter++}`;
      }

      // 1. Create host account ONLY
      const hostRes = await client.query(
        `INSERT INTO hosts (name, email, slug, password_hash, home_timezone, status)
         VALUES ($1, $2, $3, NULL, $4, 'ACTIVE')
         RETURNING id, name, email, slug, home_timezone`,
        [hostName, normalizedEmail, hostSlug, homeTimezone]
      );
      const newHost = hostRes.rows[0];

      // 2. Set up standard default weekly availability (Mon - Fri, 09:00-17:00) so host has a schedule
      for (let weekday = 1; weekday <= 5; weekday++) {
        await client.query(
          `INSERT INTO availability_rules (host_id, weekday, start_time, end_time)
           VALUES ($1, $2, '09:00:00', '17:00:00')`,
          [newHost.id, weekday]
        );
      }

      // NOTE: Strictly ZERO default event types, fake bookings, or fake notifications are created.
      return {
        id: newHost.id,
        name: newHost.name,
        email: newHost.email,
        slug: newHost.slug,
        homeTimezone: newHost.home_timezone,
      };
    });

    return apiSuccess({
      host,
      redirectTo: "/host/login",
      message: "Host account created and verified successfully. Please log in to your Host Portal."
    }, 201);
  } catch (err) {
    return apiError(err);
  }
}
