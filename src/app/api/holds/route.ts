import { NextRequest } from "next/server";
import { createHoldSchema } from "@/lib/validations";
import { BookingService } from "@/lib/booking-service";
import { apiSuccess, apiError } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const validated = createHoldSchema.parse(rawBody);
    const idempotencyKey = request.headers.get("Idempotency-Key") || undefined;

    const result = await BookingService.createHold({
      eventTypeId: validated.eventTypeId,
      startAt: validated.startAt,
      idempotencyKey,
      requestPayload: rawBody,
    });

    const headers: Record<string, string> = {};
    if (result.isIdempotentReplay) {
      headers["Idempotency-Replay"] = "true";
    }

    return apiSuccess(result.data, result.status, headers);
  } catch (err) {
    return apiError(err);
  }
}
