import type { TableSpec } from "@/lib/admin/dataTable";

/**
 * The documents hub on DataTable v2 (V4 Stage G). PURE: the table spec, the
 * filter params the table carries, and the renewal next step.
 */
export const DOCUMENT_TABLE: TableSpec = {
  sortable: [
    { key: "created_at", first: "desc" },
    { key: "title", first: "asc" },
    { key: "expires_at", first: "asc" },
  ],
  defaultSort: { key: "created_at", dir: "desc" },
  pageSize: 50,
};

export function documentFilterParams(f: { view: string; status: string; type: string; owner: string; q: string }): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.view !== "all") out.view = f.view;
  if (f.status !== "active") out.status = f.status;
  if (f.type !== "all") out.type = f.type;
  if (f.owner !== "all") out.owner = f.owner;
  if (f.q) out.q = f.q;
  return out;
}

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Renewals first: expired says how late, a near expiry says when. */
export function documentNextStep(
  d: { status: string; expires_at: string | null },
  today: string,
  windowDays = 60,
): { text: string; tone: "late" | "due" | "quiet" } {
  if (d.status === "archived") return { text: "Archived", tone: "quiet" };
  if (!d.expires_at) return { text: "Nothing due", tone: "quiet" };
  const left = days(today, d.expires_at);
  if (left < 0) return { text: `Renew: expired ${-left} ${-left === 1 ? "day" : "days"} ago`, tone: "late" };
  if (left === 0) return { text: "Renew: expires today", tone: "late" };
  if (left <= windowDays) return { text: `Renew within ${left} ${left === 1 ? "day" : "days"}`, tone: "due" };
  return { text: "Nothing due", tone: "quiet" };
}
