import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const cookieState = request.cookies.get("google_oauth_state")?.value;

  const returnUrl = new URL("/host/settings/integrations", request.url);

  if (error) {
    returnUrl.searchParams.set("error", `Google authorization denied: ${error}`);
    return NextResponse.redirect(returnUrl);
  }

  if (!code || !state || !cookieState || state !== cookieState) {
    returnUrl.searchParams.set("error", "Invalid or expired OAuth state parameter. Please try again.");
    return NextResponse.redirect(returnUrl);
  }

  const hostId = state.split(":")[0];
  if (!hostId) {
    returnUrl.searchParams.set("error", "Invalid host context in OAuth state.");
    return NextResponse.redirect(returnUrl);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${url.origin}/api/auth/google/callback`;

  try {
    // 1. Exchange code for access & refresh tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId || "",
        client_secret: clientSecret || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error("[Google OAuth] Token exchange failed:", tokenData);
      returnUrl.searchParams.set("error", tokenData.error_description || "Failed to exchange authorization code");
      return NextResponse.redirect(returnUrl);
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 3600;

    // 2. Fetch connected Google email
    let googleEmail: string | null = null;
    try {
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userInfoRes.ok) {
        const userInfo = await userInfoRes.json();
        googleEmail = userInfo.email || null;
      }
    } catch (err) {
      console.warn("[Google OAuth] Could not fetch userinfo:", err);
    }

    // 3. Save tokens into hosts table in PostgreSQL
    const pool = getPool();
    await pool.query(
      `UPDATE hosts
       SET google_refresh_token = COALESCE($1, google_refresh_token),
           google_access_token = $2,
           google_token_expiry = clock_timestamp() + ($3 || ' seconds')::interval,
           google_email = COALESCE($4, google_email),
           google_connected_at = clock_timestamp()
       WHERE id = $5`,
      [refreshToken || null, accessToken, expiresIn, googleEmail, hostId]
    );

    returnUrl.searchParams.set("google", "connected");
    const response = NextResponse.redirect(returnUrl);
    response.cookies.delete("google_oauth_state");
    return response;
  } catch (err: any) {
    console.error("[Google OAuth] Callback error:", err);
    returnUrl.searchParams.set("error", err.message || "Failed to complete Google Calendar connection");
    return NextResponse.redirect(returnUrl);
  }
}
