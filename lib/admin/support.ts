/**
 * V4 Stage F: where a person in BloomOS goes for help (spec §11 "Support: a
 * support address and a 'report a problem' action replace 'tell Remi'").
 *
 * The address comes from config, never from a person's name in code:
 *   1. NEXT_PUBLIC_SUPPORT_EMAIL (inlined into the browser bundle at build,
 *      so toasts and client screens can name it), then
 *   2. the org's own support_email in orgs.settings (set by the operator in
 *      the answers file; server-side callers pass the org's settings).
 * With neither, the copy points only at "Report an issue" (the + menu on
 * desktop, More on the phone), which files a task the BloomOS team triages
 * (app/api/admin/report/route.ts).
 *
 * PURE and client-safe. tests/support-copy.test.ts holds the admin UI to it:
 * no operator name in a user-facing string.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The configured support address, or null. Reads the env at call time. */
export function supportEmail(orgSettings?: Record<string, unknown> | null): string | null {
  // Literal reference so Next inlines it into client bundles.
  const env = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "").trim();
  if (EMAIL_RE.test(env)) return env;
  const own = typeof orgSettings?.support_email === "string" ? orgSettings.support_email.trim() : "";
  return EMAIL_RE.test(own) ? own : null;
}

export const REPORT_ACTION = "Report an issue";

/** "use Report an issue in the + menu, or write to help@…" */
export function supportHint(email: string | null = supportEmail()): string {
  return email
    ? `use ${REPORT_ACTION} in the + menu, or write to ${email}`
    : `use ${REPORT_ACTION} in the + menu`;
}

/** A full sentence for a section that only an operator can change. */
export function askSupportSentence(email: string | null = supportEmail()): string {
  return email
    ? `Write to ${email} and the BloomOS team will make the change for you.`
    : `Use ${REPORT_ACTION} in the + menu and the BloomOS team will make the change for you.`;
}
