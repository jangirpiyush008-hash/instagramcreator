import crypto from "node:crypto";
import { cookies } from "next/headers";

// Owner-only admin auth. Deliberately independent from Supabase user
// auth so admin.decodecreator.com is separately gated — a compromised
// user account cannot access the admin panel, and admin sessions have
// their own cookie + lifetime.
//
// Design:
//   - Password stored in env var ADMIN_PASSWORD (rotate by changing env)
//   - Session cookie value = base64url(exp_ts . hmac(exp_ts, secret))
//     Cookie name: dc-admin-session
//     Cookie expiry: 12h from issue, http-only, secure, path=/
//   - Verify: decode → check exp not passed → recompute HMAC → compare
//
// HMAC secret comes from ADMIN_SESSION_SECRET env var. If unset in prod
// we HARD-FAIL — a missing secret means the cookie is signed with a
// predictable fallback which anyone can forge. In dev we generate a
// random secret in-memory (session doesn't survive restart, which is
// fine locally).

const COOKIE_NAME = "dc-admin-session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Dev-only ephemeral secret. Regenerates on server restart.
let devSecret: string | null = null;
function sessionSecret(): string {
  const env = process.env.ADMIN_SESSION_SECRET;
  if (env && env.length >= 32) return env;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ADMIN_SESSION_SECRET missing or too short in production — refusing to sign admin sessions with a predictable value.",
    );
  }
  if (!devSecret) devSecret = crypto.randomBytes(32).toString("hex");
  return devSecret;
}

// ── Password verification ────────────────────────────────────────────
// Constant-time comparison so an attacker can't time the response to
// leak character-by-character info about the password.
export function verifyAdminPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected.length === 0) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ── Session encode / decode ──────────────────────────────────────────
function encodeSession(expiresAtMs: number): string {
  const payload = String(expiresAtMs);
  const mac = crypto
    .createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}.${mac}`).toString("base64url");
}

function decodeSession(cookie: string): number | null {
  try {
    const decoded = Buffer.from(cookie, "base64url").toString("utf-8");
    const dot = decoded.indexOf(".");
    if (dot < 0) return null;
    const payload = decoded.slice(0, dot);
    const mac = decoded.slice(dot + 1);
    const expectMac = crypto
      .createHmac("sha256", sessionSecret())
      .update(payload)
      .digest("hex");
    const macA = Buffer.from(mac, "hex");
    const macB = Buffer.from(expectMac, "hex");
    if (macA.length !== macB.length) return null;
    if (!crypto.timingSafeEqual(macA, macB)) return null;
    const expiresAt = Number(payload);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
    return expiresAt;
  } catch {
    return null;
  }
}

// ── Public helpers used by admin routes ──────────────────────────────

export async function issueAdminSession(): Promise<void> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = encodeSession(expiresAt);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Cookie expiry matches signed expiry so the browser drops it
    // at the same time we'd reject it server-side.
    expires: new Date(expiresAt),
  });
}

export async function clearAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

// Returns true if the current request has a valid admin session cookie.
// Used by admin layout + admin API routes.
export async function isAdminAuthed(): Promise<boolean> {
  const jar = await cookies();
  const cookie = jar.get(COOKIE_NAME)?.value;
  if (!cookie) return false;
  const exp = decodeSession(cookie);
  return exp !== null;
}
