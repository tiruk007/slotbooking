import { NextRequest } from "next/server";
import { rescheduleBookingSchema } from "@/lib/validations";
import { BookingService } from "@/lib/booking-service";
import { apiSuccess, apiError } from "@/lib/api-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const rawBody = await request.json();
    const validated = rescheduleBookingSchema.parse(rawBody);

    const result = await BookingService.rescheduleBooking({
      rawToken: params.token,
      newStartAt: validated.newStartAt,
    });

    return apiSuccess(result, 200);
  } catch (err) {
    return apiError(err);
  }
}
