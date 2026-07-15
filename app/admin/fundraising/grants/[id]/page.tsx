import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/admin/auth";
import { ensureGrantProject } from "@/lib/fundraising/grants";
import { todayISO, type OpsProject, type OpsTask } from "../../../ops/_types/ops";
import ProjectTaskList from "../../../ops/projects/[id]/_components/ProjectTaskList";
import ProjectActivityLog from "../../../ops/projects/[id]/_components/ProjectActivityLog";
import {
  StageSelect,
  RequirementRow,
  AddRequirementForm,
  EditableGrantDetails,
} from "../_components/GrantControls";
import GrantSeedTasks from "../_components/GrantSeedTasks";
import { STAGE_LABELS } from "../_lib/stages";
import PageHeader from "../../../_components/PageHeader";
import { EntityDocuments } from "../../../_components/EntityDocuments";
import { money } from "../../../finance/_components/charts";
import { ASK_FORM_LABELS } from "@/lib/fundraising/asks";
import { NewAskForm, StatusChip } from "../../asks/_components/AskControls";
import { TYPE } from "@/lib/admin/typeScale";

// Grant detail: award facts, stage control, and the requirements calendar.
// Requirement-row rendering (incl. inline edit) lives in GrantControls.
export const dynamic = "force-dynamic";

