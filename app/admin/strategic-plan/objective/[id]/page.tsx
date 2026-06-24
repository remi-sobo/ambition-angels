import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { deriveHealth, worstHealth, healthLabel } from "@/lib/admin/plan/health";
import { planHealthToStatus, taskStatusToStatus } from "@/lib/admin/status";
import PageHeader from "../../../_components/PageHeader";
import StatCard from "../../../_components/StatCard";
import { StatusChip } from "@/app/admin/_components/StatusChip";
import OwnerChip from "../../_components/OwnerChip";
import ScorecardCard, { type ScorecardKpi } from "../../scorecard/_components/ScorecardCard";

// Objective detail (drill-in from the Strategy Org grid): one objective's KPIs up
// top — "the measures associated with this" — then its goals, the initiatives
// under each, and the actual tasks doing the work. Read-focused; editing stays on
// the plan/Area lens and the ops project pages. Org-scoped service-role reads.
export const dynamic = "force-dynamic";

type GoalRow = { id: string; title: string; description: string | null; owner: string | null; status: string; sort_order: number };
type KpiRow = {
  id: string; title: string; owner: string | null; unit: string | null; target: number | null;
  current: number | null; status: string; source: string; metric_key: string | null;
  last_updated_at: string | null; goal_id: string | null; objective_id: string | null;
};
type InitiativeRow = { id: string; goal_id: string; title: string; owner: string | null; status: string; sort_order: number };
type ProjectRow = { id: string; title: string; status: string; initiative_id: string | null };
type TaskRow = { id: string; title: string; status: string; assigned_to: string | null; due_date: string | null; project_id: string | null };

const TASK_LABEL: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

