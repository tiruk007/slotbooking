import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { BookingService, AppError } from "@/lib/booking-service";
import { cancelBookingSchema } from "@/lib/validations";
import { apiSuccess, apiError } from "@/lib/api-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      throw new AppError("UNAUTHORIZED", 401, "Not authenticated");
    }

    let reason: string | undefined;
    try {
      const rawBody = await request.json();
      const validated = cancelBookingSchema.parse(rawBody);
      reason = validated.reason;
    } catch {
      // Body may be empty
    }

    const result = await BookingService.hostCancelBooking({
      hostId: session.id,
      bookingId: params.id,
      reason,
    });

    return apiSuccess(result);
  } catch (err) {
    return apiError(err);
  }
}
