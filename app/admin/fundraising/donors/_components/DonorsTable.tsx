"use client";

// Donors list on the shared DataTable (design-system §4.4). The server
// component computes rollups + retention over the whole gift spine and passes
// plain, serializable rows here; this wrapper owns the donor-specific columns,
// cell rendering, and bulk actions.

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { type Column, type BulkAction } from "../../../_components/DataTable";
import TaskComposer, { type TaskTarget } from "../../_components/TaskComposer";
import { money } from "../../../finance/_components/charts";
import { FLAG_LABELS, FLAG_HELP, type RetentionFlag } from "@/lib/fundraising/retention";
import { BAND_LABEL, type EngagementBand } from "@/lib/fundraising/engagement";

export type DonorRow = {
  id: string;
  name: string;
  email: string | null;
  total: number;
  count: number;
  first: string; // ISO date
  last: string; // ISO date
  recurring: boolean;
  doNotContact: boolean;
  flags: RetentionFlag[];
  engagement: number;
  band: EngagementBand;
  openTasks: number;
  overdueTasks: number;
};

const FLAG_STYLES: Record<RetentionFlag, string> = {
  lybunt: "bg-[#F4E8D0] text-[#A56A1B]",
  sybunt: "bg-tile text-ink-2 border-[1.5px] border-outline",
  cadence_lapsed: "bg-expense-bg text-expense",
  second_gift_watch: "bg-blue-500/15 text-blue-400",
};

