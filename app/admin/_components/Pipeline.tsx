import type { ReactNode } from "react";

// BloomOS shared pipeline board (design-system §4.3: "the same horizontal
// funnel/Kanban component" for fundraising stages, grants, student journey).
// A presentational server component: stage columns, each with a label, a
// summary line (count + optional value), and cards rendered by the caller.
// Interactivity (drag, per-card actions) lives in the cards the caller passes,
// so this stays render-prop-generic and reusable across surfaces.

export type PipelineColumn<T> = {
  key: string;
  label: string;
  items: T[];
};

export default function Pipeline<T>({
  title,
  columns,
  renderCard,
  getCardKey,
  columnSummary,
  footer,
  minColWidth = 120,
  minBoardWidth = 900,
  maxVisible,
  emptyHint,
}: {
  /** Optional board heading rendered in the card header. */
  title?: ReactNode;
  columns: PipelineColumn<T>[];
  renderCard: (item: T) => ReactNode;
  getCardKey: (item: T) => string;
  /** Sub-line under each column label; defaults to the item count. */
  columnSummary?: (items: T[]) => ReactNode;
  /** Optional row below the board (e.g. collapsed Declined/Closed). */
  footer?: ReactNode;
  minColWidth?: number;
  minBoardWidth?: number;
  /** Cap visible cards per column; the rest collapse behind "Show N more". */
  maxVisible?: number;
  /** Shown inside a column with no items. */
  emptyHint?: ReactNode;
}) {
  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
      {title != null && (
        <div className="px-5 py-4 border-b border-outline">
          <h2 className="font-heading font-bold text-ink-1 text-sm">{title}</h2>
        </div>
      )}
      <div className="overflow-x-auto">
        <div className="flex gap-3 p-4" style={{ minWidth: minBoardWidth }}>
          {columns.map((col) => (
            <div key={col.key} className="flex-1" style={{ minWidth: minColWidth }}>
              <div className="text-[10px] font-heading font-semibold uppercase tracking-[0.12em] text-ink-3 mb-0.5">
                {col.label}
              </div>
              <div className="text-[11px] text-ink-2 mb-2 [font-variant-numeric:tabular-nums]">
                {columnSummary ? columnSummary(col.items) : col.items.length}
              </div>
              <div className="space-y-2">
                {col.items.length === 0 && emptyHint != null ? (
                  <div className="text-[11px] text-ink-3">{emptyHint}</div>
                ) : maxVisible != null && col.items.length > maxVisible ? (
                  <>
                    {col.items.slice(0, maxVisible).map((item) => (
                      <div key={getCardKey(item)}>{renderCard(item)}</div>
                    ))}
                    <details>
                      <summary className="text-xs text-ink-2 cursor-pointer hover:text-ink-1 px-1 py-1">
                        Show {col.items.length - maxVisible} more
                      </summary>
                      <div className="space-y-2 mt-2">
                        {col.items.slice(maxVisible).map((item) => (
                          <div key={getCardKey(item)}>{renderCard(item)}</div>
                        ))}
                      </div>
                    </details>
                  </>
                ) : (
                  col.items.map((item) => (
                    <div key={getCardKey(item)}>{renderCard(item)}</div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {footer != null && <div className="px-4 py-3 border-t border-outline">{footer}</div>}
    </section>
  );
}
