"use client";

import { useState, type ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * The one timeline for a record (spec §5 Detail: "One timeline on the left";
 * Donor.dc.html "Activity").
 *
 * Each entry: an icon in a round well, a title with optional chips, one meta
 * line, an optional body, its actions, and the date right-aligned. Filter
 * chips above narrow by entry `kind` ("Gifts", "Emails"); counts come from
 * the entries unless given.
 *
 * Filtering is internal by default; pass `activeFilter` + `onFilterChange`
 * to drive it from the URL instead. `composer` is the add-a-note row and
 * `footer` the "Showing 9 of 31 · Show older" line.
 */
export type TimelineEntry = {
  id: string;
  /** Matches a filter key. */
  kind: string;
  /** A 16px stroke icon (aria-hidden is applied by the well). */
  icon: ReactNode;
  title: ReactNode;
  chips?: ReactNode;
  meta?: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  /** Short date ("Nov 18"). */
  date: string;
  /** Machine date for <time dateTime>. */
  dateTime?: string;
};

export type TimelineFilter = { key: string; label: string; count?: number };

export default function Timeline({
  title = "Activity",
  entries,
  filters,
  activeFilter,
  onFilterChange,
  composer,
  footer,
  emptyText = "Nothing here yet.",
}: {
  title?: string;
  entries: TimelineEntry[];
  /** Include an "all" key to show everything. */
  filters?: TimelineFilter[];
  activeFilter?: string;
  onFilterChange?: (key: string) => void;
  composer?: ReactNode;
  footer?: ReactNode;
  emptyText?: string;
}) {
  const [internal, setInternal] = useState(filters?.[0]?.key ?? "all");
  const active = activeFilter ?? internal;
  const select = (k: string) => (onFilterChange ? onFilterChange(k) : setInternal(k));
  const shown = active === "all" ? entries : entries.filter((e) => e.kind === active);
  const countFor = (f: TimelineFilter) =>
    f.count ?? (f.key === "all" ? entries.length : entries.filter((e) => e.kind === f.key).length);

  return (
    <section aria-label={title} className="bg-surface border border-hairline rounded-panel min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className={TYPE.subsectionTitle}>{title}</h2>
        {filters && filters.length > 0 ? (
          <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
            {filters.map((f) => {
              const on = f.key === active;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => select(f.key)}
                  className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-sm font-semibold transition-colors ${
                    on ? "bg-accent-soft text-orange-dark" : "bg-transparent text-ink-1 hover:bg-tile"
                  }`}
                >
                  {f.label}
                  <span className={`font-medium tabular-nums ${on ? "text-orange-dark" : "text-ink-2"}`}>{countFor(f)}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      {composer ? <div className="px-5 pb-4 border-b border-hairline">{composer}</div> : null}
      {shown.length === 0 ? (
        <p className={`${TYPE.bodyMuted} px-5 py-6 border-t border-hairline`}>{emptyText}</p>
      ) : (
        <ol className={composer ? "" : "border-t border-hairline"}>
          {shown.map((e) => (
            <li
              key={e.id}
              className="grid grid-cols-[32px_minmax(0,1fr)_auto] sm:grid-cols-[32px_minmax(0,1fr)_auto_56px] gap-3 px-5 py-4 border-b border-hairline last:border-b-0"
            >
              <span
                aria-hidden
                className="col-start-1 row-start-1 inline-flex items-center justify-center w-8 h-8 rounded-full bg-app border border-hairline text-ink-1 [&>svg]:w-4 [&>svg]:h-4"
              >
                {e.icon}
              </span>
              <div className="col-start-2 row-start-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-h-[32px]">
                  <span className={`${TYPE.body} font-semibold`}>{e.title}</span>
                  {e.chips}
                </div>
                {e.meta ? <div className={`${TYPE.bodyMuted} text-[13px] mt-0.5`}>{e.meta}</div> : null}
                {e.body ? <div className={`${TYPE.body} mt-2 max-w-[60ch]`}>{e.body}</div> : null}
              </div>
              <div className="flex flex-wrap gap-1 self-start col-start-2 row-start-2 sm:col-start-3 sm:row-start-1 empty:hidden">{e.actions}</div>
              <time
                dateTime={e.dateTime}
                className={`${TYPE.bodyMuted} text-[13px] tabular-nums leading-8 text-right whitespace-nowrap col-start-3 row-start-1 sm:col-start-4`}
              >
                {e.date}
              </time>
            </li>
          ))}
        </ol>
      )}
      {footer ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-hairline">{footer}</div>
      ) : null}
    </section>
  );
}

/** A small chip for timeline titles ("Opened", "Thanked Oct 5"). */
export function TimelineChip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" }) {
  return (
    <span
      className={`inline-flex items-center h-[22px] px-2 rounded-full ${TYPE.badge} ${
        tone === "success" ? "bg-revenue-bg text-revenue" : "bg-app text-ink-2 border border-hairline"
      }`}
    >
      {children}
    </span>
  );
}
