"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * The one filter row for list and board pages (spec §5: "One filter row
 * (search, Filters count, Sort, three or four quick filters, Clear all,
 * Advanced)"; Main.dc.html).
 *
 * Presentational: the page owns the state (URL params on migrated pages) and
 * passes values and handlers in. Accent appears only on what is active: the
 * Filters button when its count is above zero, and active quick filters.
 *
 * "/" focuses the search box from anywhere on the page, unless the person is
 * already typing in a field. On a page with a FilterRow this takes "/" from
 * the shell's global search (which keeps Ctrl/Cmd+K); on every other page
 * "/" still opens global search.
 */
export type QuickFilter = {
  key: string;
  label: string;
  /** Active filters show in the accent tint with a remove control. */
  active?: boolean;
  /** Called to toggle or open this filter's picker. */
  onClick?: () => void;
  /** Shows the ▾ affordance for a filter that opens a picker. */
  hasMenu?: boolean;
};

export default function FilterRow({
  search,
  filters,
  sort,
  quickFilters = [],
  onClearAll,
  advanced,
  right,
  disabled = false,
  disabledNote,
}: {
  search?: {
    value: string;
    onChange: (value: string) => void;
    /** Accessible name, e.g. "Search donors". */
    label: string;
    placeholder?: string;
  };
  /** The Filters button. count > 0 shows "Filters (n)" in the active tint. */
  filters?: { count: number; onClick: () => void };
  /** The Sort control: its current label ("Sort: next step due") and opener. */
  sort?: { label: string; onClick: () => void };
  quickFilters?: QuickFilter[];
  /** Shown only while something is active. */
  onClearAll?: () => void;
  /** The "Advanced filters" link or button slot. */
  advanced?: ReactNode;
  /** Right-aligned view controls (Columns, density, board/list). */
  right?: ReactNode;
  /** An empty list turns the row off (SetupEmpty.dc.html) rather than hiding it. */
  disabled?: boolean;
  disabledNote?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!search || disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    // Capture phase, so this runs before the shell's global search listener
    // (GlobalSearch also binds "/"). Focus lands in the list's own search,
    // and GlobalSearch then sees a focused input and stays closed.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [search, disabled]);

  const anyActive = (filters?.count ?? 0) > 0 || quickFilters.some((q) => q.active) || !!search?.value;
  const control = "h-10 px-3.5 rounded-control border text-sm transition-colors disabled:cursor-not-allowed";
  const neutral = "bg-surface border-outline text-ink-1 hover:bg-tile disabled:bg-transparent disabled:border-hairline disabled:text-ink-3";
  const activeTint = "bg-accent-soft border-accent text-orange-dark font-semibold";
  const pill = "inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-sm font-semibold transition-colors";

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4" role="search" aria-label="Filter this list">
      {search ? (
        <label
          className={`flex items-center gap-2 flex-[0_1_260px] min-w-[180px] h-10 px-3 rounded-control border ${
            disabled ? "bg-app border-hairline text-ink-3" : "bg-tile border-outline text-ink-2"
          } focus-within:border-orange`}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4-4" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            aria-label={search.label}
            placeholder={search.placeholder ?? "Search"}
            value={search.value}
            disabled={disabled}
            onChange={(e) => search.onChange(e.target.value)}
            className={`flex-1 min-w-0 bg-transparent border-0 p-0 ${TYPE.body} placeholder:text-ink-3 focus:outline-none focus:ring-0`}
          />
          {!disabled ? (
            <kbd aria-hidden className="text-xs text-ink-2 border border-outline rounded-[5px] px-1.5 leading-5">
              /
            </kbd>
          ) : null}
        </label>
      ) : null}

      {filters ? (
        <button
          type="button"
          disabled={disabled}
          onClick={filters.onClick}
          aria-label={filters.count > 0 ? `Filters, ${filters.count} active` : "Filters"}
          className={`${control} ${filters.count > 0 && !disabled ? activeTint : neutral}`}
        >
          {filters.count > 0 ? `Filters (${filters.count})` : "Filters"}
        </button>
      ) : null}

      {sort ? (
        <button type="button" disabled={disabled} onClick={sort.onClick} className={`${control} ${neutral}`}>
          {sort.label}
        </button>
      ) : null}

      {disabled && disabledNote ? <span className={`${TYPE.bodyMuted} text-[13px] ml-1`}>{disabledNote}</span> : null}

      {!disabled && quickFilters.length > 0 ? (
        <>
          <span aria-hidden className="w-px h-6 bg-hairline mx-1" />
          {quickFilters.map((q) => (
            <button
              key={q.key}
              type="button"
              aria-pressed={q.active ? true : false}
              onClick={q.onClick}
              className={`${pill} ${q.active ? "bg-accent-soft text-orange-dark" : "bg-transparent text-ink-1 hover:bg-tile"}`}
            >
              {q.label}
              {q.active ? (
                <svg aria-hidden viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              ) : q.hasMenu ? (
                <svg aria-hidden viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 6l4 4 4-4" />
                </svg>
              ) : null}
            </button>
          ))}
        </>
      ) : null}

      {!disabled && onClearAll && anyActive ? (
        <button
          type="button"
          onClick={onClearAll}
          className="h-8 px-2.5 text-sm text-ink-2 underline underline-offset-2 hover:text-ink-1"
        >
          Clear all
        </button>
      ) : null}

      <span className="flex-grow" />
      {!disabled ? advanced : null}
      {right}
    </div>
  );
}
