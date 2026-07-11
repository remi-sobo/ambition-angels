"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { QueueItem } from "@/lib/admin/actionQueue";
import type { AdminUser } from "@/lib/admin/auth";
import EntityChip from "./EntityChip";

// Client half of the "Needs you today" queue: per-module EXPANDABLE groups
// (a row of labeled doors with counts — never a long flat list), the
// mine-toggle (exact uuid match via the promoted owner columns, text
// fallback for sources without one), and one-click completion. Completion
// dispatches on
// (source, sourceId) ONLY — never on row position — to each source's
// existing endpoint; v_action_items itself is read-only. Sources without a
// safe one-click (a thank-you needs a channel, accepting a reconciliation
// proposal books money) deep-link instead.

const COMPLETION: Partial<
  Record<QueueItem["source"], { label: string; request: (id: string) => { url: string; body: unknown } }>
> = {
  ops_task: {
    label: "Done",
    request: (id) => ({ url: `/api/admin/ops/tasks/${id}`, body: { status: "done" } }),
  },
  grant_requirement: {
    label: "Mark submitted",
    request: (id) => ({ url: `/api/admin/grants/requirements/${id}`, body: { status: "submitted" } }),
  },
  compliance_item: {
    label: "Mark filed",
    request: (id) => ({ url: `/api/admin/compliance/${id}`, body: { status: "filed" } }),
  },
};

const MODULE_LABEL: Record<string, string> = {
  ops: "Ops",
  fundraising: "Fundraising",
  compliance: "Compliance",
  finance: "Finance",
  program: "Program",
  board: "Board",
  documents: "Documents",
  metrics: "Metrics",
};

const SOURCE_LABEL: Record<QueueItem["source"], string> = {
  ops_task: "Task",
  grant_requirement: "Grant requirement",
  compliance_item: "Compliance",
  acknowledgment: "Thank-you",
  reconciliation_item: "Reconcile",
  document_renewal: "Renewal",
  metric_stale: "Metric update",
  application_pending: "Application",
  session_unrecorded: "Attendance",
};

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Owner match for the Mine filter. Sources with a promoted uuid owner
 * (ops tasks, compliance items, stale metrics — owner_uuid_promotion.sql)
 * match exactly on the caller's user id. Rows that only carry free text
 * fall back to the old first-name heuristic, so nothing that matched before
 * silently disappears.
 */
function isMine(it: Pick<QueueItem, "ownerId" | "ownerRef">, meId: string | null, me: AdminUser | null): boolean {
  if (it.ownerId) return meId != null && it.ownerId === meId;
  if (!it.ownerRef || !me) return false;
  return it.ownerRef.trim().toLowerCase().split(/\s+/)[0] === me;
}

