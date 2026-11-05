import { NextRequest } from "next/server";
import { cancelBookingSchema } from "@/lib/validations";
import { BookingService } from "@/lib/booking-service";
import { apiSuccess, apiError } from "@/lib/api-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    let reason: string | undefined;
    try {
      const rawBody = await request.json();
      const validated = cancelBookingSchema.parse(rawBody);
      reason = validated.reason;
    } catch {
      // Body may be empty
    }

    const result = await BookingService.cancelBooking({
      rawToken: params.token,
      reason,
    });

    return apiSuccess(result, 200);
  } catch (err) {
    return apiError(err);
  }
}
