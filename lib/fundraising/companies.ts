import type { SupabaseClient } from "@supabase/supabase-js";
import { isOpenStage } from "./stage-sets";
import { isCompanyStage, OPEN_ASK_STATUSES, type CompanyStage } from "./company-stages";

// Company rollups for the Companies list (specs/bloomos-companies.md, Stage 1).
// Reads go through the caller's session client (RLS) and every list read is
// fenced to the active org. Money totals use the same tables and the same
// rules as Donor 360, so the two pages cannot disagree.

export type CompanyRow = {
  id: string;
  name: string;
  stage: CompanyStage;
  domains: string[];
  given: number;
  openAskCount: number;
  openAskTotal: number;
  lastActivity: string | null;
  nextStep: { title: string; due: string | null } | null;
};

type ConstituentLite = { id: string; org_name: string | null; company_stage: string | null; domains: string[] | null };

export function rollupCompanies(input: {
  companies: ConstituentLite[];
  gifts: Array<{ constituent_id: string | null; amount: number | string }>;
  asks: Array<{ funder_id: string; amount_requested: number | string | null; status: string }>;
  opportunities: Array<{ constituent_id: string | null; ask_amount: number | string | null; stage: string }>;
  interactions: Array<{ constituent_id: string; occurred_at: string }>;
  tasks: Array<{ linked_entity_id: string | null; title: string; due_date: string | null; status: string }>;
}): CompanyRow[] {
  const rows = new Map<string, CompanyRow>();
  for (const c of input.companies) {
    if (!isCompanyStage(c.company_stage)) continue;
    rows.set(c.id, {
      id: c.id,
      name: c.org_name?.trim() || "Unnamed organization",
      stage: c.company_stage,
      domains: c.domains ?? [],
      given: 0,
      openAskCount: 0,
      openAskTotal: 0,
      lastActivity: null,
      nextStep: null,
    });
  }
  for (const g of input.gifts) {
    const r = g.constituent_id ? rows.get(g.constituent_id) : undefined;
    if (r) r.given += Number(g.amount) || 0;
  }
  for (const a of input.asks) {
    const r = rows.get(a.funder_id);
    if (!r || !(OPEN_ASK_STATUSES as readonly string[]).includes(a.status)) continue;
    r.openAskCount += 1;
    r.openAskTotal += Number(a.amount_requested) || 0;
  }
  for (const o of input.opportunities) {
    const r = o.constituent_id ? rows.get(o.constituent_id) : undefined;
    if (!r || !isOpenStage(o.stage)) continue;
    r.openAskCount += 1;
    r.openAskTotal += Number(o.ask_amount) || 0;
  }
  for (const i of input.interactions) {
    const r = rows.get(i.constituent_id);
    if (r && (!r.lastActivity || i.occurred_at > r.lastActivity)) r.lastActivity = i.occurred_at;
  }
  // Next step: the earliest-due open task linked to the company. Undated
  // tasks sort after dated ones.
  for (const t of input.tasks) {
    const r = t.linked_entity_id ? rows.get(t.linked_entity_id) : undefined;
    if (!r || t.status === "done") continue;
    const cur = r.nextStep;
    const earlier =
      !cur || (t.due_date !== null && (cur.due === null || t.due_date < cur.due));
    if (earlier) r.nextStep = { title: t.title, due: t.due_date };
  }
  return Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadCompanies(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ rows: CompanyRow[]; error: string | null }> {
  const { data: companies, error } = await supabase
    .from("constituents")
    .select("id, org_name, company_stage, domains")
    .eq("org_id", orgId)
    .eq("type", "organization")
    .not("company_stage", "is", null)
    .is("archived_at", null)
    .order("org_name")
    .limit(500);
  if (error) return { rows: [], error: error.message };
  const list = (companies ?? []) as ConstituentLite[];
  if (list.length === 0) return { rows: [], error: null };
  const ids = list.map((c) => c.id);

  const [gifts, asks, opps, interactions, tasks] = await Promise.all([
    supabase.from("gifts").select("constituent_id, amount").eq("org_id", orgId).in("constituent_id", ids).limit(20000),
    supabase.from("asks").select("funder_id, amount_requested, status").eq("org_id", orgId).in("funder_id", ids).limit(5000),
    supabase
      .from("opportunities")
      .select("constituent_id, ask_amount, stage")
      .eq("org_id", orgId)
      .in("constituent_id", ids)
      .limit(5000),
    supabase
      .from("interactions")
      .select("constituent_id, occurred_at")
      .eq("org_id", orgId)
      .in("constituent_id", ids)
      .order("occurred_at", { ascending: false })
      .limit(5000),
    supabase
      .from("ops_tasks")
      .select("linked_entity_id, title, due_date, status")
      .eq("org_id", orgId)
      .eq("linked_entity_type", "constituent")
      .in("linked_entity_id", ids)
      .neq("status", "done")
      .limit(5000),
  ]);

  return {
    rows: rollupCompanies({
      companies: list,
      gifts: (gifts.data ?? []) as Parameters<typeof rollupCompanies>[0]["gifts"],
      asks: (asks.data ?? []) as Parameters<typeof rollupCompanies>[0]["asks"],
      opportunities: (opps.data ?? []) as Parameters<typeof rollupCompanies>[0]["opportunities"],
      interactions: (interactions.data ?? []) as Parameters<typeof rollupCompanies>[0]["interactions"],
      tasks: (tasks.data ?? []) as Parameters<typeof rollupCompanies>[0]["tasks"],
    }),
    error: null,
  };
}
