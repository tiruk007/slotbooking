import { NextRequest } from "next/server";
import { z } from "zod";
import { OtpService } from "@/lib/otp-service";
import { getPool } from "@/db";
import { createHostSession, attachSessionCookie } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

const verifyLoginSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const validated = verifyLoginSchema.parse(rawBody);
    const pool = getPool();
    const normalizedEmail = validated.email.toLowerCase().trim();

    // Verify OTP
    await OtpService.verifyOtp({
      email: normalizedEmail,
      purpose: "HOST_LOGIN",
      code: validated.code,
    });

    // Fetch host record
    const hostRes = await pool.query(
      "SELECT id, name, email, home_timezone, status FROM hosts WHERE LOWER(email) = LOWER($1)",
      [normalizedEmail]
    );

    if (hostRes.rows.length === 0) {
      throw new AppError("HOST_NOT_FOUND", 404, "Host account not found");
    }

    const host = hostRes.rows[0];
    if (host.status !== "ACTIVE") {
      throw new AppError("ACCOUNT_INACTIVE", 403, "This host account is inactive.");
    }

    // Create session in host_sessions and obtain secure token
    const { token, host: hostSession } = await createHostSession(host.id);

    const response = apiSuccess(
      {
        host: hostSession,
        redirectTo: "/host/dashboard",
        message: "Signed in successfully",
      },
      200
    );

    // Explicitly attach Set-Cookie header on outgoing HTTP response
    attachSessionCookie(response, token);

    return response;
  } catch (err) {
    return apiError(err);
  }
}

