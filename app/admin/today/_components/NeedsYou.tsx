"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { OpsTask } from "@/app/admin/ops/_types/ops";
import type { TodayObligation } from "@/lib/admin/today";
import { SHOW_CAP } from "@/lib/admin/todayRank";
import { afterRemoval, isTypingTarget, neighborId, snoozeUntil } from "@/lib/admin/needsYou";
import ListRow, { ListRows } from "../../_components/ui/ListRow";
import Button from "../../_components/ui/Button";
import Badge from "../../_components/ui/Badge";
import Alert from "../../_components/ui/Alert";
import TaskEditModal from "../../_components/TaskEditModal";
import { TYPE } from "@/lib/admin/typeScale";
import NeedsYouPopout from "./popout/NeedsYouPopout";
import type { TaskPatch } from "./popout/OpsTaskPanel";
import type { AckChoice } from "./popout/AckPanel";
import { UNDO_MS, useDeferredActions, type DeferredAction } from "./popout/useDeferredActions";

/**
 * Spec Home, stage H1 — the Needs-you feed. At most SHOW_CAP rows, ranked
 * server-side; "Show all N" expands in place (open decision 1, resolved —
 * /admin/queue's 308 lands here at cutover, not on a new screen). Every row
 * carries its why-line — never a bare checkbox.
 *
 * Every row opens a popout (specs/needs-you-popout-thank-yous.md, PR 2) where
 * the item is handled; J / K walk the whole list from there. Done and Snooze,
 * on the row or in the popout, take the row out at once with a 5-second undo
 * before anything is written (useDeferredActions).
 */
