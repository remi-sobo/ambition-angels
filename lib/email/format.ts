import { formatInTimeZone } from "date-fns-tz";

/** "Thursday, May 21, 2026" in the given IANA timezone. */
export function formatDateLong(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "EEEE, MMMM d, yyyy");
}

/** "11:00 AM – 11:30 AM PDT" in the given IANA timezone. */
export function formatTimeRange(start: Date, end: Date, tz: string): string {
  const startStr = formatInTimeZone(start, tz, "h:mm a");
  const endStr = formatInTimeZone(end, tz, "h:mm a");
  const tzLabel = shortTimeZoneName(start, tz);
  return `${startStr} – ${endStr} ${tzLabel}`;
}

/** Returns a short tz name like "PDT" / "EST" via Intl. */
export function shortTimeZoneName(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "short",
  }).formatToParts(date);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
}

/** HTML-escapes user-supplied strings before interpolation into templates. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Public URL of the manage-booking page for a given cancel token. */
export function manageUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.ambitionangels.org";
  return `${base.replace(/\/$/, "")}/meet/booked/${token}`;
}

/**
 * Wraps a body in a brand-styled HTML shell.
 *
 * Layout: cream page → white card with a 4px orange accent stripe on top,
 * letter-style content in a system font stack (no web fonts — email clients
 * are inconsistent), and a small "AMBITION ANGELS" wordmark footer outside
 * the card.
 */
export function htmlShell(body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0E0E0E;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FAFAF8;padding:36px 16px 24px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#FFFFFF;border-radius:20px;overflow:hidden;text-align:left;line-height:1.55;font-size:16px;">
      <tr><td style="height:4px;background:#E8500A;line-height:4px;font-size:0;">&nbsp;</td></tr>
      <tr><td style="padding:36px 36px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${body}
        </table>
      </td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;margin-top:18px;">
      <tr><td align="center" style="padding:4px 12px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6B6960;">
        <a href="https://www.ambitionangels.org" style="color:#6B6960;text-decoration:none;font-weight:700;">Ambition Angels</a>
        <span style="opacity:.5;">·</span>
        Career exposure in every pocket
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
