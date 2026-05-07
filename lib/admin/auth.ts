import type { NextRequest } from "next/server";

export type AdminUser = "remi" | "shannon";

/**
 * Returns true if the request carries a valid admin auth cookie.
 *
 * The login route sets `admin_auth` to whichever password value matched —
 * ADMIN_PASSWORD_REMI, ADMIN_PASSWORD_SHANNON, or the legacy ADMIN_PASSWORD.
 * We accept any of those three values here so per-user logins and legacy
 * sessions both succeed.
 */
export function isAuthed(req: NextRequest): boolean {
  const cookie = req.cookies.get("admin_auth")?.value;
  if (!cookie) return false;

  const accepted = [
    process.env.ADMIN_PASSWORD_REMI,
    process.env.ADMIN_PASSWORD_SHANNON,
    process.env.ADMIN_PASSWORD,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);

  return accepted.includes(cookie);
}

/**
 * Returns which admin user is acting on this request, or null if unknown.
 *
 * Reads the `admin_user` cookie set by the login route. If the cookie is
 * missing but `isAuthed` returns true (legacy session from before PR 2
 * shipped, or a user logged in only via the legacy ADMIN_PASSWORD), default
 * to "remi" — the safe fallback since the legacy password maps to Remi.
 */
export function getAdminUser(req: NextRequest): AdminUser | null {
  const value = req.cookies.get("admin_user")?.value;
  if (value === "remi" || value === "shannon") return value;
  if (isAuthed(req)) return "remi";
  return null;
}
