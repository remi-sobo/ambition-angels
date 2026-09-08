import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import {
  fiscalYearStart,
  type BuiltInView,
  type ViewDefinition,
} from "@/lib/fundraising/views";

/**
 * Spec Fundraising, stage F1 — the Donors & Funders data spine.
 *
 * Every constituent read goes through public.v_fr_rollups (security_invoker,
 * so RLS scopes per caller) with the ACTIVE org pinned explicitly — RLS
 * alone would merge rows from every org the user belongs to (the house
 * caveat, same as the V1 donors page). The rollups are computed set-based in
 * the view; this loader only filters and paginates — the spec's "Rollup
 * cost" failure mode forbids paging base tables into JS here.
 *
 * The Prospects view reads fr_prospects (status='active') instead — the
 * one-list rule's deliberate exception (lib/fundraising/views.ts).
 */

export const PAGE_SIZE = 50;

export type DfRow = {
  id: string;
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
  emails: string[];
  do_not_contact: boolean;
  lifetime_total: number;
  gift_count: number;
  first_gift: string | null;
  last_gift: string | null;
  last_touch: string | null;
  next_step: string | null;
  next_step_due: string | null;
  recurring_active: boolean;
};

export type ProspectRow = {
  id: string;
  name: string;
  type: string;
  email: string | null;
  org_name: string | null;
  strategy_note: string | null;
  source: string;
  created_at: string;
};

export type SavedView = {
  id: string;
  name: string;
  definition: Record<string, string>;
};

export type DonorsFundersData = {
  view: BuiltInView;
  rows: DfRow[];
  prospects: ProspectRow[];
  total: number;
  page: number;
  pageSize: number;
  savedViews: SavedView[];
  error: string | null;
};

export async function getDonorsFunders(
  def: ViewDefinition,
  page: number,
  todayISO: string,
): Promise<DonorsFundersData | null> {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const supabase = createServerSupabase();
  const view = def.view ?? "all";
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Saved views are org-fenced here (pinned), not just by RLS.
  const savedViewsQ = supabase
    .from("segments")
    .select("id, name, definition")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (view === "prospects") {
    let q = supabase
      .from("fr_prospects")
      .select("id, name, type, email, org_name, strategy_note, source, created_at", {
        count: "exact",
      })
      .eq("org_id", ctx.orgId)
      .eq("status", "active"); // promoted/disqualified never render here (DoD 2)
    if (def.q)
      q = q.or(`name.ilike.%${def.q}%,org_name.ilike.%${def.q}%,email.ilike.%${def.q}%`);
    // The prospect table's type vocabulary differs from constituents'.
    if (def.type === "person") q = q.eq("type", "individual");
    if (def.type === "organization") q = q.in("type", ["foundation", "corporate"]);
    const [{ data, count, error }, savedViewsRes] = await Promise.all([
      q.order("created_at", { ascending: false }).range(from, to),
      savedViewsQ,
    ]);
    return {
      view,
      rows: [],
      prospects: (data ?? []) as ProspectRow[],
      total: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
      savedViews: (savedViewsRes.data ?? []) as SavedView[],
      error: error ? error.message : null,
    };
  }

  let q = supabase
    .from("v_fr_rollups")
    .select(
      "id, type, first_name, last_name, org_name, emails, do_not_contact, lifetime_total, gift_count, first_gift, last_gift, last_touch, next_step, next_step_due, recurring_active",
      { count: "exact" },
    )
    .eq("org_id", ctx.orgId)
    .is("archived_at", null); // archived hidden everywhere (matchesView)
  // These filters must stay equivalent to matchesView() in
  // lib/fundraising/views.ts — the tested contract for the view semantics.
  if (view === "donors") q = q.gt("gift_count", 0);
  if (view === "recurring") q = q.eq("recurring_active", true);
  if (view === "lapsed")
    q = q.gt("gift_count", 0).lt("last_gift", fiscalYearStart(todayISO));
  if (def.type) q = q.eq("type", def.type);
  if (def.min_total) q = q.gte("lifetime_total", Number(def.min_total));
  if (def.q)
    q = q.or(
      `first_name.ilike.%${def.q}%,last_name.ilike.%${def.q}%,org_name.ilike.%${def.q}%`,
    );

  const [{ data, count, error }, savedViewsRes] = await Promise.all([
    q
      .order("lifetime_total", { ascending: false })
      .order("last_gift", { ascending: false, nullsFirst: false })
      .order("id") // stable pagination under ties
      .range(from, to),
    savedViewsQ,
  ]);

  return {
    view,
    rows: ((data ?? []) as DfRow[]).map((r) => ({
      ...r,
      lifetime_total: Number(r.lifetime_total),
    })),
    prospects: [],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    savedViews: (savedViewsRes.data ?? []) as SavedView[],
    error: error ? error.message : null,
  };
}
