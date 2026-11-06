import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      throw new AppError("UNAUTHORIZED", 401, "Not authenticated");
    }
    return apiSuccess({ host: session });
  } catch (err) {
    return apiError(err);
  }
}
