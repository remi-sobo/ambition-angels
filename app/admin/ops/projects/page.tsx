import Link from "next/link";
import EmptyState from "../../_components/EmptyState";
import PageHeader from "../../_components/PageHeader";
import DataTable, { type DataTableColumn } from "../../_components/ui/DataTable";
import SavedViews from "../../_components/ui/SavedViews";
import Figure, { SummaryStrip } from "../../_components/ui/Figure";
import Badge, { type BadgeTone } from "../../_components/ui/Badge";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveUserHandle } from "@/lib/admin/ops/identity";
import { applyTableSort, parseTableState, rowRange } from "@/lib/admin/dataTable";
import {
  PROJECT_TABLE,
  parseProjectFilters,
  projectFilterParams,
  projectNextStep,
  projectViews,
} from "@/lib/admin/ops/projectList";
import ProjectListControls, { NewProjectButton } from "../_components/ProjectListControls";
import { categoryLabel, formatDueLabel, formatRelative, isAdminUserId, isCategory, todayISO, type OpsProject } from "../_types/ops";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";

export const dynamic = "force-dynamic";

// V4 Stage G — Projects on the List archetype (spec §5; Main.dc.html):
// header with one primary action, saved views ("mine" first), one filter
// row, a summary strip with sourced figures, DataTable v2 with a next-step
// column (URL sort and paging, phone cards). Filters keep their V1 params.
const BASE = "/admin/work/projects";

const STATUS_TONE: Record<string, BadgeTone> = { active: "success", paused: "warning", done: "neutral", archived: "neutral" };

type Row = OpsProject & { openTasks: number };

