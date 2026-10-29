import type { WeekCapacity } from "@/lib/admin/ops/capacity";
import { formatHours } from "@/lib/agenda/week-summary";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Read-only capacity read for the Plan Days step (Weekly Plan v2, PR 2):
 * estimated work this week against the open time left. No colors beyond an
 * over-capacity line yet; the green/yellow/red meter lands with Choose and
 * Place (PR 7).
 */
export default function CapacityMeter({
  capacity,
  defaultBlockMinute,
}: {
  capacity: WeekCapacity;
  defaultBlockMinute: number;
}) {
  const { openMin, committedMin, countedTasks, defaultedTasks, timeBlockedTasks, overMin } = capacity;
  const pct = openMin > 0 ? Math.min(100, Math.round((committedMin / openMin) * 100)) : committedMin > 0 ? 100 : 0;

  const notes: string[] = [
    countedTasks === 0
      ? "Nothing planned for the rest of the week yet."
      : `${countedTasks} ${countedTasks === 1 ? "task" : "tasks"} counted.`,
  ];
  if (defaultedTasks > 0) {
    notes.push(
      `${defaultedTasks} had no estimate and counted at ${formatHours(defaultBlockMinute)} each.`
    );
  }
  if (timeBlockedTasks > 0) {
    notes.push(
      `${timeBlockedTasks} already on a calendar block, so ${timeBlockedTasks === 1 ? "its" : "their"} time is counted there instead.`
    );
  }
  notes.push("Open time counts from now to Friday.");

  return (
    <section className="rounded-panel border-hairline bg-surface p-4 space-y-2" aria-label="Capacity">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className={TYPE.sectionHeader}>Capacity</h3>
        <span className="text-sm text-ink-1 tabular-nums">
          {formatHours(committedMin)} of work, {formatHours(openMin)} open
        </span>
      </div>
      <div
        className="h-2 rounded-full bg-tile overflow-hidden"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={openMin}
        aria-valuenow={Math.min(committedMin, openMin)}
        aria-label="Estimated work against open time"
      >
        <div className="h-full bg-ink-2" style={{ width: `${pct}%` }} />
      </div>
      {overMin > 0 && (
        <p className="text-sm font-semibold text-expense">
          Over by {formatHours(overMin)}. Move, shrink, or defer before you commit.
        </p>
      )}
      <p className="text-xs text-ink-2">{notes.join(" ")}</p>
    </section>
  );
}
