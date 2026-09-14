import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Shared-password gate for the My Ambition partner demo at /demo.
 *
 * Threat model (from the handoff): one password, emailed to people we
 * broadly trust. The demo must not turn up in search, and a stranger with
 * the URL must not get in. It is NOT meant to resist someone who has the
 * password — anyone who does can save the page, and that is acceptable.
 *
 * Unlike the older /demoday and /strategy gates, the cookie here is not the
 * password itself but an HMAC of a fixed string keyed by DEMO_COOKIE_SECRET,
 * so it cannot be hand-written by someone who never had the password, and
 * rotating the secret signs everyone out without changing the password.
 *
 * Fails closed: with either env var unset, no password matches and no
 * cookie verifies.
 */

export const DEMO_COOKIE = "ma_demo";
export const DEMO_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
export const DEMO_COOKIE_PATH = "/demo";

// Bumping this signs everyone out, same as rotating the secret.
const COOKIE_SUBJECT = "ma-demo-v1";

/** Constant-time equality on arbitrary strings: hash both sides to a fixed
 *  length first so the comparison leaks neither content nor length. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** The cookie value for a given secret: hex HMAC-SHA256 of the fixed subject. */
export function demoCookieValue(secret: string): string {
  return createHmac("sha256", secret).update(COOKIE_SUBJECT).digest("hex");
}

export function passwordMatches(
  submitted: string | null | undefined,
  expected: string | undefined = process.env.DEMO_PASSWORD
): boolean {
  if (!expected || typeof submitted !== "string" || submitted.length === 0) return false;
  return safeEqual(submitted, expected);
}

export function cookieIsValid(
  value: string | null | undefined,
  secret: string | undefined = process.env.DEMO_COOKIE_SECRET
): boolean {
  if (!secret || typeof value !== "string" || value.length === 0) return false;
  return safeEqual(value, demoCookieValue(secret));
}

/** Cookie attributes shared by the login (set) and logout (clear) routes. */
export function demoCookieOptions() {
  return {
    httpOnly: true,
    // Browsers accept Secure cookies on http://localhost, but not on other
    // plain-http hosts (a LAN IP in dev), so key it off the environment.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: DEMO_COOKIE_PATH,
  };
}
