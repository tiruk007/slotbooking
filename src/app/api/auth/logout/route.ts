import { NextRequest } from "next/server";
import { clearSessionCookie, removeSessionCookie } from "@/lib/auth";
import { apiSuccess } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  await clearSessionCookie(request);
  const response = apiSuccess({ message: "Logged out successfully" });
  removeSessionCookie(response);
  return response;
}
