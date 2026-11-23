"use client";

// Prospects list on the kit table (V4 P1; was the V1 shared DataTable). The
// server component loads every bench row joined to its live HubSpot fields
// and score and passes plain rows here. Everything stays in the browser, as
// before: the lifecycle / owner / scored facets, search, sort (a Sort control
// in place of header clicks), 50-row pages, CSV of the filtered view, saved
// views (same localStorage key as V1, so existing views carry over), and the
// bulk actions, which run here through the kit table's "run" kind.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StaticTable, type DataTableColumn, type DataTableBulkAction } from "@/app/admin/_components/ui/DataTable";
import { TextField, SelectField, CheckboxField } from "@/app/admin/_components/ui/Field";
import Button from "@/app/admin/_components/ui/Button";
import TaskComposer, { type TaskTarget } from "../../_components/TaskComposer";
import { CategoryTag, ScoreBadge } from "@/app/admin/_components/StatusChip";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import AddProspectModal from "./AddProspectModal";
import SavedViews, { SaveViewButton, type SavedView } from "@/app/admin/_components/ui/SavedViews";

export type ProspectRow = {
  id: string;
  hubspot_id: string | null;
  source: string;
  type: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  name: string;
  company: string | null;
  lifecycle_stage: string | null;
  owner_id: string | null;
  last_activity_at: string | null;
  score_total: number | null;
  openTasks: number;
  overdueTasks: number;
};

const PAGE_SIZE = 50;
const VIEWS_KEY = "bloomos.table.prospects.views";

type SortKey = "last_activity" | "name" | "company" | "lifecycle" | "score" | "tasks";
type Sort = { key: SortKey; dir: "asc" | "desc" };
type StoredView = { name: string; search: string; sort: { key: string; dir: "asc" | "desc" } | null };

const SORTS: { value: string; label: string; sort: Sort }[] = [
  { value: "last_activity:desc", label: "Last activity, newest", sort: { key: "last_activity", dir: "desc" } },
  { value: "last_activity:asc", label: "Last activity, oldest", sort: { key: "last_activity", dir: "asc" } },
  { value: "name:asc", label: "Name, A to Z", sort: { key: "name", dir: "asc" } },
  { value: "company:asc", label: "Company, A to Z", sort: { key: "company", dir: "asc" } },
  { value: "lifecycle:asc", label: "Lifecycle", sort: { key: "lifecycle", dir: "asc" } },
  { value: "score:desc", label: "Score, highest", sort: { key: "score", dir: "desc" } },
  { value: "tasks:desc", label: "Open tasks, most", sort: { key: "tasks", dir: "desc" } },
];

function sortValue(r: ProspectRow, key: SortKey): string | number | null {
  switch (key) {
    case "last_activity":
      return r.last_activity_at;
    case "name":
      return displayName(r).toLowerCase();
    case "company":
      return r.company?.toLowerCase() ?? null;
    case "lifecycle":
      return r.lifecycle_stage;
    case "score":
      return r.score_total;
    case "tasks":
      return r.openTasks;
  }
}