function DueChip({ due }: { due: string | null }) {
  const today = todayISO();
  const overdue = due != null && due < today;
  const isToday = due === today;
  return (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
        overdue
          ? "bg-expense-bg text-expense"
          : isToday
            ? "bg-orange/15 text-orange"
            : "bg-tile text-ink-2"
      }`}
    >
      {due == null ? "No date" : overdue ? `Overdue · ${due}` : isToday ? "Today" : due}
    </span>
  );
}

type Group = {
  module: string;
  items: QueueItem[];
  overdue: number;
  dueToday: number;
};

export default function NeedsYouQueueClient({
  items,
  me,
  meId = null,
}: {
  items: QueueItem[];
  me: AdminUser | null;
  meId?: string | null;
}) {
  const router = useRouter();
  const [mineOnly, setMineOnly] = useState(false);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null = "use the default" (most urgent group open); after any click the
  // user's choices win.
  const [openModules, setOpenModules] = useState<Set<string> | null>(null);

  const key = (it: QueueItem) => `${it.source}:${it.sourceId}`;

  const groups = useMemo((): Group[] => {
    const today = todayISO();
    const live = items.filter((it) => !removed.has(key(it)));
    const filtered = mineOnly ? live.filter((it) => isMine(it, meId, me)) : live;
    const byModule = new Map<string, QueueItem[]>();
    for (const it of filtered) {
      const arr = byModule.get(it.module) ?? [];
      arr.push(it);
      byModule.set(it.module, arr);
    }
    return Array.from(byModule.entries())
      .map(([module, list]) => ({
        module,
        items: list, // already urgency-ranked by the loader
        overdue: list.filter((it) => it.dueDate != null && it.dueDate < today).length,
        dueToday: list.filter((it) => it.dueDate === today).length,
      }))
      // Most urgent door first: overdue count, then due-today, then size.
      .sort((a, b) => b.overdue - a.overdue || b.dueToday - a.dueToday || b.items.length - a.items.length);
  }, [items, removed, mineOnly, me, meId]);

  const total = groups.reduce((s, g) => s + g.items.length, 0);
  // Default: only the single most urgent group starts open.
  const defaultOpen = groups.length > 0 ? new Set([groups[0].module]) : new Set<string>();
  const open = openModules ?? defaultOpen;

  const toggle = (module: string) =>
    setOpenModules((prev) => {
      const next = new Set(prev ?? defaultOpen);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });

  async function complete(it: QueueItem) {
    const completion = COMPLETION[it.source];
    if (!completion || busy) return;
    const k = key(it);
    setBusy(k);
    setError(null);
    try {
      const { url, body } = completion.request(it.sourceId);
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Failed (${res.status})`);
      }
      setRemoved((prev) => new Set(prev).add(k));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete the item");
    } finally {
      setBusy(null);
    }
  }

  if (total === 0 && !mineOnly) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          Action queue
        </span>
        {me && (
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            title="Items assigned to you (free-text owners matched by first name)"
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
              mineOnly
                ? "border-orange bg-orange/10 text-orange"
                : "border-outline text-ink-2 hover:text-ink-1"
            }`}
          >
            Mine{mineOnly ? " ✓" : ""}
          </button>
        )}
      </div>

      {error && <p className="mb-2 text-xs font-semibold text-expense">{error}</p>}

      {total === 0 ? (
        <p className="text-sm text-ink-2">Nothing assigned to you is open.</p>
      ) : (
        <div className="space-y-1.5">
          {groups.map((g) => {
            const isOpen = open.has(g.module);
            return (
              <div key={g.module} className="rounded-card border-[1.5px] border-outline bg-tile overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(g.module)}
                  aria-expanded={isOpen}
                  className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-[#F5EFE0] transition-colors"
                >
                  <span
                    aria-hidden
                    className={`text-ink-3 text-[10px] transition-transform ${isOpen ? "rotate-90" : ""}`}
                  >
                    ▶
                  </span>
                  <span className="text-sm font-semibold text-ink-1 flex-1">
                    {MODULE_LABEL[g.module] ?? g.module}
                  </span>
                  {g.overdue > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-expense-bg text-expense whitespace-nowrap">
                      {g.overdue} overdue
                    </span>
                  )}
                  {g.dueToday > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange/15 text-orange whitespace-nowrap">
                      {g.dueToday} today
                    </span>
                  )}
                  <span className="text-xs font-semibold text-ink-2 tabular-nums">{g.items.length}</span>
                </button>

                {isOpen && (
                  <ul className="divide-y divide-hairline border-t border-outline bg-surface">
                    {g.items.map((it) => {
                      const k = key(it);
                      const completion = COMPLETION[it.source];
                      return (
                        <li key={k} className="pl-9 pr-4 py-2.5 flex items-center gap-3">
                          <DueChip due={it.dueDate} />
                          <div className="min-w-0 flex-1">
                            <Link
                              href={it.href}
                              className="text-sm font-medium text-ink-1 hover:text-orange transition-colors block truncate"
                            >
                              {it.title}
                            </Link>
                            <div className="mt-0.5 flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">
                                {SOURCE_LABEL[it.source]}
                              </span>
                              {it.entity && <EntityChip entity={it.entity} className="max-w-[16rem]" />}
                            </div>
                          </div>
                          {completion ? (
                            <button
                              type="button"
                              onClick={() => complete(it)}
                              disabled={busy === k}
                              className="text-xs font-semibold px-2.5 py-1 rounded-full border border-outline text-ink-2 hover:border-orange/40 hover:text-orange transition-colors disabled:opacity-50 whitespace-nowrap"
                            >
                              {busy === k ? "…" : completion.label}
                            </button>
                          ) : (
                            <Link
                              href={it.href}
                              className="text-xs font-semibold px-2.5 py-1 rounded-full border border-outline text-ink-2 hover:border-orange/40 hover:text-orange transition-colors whitespace-nowrap"
                            >
                              Open
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
