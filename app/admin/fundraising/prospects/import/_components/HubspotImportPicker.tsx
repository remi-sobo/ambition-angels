"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StaticTable } from "@/app/admin/_components/ui/DataTable";

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
      load(q, lifecycle, 0);
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q, lifecycle, load]);

  // Selection lives in the kit table; "Add to bench" is its bulk action.
  async function addSelected(ids: string[]) {
    if (!ids.length) return;
    setAdding(true);
    setFlash(null);
    try {
      const r = await fetch("/api/admin/fundraising/prospects/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hubspot_ids: ids }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "Import failed");
      const addedSet = new Set(ids);
      setRows((prev) => prev.filter((row) => !addedSet.has(row.hubspot_id)));
      setTotal((t) => (t == null ? t : Math.max(0, t - (d.added ?? 0))));
      setFlash(`Added ${d.added} to the bench${d.skipped ? ` · ${d.skipped} already there` : ""}.`);
      router.refresh();
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Import failed");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="search"
          aria-label="Search HubSpot contacts"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, or company…"
          className="flex-1 min-w-[220px] text-sm bg-cream border-hairline rounded-control px-3 py-2 text-ink-1 focus:outline-none focus:border-orange/50"
        />
        <select
          aria-label="Lifecycle stage"
          value={lifecycle}
          onChange={(e) => setLifecycle(e.target.value)}
          className="text-sm bg-cream border-hairline rounded-control px-2.5 py-2 text-ink-1 focus:outline-none focus:border-orange/50"
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
        <div className="bg-revenue-bg border border-revenue/30 rounded-panel px-4 py-2.5 text-sm text-revenue">{flash}</div>
      )}

      {/* Results */}
      {/* The kit table (V4 P1): select rows, then "Add to bench" in its
          footer; cards under 640px. Load more appends and keeps the
          selection. */}
      <div>
        <StaticTable
          label="HubSpot contacts not on the bench"
          noun={{ one: "contact", many: "contacts" }}
          rows={rows}
          getRowId={(c) => c.hubspot_id}
          getRowLabel={(c) => displayName(c)}
          emptyMessage={loading ? "Loading…" : "No matching HubSpot contacts left to add."}
          bulkActions={[{ kind: "run", key: "add", label: adding ? "Adding…" : "Add to bench", run: addSelected }]}
          columns={[
            { key: "name", header: "Name", card: "title", render: (c) => <span className="text-ink-1 font-medium">{displayName(c)}</span> },
            { key: "email", header: "Email", render: (c) => <span className="text-ink-2">{c.email ?? "—"}</span> },
            { key: "company", header: "Company", render: (c) => <span className="text-ink-2">{c.company ?? "—"}</span> },
            { key: "lifecycle", header: "Lifecycle", render: (c) => <span className="text-ink-3">{c.lifecycle_stage ?? "—"}</span> },
            { key: "activity", header: "Last activity", render: (c) => <span className="text-ink-3">{fmtDate(c.last_activity_at)}</span> },
          ]}
        />
        {loading && <div className="px-3 py-4 text-center text-ink-3 text-xs">Loading…</div>}
        {hasMore && !loading && (
          <button
            onClick={() => load(q, lifecycle, nextOffset)}
            className="w-full px-3 py-2.5 text-xs font-semibold text-ink-2 hover:text-ink-1 hover:bg-tile border-t border-hairline"
          >
            Load more
          </button>
        )}
      </div>

    </div>
  );
}
