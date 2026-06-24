"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Candidate = {
  hubspot_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company: string | null;
  lifecycle_stage: string | null;
  last_activity_at: string | null;
};

function displayName(c: Candidate): string {
  const n = [c.first_name, c.last_name].filter((s): s is string => !!s && s.length > 0).join(" ").trim();
  return n || c.email || "Unknown contact";
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function HubspotImportPicker({ lifecycles }: { lifecycles: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [lifecycle, setLifecycle] = useState("");
  const [rows, setRows] = useState<Candidate[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (search: string, lc: string, offset: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (lc) params.set("lifecycle", lc);
      params.set("offset", String(offset));
      const r = await fetch(`/api/admin/fundraising/prospects/hubspot-search?${params}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "Search failed");
      setRows((prev) => (offset === 0 ? d.rows : [...prev, ...d.rows]));
      if (offset === 0 && typeof d.total === "number") setTotal(d.total);
      setHasMore(!!d.hasMore);
      setNextOffset(d.nextOffset);
    } catch {
      if (offset === 0) setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + debounced reload on filter change.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setSelected(new Set());
      load(q, lifecycle, 0);
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q, lifecycle, load]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllVisible() {
    setSelected((prev) => {
      const visible = rows.map((r) => r.hubspot_id);
      const allOn = visible.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allOn) visible.forEach((id) => next.delete(id));
      else visible.forEach((id) => next.add(id));
      return next;
    });
  }

  async function addSelected() {
    if (!selected.size) return;
    setAdding(true);
    setFlash(null);
    try {
      const ids = Array.from(selected);
      const r = await fetch("/api/admin/fundraising/prospects/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hubspot_ids: ids }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "Import failed");
      const addedSet = new Set(ids);
      setRows((prev) => prev.filter((row) => !addedSet.has(row.hubspot_id)));
      setSelected(new Set());
      setTotal((t) => (t == null ? t : Math.max(0, t - (d.added ?? 0))));
      setFlash(`Added ${d.added} to the bench${d.skipped ? ` · ${d.skipped} already there` : ""}.`);
      router.refresh();
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Import failed");
    } finally {
      setAdding(false);
    }
  }

  const allVisibleOn = rows.length > 0 && rows.every((r) => selected.has(r.hubspot_id));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, or company…"
          className="flex-1 min-w-[220px] text-sm bg-cream border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 focus:outline-none focus:border-orange/50"
        />
        <select
          value={lifecycle}
          onChange={(e) => setLifecycle(e.target.value)}
          className="text-sm bg-cream border-[1.5px] border-outline rounded-lg px-2.5 py-2 text-ink-1 focus:outline-none focus:border-orange/50"
        >
          <option value="">All lifecycle stages</option>
          {lifecycles.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <span className="text-xs text-ink-3">
          {total != null ? `${total.toLocaleString()} match${total === 1 ? "" : "es"}` : ""}
        </span>
      </div>

      {flash && (
        <div className="bg-revenue-bg border border-revenue/30 rounded-xl px-4 py-2.5 text-sm text-revenue">{flash}</div>
      )}

      {/* Results */}
      <div className="rounded-card border-[1.5px] border-outline bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-ink-3 border-b border-hairline">
              <th className="w-10 px-3 py-2 text-left">
                <input type="checkbox" checked={allVisibleOn} onChange={toggleAllVisible} aria-label="Select all" />
              </th>
              <th className="px-3 py-2 text-left font-semibold">Name</th>
              <th className="px-3 py-2 text-left font-semibold">Email</th>
              <th className="px-3 py-2 text-left font-semibold">Company</th>
              <th className="px-3 py-2 text-left font-semibold">Lifecycle</th>
              <th className="px-3 py-2 text-left font-semibold">Last activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((c) => {
              const on = selected.has(c.hubspot_id);
              return (
                <tr
                  key={c.hubspot_id}
                  onClick={() => toggle(c.hubspot_id)}
                  className={`cursor-pointer ${on ? "bg-orange/5" : "hover:bg-[#EFE6D4]/40"}`}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={on} onChange={() => toggle(c.hubspot_id)} />
                  </td>
                  <td className="px-3 py-2 text-ink-1 font-medium">{displayName(c)}</td>
                  <td className="px-3 py-2 text-ink-2">{c.email ?? "—"}</td>
                  <td className="px-3 py-2 text-ink-2">{c.company ?? "—"}</td>
                  <td className="px-3 py-2 text-ink-3">{c.lifecycle_stage ?? "—"}</td>
                  <td className="px-3 py-2 text-ink-3">{fmtDate(c.last_activity_at)}</td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-ink-3 text-sm">
                  No matching HubSpot contacts left to add.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {loading && <div className="px-3 py-4 text-center text-ink-3 text-xs">Loading…</div>}
        {hasMore && !loading && (
          <button
            onClick={() => load(q, lifecycle, nextOffset)}
            className="w-full px-3 py-2.5 text-xs font-semibold text-ink-2 hover:text-ink-1 hover:bg-[#EFE6D4] border-t border-hairline"
          >
            Load more
          </button>
        )}
      </div>

      {/* Sticky action bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-full border-[1.5px] border-outline bg-ink text-cream px-5 py-2.5 shadow-lg">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <button
            onClick={addSelected}
            disabled={adding}
            className="text-xs font-semibold px-4 py-1.5 rounded-full bg-orange text-white hover:bg-orange-dark transition-colors disabled:opacity-60"
          >
            {adding ? "Adding…" : `Add ${selected.size} to bench`}
          </button>
        </div>
      )}
    </div>
  );
}
