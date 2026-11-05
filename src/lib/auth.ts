import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getPool } from "@/db";

const SESSION_COOKIE_NAME = "slotbook_session";
const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || "slotbook_production_secure_secret_key_at_least_32_characters_long_for_session"
);

export interface HostSession {
  id: string;
  name: string;
  email: string;
  homeTimezone: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(host: HostSession): Promise<string> {
  return new SignJWT({ host })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function verifySessionToken(token: string): Promise<HostSession | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return (payload.host as HostSession) || null;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<HostSession | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(host: HostSession): Promise<string> {
  const token = await createSessionToken(host);
  const cookieStore = cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return token;
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getHostByEmail(email: string) {
  const pool = getPool();
  const res = await pool.query(
    "SELECT id, name, email, password_hash, home_timezone FROM hosts WHERE email = $1",
    [email]
  );
  return res.rows[0] || null;
}
