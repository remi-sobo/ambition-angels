"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import { buttonClass } from "./Button";
import MoreActionsMenu from "./MoreActionsMenu";
import type { DataTableBulkAction } from "@/lib/admin/dataTable";

/**
 * The markup half of DataTable v2 (see ./DataTable.tsx for the API). The
 * server wrapper renders every cell, so this component only receives React
 * nodes and links: no row data, no render functions. It owns the one piece
 * of state a URL should not carry, the row selection, and the bulk footer.
 *
 * Layouts: a table from 640px up, cards below it (spec §5 "Phone: cards").
 * Both are in the DOM; the hidden one is display:none, so assistive tech only
 * ever meets one of them.
 */

export type FrameSort = {
  href: string;
  /** This column's current direction, or null when another column sorts. */
  active: "asc" | "desc" | null;
  /** The direction a click moves to, for the spoken hint. */
  next: "asc" | "desc";
};

export type FrameColumn = {
  key: string;
  header: string;
  align: "left" | "right";
  sort?: FrameSort;
  className?: string;
  headerClassName?: string;
  /** Where the column sits on a phone card. */
  card: "title" | "field" | "hidden";
};

export type FrameRow = {
  id: string;
  /** Spoken name for the row's checkbox ("Select Harlow Family Fund"). */
  label: string;
  cells: ReactNode[];
  next?: ReactNode;
};

export type FrameFooter = {
  summary: string;
  pageLabel: string | null;
  prevHref: string | null;
  nextHref: string | null;
};

const th = "px-4 py-3 font-semibold";
const td = "px-4 py-3";

