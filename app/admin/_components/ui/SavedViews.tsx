"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";
import { orderViews } from "@/lib/admin/savedViews";

/**
 * Saved views as tabs (spec §5: "Saved views as tabs, 'mine' first";
 * Main.dc.html "My donors · All · Lapsed · …  + Save view").
 *
 * Presentational only: it takes the list and the active key. Where views are
 * stored (segments on the server) and how one is saved is the page's job.
 *
 * Ordering convention: views marked `mine` come first, in the order given,
 * then the rest. Pages should not reorder around this.
 *
 * Two modes:
 *  - `href` on each view: links (a URL per view, shareable). The active one
 *    carries aria-current="page".
 *  - `onSelect`: an ARIA tablist with arrow-key movement, for client lists.
 */
export type SavedView = { key: string; label: string; mine?: boolean; href?: string; count?: number };

const tabBase = `inline-flex items-center gap-1.5 h-9 px-3.5 rounded-control border text-sm transition-colors`;
const tabOn = "bg-surface border-outline text-ink-1 font-semibold";
const tabOff = "bg-transparent border-transparent text-ink-2 hover:text-ink-1 hover:bg-tile";

export default function SavedViews({
  views,
  activeKey,
  onSelect,
  saveSlot,
  label = "Saved views",
}: {
  views: SavedView[];
  activeKey: string;
  onSelect?: (key: string) => void;
  /** The "+ Save view" control (use <SaveViewButton>), or any node. */
  saveSlot?: ReactNode;
  label?: string;
}) {
  const ordered = orderViews(views);
  const refs = useRef<(HTMLElement | null)[]>([]);

  const count = (v: SavedView) =>
    typeof v.count === "number" ? <span className={`${TYPE.metadata} font-normal tabular-nums`}>{v.count}</span> : null;

  if (!onSelect) {
    return (
      <nav aria-label={label} className="flex flex-wrap items-center gap-1 mb-3.5">
        {ordered.map((v) => (
          <Link
            key={v.key}
            href={v.href ?? "#"}
            aria-current={v.key === activeKey ? "page" : undefined}
            className={`${tabBase} ${v.key === activeKey ? tabOn : tabOff}`}
          >
            {v.label}
            {count(v)}
          </Link>
        ))}
        {saveSlot}
      </nav>
    );
  }

  const onKey = (e: React.KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % ordered.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + ordered.length) % ordered.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = ordered.length - 1;
    if (next < 0) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onSelect(ordered[next].key);
  };

  return (
    <div className="flex flex-wrap items-center gap-1 mb-3.5">
      <div role="tablist" aria-label={label} className="flex flex-wrap items-center gap-1">
        {ordered.map((v, i) => {
          const on = v.key === activeKey;
          return (
            <button
              key={v.key}
              ref={(n) => {
                refs.current[i] = n;
              }}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onSelect(v.key)}
              onKeyDown={(e) => onKey(e, i)}
              className={`${tabBase} ${on ? tabOn : tabOff}`}
            >
              {v.label}
              {count(v)}
            </button>
          );
        })}
      </div>
      {saveSlot}
    </div>
  );
}

/** The dashed "+ Save view" control that sits after the tabs. */
export function SaveViewButton({ onClick, disabled }: { onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center h-9 px-3 rounded-control border border-dashed border-outline text-sm text-ink-2 hover:text-ink-1 hover:bg-tile disabled:opacity-50"
    >
      + Save view
    </button>
  );
}
