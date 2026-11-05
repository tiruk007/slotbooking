import { NextRequest } from "next/server";
import { BookingService } from "@/lib/booking-service";
import { apiSuccess, apiError } from "@/lib/api-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const booking = await BookingService.getBookingByToken(params.token);
    return apiSuccess(booking, 200);
  } catch (err) {
    return apiError(err);
  }
}