export default function NeedsYou({
  obligations,
  today,
}: {
  obligations: TodayObligation[];
  today: string;
}) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [task, setTask] = useState<OpsTask | null>(null);
  // The open thank-you's panel choices (channel, linked tasks to close).
  const [ackChoice, setAckChoice] = useState<(AckChoice & { rowId: string }) | null>(null);
  const [editingTask, setEditingTask] = useState<OpsTask | null>(null);
  // Written and waiting for the refreshed list to drop them.
  const [gone, setGone] = useState<Set<string>>(new Set());
  // Reschedules applied before the refreshed list arrives.
  const [patches, setPatches] = useState<Record<string, Partial<TodayObligation>>>({});

  const { pending, schedule, undo } = useDeferredActions({
    onCommitted: () => router.refresh(),
    onFailed: (row, message, wrote) => {
      if (!wrote) {
        setGone((g) => {
          const next = new Set(g);
          next.delete(row.id);
          return next;
        });
      }
      setError(`${row.title}: ${message}`);
    },
  });

  // A fresh server list supersedes local patches; ids it no longer carries
  // no longer need hiding.
  useEffect(() => {
    setPatches({});
    setGone((g) => {
      const live = new Set(obligations.map((o) => o.id));
      return new Set(Array.from(g).filter((id) => live.has(id)));
    });
  }, [obligations]);

  const rows = useMemo(() => {
    const hiddenIds = new Set([...pending.map((p) => p.row.id), ...Array.from(gone)]);
    return obligations.filter((o) => !hiddenIds.has(o.id)).map((o) => ({ ...o, ...patches[o.id] }));
  }, [obligations, pending, gone, patches]);
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);

  const openRow = openId ? rows.find((r) => r.id === openId) ?? null : null;
  const overdueCount = rows.filter((r) => r.due_date && r.due_date < today).length;
  const visible = showAll ? rows : rows.slice(0, SHOW_CAP);
  const hidden = rows.length - SHOW_CAP;

  const open = useCallback((id: string | null) => {
    setTask(null);
    setOpenId(id);
  }, []);
  const close = useCallback(() => open(null), [open]);

  const act = useCallback(
    (row: TodayObligation, a: DeferredAction) => {
      setError(null);
      // A thank-you marked from its own panel carries the panel's choices.
      if (row.type === "acknowledgment" && a.action === "resolve" && ackChoice?.rowId === row.id) {
        a = { ...a, channel: ackChoice.channel, alsoClose: ackChoice.alsoClose };
      }
      if (openId === row.id) open(afterRemoval(ids, row.id));
      setGone((g) => new Set(g).add(row.id));
      schedule(row, a);
    },
    [ackChoice, ids, open, openId, schedule],
  );

  const undoAction = useCallback(
    (id: string) => {
      undo(id);
      setGone((g) => {
        const next = new Set(g);
        next.delete(id);
        return next;
      });
    },
    [undo],
  );

  const openRecord = useCallback(
    (row: TodayObligation) => {
      if (row.type === "ops_task") {
        if (task) {
          setEditingTask(task);
          close();
        }
        return;
      }
      router.push(row.href);
    },
    [close, router, task],
  );

  const onPatched = useCallback(
    (patch: TaskPatch) => {
      if (!openId) return;
      if ("due_date" in patch) {
        setPatches((p) => ({ ...p, [openId]: { ...p[openId], due_date: patch.due_date ?? null } }));
      }
      router.refresh();
    },
    [openId, router],
  );

  const onAckChoice = useCallback(
    (c: AckChoice) => setAckChoice(openId ? { ...c, rowId: openId } : null),
    [openId],
  );

  // J / K / O while the popout is open. Esc is the modal's own.
  useEffect(() => {
    if (!openRow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "j" || k === "k") {
        const next = neighborId(ids, openRow.id, k === "j" ? 1 : -1);
        if (next) {
          e.preventDefault();
          open(next);
        }
      } else if (k === "o") {
        e.preventDefault();
        openRecord(openRow);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ids, open, openRecord, openRow]);

  // The open row can vanish under the popout (a refresh dropped it): close.
  useEffect(() => {
    if (openId && !openRow) setOpenId(null);
  }, [openId, openRow]);

  if (rows.length === 0 && pending.length === 0) {
    return <p className={TYPE.bodyMuted}>Nothing needs you right now. Enjoy it.</p>;
  }

  const position = openRow ? ids.indexOf(openRow.id) + 1 : 0;
  const prevId = openRow ? neighborId(ids, openRow.id, -1) : null;
  const nextId = openRow ? neighborId(ids, openRow.id, 1) : null;

  return (
    <div>
      <p className={`${TYPE.metadata} mb-2`} aria-live="polite">
        {rows.length} open{overdueCount ? ` · ${overdueCount} overdue` : ""}
      </p>
      {error && (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      )}
      <ListRows>
        {visible.map((row) => {
          const overdue = Boolean(row.due_date && row.due_date < today);
          const dueToday = row.due_date === today;
          const until = snoozeUntil(row.due_date, today);
          return (
            /**
             * Visual System V3 §8 — "For overdue tasks, don't make the entire
             * line visually red. Prioritize task title, then status/due
             * information, then contextual explanation. Use red as a signal,
             * not as dominant typography."
             *
             * So the title stays ink-1 at the body weight whatever the row's
             * state; the ONLY red on an overdue row is the small badge, and
             * the why-line stays quiet underneath.
             */
            <ListRow
              key={row.id}
              title={
                <button
                  type="button"
                  onClick={() => open(row.id)}
                  className="text-left truncate max-w-full hover:underline underline-offset-2 focus-visible:underline"
                >
                  {row.title}
                </button>
              }
              meta={
                row.due_date ? (
                  <Badge tone={overdue ? "danger" : dueToday ? "accent" : "neutral"}>
                    {overdue ? `Overdue · ${row.due_date}` : dueToday ? "Today" : row.due_date}
                  </Badge>
                ) : null
              }
              context={
                <span className={row.whyRecorded ? "" : "italic text-ink-3"}>
                  {row.why}
                  {row.linkedTasks?.length
                    ? ` Also on your list: ${row.linkedTasks.map((t) => t.title).join("; ")}.`
                    : ""}
                </span>
              }
              actions={
                <>
                  {row.snoozable && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => act(row, { action: "snooze", until })}
                      title={`Snooze until ${until}`}
                    >
                      Snooze
                    </Button>
                  )}
                  {row.resolvable && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => act(row, { action: "resolve" })}
                      title="Mark done"
                      className="!text-revenue hover:!bg-revenue-bg"
                    >
                      Done
                    </Button>
                  )}
                </>
              }
            />
          );
        })}
      </ListRows>
      {hidden > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 !px-0"
        >
          {showAll ? `Show top ${SHOW_CAP}` : `Show all ${rows.length}`}
        </Button>
      )}

      <UndoBar items={pending.map((p) => ({ id: p.row.id, title: p.row.title, action: p.action, until: p.until, commitAt: p.commitAt }))} onUndo={undoAction} />

      {openRow && (
        <NeedsYouPopout
          row={openRow}
          position={position}
          total={ids.length}
          today={today}
          task={task}
          onClose={close}
          onPrev={prevId ? () => open(prevId) : null}
          onNext={nextId ? () => open(nextId) : null}
          onPrimary={() => act(openRow, { action: "resolve" })}
          onSnooze={() => act(openRow, { action: "snooze", until: snoozeUntil(openRow.due_date, today) })}
          onOpenTask={() => openRecord(openRow)}
          onTaskLoaded={setTask}
          onPatched={onPatched}
          onAckChoice={onAckChoice}
        />
      )}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => {
            setEditingTask(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** One line per pending Done/Snooze, with its countdown and Undo. */
function UndoBar({
  items,
  onUndo,
}: {
  items: { id: string; title: string; action: "resolve" | "snooze"; until?: string; commitAt: number }[];
  onUndo: (id: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (items.length === 0) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [items.length]);
  if (items.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[60] bottom-20 lg:bottom-6 left-4 right-4 lg:left-auto lg:right-6 lg:w-96 space-y-2"
    >
      {items.map((i) => {
        const secs = Math.max(0, Math.ceil(Math.min(i.commitAt - now, UNDO_MS) / 1000));
        return (
          <div
            key={i.id}
            className="elevate-modal flex items-center gap-3 rounded-panel border border-hairline bg-surface px-4 py-3 text-sm"
          >
            <span className="flex-1 min-w-0 truncate">
              {i.action === "resolve" ? "Done" : `Snoozed to ${i.until}`}: {i.title}
            </span>
            <Button variant="ghost" size="sm" onClick={() => onUndo(i.id)}>
              Undo{secs > 0 ? ` (${secs})` : ""}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