export default async function ObjectiveDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Not authorized.</div>;
  const orgId = ctx.orgId;
  const sb = getSupabaseAdmin();

  const { data: objective } = await sb
    .from("plan_objectives")
    .select("id, title, owner, status, three_year_statement")
    .eq("id", params.id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!objective) notFound();

  const { data: goalsData } = await sb
    .from("plan_goals")
    .select("id, title, description, owner, status, sort_order")
    .eq("org_id", orgId)
    .eq("objective_id", params.id)
    .order("sort_order")
    .order("created_at");
  const goals = (goalsData ?? []) as GoalRow[];
  const goalIds = goals.map((g) => g.id);

  // KPIs attached to this objective directly OR to any of its goals.
  const { data: kpisData } = await sb
    .from("plan_kpis")
    .select("id, title, owner, unit, target, current, status, source, metric_key, last_updated_at, goal_id, objective_id")
    .eq("org_id", orgId)
    .limit(500);
  const allKpis = (kpisData ?? []) as KpiRow[];
  const goalIdSet = new Set(goalIds);
  const kpis = allKpis.filter((k) => k.objective_id === params.id || (k.goal_id && goalIdSet.has(k.goal_id)));
  const kpiIds = kpis.map((k) => k.id);

  // Initiatives under the goals, and the work attached to them.
  const initiatives = goalIds.length
    ? ((await sb.from("plan_initiatives").select("id, goal_id, title, owner, status, sort_order").eq("org_id", orgId).in("goal_id", goalIds).order("sort_order").order("created_at")).data ?? [])
    : [];
  const inits = initiatives as InitiativeRow[];
  const initIds = inits.map((i) => i.id);

  const projects = initIds.length
    ? ((await sb.from("ops_projects").select("id, title, status, initiative_id").eq("org_id", orgId).in("initiative_id", initIds)).data ?? [])
    : [];
  const projs = projects as ProjectRow[];
  const projIds = projs.map((p) => p.id);

  const tasks = projIds.length
    ? ((await sb.from("ops_tasks").select("id, title, status, assigned_to, due_date, project_id").eq("org_id", orgId).in("project_id", projIds).is("archived_at", null).order("due_date", { ascending: true, nullsFirst: false })).data ?? [])
    : [];
  const taskRows = tasks as TaskRow[];

  const snaps = kpiIds.length
    ? ((await sb.from("plan_kpi_snapshots").select("kpi_id, value, captured_on").eq("org_id", orgId).in("kpi_id", kpiIds).order("captured_on", { ascending: true })).data ?? [])
    : [];

  // Group children for lookups.
  const kpisByGoal = new Map<string, KpiRow[]>();
  for (const k of kpis) if (k.goal_id) (kpisByGoal.get(k.goal_id) ?? kpisByGoal.set(k.goal_id, []).get(k.goal_id)!).push(k);
  const initsByGoal = new Map<string, InitiativeRow[]>();
  for (const i of inits) (initsByGoal.get(i.goal_id) ?? initsByGoal.set(i.goal_id, []).get(i.goal_id)!).push(i);
  const projsByInit = new Map<string, ProjectRow[]>();
  for (const p of projs) if (p.initiative_id) (projsByInit.get(p.initiative_id) ?? projsByInit.set(p.initiative_id, []).get(p.initiative_id)!).push(p);
  const tasksByProject = new Map<string, TaskRow[]>();
  for (const t of taskRows) if (t.project_id) (tasksByProject.get(t.project_id) ?? tasksByProject.set(t.project_id, []).get(t.project_id)!).push(t);
  const historyByKpi = new Map<string, number[]>();
  for (const s of snaps as { kpi_id: string; value: number }[]) (historyByKpi.get(s.kpi_id) ?? historyByKpi.set(s.kpi_id, []).get(s.kpi_id)!).push(Number(s.value));

  const objHealth = worstHealth(deriveHealth(kpis.map((k) => k.status)), objective.status) ?? objective.status;
  const initsDone = inits.filter((i) => i.status === "done").length;
  const openTasks = taskRows.filter((t) => t.status !== "done").length;

  const toCard = (k: KpiRow): ScorecardKpi => ({
    id: k.id,
    title: k.title,
    unit: k.unit,
    target: k.target === null ? null : Number(k.target),
    current: k.current === null ? null : Number(k.current),
    status: k.status,
    source: k.source,
    metricKey: k.metric_key,
    lastUpdatedAt: k.last_updated_at,
    goalTitle: k.goal_id ? goals.find((g) => g.id === k.goal_id)?.title ?? null : null,
    objectiveTitle: objective.title,
    history: (historyByKpi.get(k.id) ?? []).slice(-12),
  });

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <PageHeader
        title={objective.title}
        subtitle={
          <>
            <Link href="/admin/strategic-plan" className="text-orange hover:underline">← Strategy</Link>
            {objective.three_year_statement ? ` · 3-year: ${objective.three_year_statement}` : ""}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            {objective.owner && <OwnerChip owner={objective.owner} />}
            <StatusChip status={planHealthToStatus(objHealth)}>{healthLabel(objHealth)}</StatusChip>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Goals" value={goals.length} />
        <StatCard label="Measures" value={kpis.length} />
        <StatCard label="Initiatives done" value={`${initsDone}/${inits.length}`} />
        <StatCard label="Open tasks" value={openTasks} muted={openTasks === 0} />
      </div>

      {/* KPIs associated with this objective */}
      <h2 className="font-heading font-bold text-ink-1 text-lg mb-3">Measures</h2>
      {kpis.length === 0 ? (
        <p className="text-sm text-ink-2 mb-8">No measures on this objective yet — add them on the{" "}
          <Link href="/admin/strategic-plan" className="text-orange hover:underline">plan</Link>.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
          {kpis.map((k) => <ScorecardCard key={k.id} kpi={toCard(k)} />)}
        </div>
      )}

      {/* Goals → initiatives → the actual tasks */}
      <h2 className="font-heading font-bold text-ink-1 text-lg mb-3">Goals &amp; work</h2>
      {goals.length === 0 ? (
        <p className="text-sm text-ink-2">No goals under this objective yet.</p>
      ) : (
        <div className="space-y-4">
          {goals.map((g) => {
            const gInits = initsByGoal.get(g.id) ?? [];
            const gKpis = kpisByGoal.get(g.id) ?? [];
            return (
              <section key={g.id} className="border-[1.5px] border-outline rounded-card-lg p-5 bg-tile/40">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h3 className="font-heading font-semibold text-ink-1 flex-1 min-w-0">{g.title}</h3>
                  {g.owner && <OwnerChip owner={g.owner} />}
                  <StatusChip status={planHealthToStatus(g.status)}>{healthLabel(g.status)}</StatusChip>
                </div>
                {g.description && <p className="text-xs text-ink-2 mb-2">{g.description}</p>}
                {gKpis.length > 0 && (
                  <p className="text-[11px] text-ink-3 mb-3">
                    Measures: {gKpis.map((k) => k.title).join(" · ")}
                  </p>
                )}

                {gInits.length === 0 ? (
                  <p className="text-xs text-ink-3">No initiatives yet.</p>
                ) : (
                  <div className="space-y-3">
                    {gInits.map((it) => {
                      const iProjs = projsByInit.get(it.id) ?? [];
                      const iTasks = iProjs.flatMap((p) => tasksByProject.get(p.id) ?? []);
                      const done = iTasks.filter((t) => t.status === "done").length;
                      return (
                        <div key={it.id} className="bg-surface border border-hairline rounded-card p-3">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="text-sm font-semibold text-ink-1 flex-1 min-w-0">{it.title}</span>
                            {it.owner && <OwnerChip owner={it.owner} />}
                            {iTasks.length > 0 && (
                              <span className="text-[11px] text-ink-2 tabular-nums">{done}/{iTasks.length} tasks</span>
                            )}
                          </div>
                          {iProjs.length === 0 ? (
                            <p className="text-[11px] text-ink-3">No project attached — link one on the{" "}
                              <Link href="/admin/ops/projects" className="text-orange hover:underline">projects</Link> page.</p>
                          ) : (
                            <div className="space-y-2">
                              {iProjs.map((p) => {
                                const pTasks = tasksByProject.get(p.id) ?? [];
                                return (
                                  <div key={p.id}>
                                    <Link href={`/admin/ops/projects/${p.id}`} className="text-[11px] font-semibold text-ink-2 hover:text-orange">
                                      {p.title} →
                                    </Link>
                                    {pTasks.length === 0 ? (
                                      <p className="text-[11px] text-ink-3 pl-2">No tasks yet.</p>
                                    ) : (
                                      <ul className="mt-1 space-y-1">
                                        {pTasks.map((t) => (
                                          <li key={t.id} className="flex items-center gap-2 text-xs">
                                            <StatusChip status={taskStatusToStatus(t.status)} dot>{TASK_LABEL[t.status] ?? t.status}</StatusChip>
                                            <span className={`flex-1 min-w-0 truncate ${t.status === "done" ? "text-ink-3 line-through" : "text-ink-1"}`}>{t.title}</span>
                                            {t.assigned_to && <span className="text-[10px] text-ink-3 capitalize shrink-0">{t.assigned_to}</span>}
                                            {t.due_date && <span className="text-[10px] text-ink-3 tabular-nums shrink-0">{t.due_date}</span>}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
