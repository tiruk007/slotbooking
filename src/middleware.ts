import { NextResponse, type NextRequest } from "next/server";

// In-memory rate limiting map (IP -> timestamps array)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60; // 60 requests per minute

export function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const startTime = Date.now();

  // Rate limit public API write endpoints (e.g. /api/holds)
  if (request.nextUrl.pathname.startsWith("/api/holds")) {
    const ip = request.ip || request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
    const now = Date.now();
    const timestamps = (rateLimitMap.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

    if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many booking requests. Please wait a moment and try again.",
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": "60",
            "x-request-id": requestId,
          },
        }
      );
    }

    timestamps.push(now);
    rateLimitMap.set(ip, timestamps);
  }

  const response = NextResponse.next();
  response.headers.set("x-request-id", requestId);

  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
