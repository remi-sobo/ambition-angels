"use client";

import { useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AdminUser } from "@/lib/admin/auth";
import { saveAction } from "@/lib/admin/saveAction";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import FilterRow from "@/app/admin/_components/ui/FilterRow";
import SegmentedControl from "@/app/admin/_components/ui/SegmentedControl";
import Button from "@/app/admin/_components/ui/Button";
import EmptyState from "@/app/admin/_components/EmptyState";
import { Select } from "@/app/admin/_components/ui/Input";
import TaskListView, { type GroupBy } from "./TaskListView";
import TaskBoardView from "./TaskBoardView";
import TaskRow from "./TaskRow";
import type { OpsTask } from "../_types/ops";
import { useAssignees, withSelected } from "../../_lib/useAssignees";
import { TYPE } from "@/lib/admin/typeScale";

type View = "list" | "board";
type Scope = "active" | "archived";
type LinkFilter = "all" | "any" | "partner" | "constituent";

const LINK_FILTERS: { value: Exclude<LinkFilter, "all">; label: string }[] = [
  { value: "any", label: "CRM-linked" },
  { value: "partner", label: "Partners" },
  { value: "constituent", label: "Donors" },
];

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
  { value: "category", label: "Department" },
  { value: "project", label: "Project" },
];

const pick = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T =>
  v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/**
 * One Tasks surface (V4 Stage G: List archetype on the kit). Every choice
 * lives in the URL so a refresh, a shared link or the router.refresh() after
 * a completion keeps the screen as it was: scope (?scope=archived), view
 * (?view=board), grouping (?group=), the CRM filter (?linked=), the owner
 * (?assignee=) and a title search (?q=). Archiving stays an explicit step
 * (the row menu's "Archive"); "Archive done" files every finished task at
 * once through saveAction, so a failure is said, never silent.
 */
