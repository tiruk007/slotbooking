import { NextRequest } from "next/server";
import { confirmHoldSchema } from "@/lib/validations";
import { BookingService } from "@/lib/booking-service";
import { apiSuccess, apiError } from "@/lib/api-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rawBody = await request.json();
    const validated = confirmHoldSchema.parse(rawBody);

    const result = await BookingService.confirmHold({
      holdId: params.id,
      guestName: validated.guestName,
      guestEmail: validated.guestEmail,
    });

    return apiSuccess(result, 200);
  } catch (err) {
    return apiError(err);
  }
}
