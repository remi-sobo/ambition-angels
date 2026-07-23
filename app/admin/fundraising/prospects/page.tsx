import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import PageHeader from "../../_components/PageHeader";
import ProspectsTable, { type ProspectRow } from "./_components/ProspectsTable";
import { todayISO } from "../../ops/_types/ops";

// Prospects — the curated bench (fr_prospects), not the raw HubSpot mirror. Rows
// come from the bench; HubSpot-sourced ones are enriched with live mirror fields
// (lifecycle, owner, last activity) and their score, joined by hubspot_contact_id.
export const dynamic = "force-dynamic";

type BenchRow = {
  id: string;
  hubspot_contact_id: string | null;
  type: string;
  source: string;
  name: string;
  email: string | null;
  org_name: string | null;
  status: string;
};

export default async function FundraisingProspectsPage({
  searchParams,
}: {
  searchParams?: { show?: string };
}) {
  // Every read is pinned to the ACTIVE org — RLS alone would merge rows from
  // every org the user belongs to.
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Prospects" subtitle="Sign in to view prospects." />
      </div>
    );
  }
  const supabase = createServerSupabase();
  const disqualifiedView = searchParams?.show === "disqualified";
  const status = disqualifiedView ? "disqualified" : "active";

  const { data: benchData, error: benchErr } = await supabase
    .from("fr_prospects")
    .select("id, hubspot_contact_id, type, source, name, email, org_name, status")
    .eq("org_id", ctx.orgId)
    .eq("status", status)
    .limit(5000);
  const bench = (benchData ?? []) as BenchRow[];

  // Enrich HubSpot-sourced prospects from the live mirror + their score.
  const hubspotIds = bench.map((b) => b.hubspot_contact_id).filter((id): id is string => !!id);
  const [{ data: contacts }, { data: scores }, { count: disqualifiedCount }, { count: promotedCount }] =
    await Promise.all([
      hubspotIds.length
        ? supabase
            .from("hs_contacts")
            .select("hubspot_id, lifecycle_stage, owner_id, last_activity_at")
            .in("hubspot_id", hubspotIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      hubspotIds.length
        ? supabase.from("fr_prospect_scores").select("hubspot_contact_id, score_total").in("hubspot_contact_id", hubspotIds)
        : Promise.resolve({ data: [] as Array<{ hubspot_contact_id: string; score_total: number | null }> }),
      supabase.from("fr_prospects").select("id", { count: "exact", head: true }).eq("org_id", ctx.orgId).eq("status", "disqualified"),
      supabase.from("fr_prospects").select("id", { count: "exact", head: true }).eq("org_id", ctx.orgId).eq("status", "promoted"),
    ]);

  // Open tasks linked to prospects — the "Tasks" column. Pinned to the ACTIVE
  // org explicitly: RLS admits rows from every org the user belongs to, so the
  // session client alone is not enough.
  const today = todayISO();
  const openTaskCount = new Map<string, number>();
  const overdueTaskCount = new Map<string, number>();
  {
    const { data: taskRows } = await supabase
      .from("ops_tasks")
      .select("linked_entity_id, due_date")
      .eq("org_id", ctx.orgId)
      .eq("linked_entity_type", "fr_prospects")
      .neq("status", "done")
      .limit(5000);
    for (const t of (taskRows ?? []) as Array<{ linked_entity_id: string | null; due_date: string | null }>) {
      if (!t.linked_entity_id) continue;
      openTaskCount.set(t.linked_entity_id, (openTaskCount.get(t.linked_entity_id) ?? 0) + 1);
      if (t.due_date && t.due_date < today) {
        overdueTaskCount.set(t.linked_entity_id, (overdueTaskCount.get(t.linked_entity_id) ?? 0) + 1);
      }
    }
  }

  const hsMap = new Map(
    (contacts ?? []).map((c) => [
      c.hubspot_id as string,
      c as { lifecycle_stage: string | null; owner_id: string | null; last_activity_at: string | null },
    ])
  );
  const scoreMap = new Map((scores ?? []).map((s) => [s.hubspot_contact_id, s.score_total]));

  const rows: ProspectRow[] = bench.map((b) => {
    const hs = b.hubspot_contact_id ? hsMap.get(b.hubspot_contact_id) : undefined;
    return {
      id: b.id,
      hubspot_id: b.hubspot_contact_id,
      source: b.source,
      type: b.type,
      first_name: null,
      last_name: null,
      name: b.name,
      email: b.email,
      company: b.org_name,
      lifecycle_stage: hs?.lifecycle_stage ?? null,
      owner_id: hs?.owner_id ?? null,
      last_activity_at: hs?.last_activity_at ?? null,
      score_total: b.hubspot_contact_id ? scoreMap.get(b.hubspot_contact_id) ?? null : null,
      openTasks: openTaskCount.get(b.id) ?? 0,
      overdueTasks: overdueTaskCount.get(b.id) ?? 0,
    };
  });

  const lifecycleOptions = Array.from(
    new Set(rows.map((r) => r.lifecycle_stage).filter((v): v is string => !!v))
  ).sort();
  const ownerOptions = Array.from(new Set(rows.map((r) => r.owner_id).filter((v): v is string => !!v))).sort();
  const scoredCount = rows.filter((r) => r.score_total !== null).length;

  return (
    <div className="max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8">
      <PageHeader
        title={disqualifiedView ? "Prospects · Disqualified" : "Prospects"}
        subtitle={
          `${rows.length} prospect${rows.length === 1 ? "" : "s"} on the bench` +
          (disqualifiedView ? " (disqualified)" : "") +
          (!disqualifiedView && scoredCount > 0 ? ` · ${scoredCount} scored` : "") +
          (!disqualifiedView && (promotedCount ?? 0) > 0 ? ` · ${promotedCount} in pipeline` : "")
        }
        actions={
          disqualifiedView ? (
            <Link
              href="/admin/fundraising/prospects"
              className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors"
            >
              ← Active prospects
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/admin/fundraising/prospects/import"
                className="text-xs font-semibold text-orange hover:text-orange-dark bg-orange/10 hover:bg-orange/15 border-[1.5px] border-orange/30 px-4 py-2 rounded-full transition-colors"
              >
                + Import from HubSpot
              </Link>
              {(disqualifiedCount ?? 0) > 0 && (
                <Link
                  href="/admin/fundraising/prospects?show=disqualified"
                  className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors"
                >
                  Disqualified ({disqualifiedCount})
                </Link>
              )}
            </div>
          )
        }
      />

      {benchErr && (
        <div className="mb-4 bg-expense-bg border border-expense/30 rounded-xl px-5 py-3 text-expense text-sm">
          The bench failed to load — reload to retry.
        </div>
      )}

      <ProspectsTable
        rows={rows}
        lifecycleOptions={lifecycleOptions}
        ownerOptions={ownerOptions}
        disqualifiedView={disqualifiedView}
      />
    </div>
  );
}
