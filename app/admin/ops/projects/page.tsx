import Link from "next/link";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import ProjectListControls from "../_components/ProjectListControls";
import {
  categoryBadgeClass,
  categoryLabel,
  formatDueLabel,
  formatRelative,
  isAdminUserId,
  isCategory,
  isProjectStatus,
  projectStatusBadgeClass,
  type Category,
  type OpsProject,
  type ProjectStatus,
} from "../_types/ops";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type SearchParams = {
  status?: string;
  category?: string;
  assignee?: string;
  q?: string;
  sort?: string;
  dir?: string;
  page?: string;
};

const VALID_SORT = ["title", "due_date", "last_touched_at"] as const;
type SortKey = (typeof VALID_SORT)[number];

function parseParams(sp: SearchParams) {
  const status = isProjectStatus(sp.status ?? "")
    ? (sp.status as ProjectStatus)
    : sp.status === ""
    ? null // explicit "all"
    : "active";
  const category = sp.category && isCategory(sp.category) ? (sp.category as Category) : null;
  // "me" resolves to the current user; the page reads the cookie below.
  const assignee = sp.assignee ?? "";
  const q = (sp.q ?? "").trim();
  const sort: SortKey = VALID_SORT.includes(sp.sort as SortKey)
    ? (sp.sort as SortKey)
    : "last_touched_at";
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  return { status, category, assignee, q, sort, dir, page };
}

function readCurrentUser(): "remi" | "shannon" | null {
  const c = cookies().get("admin_user")?.value;
  return c === "remi" || c === "shannon" ? c : null;
}