const BAND_STYLES: Record<EngagementBand, string> = {
  strong: "bg-revenue/15 text-revenue",
  steady: "bg-blue-500/15 text-blue-400",
  at_risk: "bg-[#F4E8D0] text-[#A56A1B]",
  none: "bg-tile text-ink-3 border-[1.5px] border-outline",
};

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export default function DonorsTable({
  rows,
  taskContext,
}: {
  rows: DonorRow[];
  /** Active retention segment label (e.g. "LYBUNT") — seeds task titles. */
  taskContext?: string;
}) {
  const router = useRouter();
  const [taskTargets, setTaskTargets] = useState<TaskTarget[] | null>(null);
  const defaultTaskTitle = (targets: TaskTarget[]) =>
    targets.length === 1
      ? taskContext
        ? `Reengage ${targets[0].name} (${taskContext})`
        : `Follow up with ${targets[0].name}`
      : taskContext
      ? `Reengage (${taskContext})`
      : "Follow up";
  const bulkConstituents = (ids: string[], action: "archive" | "unarchive" | "delete") =>
    fetch("/api/admin/constituents/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action }),
    });

  const columns: Column<DonorRow>[] = [
    {
      key: "name",
      header: "Donor",
      value: (r) => r.name,
      render: (r) => (
        <Link href={`/admin/fundraising/donors/${r.id}`} className="flex items-center gap-3 group">
          <span className="w-8 h-8 rounded-full bg-orange/10 border border-orange/20 flex items-center justify-center flex-shrink-0 text-orange font-bold text-xs">
            {r.name[0]?.toUpperCase() ?? "?"}
          </span>
          <span className="font-medium text-ink-1 group-hover:text-orange transition-colors">{r.name}</span>
          {r.recurring && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange/20 text-orange">Monthly</span>
          )}
          {r.doNotContact && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-expense-bg text-expense">Do not contact</span>
          )}
          {r.flags.map((f) => (
            <span key={f} title={FLAG_HELP[f]} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${FLAG_STYLES[f]}`}>
              {FLAG_LABELS[f]}
            </span>
          ))}
        </Link>
      ),
    },
    {
      key: "email",
      header: "Email",
      value: (r) => r.email ?? "",
      render: (r) => <span className="text-ink-2 text-xs">{r.email ?? "—"}</span>,
    },
    {
      key: "total",
      header: "Total Given",
      align: "right",
      value: (r) => r.total,
      render: (r) => <span className="font-bold text-ink-1 [font-variant-numeric:tabular-nums]">{money(r.total)}</span>,
    },
    {
      key: "count",
      header: "Gifts",
      align: "right",
      value: (r) => r.count,
      render: (r) => <span className="text-ink-2 [font-variant-numeric:tabular-nums]">{r.count}</span>,
    },
    {
      key: "first",
      header: "First Gift",
      value: (r) => r.first,
      render: (r) => <span className="text-ink-2 text-xs whitespace-nowrap">{fmtDate(r.first)}</span>,
      defaultHidden: true,
    },
    {
      key: "last",
      header: "Latest Gift",
      value: (r) => r.last,
      render: (r) => <span className="text-ink-2 text-xs whitespace-nowrap">{fmtDate(r.last)}</span>,
    },
    {
      key: "engagement",
      header: "Engagement",
      align: "right",
      value: (r) => r.engagement,
      render: (r) => (
        <span
          title={`Engagement ${r.engagement}/100 · ${BAND_LABEL[r.band]}`}
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full [font-variant-numeric:tabular-nums] ${BAND_STYLES[r.band]}`}
        >
          {r.engagement}
        </span>
      ),
    },
    {
      key: "tasks",
      header: "Tasks",
      align: "right",
      value: (r) => r.openTasks,
      render: (r) =>
        r.openTasks > 0 ? (
          <span
            title={r.overdueTasks ? `${r.overdueTasks} overdue` : "open tasks"}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full [font-variant-numeric:tabular-nums] ${
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
      key: "profile",
      header: "",
      align: "right",
      csv: false,
      alwaysVisible: true,
      render: (r) => (
        <span className="flex items-center justify-end gap-3 whitespace-nowrap">
          <button
            onClick={() => setTaskTargets([{ id: r.id, name: r.name }])}
            title={`Create a follow-up task linked to ${r.name}`}
            className="text-xs font-semibold text-ink-2 hover:text-orange transition-colors"
          >
            + Task
          </button>
          <Link href={`/admin/fundraising/donors/${r.id}`} className="text-xs font-semibold text-orange hover:text-orange-mid">
            Profile →
          </Link>
        </span>
      ),
    },
  ];

  const bulkActions: BulkAction<DonorRow>[] = [
    {
      label: "Add follow-up task…",
      run: (selected) => setTaskTargets(selected.map((r) => ({ id: r.id, name: r.name }))),
    },
    {
      label: "Copy emails",
      run: (selected) => {
        const emails = selected.map((r) => r.email).filter((e): e is string => !!e);
        if (emails.length === 0) {
          alert("None of the selected donors have an email on file.");
          return;
        }
        void navigator.clipboard
          .writeText(emails.join(", "))
          .then(() => alert(`Copied ${emails.length} email${emails.length === 1 ? "" : "s"} to the clipboard.`))
          .catch(() => alert("Could not access the clipboard."));
      },
    },
    {
      label: "Archive",
      run: (selected) => {
        if (!confirm(`Archive ${selected.length} donor(s)? They'll be hidden from lists but keep all history.`)) return;
        void bulkConstituents(selected.map((r) => r.id), "archive").then(() => router.refresh());
      },
    },
    {
      label: "Unarchive",
      run: (selected) => {
        void bulkConstituents(selected.map((r) => r.id), "unarchive").then(() => router.refresh());
      },
    },
    {
      label: "Delete (no gifts)",
      run: (selected) => {
        const deletable = selected.filter((r) => r.count === 0);
        const blocked = selected.length - deletable.length;
        if (deletable.length === 0) {
          alert("None of the selected donors can be deleted — they all have gifts. Archive them instead.");
          return;
        }
        if (
          !confirm(
            `Permanently delete ${deletable.length} donor(s) with no gifts?` +
              (blocked > 0 ? ` ${blocked} with giving history will be skipped.` : "") +
              " This cannot be undone."
          )
        )
          return;
        void bulkConstituents(deletable.map((r) => r.id), "delete").then(() => router.refresh());
      },
    },
  ];

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        initialSort={{ key: "total", dir: "desc" }}
        bulkActions={bulkActions}
        csvFilename="donors.csv"
        viewsKey="donors"
        searchPlaceholder="Search donors by name or email…"
        emptyMessage="No donors match this view."
      />
      {taskTargets && (
        <TaskComposer
          targets={taskTargets}
          entityType="constituent"
          defaultTitle={defaultTaskTitle(taskTargets)}
          onClose={(created) => {
            setTaskTargets(null);
            if (created > 0) router.refresh();
          }}
        />
      )}
    </>
  );
}
