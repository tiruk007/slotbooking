import { clearSessionCookie } from "@/lib/auth";
import { apiSuccess } from "@/lib/api-utils";

export async function POST() {
  await clearSessionCookie();
  return apiSuccess({ message: "Logged out successfully" });
}
