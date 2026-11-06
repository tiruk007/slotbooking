import { NextRequest } from "next/server";
import { createHoldSchema } from "@/lib/validations";
import { BookingService } from "@/lib/booking-service";
import { OtpService } from "@/lib/otp-service";
import { apiSuccess, apiError } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const validated = createHoldSchema.parse(rawBody);
    const idempotencyKey = request.headers.get("Idempotency-Key") || undefined;

    const result = await BookingService.createHold({
      eventTypeId: validated.eventTypeId,
      startAt: validated.startAt,
      guestName: validated.guestName,
      guestEmail: validated.guestEmail,
      guestTimezone: validated.guestTimezone,
      meetingPurpose: validated.meetingPurpose,
      idempotencyKey,
      requestPayload: rawBody,
    });

    // If guest email is provided, automatically trigger email verification OTP
    let otpSent = false;
    if (validated.guestEmail && !result.isIdempotentReplay) {
      try {
        await OtpService.sendOtp({
          email: validated.guestEmail,
          purpose: "GUEST_BOOKING",
          metadata: {
            holdId: result.data.id,
            guestName: validated.guestName,
            meetingPurpose: validated.meetingPurpose,
          },
        });
        otpSent = true;
      } catch (otpErr: any) {
        console.warn("Could not dispatch guest OTP email:", otpErr.message);
      }
    }

    const headers: Record<string, string> = {};
    if (result.isIdempotentReplay) {
      headers["Idempotency-Replay"] = "true";
    }

    return apiSuccess({ ...result.data, otpSent }, result.status, headers);
  } catch (err) {
    return apiError(err);
  }
}
