import { NextRequest } from "next/server";
import { NotificationService } from "@/lib/notification-service";
import { apiSuccess, apiError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const result = await NotificationService.processOutbox();
    return apiSuccess(result, 200);
  } catch (err) {
    return apiError(err);
  }
}
