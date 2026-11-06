import { NextRequest } from "next/server";
import { apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

export async function POST(request: NextRequest) {
  return apiError(
    new AppError(
      "PASSWORD_LOGIN_RETIRED",
      400,
      "Password login has been retired. Please use Email OTP verification to sign in."
    )
  );
}
