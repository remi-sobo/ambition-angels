"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * BloomOS shared drag-and-drop stage board (design-system §4.3: "the same
 * horizontal funnel/Kanban component" for fundraising stages, grants, partner
 * pipeline, student journey).
 *
 * Marries the column/summary layout of the presentational <Pipeline> with the
 * native HTML5 drag-and-drop + optimistic move proven in the Ops TaskBoardView:
 * drag a card to another column and it advances that item's stage. The caller
 * owns persistence via `onMove`; the board owns the drag mechanics, the
 * optimistic re-bucketing, and the revert-on-failure.
 *
 * Generic over the item type T. `getItemColumn` reads the item's current
 * column key (e.g. its stage); `onMove(id, toKey)` persists the change and must
 * throw on failure so the board can revert. Fresh server data (after
 * router.refresh) supersedes any optimistic move.
 */

export type StageColumn = { key: string; label: string };

export default function StageBoard<T>({
  title,
  columns,
  items,
  getItemId,
  getItemColumn,
  renderCard,
  onMove,
  onCardClick,
  columnSummary,
  footer,
  minColWidth = 130,
  minBoardWidth = 900,
  emptyHint,
}: {
  /** Optional board heading rendered in the card header. */
  title?: ReactNode;
  columns: StageColumn[];
  items: T[];
  getItemId: (item: T) => string;
  /** The column key an item currently belongs to (e.g. its stage). */
  getItemColumn: (item: T) => string;
  /** Inner card content; the board wraps it in the draggable shell. */
  renderCard: (item: T) => ReactNode;
  /** Persist a move. Must throw on failure so the board reverts. */
  onMove: (id: string, toKey: string) => Promise<void>;
  /** Click a card (drag gestures don't fire this). */
  onCardClick?: (item: T) => void;
  /** Sub-line under each column label; defaults to the item count. */
  columnSummary?: (items: T[]) => ReactNode;
  /** Optional row below the board (e.g. collapsed Declined/Closed). */
  footer?: ReactNode;
  minColWidth?: number;
  minBoardWidth?: number;
  /** Shown inside a column with no items. */
  emptyHint?: ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Optimistic overrides: itemId -> column key. Cleared whenever fresh server
  // data arrives, which already reflects any committed move.
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<string | null>(null);

  useEffect(() => setMoves({}), [items]);

  const columnOf = (item: T) => moves[getItemId(item)] ?? getItemColumn(item);

  const byColumn: Record<string, T[]> = {};
  for (const c of columns) byColumn[c.key] = [];
  for (const item of items) {
    const key = columnOf(item);
    if (byColumn[key]) byColumn[key].push(item);
  }

  async function handleDrop(toKey: string) {
    const id = dragId;
    setDragId(null);
    setHoverCol(null);
    if (!id) return;
    const item = items.find((it) => getItemId(it) === id);
    if (!item || columnOf(item) === toKey) return;
    setMoves((m) => ({ ...m, [id]: toKey })); // optimistic
    try {
      await onMove(id, toKey);
      startTransition(() => router.refresh());
    } catch (e) {
      console.error("Stage move failed:", e);
      setMoves((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
      alert("Couldn't move that card. Try again.");
    }
  }

  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
      {title != null && (
        <div className="px-5 py-4 border-b border-outline">
          <h2 className="font-heading font-bold text-ink-1 text-sm">{title}</h2>
        </div>
      )}
      <div className="overflow-x-auto">
        <div className="flex gap-2 p-4" style={{ minWidth: minBoardWidth }}>
          {columns.map((col) => {
            const colItems = byColumn[col.key] ?? [];
            const isOver = hoverCol === col.key;
            return (
              <div
                key={col.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setHoverCol(col.key);
                }}
                onDragLeave={() =>
                  setHoverCol((c) => (c === col.key ? null : c))
                }
                onDrop={() => handleDrop(col.key)}
                className={`flex-1 rounded-lg p-1.5 -m-px transition-colors ${
                  isOver ? "bg-orange/5 ring-1 ring-orange/40" : ""
                }`}
                style={{ minWidth: minColWidth }}
              >
                <div className="text-[10px] font-heading font-semibold uppercase tracking-[0.12em] text-ink-3 mb-0.5 px-0.5">
                  {col.label}
                </div>
                <div className="text-[11px] text-ink-2 mb-2 px-0.5 [font-variant-numeric:tabular-nums]">
                  {columnSummary ? columnSummary(colItems) : colItems.length}
                </div>
                <div className="space-y-2">
                  {colItems.length === 0 ? (
                    emptyHint != null ? (
                      <div className="text-[11px] text-ink-3 px-0.5">{emptyHint}</div>
                    ) : null
                  ) : (
                    colItems.map((item) => (
                      <div
                        key={getItemId(item)}
                        draggable
                        onDragStart={() => setDragId(getItemId(item))}
                        onDragEnd={() => {
                          setDragId(null);
                          setHoverCol(null);
                        }}
                        onClick={() => onCardClick?.(item)}
                        className={`cursor-grab active:cursor-grabbing ${
                          dragId === getItemId(item) ? "opacity-50" : ""
                        }`}
                      >
                        {renderCard(item)}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {footer != null && (
        <div className="px-4 py-3 border-t border-outline">{footer}</div>
      )}
    </section>
  );
}