export default async function ProjectsListPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const roleGate = await requirePagePermission("ops.read", "Operations");
  if (!roleGate.ok) return roleGate.page;
  const raw = searchParams ?? {};
  const filters = parseProjectFilters(raw, isCategory);
  const state = parseTableState(raw, PROJECT_TABLE);
  const me = await resolveUserHandle();
  const currentUser = me?.handle ?? null;

  // Org fence: service-role client bypasses RLS, so the list + its task-count
  // lookup MUST filter by the active org. No org → empty list.
  if (!me?.orgId) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-workspace">
        <PageHeader title="Projects" subtitle="Sign in to view your organization's projects." />
      </div>
    );
  }
  const orgId = me.orgId;
  const supabase = getSupabaseAdmin();
  const today = todayISO();
  const assignee = filters.assignee === "me" ? currentUser : filters.assignee;

  let query = supabase.from("ops_projects").select("*", { count: "exact" }).eq("org_id", orgId);
  if (!filters.showGrants) query = query.is("grant_id", null);
  if (filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.category) query = query.eq("category", filters.category);
  if (assignee === "unassigned") query = query.is("assigned_to", null);
  else if (assignee && isAdminUserId(assignee)) query = query.eq("assigned_to", assignee);
  if (filters.q) {
    const safe = filters.q.replace(/[,()*%]/g, "").trim();
    if (safe) query = query.ilike("title", `%${safe}%`);
  }
  query = applyTableSort(query, state.sort, { title: "title", due_date: "due_date", last_touched_at: "last_touched_at" });
  const { from, to } = rowRange(state.page, PROJECT_TABLE.pageSize);

  // The strip counts the org's open (active) projects, grant workspaces left
  // out unless the list shows them, so the numbers match what the list holds.
  const activeBase = () => {
    let q = supabase.from("ops_projects").select("*", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "active");
    if (!filters.showGrants) q = q.is("grant_id", null);
    return q;
  };
  const [{ data: rows, error, count }, { count: orgCount }, activeRes, lateRes, unassignedRes] = await Promise.all([
    query.range(from, to),
    // Any project at all: the first-run signal (the default view filters to
    // Active, which reads as zero on day one).
    supabase.from("ops_projects").select("*", { count: "exact", head: true }).eq("org_id", orgId),
    activeBase(),
    activeBase().lt("due_date", today),
    activeBase().is("assigned_to", null),
  ]);
  if (error) console.error("[projects] query failed:", { code: error.code, message: error.message });

  const projects = (rows as OpsProject[] | null) ?? [];
  const openCounts = new Map<string, number>();
  if (projects.length > 0) {
    const { data: taskRows } = await supabase
      .from("ops_tasks")
      .select("project_id, status")
      .eq("org_id", orgId)
      .in("project_id", projects.map((p) => p.id))
      .neq("status", "done")
      .is("archived_at", null);
    for (const r of (taskRows as Array<{ project_id: string }> | null) ?? []) {
      openCounts.set(r.project_id, (openCounts.get(r.project_id) ?? 0) + 1);
    }
  }
  const data = {
    rows: projects.map((p): Row => ({ ...p, openTasks: openCounts.get(p.id) ?? 0 })),
    total: count ?? 0,
    page: state.page,
    pageSize: PROJECT_TABLE.pageSize,
    error: error ? "The projects could not be read." : null,
  };
  const firstRun = (orgCount ?? 0) === 0 && !error;
  const countOf = (r: { count: number | null; error: unknown }) => (r.error ? null : r.count ?? 0);
  const grantsNote = filters.showGrants ? "" : ", grant projects left out";
  const { views, activeKey } = projectViews(BASE, filters);
  const newProject = <NewProjectButton currentUser={currentUser} basePath={BASE} />;

  const columns: DataTableColumn<Row>[] = [
    {
      key: "title",
      header: "Project",
      card: "title",
      render: (p) => (
        <>
          <Link href={`${BASE}/${p.id}`} className="font-semibold text-ink-1 hover:text-orange transition-colors">
            {p.title}
          </Link>
          <span className="block text-xs text-ink-2">{categoryLabel(p.category)}</span>
        </>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (p) => <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{categoryLabel(p.status)}</Badge>,
    },
    {
      key: "owner",
      header: "Owner",
      className: "text-ink-2",
      render: (p) => (p.assigned_to ? <span className="capitalize">{p.assigned_to}</span> : <span className="text-ink-3">No owner</span>),
    },
    {
      key: "due_date",
      header: "Due",
      className: "text-ink-2 tabular-nums",
      render: (p) => (p.due_date ? formatDueLabel(p.due_date) : <span className="text-ink-3">No date</span>),
    },
    {
      key: "open",
      header: "Open tasks",
      align: "right",
      className: "tabular-nums",
      render: (p) => p.openTasks,
    },
    {
      key: "last_touched_at",
      header: "Last touched",
      className: "text-ink-2",
      render: (p) => formatRelative(p.last_touched_at),
    },
  ];

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-workspace">
      <PageHeader
        title="Projects"
        subtitle="Work with a goal and an owner: grant deliverables, launches, board prep"
        primaryAction={newProject}
        moreActions={[
          { label: "See all tasks", href: "/admin/work/tasks" },
          { label: filters.showGrants ? "Hide grant projects" : "Show grant projects", href: `${BASE}?${new URLSearchParams({ ...projectFilterParams({ ...filters, showGrants: !filters.showGrants }) }).toString()}` },
        ]}
      />

      {firstRun ? (
        <EmptyState
          label="projects"
          title="No projects yet"
          purpose="A project groups tasks with a goal and an owner, so a launch or a grant deliverable has one place to track it."
          primaryAction={newProject}
          next="Add tasks on the project page. Its open tasks and due date show up here with a next step."
        />
      ) : (
        <>
          <SavedViews views={views} activeKey={activeKey} label="Project views" />
          <ProjectListControls
            status={filters.status}
            category={filters.category}
            assignee={filters.assignee}
            q={filters.q}
            currentUser={currentUser}
            showGrants={filters.showGrants}
          />
          <div className="mt-3" />
          <SummaryStrip label="Project summary">
            <Figure label="Active projects" value={countOf(activeRes)} source={`Status active, as of now${grantsNote}`} />
            <Figure
              label="Late"
              value={countOf(lateRes)}
              source="Active and past their due date"
              compareTone="danger"
              href={(countOf(lateRes) ?? 0) > 0 ? `${BASE}?sort=due_date` : undefined}
            />
            <Figure
              label="No owner"
              value={countOf(unassignedRes)}
              source="Active with nobody assigned"
              href={(countOf(unassignedRes) ?? 0) > 0 ? `${BASE}?assignee=unassigned` : undefined}
            />
          </SummaryStrip>
          <DataTable
            label="Projects"
            noun={{ one: "project", many: "projects" }}
            columns={columns}
            nextStep={{
              header: "Next step",
              render: (p) => {
                const n = projectNextStep(p, p.openTasks, today);
                return (
                  <span className={n.tone === "late" ? "text-status-critical-text font-semibold" : n.tone === "due" ? "text-ink-1" : "text-ink-2"}>
                    {n.text}
                  </span>
                );
              },
            }}
            data={data}
            getRowId={(p) => p.id}
            getRowLabel={(p) => p.title}
            spec={PROJECT_TABLE}
            state={state}
            baseHref={BASE}
            filters={projectFilterParams(filters)}
            emptyMessage="No projects match these filters. Clear them, or start a new project."
          />
        </>
      )}
    </div>
  );
}
