import type { BadgeTone } from "@/app/admin/_components/ui/Badge";
import type { Freshness } from "@/lib/admin/figure";

/**
 * Impact screens (V4 Stage G2): how a catalog metric's freshness and
 * confirmation read, in words. PURE (type-only imports) and unit-tested.
 * "Mission numbers marked unconfirmed where they are": anything not
 * confirmed says so, and a never-captured metric is missing, never 0.
 */

type MetricLike = {
  latest: { value: number; captured_on: string } | null;
  stale: boolean;
  confirmed_state: "confirmed" | "unconfirmed" | "conflict" | "stale" | null;
  source_kind: "manual" | "computed";
  cadence: string;
};

export function ageDays(capturedOn: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(capturedOn + "T00:00:00Z")) / 86_400_000));
}

export function freshnessLabel(m: MetricLike, now: Date): { label: string; tone: BadgeTone } {
  if (!m.latest) return { label: "Never updated", tone: "danger" };
  const age = ageDays(m.latest.captured_on, now);
  const ago = age === 0 ? "today" : age === 1 ? "1 day ago" : `${age} days ago`;
  if (m.stale) return { label: `Out of date, ${ago}`, tone: "warning" };
  return { label: age === 0 ? "Updated today" : `Updated ${ago}`, tone: "success" };
}

export function confirmLabel(state: MetricLike["confirmed_state"]): { label: string; tone: BadgeTone } {
  switch (state) {
    case "confirmed":
      return { label: "Confirmed", tone: "success" };
    case "conflict":
      return { label: "In conflict", tone: "danger" };
    case "stale":
      return { label: "Stale", tone: "warning" };
    case "unconfirmed":
      return { label: "Unconfirmed", tone: "warning" };
    default:
      return { label: "Not yet classified", tone: "neutral" };
  }
}

/** The Figure freshness for a catalog metric. */
export function metricFreshness(m: MetricLike): Freshness {
  if (!m.latest) return "missing";
  return m.stale ? "stale" : "fresh";
}

/** The Figure source line: where the number came from and how fresh it is. */
export function metricSource(m: MetricLike, now: Date, fmtDate: (iso: string) => string): string {
  const how = m.source_kind === "manual" ? "Entered by hand" : "Computed daily";
  if (!m.latest) return `${how}. Never captured.`;
  const c = confirmLabel(m.confirmed_state);
  const conf = m.confirmed_state === "confirmed" ? "" : ` ${c.label}.`;
  return `${how}, captured ${fmtDate(m.latest.captured_on)} (${m.cadence}).${conf}`;
}
