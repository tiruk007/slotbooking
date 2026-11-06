import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { OtpService } from "@/lib/otp-service";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      throw new AppError("UNAUTHORIZED", 401, "Not authenticated");
    }

    const result = await OtpService.sendOtp({
      email: session.email,
      purpose: "HOST_DELETE_ACCOUNT",
      metadata: { hostId: session.id, hostName: session.name },
    });

    return apiSuccess(result, 200);
  } catch (err) {
    return apiError(err);
  }
}