export default async function ProjectsListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { status, category, assignee, q, sort, dir, page } = parseParams(searchParams);
  const currentUser = readCurrentUser();
  const resolvedAssignee = assignee === "me" ? currentUser : assignee;

  const supabase = getSupabaseAdmin();

  let baseQuery = supabase.from("ops_projects").select("*", { count: "exact" });
  if (status) baseQuery = baseQuery.eq("status", status);
  if (category) baseQuery = baseQuery.eq("category", category);
  if (resolvedAssignee === "unassigned") {
    baseQuery = baseQuery.is("assigned_to", null);
  } else if (resolvedAssignee && isAdminUserId(resolvedAssignee)) {
    baseQuery = baseQuery.eq("assigned_to", resolvedAssignee);
  }
  if (q) {
    const safe = q.replace(/[,()*%]/g, "").trim();
    if (safe) baseQuery = baseQuery.ilike("title", `%${safe}%`);
  }

  const offset = (page - 1) * PAGE_SIZE;
  baseQuery = baseQuery
    .order(sort, { ascending: dir === "asc", nullsFirst: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const { data: rows, error, count } = await baseQuery;
  if (error) {
    console.error("[/admin/ops/projects] query failed:", {
      code: error.code,
      message: error.message,
    });
  }
  const projects = (rows as OpsProject[] | null) ?? [];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Open task counts for the projects on this page.
  const openCounts = new Map<string, number>();
  if (projects.length > 0) {
    const ids = projects.map((p) => p.id);
    const { data: taskRows } = await supabase
      .from("ops_tasks")
      .select("project_id, status")
      .in("project_id", ids)
      .neq("status", "done");
    for (const r of (taskRows as Array<{ project_id: string }> | null) ?? []) {
      openCounts.set(r.project_id, (openCounts.get(r.project_id) ?? 0) + 1);
    }
  }

  function buildSortHref(nextSort: SortKey, nextDir: "asc" | "desc"): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    if (assignee) params.set("assignee", assignee);
    if (q) params.set("q", q);
    params.set("sort", nextSort);
    params.set("dir", nextDir);
    return `/admin/ops/projects?${params.toString()}`;
  }

  function buildPageHref(p: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    if (assignee) params.set("assignee", assignee);
    if (q) params.set("q", q);
    if (sort !== "last_touched_at") params.set("sort", sort);
    if (dir !== "desc") params.set("dir", dir);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/admin/ops/projects?${s}` : "/admin/ops/projects";
  }

  const fromIdx = totalCount === 0 ? 0 : offset + 1;
  const toIdx = Math.min(offset + PAGE_SIZE, totalCount);

  return (
    <div className="max-w-6xl mx-auto p-8">
      <header className="flex items-baseline justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="font-display font-black uppercase tracking-tight text-cream text-3xl sm:text-4xl leading-none">
            Projects
          </h1>
          <Link href="/admin/ops" className="text-xs text-gray-mid hover:text-cream mt-1 inline-block">
            ← Ops
          </Link>
        </div>
        <div className="text-xs text-gray-mid">
          {totalCount > 0 ? (
            <>
              Showing <span className="text-cream">{fromIdx}–{toIdx}</span> of{" "}
              <span className="text-cream">{totalCount}</span>
            </>
          ) : (
            "No matching projects"
          )}
        </div>
      </header>

      <ProjectListControls
        status={status ?? ""}
        category={category ?? ""}
        assignee={assignee}
        q={q}
        currentUser={currentUser}
      />

      {projects.length === 0 ? (
        <div className="rounded-card border border-white/10 bg-black/30 p-8 text-center text-sm text-gray-mid">
          No projects match your filters. Try clearing them, or use{" "}
          <span className="text-orange">+ New project</span> above.
        </div>
      ) : (
        <div className="rounded-card border border-white/10 bg-black/30 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/10 bg-black/20">
                <tr>
                  <SortHeader label="Title"        col="title"           current={sort} dir={dir} buildHref={buildSortHref} />
                  <ColHeader  label="Category" />
                  <ColHeader  label="Status" />
                  <ColHeader  label="Assignee" />
                  <SortHeader label="Due"          col="due_date"        current={sort} dir={dir} buildHref={buildSortHref} />
                  <ColHeader  label="Open tasks"   align="right" />
                  <SortHeader label="Last touched" col="last_touched_at" current={sort} dir={dir} buildHref={buildSortHref} />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {projects.map((p) => (
                  <tr key={p.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-2.5 pl-4 pr-4">
                      <Link
                        href={`/admin/ops/projects/${p.id}`}
                        className="text-cream font-medium hover:text-orange block max-w-[280px] truncate"
                      >
                        {p.title}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${categoryBadgeClass(p.category)}`}>
                        {categoryLabel(p.category)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${projectStatusBadgeClass(p.status)}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      {p.assigned_to ? (
                        <span className="inline-flex items-center gap-1 text-cream/70">
                          <span className="inline-flex w-4 h-4 rounded-full bg-white/10 items-center justify-center text-[9px] font-bold uppercase">
                            {p.assigned_to.charAt(0)}
                          </span>
                          <span className="text-xs">{p.assigned_to}</span>
                        </span>
                      ) : (
                        <span className="text-gray-mid">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-cream/70 font-mono text-xs">
                      {p.due_date ? formatDueLabel(p.due_date) : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono">
                      {openCounts.get(p.id) ?? 0}
                    </td>
                    <td className="py-2.5 pr-4 text-cream/60 text-xs">
                      {formatRelative(p.last_touched_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between text-xs text-gray-mid">
          <div>
            Page <span className="text-cream">{page}</span> of{" "}
            <span className="text-cream">{totalPages}</span>
          </div>
          <div className="flex gap-2">
            <PageLink disabled={page <= 1} href={buildPageHref(page - 1)} label="← Prev" />
            <PageLink disabled={page >= totalPages} href={buildPageHref(page + 1)} label="Next →" />
          </div>
        </nav>
      )}
    </div>
  );
}

function ColHeader({ label, align }: { label: string; align?: "left" | "right" }) {
  return (
    <th className={`text-${align ?? "left"} pb-2 pr-4 text-[10px] uppercase tracking-wider text-gray-mid font-medium`}>
      {label}
    </th>
  );
}

function SortHeader({
  label,
  col,
  current,
  dir,
  buildHref,
}: {
  label: string;
  col: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  buildHref: (s: SortKey, d: "asc" | "desc") => string;
}) {
  const isActive = current === col;
  const nextDir: "asc" | "desc" = isActive ? (dir === "asc" ? "desc" : "asc") : col === "title" ? "asc" : "desc";
  const arrow = isActive ? (dir === "asc" ? " ↑" : " ↓") : "";
  return (
    <th className="text-left pb-2 pr-4 text-[10px] uppercase tracking-wider font-medium">
      <Link
        href={buildHref(col, nextDir)}
        className={`hover:text-cream ${isActive ? "text-orange" : "text-gray-mid"}`}
      >
        {label}
        <span>{arrow}</span>
      </Link>
    </th>
  );
}

function PageLink({ disabled, href, label }: { disabled: boolean; href: string; label: string }) {
  if (disabled) {
    return (
      <span className="px-3 py-1.5 rounded-lg border border-white/5 text-gray-mid/50 cursor-default">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-lg border border-white/10 text-cream/80 hover:text-cream hover:bg-white/5"
    >
      {label}
    </Link>
  );
}
