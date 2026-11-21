// Pure pieces of Fundraising → Thank-yous on DataTable v2 (V4 B1): the
// built-in views, the server-side sort and page over the reconciled queue,
// each row's next step, and the summary strip.
import { requiresSubstantiation } from "./receipt";
import { daysBetween } from "./donorRecord";
import type { TableSort } from "@/lib/admin/dataTable";

export type ThankYouRow = {
  id: string;
  amount: number;
  gift_date: string;
  email: string | null;
};

export const THANK_VIEWS = [
  { key: "all", label: "All waiting" },
  { key: "receipt", label: "Receipt required" },
  { key: "no_email", label: "No email on file" },
] as const;
export type ThankViewKey = (typeof THANK_VIEWS)[number]["key"];

export function isThankView(v: unknown): v is ThankViewKey {
  return THANK_VIEWS.some((t) => t.key === v);
}

export function filterThankYous<R extends ThankYouRow>(rows: readonly R[], view: ThankViewKey): R[] {
  if (view === "receipt") return rows.filter((r) => requiresSubstantiation(r.amount));
  if (view === "no_email") return rows.filter((r) => !r.email);
  return [...rows];
}

/** Sort by gift date (default oldest first, the IRS clock) or amount. Ties
 *  fall back to the gift id so paging is stable. */
export function sortThankYous<R extends ThankYouRow>(rows: readonly R[], sort: TableSort | null): R[] {
  const s = sort ?? { key: "date", dir: "asc" };
  const sign = s.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const d = s.key === "amount" ? a.amount - b.amount : a.gift_date.localeCompare(b.gift_date);
    return d !== 0 ? d * sign : a.id.localeCompare(b.id);
  });
}

export function pageOf<R>(rows: readonly R[], page: number, pageSize: number): R[] {
  return rows.slice(page * pageSize, page * pageSize + pageSize);
}

const OFFLINE = ["letter", "call", "text", "in_person"];

/** "Send thank-you" when there is an email to send to and the donor does not
 *  prefer a letter, call, text or visit; else "Mark thanked". */
export function nextStepFor(row: { email: string | null; preferred?: string | null }): "send" | "mark" {
  if (row.preferred && OFFLINE.includes(row.preferred)) return "mark";
  return row.email ? "send" : "mark";
}

export type ThankSummary = { count: number; total: number; receiptCount: number; oldestDays: number | null; oldestDate: string | null };

export function thankSummary(rows: readonly ThankYouRow[], today: string): ThankSummary {
  const oldest = rows.reduce<string | null>((o, r) => (o === null || r.gift_date < o ? r.gift_date : o), null);
  return {
    count: rows.length,
    total: Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    receiptCount: rows.filter((r) => requiresSubstantiation(r.amount)).length,
    oldestDays: oldest ? Math.max(0, daysBetween(oldest, today)) : null,
    oldestDate: oldest,
  };
}
