"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Shared admin DataTable (BloomOS design foundation, Phase 0B).
 *
 * One table component every list surface can adopt: click-to-sort headers,
 * client-side pagination, CSV export of the full (sorted) set, and a column
 * picker (show/hide + reorder) whose layout persists per user via
 * localStorage. Heavy data filtering stays server-side (URL params on the
 * page); this component owns presentation of the already-filtered rows.
 *
 * Scale note: sorting/paging happen client-side over the rows handed in. That
 * is the right call at the current scale (hundreds–low thousands). A surface
 * that outgrows that should switch to server-side range/sort behind the same
 * column model.
 */

export type Column<T> = {
  key: string;
  header: string;
  // Primitive used for sorting and CSV. Return null for "no value".
  value: (row: T) => string | number | null;
  // Optional rich cell; defaults to the stringified `value`.
  cell?: (row: T) => React.ReactNode;
  align?: "left" | "right";
  sortable?: boolean; // default true
  defaultHidden?: boolean; // off until enabled in the picker
  alwaysVisible?: boolean; // cannot be hidden (e.g. the name column)
};

type ColPref = { key: string; visible: boolean };

function csvCell(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function DataTable<T>({
  rows,
  columns,
  getRowKey,
  initialSort,
  pageSize = 25,
  csvFilename = "export.csv",
  storageKey,
  emptyMessage = "Nothing to show.",
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  getRowKey: (row: T) => string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  pageSize?: number;
  csvFilename?: string;
  storageKey?: string;
  emptyMessage?: string;
  caption?: React.ReactNode;
}) {
  const colByKey = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.key, c])),
    [columns]
  );

  // Column order + visibility (deterministic init; localStorage hydrates after mount).
  const defaultPrefs: ColPref[] = useMemo(
    () => columns.map((c) => ({ key: c.key, visible: !c.defaultHidden })),
    [columns]
  );
  const [prefs, setPrefs] = useState<ColPref[]>(defaultPrefs);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as ColPref[];
      const valid = saved.filter((p) => colByKey[p.key]);
      const missing = columns.filter((c) => !valid.some((p) => p.key === c.key));
      setPrefs([...valid, ...missing.map((c) => ({ key: c.key, visible: !c.defaultHidden }))]);
    } catch {
      /* ignore malformed prefs */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const persist = (next: ColPref[]) => {
    setPrefs(next);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* storage full / unavailable — keep in-memory */
      }
    }
  };

  const orderedCols = prefs
    .map((p) => colByKey[p.key])
    .filter(Boolean) as Column<T>[];
  const visibleKeys = new Set(
    prefs.filter((p) => p.visible || colByKey[p.key]?.alwaysVisible).map((p) => p.key)
  );
  const visibleCols = orderedCols.filter((c) => visibleKeys.has(c.key));

  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    initialSort ?? null
  );
  const [page, setPage] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = colByKey[sort.key];
    if (!col) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.value(a);
      const vb = col.value(b);
      if (va === null) return vb === null ? 0 : 1; // nulls last
      if (vb === null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [rows, sort, colByKey]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const paged = sorted.slice(start, start + pageSize);

  const toggleSort = (key: string) => {
    setPage(0);
    setSort((s) =>
      s && s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  };

  const exportCsv = () => {
    const header = visibleCols.map((c) => csvCell(c.header)).join(",");
    const body = sorted
      .map((r) => visibleCols.map((c) => csvCell(c.value(r))).join(","))
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...prefs];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    persist(next);
  };
  const toggleVisible = (key: string) => {
    persist(prefs.map((p) => (p.key === key ? { ...p, visible: !p.visible } : p)));
  };

  return (
    <div className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-outline">
        <span className="text-xs text-ink-2">
          {sorted.length === 0
            ? "0 rows"
            : `${start + 1}–${Math.min(start + pageSize, sorted.length)} of ${sorted.length}`}
        </span>
        <div className="flex items-center gap-2 relative">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile border-[1.5px] border-outline px-3 py-1.5 rounded-full transition-colors"
          >
            Columns
          </button>
          <button
            onClick={exportCsv}
            disabled={sorted.length === 0}
            className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile border-[1.5px] border-outline px-3 py-1.5 rounded-full transition-colors disabled:opacity-40"
          >
            Export CSV
          </button>
          {pickerOpen && (
            <div className="absolute right-0 top-full mt-2 z-40 w-60 bg-surface shadow-panel border-[1.5px] border-outline rounded-card p-2">
              <p className="text-[10px] uppercase tracking-widest text-ink-3 px-2 py-1">Columns</p>
              {orderedCols.map((c, i) => {
                const pref = prefs.find((p) => p.key === c.key)!;
                return (
                  <div key={c.key} className="flex items-center gap-2 px-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={pref.visible || !!c.alwaysVisible}
                      disabled={!!c.alwaysVisible}
                      onChange={() => toggleVisible(c.key)}
                      className="accent-orange"
                    />
                    <span className="flex-1 text-ink-1 truncate">{c.header}</span>
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="text-ink-3 hover:text-ink-1 disabled:opacity-30 px-1"
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === orderedCols.length - 1}
                      className="text-ink-3 hover:text-ink-1 disabled:opacity-30 px-1"
                      title="Move down"
                    >
                      ▼
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="p-8 text-ink-2 text-sm">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-outline">
                {visibleCols.map((c) => {
                  const sortable = c.sortable !== false;
                  const active = sort?.key === c.key;
                  return (
                    <th
                      key={c.key}
                      className={`text-${c.align ?? "left"} text-xs font-semibold text-ink-3 uppercase tracking-widest px-5 py-3 whitespace-nowrap ${
                        sortable ? "cursor-pointer select-none hover:text-ink-1" : ""
                      }`}
                      onClick={sortable ? () => toggleSort(c.key) : undefined}
                    >
                      {c.header}
                      {active ? (sort!.dir === "asc" ? " ↑" : " ↓") : sortable ? " ↕" : ""}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => (
                <tr key={getRowKey(r)} className="border-b border-hairline hover:bg-[#EFE6D4] transition-colors">
                  {visibleCols.map((c) => (
                    <td
                      key={c.key}
                      className={`px-5 py-3.5 ${c.align === "right" ? "text-right" : ""} ${
                        typeof c.value(r) === "number" ? "[font-variant-numeric:tabular-nums]" : ""
                      }`}
                    >
                      {c.cell ? c.cell(r) : c.value(r) ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {caption && <div className="px-5 py-3 border-t border-hairline text-xs text-ink-2">{caption}</div>}

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-outline">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile border-[1.5px] border-outline px-3 py-1.5 rounded-full transition-colors disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-xs text-ink-2">
            Page {safePage + 1} of {pageCount}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}
            className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile border-[1.5px] border-outline px-3 py-1.5 rounded-full transition-colors disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
