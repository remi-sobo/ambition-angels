"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { QueueItem } from "@/lib/admin/actionQueue";
import type { AdminUser } from "@/lib/admin/auth";
import EntityChip from "./EntityChip";

// Client half of the "Needs You" queue: the mine-toggle (best-effort — owner
// columns are free text today, spec open decision B) and one-click completion.
// Completion dispatches on (source, sourceId) ONLY — never on row position —
// to each source's existing endpoint; v_action_items itself is read-only.
// Sources without a safe one-click (a thank-you needs a channel, accepting a
// reconciliation proposal books money) deep-link instead.

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
};

const SOURCE_LABEL: Record<QueueItem["source"], string> = {
  ops_task: "Task",
  grant_requirement: "Grant requirement",
  compliance_item: "Compliance",
  acknowledgment: "Thank-you",
  reconciliation_item: "Reconcile",
};

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Best-effort text-owner match: 'remi' matches "remi", "Remi Sobo", … */
function isMine(ownerRef: string | null, me: AdminUser | null): boolean {
  if (!ownerRef || !me) return false;
  return ownerRef.trim().toLowerCase().split(/\s+/)[0] === me;
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

export default function NeedsYouQueueClient({
  items,
  me,
}: {
  items: QueueItem[];
  me: AdminUser | null;
}) {
  const router = useRouter();
  const [mineOnly, setMineOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const key = (it: QueueItem) => `${it.source}:${it.sourceId}`;

  const visible = useMemo(() => {
    const live = items.filter((it) => !removed.has(key(it)));
    return mineOnly ? live.filter((it) => isMine(it.ownerRef, me)) : live;
  }, [items, removed, mineOnly, me]);

  const shown = showAll ? visible : visible.slice(0, 10);

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

  return (
    <section className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-heading font-semibold text-ink-1">
          Needs you
          {visible.length > 0 && (
            <span className="ml-2 text-xs font-semibold text-ink-2">{visible.length}</span>
          )}
        </h2>
        {me && (
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            title="Best-effort match on the free-text owner field"
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

      {error && <p className="mb-3 text-xs font-semibold text-expense">{error}</p>}

      {shown.length === 0 ? (
        <p className="text-sm text-ink-2">
          {mineOnly ? "Nothing assigned to you is open." : "Nothing needs you — all clear."}
        </p>
      ) : (
        <ul className="divide-y divide-hairline">
          {shown.map((it) => {
            const k = key(it);
            const completion = COMPLETION[it.source];
            return (
              <li key={k} className="py-2.5 flex items-center gap-3">
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
                      {MODULE_LABEL[it.module] ?? it.module} · {SOURCE_LABEL[it.source]}
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

      {visible.length > 10 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-xs font-semibold text-orange hover:text-orange-dark"
        >
          {showAll ? "Show fewer" : `Show all ${visible.length}`}
        </button>
      )}
    </section>
  );
}
