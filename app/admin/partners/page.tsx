import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import StatCard from "../_components/StatCard";
import PageHeader from "../_components/PageHeader";
import { NewPartnerForm } from "./_components/PartnerControls";
import { type Partner } from "./_lib/partners";
import PartnersWorkspace from "./_components/PartnersWorkspace";

// Schools & nonprofit partners (Ring 3, modules/02-program.md "Schools"):
// the partner CRM — a Prospect → Emerging → Pilot → Active → Anchor
// pipeline, a contacts directory per org, MOU/data-agreement tracking, and
// a logged touch/meeting timeline. The public /program-partners signup form
// feeds prospects in automatically.
export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  const today = new Date().toISOString().slice(0, 10);
  const supabase = getSupabaseAdmin();
  // Org fence: the service-role client bypasses RLS, so every read is scoped to
  // the active org. No session → empty.
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Schools & Partners" subtitle="Sign in to view partners." />
      </div>
    );
  }
  const orgId = ctx.orgId;
  const [partnersRes, contactsRes, tasksRes] = await Promise.all([
    supabase
      .from("partners")
      .select("*")
      .eq("org_id", orgId)
      .order("last_touch_at", { ascending: false, nullsFirst: false })
      .limit(500),
    supabase
      .from("partner_contacts")
      .select("partner_id, first_name, last_name, is_primary")
      .eq("org_id", orgId)
      .limit(2000),
    // Open tasks linked to partner orgs — for the per-row "tasks due" chip.
    supabase
      .from("ops_tasks")
      .select("linked_entity_id, due_date")
      .eq("org_id", orgId)
      .eq("linked_entity_type", "partner")
      .neq("status", "done")
      .limit(2000),
  ]);

  const base = (partnersRes.data ?? []) as Partner[];

  // Roll up contacts → count + primary name per org (no SQL group-by).
  const counts = new Map<string, number>();
  const primary = new Map<string, string>();
  for (const c of (contactsRes.data ?? []) as Array<{
    partner_id: string; first_name: string | null; last_name: string | null; is_primary: boolean;
  }>) {
    counts.set(c.partner_id, (counts.get(c.partner_id) ?? 0) + 1);
    if (c.is_primary || !primary.has(c.partner_id)) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
      if (name) primary.set(c.partner_id, name);
    }
  }
  // Roll up open tasks → count + overdue count per org.
  const openTasks = new Map<string, number>();
  const overdueTasks = new Map<string, number>();
  for (const t of (tasksRes.data ?? []) as Array<{ linked_entity_id: string | null; due_date: string | null }>) {
    if (!t.linked_entity_id) continue;
    openTasks.set(t.linked_entity_id, (openTasks.get(t.linked_entity_id) ?? 0) + 1);
    if (t.due_date && t.due_date < today) {
      overdueTasks.set(t.linked_entity_id, (overdueTasks.get(t.linked_entity_id) ?? 0) + 1);
    }
  }

  const partners: Partner[] = base.map((p) => ({
    ...p,
    contact_count: counts.get(p.id) ?? 0,
    primary_contact: primary.get(p.id) ?? null,
    open_tasks: openTasks.get(p.id) ?? 0,
    overdue_tasks: overdueTasks.get(p.id) ?? 0,
  }));

  // ── KPIs ──
  const in90 = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10);
  const cut30 = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const live = partners.filter((p) => p.status !== "lapsed");
  const active = partners.filter((p) => p.status === "active" || p.status === "anchor");
  const emerging = partners.filter((p) => p.status === "outreach" || p.status === "pilot");
  const prospects = partners.filter((p) => p.status === "prospect");
  const mouExpiring = live.filter(
    (p) => p.mou_status === "signed" && p.mou_end && p.mou_end >= today && p.mou_end <= in90
  );
  const mouExpired = live.filter(
    (p) => p.mou_status === "signed" && p.mou_end && p.mou_end < today
  );
  const staleTouch = active.filter((p) => !p.last_touch_at || p.last_touch_at < cut30);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <PageHeader
        title="Schools & Partners"
        subtitle="Prospect → emerging → pilot → active → anchor · contacts, MOUs, touch cadence"
        actions={<NewPartnerForm />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Active partners" value={active.length} sub={`${live.length} live in pipeline`} />
        <StatCard label="Emerging" value={emerging.length} sub="in outreach / piloting" muted={emerging.length === 0} />
        <StatCard label="Prospects" value={prospects.length} sub="cold + inbound" muted={prospects.length === 0} />
        <StatCard
          label="Need a touch"
          value={staleTouch.length + mouExpiring.length + mouExpired.length}
          sub={
            mouExpired.length > 0
              ? `${mouExpired.length} MOU expired`
              : mouExpiring.length > 0
              ? `${mouExpiring.length} MOU expiring`
              : "active, 30+ days quiet"
          }
          muted={staleTouch.length + mouExpiring.length + mouExpired.length === 0}
        />
      </div>

      {partners.length === 0 ? (
        <p className="text-sm text-ink-2">
          No partners yet — add your first school or nonprofit partner, or wait for the public
          signup form to feed prospects in.
        </p>
      ) : (
        <PartnersWorkspace partners={partners} />
      )}
    </div>
  );
}