function SortGlyph({ dir }: { dir: "asc" | "desc" | null }) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className={`w-3 h-3 ${dir ? "text-ink-1" : "text-ink-3 opacity-60"}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {dir === "asc" ? <path d="M3 7.5L6 4.5l3 3" /> : dir === "desc" ? <path d="M3 4.5L6 7.5l3-3" /> : <path d="M3.5 4.5L6 2l2.5 2.5M3.5 7.5L6 10l2.5-2.5" />}
    </svg>
  );
}

const dirWord = (d: "asc" | "desc") => (d === "asc" ? "ascending" : "descending");

export default function DataTableFrame({
  label,
  columns,
  rows,
  nextColumn,
  footer,
  bulkActions,
  empty,
  minWidth,
}: {
  label: string;
  columns: FrameColumn[];
  rows: FrameRow[];
  /** The next-step column; null = none. */
  nextColumn: { header: string; sort?: FrameSort } | null;
  footer: FrameFooter;
  bulkActions: DataTableBulkAction[];
  /** Rendered in place of rows when there are none. */
  empty: ReactNode;
  minWidth?: number;
}) {
  const router = useRouter();
  const save = useSaveAction();
  const confirm = useConfirm();
  const selectable = bulkActions.length > 0;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const headerBox = useRef<HTMLInputElement>(null);

  // A new page of rows (paging, sorting, a refresh after a bulk action)
  // keeps only the selected ids that are still on screen.
  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set(Array.from(prev).filter((id) => rowIds.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rowIds]);

  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someOn = !allOn && rows.some((r) => selected.has(r.id));
  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = someOn;
  }, [someOn]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(rowIds));

  async function run(action: DataTableBulkAction, choice?: { value: string; label: string }) {
    const ids = rowIds.filter((id) => selected.has(id));
    if (ids.length === 0 || busy) return;
    if (action.kind === "choose") {
      if (!choice) return;
      setBusy(action.key);
      const r = await save({
        request: { url: action.url, method: action.method ?? "POST", body: { ids, [action.field]: choice.value || null } },
        success: action.success?.replace("{label}", choice.label),
      });
      setBusy(null);
      if (r.ok) {
        setSelected(new Set());
        router.refresh();
      }
      return;
    }
    if (action.kind === "link") {
      const [path, hash] = action.href.split("#");
      const sep = path.includes("?") ? "&" : "?";
      const q = `${action.param ?? "ids"}=${ids.map(encodeURIComponent).join(",")}`;
      router.push(`${path}${sep}${q}${hash ? `#${hash}` : ""}`);
      return;
    }
    if (action.confirm) {
      const ok = await confirm({
        title: action.confirm,
        body: action.confirmBody,
        confirmLabel: action.label,
        destructive: action.tone === "danger",
      });
      if (!ok) return;
    }
    setBusy(action.key);
    // No optimistic change: the list re-reads from the server on success.
    const r = await save({
      request: { url: action.url, method: action.method ?? "POST", body: { ids } },
      success: action.success,
    });
    setBusy(null);
    if (r.ok) {
      setSelected(new Set());
      router.refresh();
    }
  }

  const count = rowIds.filter((id) => selected.has(id)).length;
  const nextHeader = nextColumn ? nextColumn.header : null;
  const sortable = [
    ...columns.filter((c) => c.sort),
    ...(nextColumn?.sort ? [{ key: "__next", header: nextColumn.header, sort: nextColumn.sort }] : []),
  ];
  const titleCol = Math.max(0, columns.findIndex((c) => c.card === "title"));

  return (
    <section aria-label={label} className="bg-tile border-hairline rounded-panel-lg overflow-hidden">
      {rows.length === 0 ? (
        empty
      ) : (
        <>
          {/* ── Desktop and tablet: the table ── */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm" style={minWidth ? { minWidth } : undefined}>
              <caption className="sr-only">{label}</caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-ink-3 border-b border-hairline">
                  {selectable ? (
                    <th scope="col" className="pl-4 pr-1 py-3 w-8">
                      <input
                        ref={headerBox}
                        type="checkbox"
                        checked={allOn}
                        onChange={toggleAll}
                        aria-label="Select every row on this page"
                        className="w-4 h-4 accent-orange align-middle"
                      />
                    </th>
                  ) : null}
                  {[...columns, ...(nextColumn ? [{ key: "__next", header: nextColumn.header, align: "left" as const, sort: nextColumn.sort, headerClassName: "", className: "", card: "hidden" as const }] : [])].map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={c.sort ? (c.sort.active ? dirWord(c.sort.active) : "none") : undefined}
                      className={`${th} ${c.align === "right" ? "text-right" : ""} ${c.headerClassName ?? ""}`}
                    >
                      {c.sort ? (
                        <Link
                          href={c.sort.href}
                          scroll={false}
                          className={`inline-flex items-center gap-1 rounded-sm hover:text-ink-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange ${
                            c.sort.active ? "text-ink-1" : ""
                          } ${c.align === "right" ? "flex-row-reverse" : ""}`}
                        >
                          {c.header}
                          <SortGlyph dir={c.sort.active} />
                          <span className="sr-only">, sort {dirWord(c.sort.next)}</span>
                        </Link>
                      ) : (
                        c.header
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline">
                {rows.map((r) => {
                  const on = selected.has(r.id);
                  return (
                    <tr key={r.id} className={`${on ? "bg-orange/10" : "hover:bg-orange/5"} transition-colors`} aria-selected={selectable ? on : undefined}>
                      {selectable ? (
                        <td className="pl-4 pr-1 py-3 w-8">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(r.id)}
                            aria-label={`Select ${r.label}`}
                            className="w-4 h-4 accent-orange align-middle"
                          />
                        </td>
                      ) : null}
                      {r.cells.map((cell, i) => (
                        <td
                          key={columns[i].key}
                          className={`${td} ${columns[i].align === "right" ? "text-right" : ""} ${columns[i].className ?? ""}`}
                        >
                          {cell}
                        </td>
                      ))}
                      {nextHeader !== null ? <td className={`${td} text-ink-2 max-w-[280px]`}>{r.next}</td> : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Phone: cards ── */}
          <div className="sm:hidden">
            {sortable.length > 0 ? (
              <nav aria-label="Sort this list" className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
                <span className={`${TYPE.metadata} mr-1`}>Sort</span>
                {sortable.map((c) => (
                  <Link
                    key={c.key}
                    href={c.sort!.href}
                    scroll={false}
                    aria-current={c.sort!.active ? "true" : undefined}
                    className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-xs font-semibold ${
                      c.sort!.active ? "bg-accent-soft text-orange-dark" : "text-ink-2 hover:bg-surface"
                    }`}
                  >
                    {c.header}
                    {c.sort!.active ? <SortGlyph dir={c.sort!.active} /> : null}
                    <span className="sr-only">
                      {c.sort!.active ? `, sorted ${dirWord(c.sort!.active)}` : ""}, sort {dirWord(c.sort!.next)}
                    </span>
                  </Link>
                ))}
              </nav>
            ) : null}
            <ul className="divide-y divide-outline">
              {rows.map((r) => {
                const on = selected.has(r.id);
                return (
                  <li key={r.id} className={`px-4 py-3.5 ${on ? "bg-orange/10" : ""}`}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">{r.cells[titleCol]}</div>
                      {selectable ? (
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(r.id)}
                          aria-label={`Select ${r.label}`}
                          className="w-5 h-5 mt-0.5 accent-orange shrink-0"
                        />
                      ) : null}
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {columns.map((c, i) =>
                        i === titleCol || c.card !== "field" ? null : (
                          <div key={c.key} className="min-w-0">
                            <dt className="text-xs uppercase tracking-wider text-ink-3">{c.header}</dt>
                            <dd className="text-sm text-ink-1 [font-variant-numeric:tabular-nums]">{r.cells[i]}</dd>
                          </div>
                        ),
                      )}
                    </dl>
                    {nextHeader !== null && r.next ? (
                      <div className="mt-2.5 pt-2.5 border-t border-hairline text-sm text-ink-2">
                        <span className="block text-xs uppercase tracking-wider text-ink-3">{nextHeader}</span>
                        {r.next}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      {/* ── Footer: count and paging, or the selection and its bulk actions ── */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-hairline text-xs text-ink-2 ${
          count > 0 ? "sticky bottom-0 bg-surface" : ""
        }`}
      >
        <span aria-live="polite" className="[font-variant-numeric:tabular-nums]">
          {count > 0 ? (
            <strong className="font-semibold text-ink-1">{count} selected</strong>
          ) : (
            footer.summary
          )}
        </span>
        {count > 0 ? (
          <div role="group" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2">
            {bulkActions.map((a) =>
              a.kind === "choose" ? (
                <MoreActionsMenu
                  key={a.key}
                  label={a.label}
                  triggerText={busy === a.key ? "Working" : a.label}
                  size="sm"
                  align="left"
                  placement="above"
                  disabled={busy !== null}
                  items={a.options.map((o) => ({ label: o.label, onSelect: () => void run(a, o) }))}
                />
              ) : (
              <button
                key={a.key}
                type="button"
                onClick={() => void run(a)}
                disabled={busy !== null}
                aria-busy={busy === a.key || undefined}
                className={buttonClass({ variant: a.tone === "danger" ? "danger" : "secondary", size: "sm" })}
              >
                {busy === a.key ? "Working" : a.label}
              </button>
              ),
            )}
            <button type="button" onClick={() => setSelected(new Set())} className={buttonClass({ variant: "quiet", size: "sm" })}>
              Clear selection
            </button>
          </div>
        ) : footer.pageLabel ? (
          <nav aria-label="Pages" className="flex items-center gap-3">
            {footer.prevHref ? (
              <Link href={footer.prevHref} className="font-semibold text-orange hover:text-orange-dark">
                ← Previous<span className="sr-only"> page</span>
              </Link>
            ) : (
              <span className="text-ink-3" aria-hidden>
                ← Previous
              </span>
            )}
            <span>{footer.pageLabel}</span>
            {footer.nextHref ? (
              <Link href={footer.nextHref} className="font-semibold text-orange hover:text-orange-dark">
                Next<span className="sr-only"> page</span> →
              </Link>
            ) : (
              <span className="text-ink-3" aria-hidden>
                Next →
              </span>
            )}
          </nav>
        ) : null}
      </div>
    </section>
  );
}
