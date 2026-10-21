"use client";

import Link from "next/link";
import type { OpsTask } from "@/app/admin/ops/_types/ops";
import type { TodayObligation } from "@/lib/admin/today";
import { obligationMeta } from "@/lib/admin/needsYou";
import Modal from "../../../_components/ui/Modal";
import Button from "../../../_components/ui/Button";
import Badge from "../../../_components/ui/Badge";
import { TYPE } from "@/lib/admin/typeScale";
import { PANELS } from "./panels";
import type { TaskPatch } from "./OpsTaskPanel";

/**
 * The shared popout shell for every Needs-you row: title, type chip, due
 * state, why-it-matters, the per-type panel, and a footer with Snooze, the
 * type's primary action, and Open full record. Keyboard (wired by the list,
 * which owns order): J / K next and previous, O open the record, Esc close.
 */
export default function NeedsYouPopout({
  row,
  position,
  total,
  today,
  task,
  onClose,
  onPrev,
  onNext,
  onPrimary,
  onSnooze,
  onOpenTask,
  onTaskLoaded,
  onPatched,
}: {
  row: TodayObligation;
  position: number;
  total: number;
  today: string;
  task: OpsTask | null;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onPrimary: () => void;
  onSnooze: () => void;
  onOpenTask: () => void;
  onTaskLoaded: (task: OpsTask | null) => void;
  onPatched: (patch: TaskPatch) => void;
}) {
  const meta = obligationMeta(row.type);
  const Panel = PANELS[row.type];
  const overdue = Boolean(row.due_date && row.due_date < today);
  const dueToday = row.due_date === today;

  const record =
    row.type === "ops_task" ? (
      <Button variant="ghost" size="sm" onClick={onOpenTask} disabled={!task} title="O">
        {meta.recordLabel}
      </Button>
    ) : (
      <Link
        href={row.href}
        title="O"
        className="text-sm font-medium text-ink-2 hover:text-ink-1 underline-offset-2 hover:underline"
      >
        {meta.recordLabel} →
      </Link>
    );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={row.title}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{meta.label}</Badge>
          {row.due_date ? (
            <Badge tone={overdue ? "danger" : dueToday ? "accent" : "neutral"}>
              {overdue ? `Overdue · ${row.due_date}` : dueToday ? "Due today" : `Due ${row.due_date}`}
            </Badge>
          ) : (
            <span>No due date</span>
          )}
          <span aria-live="polite">
            {position} of {total}
          </span>
        </span>
      }
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <div className="mr-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onPrev ?? undefined} disabled={!onPrev} title="K" aria-label="Previous (K)">
              ↑ Prev
            </Button>
            <Button variant="ghost" size="sm" onClick={onNext ?? undefined} disabled={!onNext} title="J" aria-label="Next (J)">
              ↓ Next
            </Button>
            {record}
          </div>
          {row.snoozable && (
            <Button variant="secondary" size="sm" onClick={onSnooze}>
              Snooze
            </Button>
          )}
          {row.resolvable && meta.primaryLabel && (
            <Button variant="primary" size="sm" onClick={onPrimary}>
              {meta.primaryLabel}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <p className={row.whyRecorded ? TYPE.body : `${TYPE.bodyMuted} italic`}>{row.why}</p>
        {Panel ? <Panel row={row} onLoaded={onTaskLoaded} onPatched={onPatched} /> : null}
        <p className={`${TYPE.metadata} hidden sm:block`}>
          J / K to move · O to open · Esc to close
        </p>
      </div>
    </Modal>
  );
}
