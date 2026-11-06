import { NextRequest } from "next/server";
import { confirmHoldSchema } from "@/lib/validations";
import { BookingService, AppError } from "@/lib/booking-service";
import { OtpService } from "@/lib/otp-service";
import { apiSuccess, apiError } from "@/lib/api-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rawBody = await request.json();
    const validated = confirmHoldSchema.parse(rawBody);

    // Require email verification OTP in web requests
    if (validated.guestEmail) {
      if (!validated.code) {
        throw new AppError("OTP_REQUIRED", 400, "A 6-digit verification code is required to confirm your booking.");
      }

      await OtpService.verifyOtp({
        email: validated.guestEmail,
        purpose: "GUEST_BOOKING",
        code: validated.code,
      });
    }

    const result = await BookingService.confirmHold({
      holdId: params.id,
      guestName: validated.guestName,
      guestEmail: validated.guestEmail,
      guestTimezone: validated.guestTimezone,
      meetingPurpose: validated.meetingPurpose,
    });

    return apiSuccess(result, 200);
  } catch (err) {
    return apiError(err);
  }
}
