"use client";

// BloomOS shared data table (design-system §4.4: "Every entity list is this
// one table component"). One reusable, accessible table with:
//   - sortable columns
//   - quick search
//   - column picker (show/hide), persisted per user
//   - row selection + bulk actions
//   - CSV export (current filtered view, or just the selected rows)
//   - saved views (named {search, sort, hidden columns, page size}), per user
//   - pagination with a page-size selector
//
// Pagination is client-side: the parent server component fetches and passes
// the full row set, and this component paginates in the browser. That keeps
// surfaces whose rollups must be computed over the whole dataset (e.g. Donors
// retention) correct. A server-driven mode (a `source` callback) can be added
// later for surfaces large enough to need it; the column/feature API is shaped
// so that swap won't change call sites.

import {
  useMemo,
  useState,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { TYPE } from "@/lib/admin/typeScale";

export type Column<Row> = {
  key: string;
  header: string;
  /** Sort/search/CSV value. Omit for action-only columns (e.g. a link). */
  value?: (row: Row) => string | number | null;
  /** Cell renderer; defaults to the stringified `value`. */
  render?: (row: Row) => ReactNode;
  /** Defaults to true when `value` is provided. */
  sortable?: boolean;
  align?: "left" | "right";
  /** Hidden until the user enables it in the column picker. */
  defaultHidden?: boolean;
  /** Excluded from CSV when false (defaults to true when `value` is provided). */
  csv?: boolean;
  /** Excluded from the column picker (always shown), e.g. an action column. */
  alwaysVisible?: boolean;
  thClassName?: string;
  tdClassName?: string;
};

export type BulkAction<Row> = {
  label: string;
  /** Receives the currently-selected rows. */
  run: (rows: Row[]) => void | Promise<void>;
};

type SortState = { key: string; dir: "asc" | "desc" } | null;
type SavedView = {
  name: string;
  search: string;
  sort: SortState;
  hidden: string[];
  pageSize: number;
};

const btn =
  "text-xs font-semibold px-3 py-1.5 rounded-full border-[1.5px] border-outline bg-tile text-ink-2 hover:text-ink-1 hover:bg-[#EFE6D4] transition-colors disabled:opacity-50";

function csvEscape(v: string | number | null): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function DataTable<Row>({
  rows,
  columns,
  getRowId,
  initialSort = null,
  bulkActions,
  enableCsv = true,
  csvFilename = "export.csv",
  viewsKey,
  pageSizeOptions = [25, 50, 100],
  initialPageSize,
  searchPlaceholder = "Search…",
  emptyMessage = "Nothing to show yet.",
}: {
  rows: Row[];
  columns: Column<Row>[];
  getRowId: (row: Row) => string;
  initialSort?: SortState;
  bulkActions?: BulkAction<Row>[];
  enableCsv?: boolean;
  csvFilename?: string;
  /** localStorage namespace for saved views + column prefs. Omit to disable. */
  viewsKey?: string;
  pageSizeOptions?: number[];
  initialPageSize?: number;
  searchPlaceholder?: string;
  emptyMessage?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>(initialSort);
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key))
  );
  const [pageSize, setPageSize] = useState(initialPageSize ?? pageSizeOptions[0]);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);

  // Load persisted column prefs + saved views once.
  useEffect(() => {
    if (!viewsKey || typeof window === "undefined") return;
    try {
      const rawCols = localStorage.getItem(`bloomos.table.${viewsKey}.cols`);
      if (rawCols) setHidden(new Set(JSON.parse(rawCols) as string[]));
      const rawViews = localStorage.getItem(`bloomos.table.${viewsKey}.views`);
      if (rawViews) setViews(JSON.parse(rawViews) as SavedView[]);
    } catch {
      /* corrupt prefs are non-fatal */
    }
  }, [viewsKey]);

  const persistCols = (next: Set<string>) => {
    if (viewsKey && typeof window !== "undefined")
      localStorage.setItem(`bloomos.table.${viewsKey}.cols`, JSON.stringify(Array.from(next)));
  };
  const persistViews = (next: SavedView[]) => {
    setViews(next);
    if (viewsKey && typeof window !== "undefined")
      localStorage.setItem(`bloomos.table.${viewsKey}.views`, JSON.stringify(next));
  };

  const colByKey = useMemo(() => {
    const m = new Map<string, Column<Row>>();
    for (const c of columns) m.set(c.key, c);
    return m;
  }, [columns]);

  // Filter → sort. Recomputed only when inputs change.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows;
    if (q) {
      const searchable = columns.filter((c) => c.value);
      out = rows.filter((row) =>
        searchable.some((c) => String(c.value!(row) ?? "").toLowerCase().includes(q))
      );
    }
    if (sort) {
      const col = colByKey.get(sort.key);
      if (col?.value) {
        const dir = sort.dir === "asc" ? 1 : -1;
        out = [...out].sort((a, b) => {
          const av = col.value!(a);
          const bv = col.value!(b);
          if (av == null && bv == null) return 0;
          if (av == null) return 1; // nulls last
          if (bv == null) return -1;
          if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
          return String(av).localeCompare(String(bv)) * dir;
        });
      }
    }
    return out;
  }, [rows, columns, colByKey, search, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const visibleColumns = columns.filter((c) => c.alwaysVisible || !hidden.has(c.key));
  const selectedRows = filtered.filter((r) => selected.has(getRowId(r)));
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(getRowId(r)));

  const toggleSort = (key: string) => {
    const col = colByKey.get(key);
    if (!col?.value || col.sortable === false) return;
    setSort((s) =>
      s?.key === key
        ? s.dir === "desc"
          ? { key, dir: "asc" }
          : null
        : { key, dir: "desc" }
    );
  };

  const toggleCol = (key: string) => {
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persistCols(next);
      return next;
    });
  };

  const toggleRow = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllOnPage = () =>
    setSelected((s) => {
      const next = new Set(s);
      if (allOnPageSelected) pageRows.forEach((r) => next.delete(getRowId(r)));
      else pageRows.forEach((r) => next.add(getRowId(r)));
      return next;
    });

  const exportCsv = () => {
    const cols = visibleColumns.filter((c) => c.value && c.csv !== false);
    const data = selected.size > 0 ? selectedRows : filtered;
    const header = cols.map((c) => csvEscape(c.header)).join(",");
    const body = data
      .map((row) => cols.map((c) => csvEscape(c.value!(row))).join(","))
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveView = () => {
    const name = window.prompt("Save this view as…")?.trim();
    if (!name) return;
    const view: SavedView = { name, search, sort, hidden: Array.from(hidden), pageSize };
    persistViews([...views.filter((v) => v.name !== name), view]);
    setViewsOpen(false);
  };
  const applyView = (v: SavedView) => {
    setSearch(v.search);
    setSort(v.sort);
    setHidden(new Set(v.hidden));
    setPageSize(v.pageSize);
    setPage(0);
    setViewsOpen(false);
  };
  const deleteView = (name: string) => persistViews(views.filter((v) => v.name !== name));

  // Close dropdowns on outside click.
  const toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pickerOpen && !viewsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
        setViewsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen, viewsOpen]);

  return (
    <div className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
      {/* Toolbar */}
      <div ref={toolbarRef} className="px-4 py-3 border-b border-outline flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder={searchPlaceholder}
          className={`bg-cream/5 border-[1.5px] border-outline rounded-lg px-3 py-1.5 ${TYPE.body} placeholder-ink-3 focus:outline-none focus:border-orange/40 min-w-[180px] flex-1 max-w-xs`}
        />

        {/* Column picker */}
        <div className="relative">
          <button className={btn} onClick={() => { setPickerOpen((o) => !o); setViewsOpen(false); }} aria-expanded={pickerOpen}>
            Columns
          </button>
          {pickerOpen && (
            <div className="absolute right-0 z-20 mt-1 w-52 bg-tile border-[1.5px] border-outline rounded-card shadow-lg p-2 max-h-72 overflow-auto">
              {columns.filter((c) => !c.alwaysVisible).map((c) => (
                <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 text-sm text-ink-1 hover:bg-[#EFE6D4] rounded cursor-pointer">
                  <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggleCol(c.key)} className="accent-orange" />
                  {c.header}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Saved views */}
        {viewsKey && (
          <div className="relative">
            <button className={btn} onClick={() => { setViewsOpen((o) => !o); setPickerOpen(false); }} aria-expanded={viewsOpen}>
              Views{views.length ? ` (${views.length})` : ""}
            </button>
            {viewsOpen && (
              <div className="absolute right-0 z-20 mt-1 w-60 bg-tile border-[1.5px] border-outline rounded-card shadow-lg p-2">
                <button onClick={saveView} className="w-full text-left px-2 py-1.5 text-sm font-semibold text-orange hover:bg-[#EFE6D4] rounded">
                  + Save current view
                </button>
                {views.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-ink-3">No saved views yet.</p>
                ) : (
                  views.map((v) => (
                    <div key={v.name} className="flex items-center gap-1 px-2 py-1 hover:bg-[#EFE6D4] rounded">
                      <button onClick={() => applyView(v)} className="flex-1 text-left text-sm text-ink-1 truncate">{v.name}</button>
                      <button onClick={() => deleteView(v.name)} title="Delete view" className="w-5 h-5 text-ink-3 hover:text-expense leading-none">×</button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {enableCsv && (
          <button className={btn} onClick={exportCsv}>
            {selected.size > 0 ? `Export ${selected.size} (CSV)` : "Export CSV"}
          </button>
        )}

        <span className="text-xs text-ink-2 ml-auto [font-variant-numeric:tabular-nums]">
          {filtered.length} row{filtered.length === 1 ? "" : "s"}
          {search ? ` (filtered from ${rows.length})` : ""}
        </span>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && bulkActions && bulkActions.length > 0 && (
        <div className="px-4 py-2 bg-orange/10 border-b border-orange/20 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-orange">{selected.size} selected</span>
          {bulkActions.map((a) => (
            <button key={a.label} onClick={() => void a.run(selectedRows)} className={btn}>
              {a.label}
            </button>
          ))}
          <button onClick={() => setSelected(new Set())} className="text-xs text-ink-2 hover:text-ink-1 ml-auto">
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className={`p-8 ${TYPE.bodyMuted}`}>{emptyMessage}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline">
                {bulkActions && bulkActions.length > 0 && (
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} className="accent-orange" aria-label="Select all on page" />
                  </th>
                )}
                {visibleColumns.map((c) => {
                  const active = sort?.key === c.key;
                  const sortable = !!c.value && c.sortable !== false;
                  return (
                    <th
                      key={c.key}
                      onClick={sortable ? () => toggleSort(c.key) : undefined}
                      className={`text-xs font-semibold text-ink-3 uppercase tracking-widest px-5 py-3 whitespace-nowrap ${
                        c.align === "right" ? "text-right" : "text-left"
                      } ${sortable ? "cursor-pointer select-none hover:text-ink-1" : ""} ${c.thClassName ?? ""}`}
                      aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    >
                      {c.header}
                      {active ? <span className="text-orange ml-1">{sort!.dir === "asc" ? "↑" : "↓"}</span> : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const id = getRowId(row);
                return (
                  <tr key={id} className="border-b border-hairline hover:bg-[#EFE6D4] transition-colors">
                    {bulkActions && bulkActions.length > 0 && (
                      <td className="px-4 py-3.5">
                        <input type="checkbox" checked={selected.has(id)} onChange={() => toggleRow(id)} className="accent-orange" aria-label="Select row" />
                      </td>
                    )}
                    {visibleColumns.map((c) => (
                      <td key={c.key} className={`px-5 py-3.5 ${c.align === "right" ? "text-right" : ""} ${c.tdClassName ?? ""}`}>
                        {c.render ? c.render(row) : String(c.value?.(row) ?? "—")}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {filtered.length > 0 && (
        <div className="px-4 py-3 border-t border-outline flex flex-wrap items-center gap-3 text-xs text-ink-2">
          <label className="flex items-center gap-1.5">
            Rows
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
              className="bg-tile border-[1.5px] border-outline rounded-lg px-2 py-1 text-ink-1 focus:outline-none focus:border-orange/40"
            >
              {pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span className="[font-variant-numeric:tabular-nums]">
            {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, filtered.length)} of {filtered.length}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button className={btn} disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Prev</button>
            <span className="px-2 [font-variant-numeric:tabular-nums]">Page {safePage + 1} / {pageCount}</span>
            <button className={btn} disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
