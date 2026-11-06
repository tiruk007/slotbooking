import { NextRequest } from "next/server";
import { hostRegisterSchema } from "@/lib/validations";
import { OtpService } from "@/lib/otp-service";
import { getPool } from "@/db";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const validated = hostRegisterSchema.parse(rawBody);
    const pool = getPool();

    const normalizedEmail = validated.email.toLowerCase().trim();

    // Check if host already exists
    const checkRes = await pool.query(
      "SELECT id FROM hosts WHERE LOWER(email) = LOWER($1)",
      [normalizedEmail]
    );

    if (checkRes.rows.length > 0) {
      throw new AppError("HOST_ALREADY_EXISTS", 409, "An account with this email already exists. Please log in.");
    }

    const result = await OtpService.sendOtp({
      email: normalizedEmail,
      purpose: "HOST_REGISTER",
      metadata: {
        name: validated.name.trim(),
        homeTimezone: validated.homeTimezone || "UTC",
      },
    });

    return apiSuccess(result, 200);
  } catch (err) {
    return apiError(err);
  }
}

