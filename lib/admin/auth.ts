import type { NextRequest } from "next/server";

export type AdminUser = "remi" | "shannon";

/**
 * Returns true if the request carries a valid admin auth cookie.
 *
 * Today: a single shared password in ADMIN_PASSWORD. The login route stores
 * the literal password value in the `admin_auth` cookie and we compare here.
 * Per-user identity is added in PR 2; this helper continues to gate access.
 */
export function isAuthed(req: NextRequest): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return req.cookies.get("admin_auth")?.value === expected;
}

/**
 * Returns which admin user is acting on this request, or null if unknown.
 *
 * Stub for now — PR 2 will wire this up to a second cookie (`admin_user`)
 * set at login time once we have per-user passwords. Returning null today
 * is correct: callers should treat null as "no per-user context yet" and
 * fall back to non-personalized behavior.
 */
export function getAdminUser(req: NextRequest): AdminUser | null {
  const value = req.cookies.get("admin_user")?.value;
  if (value === "remi" || value === "shannon") return value;
  return null;
}