function csvEscape(v: string | number | null): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: ProspectRow[]) {
  const head = ["Name", "Email", "Company", "Lifecycle", "Owner ID", "Last Activity", "Score", "Tasks"];
  const body = rows.map((r) =>
    [displayName(r), r.email, r.company, r.lifecycle_stage, r.owner_id, r.last_activity_at, r.score_total, r.openTasks]
      .map(csvEscape)
      .join(","),
  );
  const blob = new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "prospects.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function displayName(r: ProspectRow): string {
  return r.name || r.email || "Unknown";
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

export default function ProspectsTable({
  rows,
  lifecycleOptions,
  ownerOptions,
  disqualifiedView = false,
}: {
  rows: ProspectRow[];
  lifecycleOptions: string[];
  ownerOptions: string[];
  disqualifiedView?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [lifecycle, setLifecycle] = useState("");
  const [owner, setOwner] = useState("");
  const [scored, setScored] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "last_activity", dir: "desc" });
  const [page, setPage] = useState(0);
  const [views, setViews] = useState<StoredView[]>([]);
  const [activeView, setActiveView] = useState("all");
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEWS_KEY);
      if (raw) setViews(JSON.parse(raw) as StoredView[]);
    } catch {
      /* corrupt prefs are non-fatal */
    }
  }, []);
  const persistViews = (next: StoredView[]) => {
    setViews(next);
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    } catch {
      /* storage full or blocked: the view lasts this session */
    }
  };
  const applyView = (key: string) => {
    setActiveView(key);
    setPage(0);
    if (key === "all") {
      setSearch("");
      setSort({ key: "last_activity", dir: "desc" });
      return;
    }
    const v = views.find((x) => x.name === key);
    if (!v) return;
    setSearch(v.search);
    const known = SORTS.find((o) => o.sort.key === v.sort?.key && o.sort.dir === v.sort?.dir);
    setSort(known ? known.sort : { key: "last_activity", dir: "desc" });
  };
  const saveView = () => {
    const name = viewName.trim();
    if (!name) return;
    persistViews([...views.filter((v) => v.name !== name), { name, search, sort }]);
    setActiveView(name);
    setNaming(false);
    setViewName("");
  };
  const [addOpen, setAddOpen] = useState(false);
  const [identifying, setIdentifying] = useState<string | null>(null);
  const [taskTargets, setTaskTargets] = useState<TaskTarget[] | null>(null);

  // Promote a single prospect into the pipeline at the Identify stage. Shared by
  // the "Promote to pipeline" bulk action and the per-row "No lifecycle" cell —
  // a prospect with no lifecycle has never entered the pipeline, so clicking it
  // is the natural "mark as Identified" gesture.
  const identifyOne = async (r: ProspectRow) => {
    if (identifying) return;
    const ok = await confirm({
      title: `Move ${displayName(r)} into the pipeline?`,
      body: "They'll be marked Identified and leave the bench.",
      confirmLabel: "Move to pipeline",
    });
    if (!ok) return;
    setIdentifying(r.id);
    void fetch("/api/admin/fundraising/prospects/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospect_id: r.id }),
    })
      .then((res) => res.json())
      .then((d: { promoted?: number }) => {
        if (!d?.promoted) toast.info("Already in the pipeline.");
        router.refresh();
      })
      .catch(() => toast.error("Could not move into the pipeline. Try again."))
      .finally(() => setIdentifying(null));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter(
      (r) =>
        (!lifecycle || r.lifecycle_stage === lifecycle) &&
        (!owner || r.owner_id === owner) &&
        (!scored || r.score_total !== null) &&
        (!q || [displayName(r), r.email, r.company].some((v) => (v ?? "").toLowerCase().includes(q))),
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls last
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, lifecycle, owner, scored, search, sort]);
  useEffect(() => setPage(0), [lifecycle, owner, scored, search, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const rowsFor = (ids: string[]) => ids.map((id) => byId.get(id)).filter((r): r is ProspectRow => !!r);

  const columns: DataTableColumn<ProspectRow>[] = [
    {
      key: "name",
      header: "Name",
      render: (r) => (
        <span className="flex items-center gap-1.5">
          <Link href={`/admin/fundraising/prospects/${r.id}`} className="text-ink-1 font-medium hover:text-orange">
            {displayName(r)}
          </Link>
          {r.type && r.type !== "individual" && (
            <span className="text-xs text-ink-3 border border-hairline rounded px-1 py-px">
              {r.type === "foundation" ? "Foundation" : r.type === "corporate" ? "Corp" : r.type}
            </span>
          )}
          {r.source === "manual" && <span className="text-xs text-orange/80">added</span>}
          {r.source === "research" && <span className="text-xs text-revenue">AI</span>}
        </span>
      ),
    },
    {
      key: "email",
      header: "Email",
      render: (r) => <span className="text-ink-2 truncate block max-w-[220px]">{r.email ?? "—"}</span>,
    },
    {
      key: "company",
      header: "Company",
      render: (r) => <span className="text-ink-2 truncate block max-w-[160px]">{r.company ?? "—"}</span>,
    },
    {
      key: "lifecycle",
      header: "Lifecycle",
      render: (r) =>
        r.lifecycle_stage ? (
          <CategoryTag category={r.lifecycle_stage}>{r.lifecycle_stage}</CategoryTag>
        ) : disqualifiedView ? (
          <span className="text-ink-2">—</span>
        ) : (
          <button
            type="button"
            onClick={() => void identifyOne(r)}
            disabled={identifying === r.id}
            title="Mark as Identified and move into the pipeline"
            className="inline-flex items-center gap-1 text-xs font-semibold text-ink-2 hover:text-orange border border-dashed border-hairline hover:border-orange/50 rounded-full px-2 py-0.5 transition-colors disabled:opacity-50"
          >
            {identifying === r.id ? "Moving…" : "No lifecycle · Identify →"}
          </button>
        ),
    },
    {
      key: "last_activity",
      header: "Last activity",
      render: (r) => <span className="text-ink-2">{fmtRelative(r.last_activity_at)}</span>,
    },
    {
      key: "score",
      header: "Score",
      align: "right",
      render: (r) => <ScoreBadge score={r.score_total} />,
    },
    {
      key: "tasks",
      header: "Tasks",
      align: "right",
      render: (r) =>
        r.openTasks > 0 ? (
          <span
            title={r.overdueTasks ? `${r.overdueTasks} overdue` : "open tasks"}
            className={`text-xs font-semibold px-2 py-0.5 rounded-full [font-variant-numeric:tabular-nums] ${
              r.overdueTasks ? "bg-expense-bg text-expense" : "bg-orange/15 text-orange"
            }`}
          >
            {r.openTasks}{r.overdueTasks ? ` · ${r.overdueTasks} overdue` : ""}
          </span>
        ) : (
          <span className="text-ink-3 text-xs">—</span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <button
          onClick={() => setTaskTargets([{ id: r.id, name: displayName(r) }])}
          title={`Create a follow-up task linked to ${displayName(r)}`}
          className="text-xs font-semibold text-ink-2 hover:text-orange transition-colors whitespace-nowrap"
        >
          + Task
        </button>
      ),
    },
  ];

  const bulkActions: DataTableBulkAction[] = [
    {
      kind: "run",
      key: "task",
      label: "Add follow-up task…",
      run: (ids) => setTaskTargets(rowsFor(ids).map((r) => ({ id: r.id, name: displayName(r) }))),
    },
    {
      kind: "run",
      key: "emails",
      label: "Copy emails",
      run: (ids) => {
        const selected = rowsFor(ids);
        const emails = selected.map((r) => r.email).filter((e): e is string => !!e);
        if (emails.length === 0) {
          toast.info("None of the selected prospects have an email on file.");
          return;
        }
        void navigator.clipboard
          .writeText(emails.join(", "))
          .then(() => toast.success(`Copied ${emails.length} email${emails.length === 1 ? "" : "s"} to the clipboard.`))
          .catch(() => toast.error("Could not access the clipboard."));
      },
    },
    // Promote: open an Identify-stage opportunity for each and move them off the
    // bench into the pipeline. Only offered on the active list.
    ...(disqualifiedView
      ? []
      : [
          {
            kind: "run",
            key: "promote",
            label: "Promote to pipeline →",
            run: async (ids: string[]) => {
              const selected = rowsFor(ids);
              const ok = await confirm({
                title: `Promote ${selected.length} prospect${selected.length === 1 ? "" : "s"} to the pipeline?`,
                body: "They'll enter at the Identify stage, move off the bench, and appear in Pipeline.",
                confirmLabel: "Promote",
              });
              if (!ok) return;
              void fetch("/api/admin/fundraising/prospects/promote", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prospect_ids: selected.map((r) => r.id) }),
              })
                .then((r) => r.json())
                .then((d: { promoted?: number }) => {
                  if (typeof d?.promoted === "number" && d.promoted < selected.length) {
                    toast.info(`Promoted ${d.promoted} of ${selected.length}. Some may already be in the pipeline.`);
                  }
                  router.refresh();
                })
                .catch(() => toast.error("Could not promote. Try again."));
            },
          } as DataTableBulkAction,
        ]),
    disqualifiedView
      ? {
          kind: "run" as const,
          key: "requalify",
          label: "Requalify",
          run: (ids: string[]) => {
            const selected = rowsFor(ids);
            void fetch("/api/admin/fundraising/prospects/disqualify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prospect_ids: selected.map((r) => r.id), disqualified: false }),
            }).then(() => router.refresh());
          },
        }
      : {
          kind: "run" as const,
          key: "disqualify",
          label: "Disqualify",
          tone: "danger" as const,
          run: async (ids: string[]) => {
            const selected = rowsFor(ids);
            const ok = await confirm({
              title: `Disqualify ${selected.length} prospect${selected.length === 1 ? "" : "s"}?`,
              body: "They leave the bench. You can requalify them later.",
              confirmLabel: "Disqualify",
            });
            if (!ok) return;
            void fetch("/api/admin/fundraising/prospects/disqualify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prospect_ids: selected.map((r) => r.id), disqualified: true }),
            }).then(() => router.refresh());
          },
        },
  ];

  const viewTabs: SavedView[] = [
    { key: "all", label: "All", mine: true },
    ...views.map((v) => ({ key: v.name, label: v.name })),
  ];

  return (
    <div className="space-y-4">
      <SavedViews
        views={viewTabs}
        activeKey={activeView}
        onSelect={applyView}
        label="Saved prospect views"
        saveSlot={
          naming ? (
            <span className="inline-flex items-end gap-2">
              <TextField
                label="View name"
                controlSize="md"
                data-autofocus
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveView();
                  if (e.key === "Escape") setNaming(false);
                }}
              />
              <Button size="sm" onClick={saveView} disabled={!viewName.trim()}>
                Save
              </Button>
              <Button size="sm" variant="quiet" onClick={() => setNaming(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            <SaveViewButton onClick={() => setNaming(true)} />
          )
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label="Search"
          type="search"
          controlSize="md"
          className="w-full sm:w-72"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setActiveView("");
          }}
          placeholder="Name, email, or company"
        />
        <SelectField
          label="Lifecycle"
          controlSize="md"
          value={lifecycle}
          onChange={(e) => setLifecycle(e.target.value)}
          placeholder="All lifecycles"
          options={lifecycleOptions.map((o) => ({ value: o, label: o }))}
        />
        <SelectField
          label="Owner"
          controlSize="md"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="All owners"
          options={ownerOptions.map((o) => ({ value: o, label: o }))}
        />
        <SelectField
          label="Sort"
          controlSize="md"
          value={`${sort.key}:${sort.dir}`}
          onChange={(e) => {
            const pick = SORTS.find((o) => o.value === e.target.value);
            if (pick) setSort(pick.sort);
            setActiveView("");
          }}
          options={SORTS.map((o) => ({ value: o.value, label: o.label }))}
        />
        <CheckboxField label="Scored only" checked={scored} onChange={(e) => setScored(e.target.checked)} className="pb-2" />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => downloadCsv(filtered)}>
            Export CSV
          </Button>
          {!disqualifiedView && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              + Add prospect
            </Button>
          )}
        </div>
      </div>

      <StaticTable
        label="Prospects"
        noun={{ one: "prospect", many: "prospects" }}
        columns={columns}
        rows={pageRows}
        getRowId={(r) => r.id}
        getRowLabel={(r) => displayName(r)}
        bulkActions={bulkActions}
        emptyMessage="No prospects on the bench match these filters."
        minWidth={900}
      />
      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-ink-2">
            Page {safePage + 1} of {pageCount} · {filtered.length} prospects
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPage(safePage - 1)} disabled={safePage === 0}>
              ← Prev
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount - 1}>
              Next →
            </Button>
          </div>
        </div>
      )}

      {addOpen && <AddProspectModal onClose={() => setAddOpen(false)} />}
      {taskTargets && (
        <TaskComposer
          targets={taskTargets}
          entityType="fr_prospects"
          onClose={(created) => {
            setTaskTargets(null);
            if (created > 0) router.refresh();
          }}
        />
      )}
    </div>
  );
}
