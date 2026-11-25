/**
 * The public website's origin, for absolute links in website emails and
 * redirects. MARKETING_ORIGIN, then NEXT_PUBLIC_SITE_URL, then the
 * production host. Read at call time so tests and per-environment overrides
 * behave predictably.
 */

const strip = (origin: string) => origin.replace(/\/+$/, "");

export function marketingOrigin(): string {
  return strip(
    process.env.MARKETING_ORIGIN ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://www.ambitionangels.org",
  );
}
