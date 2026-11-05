import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      throw new AppError("UNAUTHORIZED", 401, "Not authenticated");
    }
    return apiSuccess({ host: session });
  } catch (err) {
    return apiError(err);
  }
}
