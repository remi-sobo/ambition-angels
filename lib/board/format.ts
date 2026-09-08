/**
 * Presentation helpers for the board portal.
 *
 * Every date here renders in America/Los_Angeles regardless of where the
 * server or the director is. A board meeting has one time — 4:00 PM Pacific —
 * and a director opening the portal from a hotel in another zone must see the
 * meeting's time, not her own. Getting this wrong shows someone the wrong
 * hour for a meeting they are expected to attend.
 */
export const BOARD_TZ = "America/Los_Angeles";

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: BOARD_TZ, ...opts });

/** "Wednesday, September 9" — the home hero date. */
export function heroDate(iso: string | null): string {
  if (!iso) return "";
  return fmt({ weekday: "long", month: "long", day: "numeric" }).format(new Date(iso));
}

/** "Wednesday, September 9, 2026" */
export function longDate(iso: string | null): string {
  if (!iso) return "";
  return fmt({ weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(
    new Date(iso),
  );
}

/** "September 9, 2026" */
export function plainDate(iso: string | null): string {
  if (!iso) return "";
  return fmt({ month: "long", day: "numeric", year: "numeric" }).format(new Date(iso));
}

/** "Sep 9" — compact, for due dates in the continuity block. */
export function shortDate(iso: string | null): string {
  if (!iso) return "";
  return fmt({ month: "short", day: "numeric" }).format(new Date(iso));
}

/** A date-only column ("2026-09-09") formatted without timezone drift.
 *  Parsing "2026-09-09" as a Date yields UTC midnight, which is the previous
 *  evening in Pacific — so a meeting date would render a day early. */
export function dateOnly(value: string | null, style: "long" | "plain" | "short" = "plain"): string {
  if (!value) return "";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const opts: Intl.DateTimeFormatOptions =
    style === "long"
      ? { weekday: "long", month: "long", day: "numeric", year: "numeric" }
      : style === "short"
        ? { month: "short", day: "numeric" }
        : { month: "long", day: "numeric", year: "numeric" };
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(dt);
}

/** "4:00 to 5:30 PM Pacific" */
export function timeRange(startIso: string | null, endIso: string | null): string {
  if (!startIso) return "";
  const t = (iso: string) =>
    fmt({ hour: "numeric", minute: "2-digit" })
      .format(new Date(iso))
      .replace(/\s?[AP]M$/, "");
  const suffix = fmt({ hour: "numeric" })
    .format(new Date(endIso ?? startIso))
    .replace(/^\d+\s?/, "");
  return endIso
    ? `${t(startIso)} to ${t(endIso)} ${suffix} Pacific`
    : `${t(startIso)} ${suffix} Pacific`;
}

/** "1.4 MB" */
export function fileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "Six" — the design spells small counts in prose. */
export function countWord(n: number): string {
  const w = [
    "zero", "one", "two", "three", "four", "five", "six",
    "seven", "eight", "nine", "ten", "eleven", "twelve",
  ];
  const s = w[n] ?? String(n);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Chip label for an agenda item type. */
export function itemTypeLabel(t: string): string {
  return t.toUpperCase();
}

/** Follow-up state label. States are carried by weight and label, never by
 *  color — a "decision required" tag is ink on a rule-bordered chip, not a
 *  red badge (spec §2). OVERDUE is the single permitted second accent. */
export function followUpLabel(status: FollowUpStatus): string {
  return {
    done: "Done",
    in_progress: "In progress",
    not_pursued: "Not pursued",
    overdue: "Overdue",
  }[status];
}

export type FollowUpStatus = "done" | "in_progress" | "not_pursued" | "overdue";

/** Days until a term expires; negative when already past. */
export function daysUntil(dateOnlyValue: string | null): number | null {
  if (!dateOnlyValue) return null;
  const [y, m, d] = dateOnlyValue.split("-").map(Number);
  if (!y || !m || !d) return null;
  const then = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((then - today) / 86_400_000);
}