export default function TasksSurface({
  tasks,
  projectNames,
  currentUser,
}: {
  tasks: OpsTask[];
  projectNames: Record<string, string>;
  currentUser: AdminUser | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [archiving, setArchiving] = useState(false);

  const scope = pick<Scope>(searchParams.get("scope"), ["active", "archived"], "active");
  const view = pick<View>(searchParams.get("view"), ["list", "board"], "list");
  const groupBy = pick<GroupBy>(searchParams.get("group"), ["priority", "status", "category", "project"], "priority");
  const linkFilter = pick<LinkFilter>(searchParams.get("linked"), ["all", "any", "partner", "constituent"], "all");
  const assignee = searchParams.get("assignee")?.trim() || "all";
  const q = searchParams.get("q") ?? "";
  const [text, setText] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const members = useAssignees();
  const assigneeOptions = [
    { value: "all", label: "Everyone" },
    ...withSelected(members, assignee === "all" || assignee === "unassigned" ? "" : assignee),
    { value: "unassigned", label: "Unassigned" },
  ];

  const hrefWith = (updates: Record<string, string | null>) => {
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const go = (updates: Record<string, string | null>) => router.replace(hrefWith(updates), { scroll: false });

  const activeTasks = useMemo(() => tasks.filter((t) => !t.archived_at), [tasks]);
  const archivedTasks = useMemo(
    () => tasks.filter((t) => !!t.archived_at).sort((a, b) => (b.archived_at ?? "").localeCompare(a.archived_at ?? "")),
    [tasks],
  );

  const visibleTasks = useMemo(() => {
    let list = activeTasks;
    if (linkFilter === "any") list = list.filter((t) => !!t.linked_entity_type);
    else if (linkFilter !== "all") list = list.filter((t) => t.linked_entity_type === linkFilter);
    if (assignee === "unassigned") list = list.filter((t) => !t.assigned_to);
    else if (assignee !== "all") list = list.filter((t) => t.assigned_to === assignee);
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((t) => t.title.toLowerCase().includes(needle));
    return list;
  }, [activeTasks, linkFilter, assignee, q]);

  const doneActive = useMemo(() => activeTasks.filter((t) => t.status === "done"), [activeTasks]);

  async function archiveAllDone() {
    if (doneActive.length === 0 || archiving) return;
    setArchiving(true);
    const now = new Date().toISOString();
    const results = await Promise.all(
      doneActive.map((t) =>
        saveAction({ request: { url: `/api/admin/ops/tasks/${t.id}`, method: "PATCH", body: { archived_at: now } }, failure: false }),
      ),
    );
    const failed = results.filter((r) => !r.ok).length;
    setArchiving(false);
    if (failed > 0) toast.error(`${failed} of ${results.length} tasks could not be archived. Try again.`);
    else toast.success(`Archived ${results.length} done ${results.length === 1 ? "task" : "tasks"}`);
    router.refresh();
  }

  const filtersOn = (linkFilter !== "all" ? 1 : 0) + (assignee !== "all" ? 1 : 0) + (q ? 1 : 0);

  return (
    <section aria-label="Tasks" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<Scope>
          label="Which tasks"
          value={scope}
          segments={[
            { value: "active", label: "Active", hint: String(activeTasks.length) },
            { value: "archived", label: "Archived", hint: String(archivedTasks.length) },
          ]}
          hrefFor={(s) => hrefWith({ scope: s === "active" ? null : s })}
        />
        {scope === "active" ? (
          <div className="flex flex-wrap items-center gap-2">
            {doneActive.length > 0 ? (
              <Button type="button" variant="secondary" size="sm" onClick={archiveAllDone} loading={archiving}>
                {archiving ? "Archiving" : `Archive done (${doneActive.length})`}
              </Button>
            ) : null}
            <SegmentedControl<View>
              label="Layout"
              value={view}
              segments={[
                { value: "list", label: "List" },
                { value: "board", label: "Board" },
              ]}
              hrefFor={(v) => hrefWith({ view: v === "list" ? null : v })}
            />
          </div>
        ) : null}
      </div>

      {scope === "active" ? (
        <FilterRow
          search={{
            value: text,
            onChange: (v) => {
              setText(v);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => go({ q: v.trim() || null }), 300);
            },
            label: "Search tasks",
            placeholder: "Search by title",
          }}
          quickFilters={LINK_FILTERS.map((f) => ({
            key: f.value,
            label: f.label,
            active: linkFilter === f.value,
            onClick: () => go({ linked: linkFilter === f.value ? null : f.value }),
          }))}
          onClearAll={
            filtersOn > 0
              ? () => {
                  setText("");
                  go({ linked: null, assignee: null, q: null });
                }
              : undefined
          }
          right={
            <div className="flex flex-wrap items-center gap-2">
              <Select aria-label="Owner" value={assignee} onChange={(e) => go({ assignee: e.target.value === "all" ? null : e.target.value })} className="!w-auto">
                {assigneeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              {view === "list" ? (
                <Select aria-label="Group by" value={groupBy} onChange={(e) => go({ group: e.target.value === "priority" ? null : e.target.value })} className="!w-auto">
                  {GROUP_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      Group by {o.label.toLowerCase()}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
          }
        />
      ) : null}

      <div className="rounded-panel border border-hairline bg-surface p-4 sm:p-6">
        {scope === "archived" ? (
          archivedTasks.length === 0 ? (
            <EmptyState label="archived tasks" hint="Use a task's menu, then Archive, to file it here. Archived tasks can be reopened." />
          ) : (
            <div className="space-y-1.5">
              <p className={`${TYPE.bodyMuted} mb-2`}>Newest first. Reopen or unarchive from a task&apos;s menu.</p>
              {archivedTasks.map((t) => (
                <TaskRow key={t.id} task={t} projectName={t.project_id ? projectNames[t.project_id] ?? null : null} />
              ))}
            </div>
          )
        ) : view === "list" ? (
          <TaskListView tasks={visibleTasks} projectNames={projectNames} groupBy={groupBy} currentUser={currentUser} />
        ) : (
          <TaskBoardView tasks={visibleTasks} projectNames={projectNames} />
        )}
      </div>
    </section>
  );
}
