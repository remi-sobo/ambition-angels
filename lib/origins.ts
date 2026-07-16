/**
 * Origin seam for absolute links (core fence spec §6d, B4).
 *
 * Two hosts, two audiences:
 *
 * - APP_ORIGIN — the host that serves the admin. Every admin deep link in
 *   operator emails, digests, reports, and webhook registrations builds from
 *   appOrigin(). Until cutover the env var stays the AA host (email links
 *   keep pointing where operators' PWAs and habits are); at cutover it flips
 *   to https://app.bloomos.org with no code change.
 *
 * - MARKETING_ORIGIN — the public marketing site, for AA-site email flows
 *   (booking pages, receipts, unsubscribe, footers). Later per-org from
 *   orgs.settings.
 *
 * Both fall back to NEXT_PUBLIC_SITE_URL and then the AA production host, so
 * behavior is unchanged until the env vars are set. Read at call time (not
 * module load) so tests and per-environment overrides behave predictably.
 */

const strip = (origin: string) => origin.replace(/\/+$/, "");

export function appOrigin(): string {
  return strip(
    process.env.APP_ORIGIN ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://www.ambitionangels.org",
  );
}

/**
 * The app origin only when one is actually configured, else null — for
 * callers like the Google calendar-webhook registration where guessing a
 * default origin (and registering a prod webhook from a dev machine) is
 * worse than skipping.
 */
export function configuredAppOrigin(): string | null {
  const base =
    process.env.APP_ORIGIN ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return base ? strip(base) : null;
}

export function marketingOrigin(): string {
  return strip(
    process.env.MARKETING_ORIGIN ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://www.ambitionangels.org",
  );
}

/** Absolute URL to an admin path: adminUrl("/admin/ops") or adminUrl(). */
export function adminUrl(path: string = "/admin"): string {
  return `${appOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}
