import { NextRequest } from "next/server";
import { loginSchema } from "@/lib/validations";
import { getHostByEmail, verifyPassword, setSessionCookie } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-utils";
import { AppError } from "@/lib/booking-service";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const validated = loginSchema.parse(rawBody);

    const host = await getHostByEmail(validated.email);
    if (!host) {
      throw new AppError("INVALID_CREDENTIALS", 401, "Invalid email or password");
    }

    const isValid = await verifyPassword(validated.password, host.password_hash);
    if (!isValid) {
      throw new AppError("INVALID_CREDENTIALS", 401, "Invalid email or password");
    }

    const sessionHost = {
      id: host.id,
      name: host.name,
      email: host.email,
      homeTimezone: host.home_timezone,
    };

    await setSessionCookie(sessionHost);

    return apiSuccess({
      host: sessionHost,
      message: "Logged in successfully",
    });
  } catch (err) {
    return apiError(err);
  }
}
