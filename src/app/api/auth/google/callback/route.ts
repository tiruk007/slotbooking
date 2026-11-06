import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(
      `<html><body><h2>Google Authorization Error</h2><p>${error}</p><a href="/dashboard">Return to Dashboard</a></body></html>`,
      { headers: { "Content-Type": "text/html" }, status: 400 }
    );
  }

  if (!code) {
    return new Response(
      `<html><body><h2>Missing Authorization Code</h2><a href="/dashboard">Return to Dashboard</a></body></html>`,
      { headers: { "Content-Type": "text/html" }, status: 400 }
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${url.origin}/api/auth/google/callback`;

  try {
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
      return new Response(
        `<html><body><h2>Failed to exchange token</h2><pre>${JSON.stringify(tokenData, null, 2)}</pre><a href="/dashboard">Return to Dashboard</a></body></html>`,
        { headers: { "Content-Type": "text/html" }, status: 400 }
      );
    }

    const refreshToken = tokenData.refresh_token;

    // If refresh token was returned, try updating .env file
    if (refreshToken) {
      try {
        const envPath = path.resolve(process.cwd(), ".env");
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, "utf-8");
          if (envContent.includes("GOOGLE_REFRESH_TOKEN=")) {
            envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN=${refreshToken}`);
          } else {
            envContent += `\nGOOGLE_REFRESH_TOKEN=${refreshToken}\n`;
          }
          fs.writeFileSync(envPath, envContent, "utf-8");
          process.env.GOOGLE_REFRESH_TOKEN = refreshToken;
        }
      } catch (err) {
        console.error("Could not write refresh token to .env:", err);
      }
    }

    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <title>Google Calendar Connected - Slotbook</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background-color: #f8fafc; }
    .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); max-width: 480px; width: 100%; text-align: center; }
    h2 { color: #0f172a; margin-top: 0; }
    p { color: #475569; font-size: 14px; line-height: 1.5; }
    .btn { display: inline-block; background: #0f172a; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 500; margin-top: 1rem; }
    .token-box { background: #f1f5f9; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 12px; word-break: break-all; margin: 10px 0; text-align: left; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 40px; margin-bottom: 10px;">✓</div>
    <h2>Google Meet Connected!</h2>
    <p>Your Google Calendar account is connected to Slotbook. Live Google Meet conference links will now be automatically generated for all confirmed appointments.</p>
    ${refreshToken ? `<p style="font-size: 12px; color: #64748b;">Refresh token saved to environment.</p>` : ''}
    <a href="/dashboard" class="btn">Return to Dashboard</a>
  </div>
</body>
</html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err: any) {
    return new Response(
      `<html><body><h2>Unexpected Error</h2><p>${err.message}</p><a href="/dashboard">Return to Dashboard</a></body></html>`,
      { headers: { "Content-Type": "text/html" }, status: 500 }
    );
  }
}
