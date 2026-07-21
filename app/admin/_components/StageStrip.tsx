import type { ReactNode } from "react";

// Shared horizontal stage strip: one count-cell per stage, highlighted when
// active. Extracted from the student journey funnel (students/page.tsx) so the
// donor lifecycle strip and the student journey share one visual language
// (specs/donor-lifecycle-journeys.md Amendment 1 §A.2). Presentational server
// component — the caller decides what "active" and the cell value mean (a
// roster count, the donor's current stage marker, …).

export type StageCell = {
  key: string;
  label: string;
  /** Big line in the cell — a count, a marker, anything. */
  value: ReactNode;
  active: boolean;
  /** Tooltip (e.g. the stage description). */
  title?: string;
};

export default function StageStrip({ cells, className }: { cells: StageCell[]; className?: string }) {
  return (
    <div
      className={`grid gap-1.5 ${className ?? ""}`}
      style={{ gridTemplateColumns: `repeat(${Math.max(cells.length, 1)}, minmax(0, 1fr))` }}
    >
      {cells.map((cell) => (
        <div
          key={cell.key}
          title={cell.title}
          className={`rounded-lg border px-2 py-2.5 text-center ${
            cell.active ? "bg-orange/10 border-orange/30" : "bg-surface shadow-panel border-outline"
          }`}
        >
          <div className={`text-lg font-bold tabular-nums ${cell.active ? "text-orange" : "text-ink-2"}`}>
            {cell.value}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-ink-2">{cell.label}</div>
        </div>
      ))}
    </div>
  );
}
