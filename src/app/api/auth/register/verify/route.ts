import { NextRequest } from "next/server";
import { z } from "zod";
import { OtpService } from "@/lib/otp-service";
import { getPool, withTransaction } from "@/db";
import { setSessionCookie } from "@/lib/auth";
import { NotificationService } from "@/lib/notification-service";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

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
    const hostName = metadata.name || "Host";
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

      // 1. Create host
      const hostRes = await client.query(
        `INSERT INTO hosts (name, email, password_hash, home_timezone, status)
         VALUES ($1, $2, NULL, $3, 'ACTIVE')
         RETURNING id, name, email, home_timezone`,
        [hostName, normalizedEmail, homeTimezone]
      );
      const newHost = hostRes.rows[0];

      // 2. Create initial default event types
      await client.query(
        `INSERT INTO event_types 
         (host_id, name, slug, duration_minutes, capacity, buffer_before, buffer_after, minimum_notice_minutes, booking_horizon_days)
         VALUES 
         ($1, '30 Min Appointment', '30-min-appointment', 30, 1, 10, 10, 60, 30),
         ($1, '1 Hr Appointment', '1-hr-appointment', 60, 1, 15, 15, 120, 60),
         ($1, 'Group Discussion', 'group-discussion', 45, 4, 10, 10, 180, 30)`,
        [newHost.id]
      );

      // 3. Create default weekly availability (Mon - Fri, 09:00-12:00 and 13:00-17:00)
      for (let weekday = 1; weekday <= 5; weekday++) {
        await client.query(
          `INSERT INTO availability_rules (host_id, weekday, start_time, end_time)
           VALUES ($1, $2, '09:00:00', '12:00:00'), ($1, $2, '13:00:00', '17:00:00')`,
          [newHost.id, weekday]
        );
      }

      // 4. Enqueue welcome notification
      await NotificationService.enqueue(client, {
        eventType: "HOST_REGISTERED",
        recipientEmail: newHost.email,
        subject: "Welcome to Slotbook!",
        payload: {
          hostName: newHost.name,
          hostEmail: newHost.email,
        },
      });

      return {
        id: newHost.id,
        name: newHost.name,
        email: newHost.email,
        homeTimezone: newHost.home_timezone,
      };
    });

    // Set HTTP-only secure session cookie
    await setSessionCookie(host);

    // Process notification outbox
    NotificationService.processOutbox().catch((e) =>
      console.error("Outbox process error:", e.message)
    );

    return apiSuccess({ host, message: "Host account created and verified successfully" }, 201);
  } catch (err) {
    return apiError(err);
  }
}
