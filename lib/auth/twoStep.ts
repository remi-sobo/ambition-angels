/**
 * Two-step login (pre-SafeSpace hardening item D): the rule, as pure,
 * edge-safe functions so middleware, the server auth path and the tests share
 * one definition. Nothing here imports a server-only module.
 *
 * Remi's decision: every user, every role, every org signs in with a second
 * step (an authenticator app, Supabase Auth MFA TOTP). There is no bypass
 * flag in any environment; the local mock (e2e/v4/mock-supabase.mjs) issues
 * aal2 sessions instead.
 *
 * The rule, from the session's assurance level (the `aal` claim of the
 * Supabase access token, validated by getUser()) and the user's factors:
 *
 *   no session                         → "anonymous" (existing sign-in flow)
 *   no verified factor (any aal)       → "enroll"  (set up an authenticator)
 *   verified factor, aal1              → "verify"  (enter a 6-digit code)
 *   verified factor, aal2              → "ok"
 *
 * "No factor" wins even at aal2: when an owner resets someone's two-step
 * login (Settings → People and roles deletes their factors), that person's
 * open sessions stop working at once and they must enroll again. The factor
 * list comes from getUser(), which reads the user fresh from Supabase Auth.
 *
 * Pages under /admin and /board redirect "enroll"/"verify" to the screens
 * below; /api/admin, /api/reed and /api/board answer 401 with a clear error
 * instead (twoStepApiRefusal). getOrgContext (lib/admin/auth.ts) treats any
 * status but "ok" as signed out, so a route that slips past middleware still
 * refuses.
 */

export const TWO_STEP_ENROLL_PATH = "/admin/two-step/enroll";
export const TWO_STEP_VERIFY_PATH = "/admin/two-step/verify";
export const TWO_STEP_PREFIX = "/admin/two-step";

export type Aal = "aal1" | "aal2" | null;
export type TwoStepStatus = "anonymous" | "enroll" | "verify" | "ok";

type FactorLike = { status?: string | null };
type UserLike = { factors?: FactorLike[] | null } | null | undefined;

function decodeBase64Url(part: string): string {
  let s = part.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** The `aal` claim of an access token, or null when absent or unreadable.
 *  Only meaningful for a token getUser() has already accepted. */
export function jwtAal(token: string | null | undefined): Aal {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const claims = JSON.parse(decodeBase64Url(part)) as { aal?: unknown };
    return claims.aal === "aal2" ? "aal2" : claims.aal === "aal1" ? "aal1" : null;
  } catch {
    return null;
  }
}

/** True when the user has at least one verified second factor. */
export function hasVerifiedFactor(user: UserLike): boolean {
  return (user?.factors ?? []).some((f) => f?.status === "verified");
}

export function twoStepStatus(s: { hasUser: boolean; aal: Aal; verifiedFactor: boolean }): TwoStepStatus {
  if (!s.hasUser) return "anonymous";
  if (!s.verifiedFactor) return "enroll";
  return s.aal === "aal2" ? "ok" : "verify";
}

/** Where a finished two-step sign-in may return to: a same-origin path under
 *  /admin or /board, never the two-step screens themselves. */
export function safeTwoStepNext(raw: string | null | undefined): string {
  const fallback = "/admin/today";
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  const path = raw.split(/[?#]/)[0];
  const allowed =
    path === "/admin" || path.startsWith("/admin/") || path === "/board" || path.startsWith("/board/");
  if (!allowed || path.startsWith(TWO_STEP_PREFIX)) return fallback;
  return raw;
}

function withNext(screen: string, next: string): string {
  return next === "/admin/today" || next === "/admin" ? screen : `${screen}?next=${encodeURIComponent(next)}`;
}

/**
 * For a gated PAGE (under /admin or /board): the path to redirect to, or null
 * to let the request through. `nextParam` is the two-step screen's own ?next.
 * Anonymous requests are left to the existing sign-in gates.
 */
export function twoStepPageRedirect(
  status: TwoStepStatus,
  pathname: string,
  search: string,
  nextParam: string | null,
): string | null {
  const onScreen = pathname === TWO_STEP_PREFIX || pathname.startsWith(`${TWO_STEP_PREFIX}/`);
  if (status === "anonymous") return onScreen ? "/admin" : null;
  if (onScreen) {
    const next = safeTwoStepNext(nextParam);
    if (status === "ok") return next;
    const want = status === "enroll" ? TWO_STEP_ENROLL_PATH : TWO_STEP_VERIFY_PATH;
    return pathname === want ? null : withNext(want, next);
  }
  if (status === "ok") return null;
  const screen = status === "enroll" ? TWO_STEP_ENROLL_PATH : TWO_STEP_VERIFY_PATH;
  return withNext(screen, safeTwoStepNext(pathname + search));
}

/** Session-backed API surfaces the two-step rule covers. */
export const TWO_STEP_API_PREFIXES = ["/api/admin/", "/api/reed/", "/api/board/"] as const;

/** API routes that must work before the second step: signing in, signing
 *  out, and asking for a password reset link. */
export const TWO_STEP_API_EXEMPT: ReadonlySet<string> = new Set([
  "/api/admin/login",
  "/api/admin/logout",
  "/api/admin/account/password/reset-link",
  "/api/board/signin",
  "/api/board/signout",
]);

export type TwoStepRefusal = { status: 401; body: { error: string; code: "two_step_required"; step: "enroll" | "verify"; url: string } };

/** For an API request: the 401 to return, or null to let the handler decide
 *  (an anonymous call still gets the handler's own 401). */
export function twoStepApiRefusal(status: TwoStepStatus, pathname: string): TwoStepRefusal | null {
  if (status !== "enroll" && status !== "verify") return null;
  if (TWO_STEP_API_EXEMPT.has(pathname)) return null;
  if (!TWO_STEP_API_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  return {
    status: 401,
    body: {
      error:
        status === "enroll"
          ? "Two-step login is required. Set up an authenticator app to finish signing in."
          : "Two-step login is required. Enter the code from your authenticator app to finish signing in.",
      code: "two_step_required",
      step: status,
      url: status === "enroll" ? TWO_STEP_ENROLL_PATH : TWO_STEP_VERIFY_PATH,
    },
  };
}

export type FactorRuleResult = { ok: true } | { ok: false; status: 404 | 409; error: string };

/**
 * May a user remove one of their own factors? Never the last verified one:
 * two-step login is required for everyone, so removing it would only send
 * them straight back to the enroll screen. Unverified (abandoned) factors can
 * always go. A factor id that isn't theirs is 404.
 */
export function checkFactorRemoval(
  factors: readonly { id: string; status?: string | null }[],
  factorId: string,
): FactorRuleResult {
  const target = factors.find((f) => f.id === factorId);
  if (!target) return { ok: false, status: 404, error: "That authenticator isn't on your account." };
  if (target.status !== "verified") return { ok: true };
  const verified = factors.filter((f) => f.status === "verified").length;
  if (verified <= 1) {
    return {
      ok: false,
      status: 409,
      error: "This is your only authenticator. Add another one before removing it.",
    };
  }
  return { ok: true };
}
