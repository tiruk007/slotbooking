import { NextRequest } from "next/server";
import { hostRequestLoginOtpSchema } from "@/lib/validations";
import { OtpService } from "@/lib/otp-service";
import { getPool } from "@/db";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const validated = hostRequestLoginOtpSchema.parse(rawBody);
    const pool = getPool();
    const normalizedEmail = validated.email.toLowerCase().trim();

    // Verify host exists
    const hostRes = await pool.query(
      "SELECT id, name, email, status FROM hosts WHERE LOWER(email) = LOWER($1)",
      [normalizedEmail]
    );

    if (hostRes.rows.length === 0) {
      throw new AppError("HOST_NOT_FOUND", 404, "No host account found with this email. Please sign up first.");
    }

    const host = hostRes.rows[0];
    if (host.status !== "ACTIVE") {
      throw new AppError("ACCOUNT_INACTIVE", 403, "This host account is inactive.");
    }

    const result = await OtpService.sendOtp({
      email: normalizedEmail,
      purpose: "HOST_LOGIN",
      metadata: { hostId: host.id, name: host.name },
    });

    return apiSuccess(result, 200);
  } catch (err) {
    return apiError(err);
  }
}
