"use client";

// Interactive "overdue across CRM" list for the Weekly Briefing: filter by
// owner (chips derived from the tasks' own assignees, plus Unassigned) and
// reschedule or complete a task inline. Each action hits the ops_tasks PATCH
// route; a refresh drops the row once it's no longer overdue.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CrmOverdueTask } from "@/lib/admin/crmOverdue";

type AssigneeFilter = string; // "all" | "unassigned" | an assignee handle

const hrefFor = (t: CrmOverdueTask) =>
  t.entityType === "partner"
    ? `/admin/partners/${t.entityId}`
    : `/admin/fundraising/donors/${t.entityId}`;

const isoIn = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export default function CrmOverdueList({
  partners,
  donors,
}: {
  partners: CrmOverdueTask[];
  donors: CrmOverdueTask[];
}) {
  const [filter, setFilter] = useState<AssigneeFilter>("all");
  const all = useMemo(() => [...partners, ...donors], [partners, donors]);

  const match = (t: CrmOverdueTask) =>
    filter === "all" ? true : filter === "unassigned" ? t.assignedTo === null : t.assignedTo === filter;

  const fPartners = partners.filter(match);
  const fDonors = donors.filter(match);

  // Owner chips come from the data itself, so any tenant's people show up.
  const handles = Array.from(
    new Set(all.map((t) => t.assignedTo).filter((a): a is string => !!a)),
  ).sort();
  const counts: Record<string, number> = { all: all.length };
  for (const h of handles) counts[h] = all.filter((t) => t.assignedTo === h).length;
  counts.unassigned = all.filter((t) => t.assignedTo === null).length;

  const CHIPS: { key: AssigneeFilter; label: string }[] = [
    { key: "all", label: "All" },
    ...handles.map((h) => ({ key: h, label: h.charAt(0).toUpperCase() + h.slice(1) })),
    { key: "unassigned", label: "Unassigned" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {CHIPS.filter((c) => c.key === "all" || counts[c.key] > 0).map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border-[1.5px] transition-colors ${
              filter === c.key
                ? "bg-orange/15 text-orange border-orange/30"
                : "bg-tile text-ink-2 border-outline hover:text-ink-1"
            }`}
          >
            {c.label} <span className="opacity-60">{counts[c.key]}</span>
          </button>
        ))}
      </div>
      <Group title="Partners" rows={fPartners} />
      <Group title="Donors" rows={fDonors} />
      {fPartners.length === 0 && fDonors.length === 0 && (
        <p className="text-sm text-ink-2">Nothing overdue for this owner.</p>
      )}
    </div>
  );
}

function Group({ title, rows }: { title: string; rows: CrmOverdueTask[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-[11px] uppercase tracking-wider text-ink-2 mb-1">
        {title} ({rows.length})
      </div>
      <ul className="space-y-1">
        {rows.map((t) => (
          <Row key={t.id} t={t} />
        ))}
      </ul>
    </div>
  );
}

function Row({ t }: { t: CrmOverdueTask }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/ops/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`flex items-center gap-2 text-sm group ${busy ? "opacity-50" : ""}`}>
      <Link href={hrefFor(t)} className="font-semibold text-orange hover:text-orange-dark whitespace-nowrap">
        {t.label}
      </Link>
      <span className="text-ink-1 truncate">{t.title}</span>
      {t.assignedTo && (
        <span className="text-[10px] uppercase tracking-wider text-ink-3">{t.assignedTo}</span>
      )}
      <span className="ml-auto text-[11px] text-expense whitespace-nowrap tabular-nums">{t.daysOverdue}d</span>
      <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Snooze label="Today" onClick={() => patch({ due_date: isoIn(0) })} busy={busy} />
        <Snooze label="+1d" onClick={() => patch({ due_date: isoIn(1) })} busy={busy} />
        <Snooze label="+1w" onClick={() => patch({ due_date: isoIn(7) })} busy={busy} />
        <button
          onClick={() => patch({ status: "done" })}
          disabled={busy}
          title="Mark done"
          className="text-[11px] font-semibold w-6 h-6 rounded-full flex items-center justify-center bg-revenue/15 text-revenue hover:bg-revenue/25"
        >
          ✓
        </button>
      </span>
    </li>
  );
}

function Snooze({ label, onClick, busy }: { label: string; onClick: () => void; busy: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={`Reschedule to ${label}`}
      className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-tile border border-outline text-ink-2 hover:text-ink-1"
    >
      {label}
    </button>
  );
}
