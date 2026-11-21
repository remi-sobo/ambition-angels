/**
 * V4 Stage C (spec §10): "look someone up" on a phone, PURE helpers. The page
 * (app/admin/lookup/page.tsx) reads through the session client; this shapes
 * what it shows. Tests: tests/phone-lookup.test.ts.
 */

/** Strip what would break a PostgREST or() filter; null when too short to search. */
export function cleanLookupQuery(raw: string | null | undefined): string | null {
  const q = (raw ?? "").replace(/[(),*%\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return q.length >= 2 ? q : null;
}

/** tel: link from a stored phone, digits and a leading + only. */
export function telHref(phone: string | null | undefined): string | null {
  const p = (phone ?? "").replace(/[^\d+]/g, "");
  return p.replace(/\D/g, "").length >= 7 ? `tel:${p}` : null;
}

export function mailHref(email: string | null | undefined): string | null {
  const e = (email ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? `mailto:${e}` : null;
}

export type StepCandidate = { text: string; due: string | null; source: "ask" | "task"; context: string | null };

/** The one next step to show: dated before undated, earliest due first. */
export function pickNextStep(steps: readonly StepCandidate[]): StepCandidate | null {
  const real = steps.filter((s) => s.text.trim());
  if (real.length === 0) return null;
  return [...real].sort((a, b) => {
    if (a.due && b.due) return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
    if (a.due) return -1;
    if (b.due) return 1;
    return 0;
  })[0];
}

export type GiftLite = { amount: number; gift_date: string; acknowledgment_status: string | null };

/** Lifetime, last gift and this year, each with the line that says where it came from. */
export function donorFigures(gifts: readonly GiftLite[], today: string) {
  const sorted = [...gifts].sort((a, b) => (a.gift_date > b.gift_date ? -1 : 1));
  const year = today.slice(0, 4);
  const lastYear = String(Number(year) - 1);
  const sum = (xs: readonly GiftLite[]) => xs.reduce((n, g) => n + g.amount, 0);
  const thisYear = sorted.filter((g) => g.gift_date.startsWith(year));
  const prior = sorted.filter((g) => g.gift_date.startsWith(lastYear));
  const last = sorted[0] ?? null;
  return {
    lifetime: { value: gifts.length ? sum(gifts) : null, source: `${gifts.length} gift${gifts.length === 1 ? "" : "s"}, as of now` },
    last: {
      value: last ? last.amount : null,
      source: last ? `${last.gift_date}, ${last.acknowledgment_status === "pending" ? "not thanked yet" : "thanked"}` : "No gifts on record",
    },
    thisYear: { value: thisYear.length ? sum(thisYear) : null, source: prior.length ? `Last year ${Math.round(sum(prior)).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}` : "Nothing last year" },
  };
}
