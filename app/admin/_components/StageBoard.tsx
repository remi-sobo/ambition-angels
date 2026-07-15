"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * BloomOS shared drag-and-drop stage board (design-system §4.3: "the same
 * horizontal funnel/Kanban component" for fundraising stages, grants, partner
 * pipeline, student journey).
 *
 * Marries the column/summary layout of the presentational <Pipeline> with an
 * optimistic move: drag a card to another column and it advances that item's
 * stage. The caller owns persistence via `onMove`; the board owns the drag
 * mechanics, the optimistic re-bucketing, and the revert-on-failure.
 *
 * Drag is driven by Pointer Events rather than the HTML5 drag-and-drop API.
 * Native HTML5 DnD never fires on touch devices and won't even start in Firefox
 * without a dataTransfer payload — so on the admin PWA (tablets/phones) the
 * cards simply couldn't be dragged. Pointer Events unify mouse, touch and pen
 * across every browser: press a card, move past a small threshold to pick it
 * up, release over a column to drop. A short move counts as a tap, so the
 * cards' own links/buttons keep working.
 *
 * Generic over the item type T. `getItemColumn` reads the item's current
 * column key (e.g. its stage); `onMove(id, toKey)` persists the change and must
 * throw on failure so the board can revert. Fresh server data (after
 * router.refresh) supersedes any optimistic move.
 */

export type StageColumn = { key: string; label: string };

// Pixels of movement before a press becomes a drag (below this it's a tap/click).
const DRAG_THRESHOLD = 6;

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
  maxVisible,
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
  /** Cap visible cards per column; the rest collapse behind "Show N more". */
  maxVisible?: number;
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

  // Transient pointer-gesture tracking. Kept in a ref so a press that turns out
  // to be a tap never triggers a re-render.
  const pending = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    started: boolean;
  } | null>(null);
  // Set right after a real drag so the trailing synthetic click on the card
  // (link/edit) is swallowed instead of navigating.
  const suppressClick = useRef(false);

  useEffect(() => setMoves({}), [items]);

  const columnOf = (item: T) => moves[getItemId(item)] ?? getItemColumn(item);

  const byColumn: Record<string, T[]> = {};
  for (const c of columns) byColumn[c.key] = [];
  for (const item of items) {
    const key = columnOf(item);
    if (byColumn[key]) byColumn[key].push(item);
  }

  // Which column sits under a viewport point (works over a card or empty space).
  function colKeyAtPoint(x: number, y: number): string | null {
    if (typeof document === "undefined") return null;
    const el = document.elementFromPoint(x, y);
    const col = el?.closest?.("[data-stage-col]");
    return col?.getAttribute("data-stage-col") ?? null;
  }

  function onPointerDown(e: React.PointerEvent, id: string) {
    // Only the primary mouse button starts a drag.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Let form controls inside a card (the inline edit panel) handle their own
    // gestures — don't hijack typing or option selection.
    if ((e.target as HTMLElement).closest("input,textarea,select,label,summary")) {
      pending.current = null;
      return;
    }
    pending.current = { id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, started: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = pending.current;
    if (!p || p.pointerId !== e.pointerId) return;
    if (!p.started) {
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < DRAG_THRESHOLD) return;
      p.started = true;
      // Keep receiving moves even as the pointer leaves this card.
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* element detached — harmless */
      }
      setDragId(p.id);
    }
    setHoverCol(colKeyAtPoint(e.clientX, e.clientY));
  }

  function endDrag() {
    pending.current = null;
    setDragId(null);
    setHoverCol(null);
  }

  function onPointerUp(e: React.PointerEvent) {
    const p = pending.current;
    if (!p || p.pointerId !== e.pointerId) return;
    if (p.started) {
      const toKey = colKeyAtPoint(e.clientX, e.clientY);
      const id = p.id;
      suppressClick.current = true; // a real drag — eat the trailing click
      endDrag();
      if (toKey) void handleDrop(id, toKey);
    } else {
      // No movement: it was a tap/click — let the card's own handlers run.
      pending.current = null;
    }
  }

  function onPointerCancel(e: React.PointerEvent) {
    const p = pending.current;
    if (!p || p.pointerId !== e.pointerId) return;
    endDrag();
  }

  async function handleDrop(id: string, toKey: string) {
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

  const draggableCard = (item: T) => {
    const id = getItemId(item);
    return (
      <div
        key={id}
        onPointerDown={(e) => onPointerDown(e, id)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
            suppressClick.current = false;
          }
        }}
        onClick={onCardClick ? () => onCardClick(item) : undefined}
        // touch-action: none lets us own the drag gesture on touch screens
        // instead of the browser scrolling the page out from under the card.
        style={{ touchAction: "none" }}
        className={`select-none cursor-grab active:cursor-grabbing ${
          dragId === id ? "opacity-40" : ""
        }`}
      >
        {renderCard(item)}
      </div>
    );
  };

  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
      {title != null && (
        <div className="px-5 py-4 border-b border-outline">
          <h2 className={TYPE.cardTitle}>{title}</h2>
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
                data-stage-col={col.key}
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
                  ) : maxVisible != null && colItems.length > maxVisible ? (
                    <>
                      {colItems.slice(0, maxVisible).map(draggableCard)}
                      <details>
                        <summary className="text-xs text-ink-2 cursor-pointer hover:text-ink-1 px-1 py-1">
                          Show {colItems.length - maxVisible} more
                        </summary>
                        <div className="space-y-2 mt-2">
                          {colItems.slice(maxVisible).map(draggableCard)}
                        </div>
                      </details>
                    </>
                  ) : (
                    colItems.map(draggableCard)
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
