import crypto from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getPool } from "@/db";

export const SESSION_COOKIE_NAME = "slotbook_session";

export interface HostSession {
  id: string;
  name: string;
  email: string;
  homeTimezone: string;
  slug?: string | null;
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function isSecureCookie(): boolean {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  const appUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  return appUrl.startsWith("https://");
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };
}

export function attachSessionCookie(response: any, token: string): any {
  response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
  return response;
}

export function removeSessionCookie(response: any): any {
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...getSessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}

/**
 * Creates a persistent database session in `host_sessions` and sets the HTTP-only session cookie.
 */
export async function createHostSession(hostId: string, customUrl?: string): Promise<{ token: string; host: HostSession }> {
  const pool = getPool(customUrl);
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);

  // 1. Fetch host info
  const hostRes = await pool.query(
    "SELECT id, name, email, slug, home_timezone, status FROM hosts WHERE id = $1",
    [hostId]
  );
  if (hostRes.rows.length === 0) {
    throw new Error("Host not found");
  }
  const hostRow = hostRes.rows[0];

  // 2. Insert session into host_sessions (valid for 7 days)
  await pool.query(
    `INSERT INTO host_sessions (host_id, token_hash, expires_at)
     VALUES ($1, $2, clock_timestamp() + interval '7 days')`,
    [hostId, tokenHash]
  );

  const hostSession: HostSession = {
    id: hostRow.id,
    name: hostRow.name,
    email: hostRow.email,
    slug: hostRow.slug,
    homeTimezone: hostRow.home_timezone,
  };

  // 3. Set HTTP-only cookie
  try {
    const cookieStore = cookies();
    cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
      httpOnly: true,
      secure: isSecureCookie(),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
  } catch {
    // In environments without cookies() context (e.g. some tests), return token directly
  }

  return { token: rawToken, host: hostSession };
}

/**
 * Validates and retrieves the authenticated host session from database `host_sessions`.
 */
export async function getSession(customUrl?: string): Promise<HostSession | null> {
  let rawToken: string | undefined;
  try {
    const cookieStore = cookies();
    rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  } catch {
    return null;
  }

  if (!rawToken) return null;
  return getSessionByToken(rawToken, customUrl);
}

/**
 * Validates session token against database `host_sessions`.
 */
export async function getSessionByToken(token: string, customUrl?: string): Promise<HostSession | null> {
  const pool = getPool(customUrl);
  const tokenHash = hashToken(token);

  const res = await pool.query(
    `SELECT s.id AS session_id, s.expires_at, s.revoked_at,
            h.id, h.name, h.email, h.slug, h.home_timezone AS "homeTimezone", h.status
     FROM host_sessions s
     JOIN hosts h ON s.host_id = h.id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > clock_timestamp()
       AND h.status = 'ACTIVE'`,
    [tokenHash]
  );

  if (res.rows.length === 0) {
    return null;
  }

  const row = res.rows[0];
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    slug: row.slug,
    homeTimezone: row.homeTimezone,
  };
}

/**
 * Extracts session from Next.js request headers or cookies.
 */
export async function getSessionFromRequest(request?: Request, customUrl?: string): Promise<HostSession | null> {
  if (request) {
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader) {
      const match = cookieHeader.match(new RegExp(`(^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`));
      if (match && match[2]) {
        return getSessionByToken(match[2], customUrl);
      }
    }
    // Also check Authorization: Bearer <token> for API test convenience
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();
      return getSessionByToken(token, customUrl);
    }
  }
  return getSession(customUrl);
}

/**
 * Revokes the session in `host_sessions` and clears the cookie.
 */
export async function clearSessionCookie(request?: Request, customUrl?: string): Promise<void> {
  let rawToken: string | undefined;

  if (request) {
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader) {
      const match = cookieHeader.match(new RegExp(`(^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`));
      if (match && match[2]) {
        rawToken = match[2];
      }
    }
  }

  try {
    const cookieStore = cookies();
    if (!rawToken) {
      rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    }
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch {
    // ignore outside next.js request context
  }

  if (rawToken) {
    const pool = getPool(customUrl);
    const tokenHash = hashToken(rawToken);
    await pool.query(
      "UPDATE host_sessions SET revoked_at = clock_timestamp() WHERE token_hash = $1",
      [tokenHash]
    );
  }
}

export async function setSessionCookie(host: HostSession, customUrl?: string): Promise<string> {
  const { token } = await createHostSession(host.id, customUrl);
  return token;
}

export async function getHostByEmail(email: string, customUrl?: string) {
  const pool = getPool(customUrl);
  const res = await pool.query(
    "SELECT id, name, email, password_hash, home_timezone, status FROM hosts WHERE LOWER(email) = LOWER($1)",
    [email.toLowerCase().trim()]
  );
  return res.rows[0] || null;
}
