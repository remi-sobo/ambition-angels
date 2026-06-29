"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect } from "react";
import type { FinCategory } from "@/lib/finance/types";

type Props = {
  categories: FinCategory[];
};

// URL-driven filter bar. Re-renders the server page when any input changes;
// search input is debounced so each keystroke doesn't fire a route change.
export default function TransactionFilters({ categories }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const [q, setQ] = useState(sp.get("q") ?? "");
  // Free-text and date inputs are held in local state and pushed to the URL on
  // a debounce. Binding them straight to the search param makes the controlled
  // value lag router.replace() (which is async), so the field snaps back to its
  // old value mid-edit — you type a date and it "resets". Local state is the
  // source of truth while editing; the URL catches up after a pause.
  const [dateFrom, setDateFrom] = useState(sp.get("from") ?? "");
  const [dateTo, setDateTo] = useState(sp.get("to") ?? "");
  const category = sp.get("category") ?? "";
  const status = sp.get("status") ?? "";

  const apply = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === "") next.delete(k);
        else next.set(k, v);
      }
      // Any filter change resets to page 1.
      next.delete("page");
      router.replace(`/admin/finance/transactions?${next.toString()}`);
    },
    [router, sp]
  );

  // Debounce the search input — 300ms after the last keystroke pushes a new
  // URL. Lower than that and we'd ping the server on every key.
  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== (sp.get("q") ?? "")) apply({ q });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Same debounce for the date range — a complete date pushes to the URL after
  // a short pause instead of on every keystroke, so editing a segment never
  // triggers a mid-edit route change.
  useEffect(() => {
    const t = setTimeout(() => {
      if (dateFrom !== (sp.get("from") ?? "")) apply({ from: dateFrom });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (dateTo !== (sp.get("to") ?? "")) apply({ to: dateTo });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateTo]);

  // Group categories the same way the picker does — by group_name in source
  // order.
  const groups: Array<{ name: string; items: FinCategory[] }> = [];
  for (const c of categories) {
    let g = groups.find((x) => x.name === c.group_name);
    if (!g) {
      g = { name: c.group_name, items: [] };
      groups.push(g);
    }
    g.items.push(c);
  }

  return (
    <div className="rounded-card border-[1.5px] border-outline bg-surface shadow-panel p-4 mb-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-2">
          <label className="block text-[10px] uppercase tracking-wider text-ink-2 mb-1">
            Search
          </label>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="description"
            className="w-full bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-ink-2 mb-1">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => apply({ category: e.target.value })}
            className="w-full bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1"
          >
            <option value="">All</option>
            <option value="uncategorized">— Uncategorized —</option>
            {groups.map((g) => (
              <optgroup key={g.name} label={g.name}>
                {g.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-ink-2 mb-1">
            From
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-ink-2 mb-1">
            To
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {[
          { label: "All", value: "" },
          { label: "Inflows", value: "inflow" },
          { label: "Outflows", value: "outflow" },
          { label: "Restricted", value: "restricted" },
        ].map((s) => (
          <button
            key={s.label}
            onClick={() => apply({ status: s.value })}
            className={`text-xs px-2.5 py-1 rounded-full border ${
              status === s.value
                ? "border-orange/60 bg-orange/15 text-orange"
                : "border-outline text-ink-2 hover:text-ink-1"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