export default async function GrantDetailPage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const supabase = createServerSupabase();
  const [gRes, reqsRes] = await Promise.all([
    supabase
      .from("grants")
      .select("*, funder:constituents(id, org_name)")
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("grant_requirements")
      .select("*")
      .eq("grant_id", params.id)
      .order("due_date", { ascending: true }),
  ]);

  if (gRes.error) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className={`${TYPE.pageTitle} mb-4`}>Grants</h1>
        <div className="bg-tile shadow-tile border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
          The grants tables aren&apos;t in this database yet. Apply{" "}
          <code className="text-orange">create_grants.sql</code> via Actions → Apply DB migration,
          then reload.
        </div>
      </div>
    );
  }
  if (!gRes.data) notFound();
  const g = gRes.data;
  const requirements = (reqsRes.data ?? []) as Array<{
    id: string; kind: string; label: string | null; due_date: string;
    status: string; submitted_at: string | null; notes: string | null;
  }>;
  const today = todayISO();

  // Asks logged against this grant (the ask log ties into the pipeline). The
  // proposal PDF for a grant lives on its ask, so this is also the way in to
  // the documents for this grant.
  const asks = (
    (
      await supabase
        .from("asks")
        .select("id, form, title, status, amount_requested, ask_date, ask_documents(count)")
        .eq("grant_id", g.id)
        .order("ask_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
    ).data ?? []
  ) as Array<{
    id: string;
    form: string;
    title: string | null;
    status: string;
    amount_requested: number | null;
    ask_date: string | null;
    ask_documents: { count: number }[] | null;
  }>;

  // The grant's workspace project. Phase 2 creates this on grant creation;
  // self-heal here covers grants made before Phase 2 (or whose project insert
  // failed) by creating it on first load. The insert is idempotent against the
  // unique partial index on grant_id — if a concurrent load wins the race, we
  // re-read the winner rather than surfacing the unique violation.
  let project = (
    await supabase.from("ops_projects").select("*").eq("grant_id", g.id).maybeSingle()
  ).data as OpsProject | null;
  if (!project) {
    project = (await ensureGrantProject(
      supabase,
      g,
      (await getAdminUser()) ?? "remi"
    )) as OpsProject | null;
  }

  const tasks = project
    ? (((
        await supabase
          .from("ops_tasks")
          .select("*")
          .eq("project_id", project.id)
          .order("display_order", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true })
      ).data as OpsTask[] | null) ?? [])
    : [];

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1100px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <PageHeader
          eyebrow={
            <Link href="/admin/fundraising/grants" className="hover:text-ink-1 transition-colors">
              ← Grants
            </Link>
          }
          title={
            <span className="flex items-center gap-3 flex-wrap">
              <span className="truncate">{g.name}</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange/15 text-orange uppercase tracking-wider">
                {STAGE_LABELS[g.stage] ?? g.stage}
              </span>
            </span>
          }
          actions={<StageSelect grantId={g.id} stage={g.stage} periodEnd={g.period_end ?? null} />}
        />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <section className="lg:col-span-5 bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5">
            <EditableGrantDetails
              grant={{
                id: g.id,
                name: g.name,
                funderId: g.funder?.id ?? null,
                funderName: g.funder?.org_name ?? null,
                amount_requested: g.amount_requested != null ? Number(g.amount_requested) : null,
                amount_awarded: g.amount_awarded != null ? Number(g.amount_awarded) : null,
                period_start: g.period_start ?? null,
                period_end: g.period_end ?? null,
                program: g.program ?? null,
                restrictions: g.restrictions ?? null,
                owner: g.owner ?? null,
                notes: g.notes ?? null,
              }}
            />
          </section>

          <section className="lg:col-span-7 bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-outline">
              <h2 className={TYPE.cardTitle}>Requirements Calendar</h2>
            </div>
            {requirements.length === 0 ? (
              <p className="px-5 py-6 text-ink-2 text-sm">
                No deadlines yet — add the application, reports, and anything else the funder
                expects. Awarded grants auto-plot a final report at the period end.
              </p>
            ) : (
              <ul className="divide-y divide-hairline">
                {requirements.map((r) => (
                  <RequirementRow key={r.id} requirement={r} today={today} />
                ))}
              </ul>
            )}
            <AddRequirementForm grantId={g.id} />
          </section>
        </div>

        {/* ── Asks: the solicitations behind this grant + their PDFs ── */}
        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-outline flex items-center justify-between gap-3 flex-wrap">
            <h2 className={TYPE.cardTitle}>Asks</h2>
            {g.funder?.id && (
              <NewAskForm
                grantId={g.id}
                fixedFunder={{ id: g.funder.id, name: g.funder.org_name ?? "This funder" }}
              />
            )}
          </div>
          {asks.length === 0 ? (
            <p className="px-5 py-6 text-ink-2 text-sm">
              No asks logged for this grant yet. Log the proposal or LOI you submitted and attach the
              PDF — it lands in the Ask Log too.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {asks.map((a) => {
                const docCount = a.ask_documents?.[0]?.count ?? 0;
                return (
                  <li key={a.id} className="px-5 py-3">
                    <Link href={`/admin/fundraising/asks/${a.id}`} className="flex items-center gap-3 group">
                      <StatusChip status={a.status} />
                      <span className="min-w-0 flex-1">
                        <span className="text-sm text-ink-1 font-medium truncate group-hover:text-orange transition-colors block">
                          {a.title || ASK_FORM_LABELS[a.form] || a.form}
                        </span>
                        <span className="text-[11px] text-ink-2">
                          {ASK_FORM_LABELS[a.form] ?? a.form}
                          {a.ask_date ? ` · ${new Date(a.ask_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                          {docCount > 0 ? ` · ${docCount} doc${docCount === 1 ? "" : "s"}` : ""}
                        </span>
                      </span>
                      {a.amount_requested != null && (
                        <span className="text-sm text-ink-1 tabular-nums whitespace-nowrap">{money(Number(a.amount_requested))}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── Documents: award letter, narrative, reports — linked here ── */}
        <EntityDocuments entityType="grant" entityId={g.id} entityLabel={g.name} />

        {project ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 space-y-4">
              <p className="text-[11px] text-ink-3">
                Tasks added here are filed to this grant&apos;s workspace project and show up in
                your normal task views (My Week, Tasks, Ops) — assignee, due date, and priority set
                here carry through.
              </p>
              {tasks.length === 0 && <GrantSeedTasks grantId={g.id} />}
              <ProjectTaskList
                projectId={project.id}
                projectCategory={project.category}
                projectAssignedTo={project.assigned_to}
                initialTasks={tasks}
              />
            </div>
            <div className="lg:col-span-5">
              <ProjectActivityLog project={project} tasks={tasks} />
            </div>
          </div>
        ) : (
          <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5 text-sm text-ink-2">
            This grant&apos;s workspace project couldn&apos;t be loaded. Reload the
            page to retry — it will be created automatically.
          </section>
        )}
      </div>
    </div>
  );
}
