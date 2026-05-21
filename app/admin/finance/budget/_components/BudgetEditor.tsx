"use client";

import { useState, useMemo } from "react";
import type { FinCategory } from "@/lib/finance/types";

export type BudgetRow = {
  year: number;
  category_id: string;
  base_amount: number;
  contingency_t1: number;
  contingency_t2: number;
  activated_contingency: number;
};

type Props = {
  year: number;
  categories: FinCategory[];
  initialBudget: BudgetRow[];
};

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// Inline budget editor. One row per category, grouped by group_name. The
// four amount columns are edit-on-blur — typing into a cell stages a local
// edit, blur or Enter commits via POST. Group totals and grand totals are
// derived from local state so the table updates immediately.
export default function BudgetEditor({ year, categories, initialBudget }: Props) {
  // Expense categories only — revenue and transfers don't belong in budget.
  const expenseCats = useMemo(
    () => categories.filter((c) => c.kind === "expense"),
    [categories]
  );

  const initialByCat = useMemo(() => {
    const map = new Map<string, BudgetRow>();
    for (const r of initialBudget) map.set(r.category_id, r);
    return map;
  }, [initialBudget]);

  const [rows, setRows] = useState<Map<string, BudgetRow>>(() => {
    const m = new Map<string, BudgetRow>();
    for (const c of expenseCats) {
      m.set(
        c.id,
        initialByCat.get(c.id) ?? {
          year,
          category_id: c.id,
          base_amount: 0,
          contingency_t1: 0,
          contingency_t2: 0,
          activated_contingency: 0,
        }
      );
    }
    return m;
  });

  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  async function save(category_id: string, patch: Partial<BudgetRow>) {
    const existing = rows.get(category_id);
    if (!existing) return;
    const next = { ...existing, ...patch };
    setRows((m) => {
      const c = new Map(m);
      c.set(category_id, next);
      return c;
    });
    setSavingId(category_id);
    setErrorId(null);
    const r = await fetch("/api/admin/finance/budget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, category_id, ...patch }),
    });
    setSavingId(null);
    if (!r.ok) setErrorId(category_id);
  }

  // Build the grouped view.
  const groups: Array<{ name: string; items: FinCategory[] }> = [];
  for (const c of expenseCats) {
    let g = groups.find((x) => x.name === c.group_name);
    if (!g) {
      g = { name: c.group_name, items: [] };
      groups.push(g);
    }
    g.items.push(c);
  }

  function totalFor(items: FinCategory[]): { base: number; t1: number; t2: number; act: number; total: number } {
    let base = 0, t1 = 0, t2 = 0, act = 0;
    for (const c of items) {
      const r = rows.get(c.id);
      if (!r) continue;
      base += r.base_amount;
      t1 += r.contingency_t1;
      t2 += r.contingency_t2;
      act += r.activated_contingency;
    }
    return { base, t1, t2, act, total: base + act };
  }

  const grand = totalFor(expenseCats);

  return (
    <div className="space-y-6">
      {/* Grand total card */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Base budget" value={`$${fmt(grand.base)}`} accent />
        <Stat label="Tier 1 contingency" value={`$${fmt(grand.t1)}`} />
        <Stat label="Tier 2 contingency" value={`$${fmt(grand.t2)}`} />
        <Stat label="Activated" value={`$${fmt(grand.act)}`} accent />
      </div>
      <div className="rounded-card border border-orange/30 bg-orange/5 p-4 text-sm flex items-baseline justify-between flex-wrap gap-2">
        <span className="text-cream/80">Total budget ({year}, base + activated)</span>
        <span className="font-display font-black text-2xl text-orange leading-none">
          ${fmt(grand.total)}
        </span>
      </div>

      {/* Editor table */}
      <div className="rounded-card-lg border border-white/10 bg-white/[0.02] overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-white/[0.03] text-gray-mid uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2.5">Line item</th>
              <th className="text-right px-3 py-2.5 w-32">Base</th>
              <th className="text-right px-3 py-2.5 w-32">Tier 1</th>
              <th className="text-right px-3 py-2.5 w-32">Tier 2</th>
              <th className="text-right px-3 py-2.5 w-32">Activated</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const t = totalFor(g.items);
              return (
                <GroupBlock
                  key={g.name}
                  name={g.name}
                  items={g.items}
                  rows={rows}
                  totals={t}
                  savingId={savingId}
                  errorId={errorId}
                  onSave={save}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type GroupTotals = { base: number; t1: number; t2: number; act: number; total: number };

function GroupBlock({
  name,
  items,
  rows,
  totals,
  savingId,
  errorId,
  onSave,
}: {
  name: string;
  items: FinCategory[];
  rows: Map<string, BudgetRow>;
  totals: GroupTotals;
  savingId: string | null;
  errorId: string | null;
  onSave: (id: string, patch: Partial<BudgetRow>) => void;
}) {
  return (
    <>
      <tr className="bg-white/[0.04] border-t-2 border-white/10">
        <td className="px-3 py-2 text-[10px] uppercase tracking-widest text-orange font-medium">
          {name}
        </td>
        <td className="px-3 py-2 text-right text-cream/70 font-mono">
          ${fmt(totals.base)}
        </td>
        <td className="px-3 py-2 text-right text-cream/70 font-mono">
          ${fmt(totals.t1)}
        </td>
        <td className="px-3 py-2 text-right text-cream/70 font-mono">
          ${fmt(totals.t2)}
        </td>
        <td className="px-3 py-2 text-right text-cream/70 font-mono">
          ${fmt(totals.act)}
        </td>
      </tr>
      {items.map((c) => {
        const r = rows.get(c.id);
        if (!r) return null;
        return (
          <tr key={c.id} className="border-t border-white/5">
            <td className="px-3 py-1.5 text-cream/85">
              <div className="flex items-center gap-2">
                <span>{c.display_name}</span>
                {savingId === c.id && (
                  <span className="text-[10px] text-gray-mid">saving…</span>
                )}
                {errorId === c.id && (
                  <span className="text-[10px] text-red-300">save failed</span>
                )}
              </div>
            </td>
            <AmountCell value={r.base_amount} onSave={(v) => onSave(c.id, { base_amount: v })} />
            <AmountCell value={r.contingency_t1} onSave={(v) => onSave(c.id, { contingency_t1: v })} />
            <AmountCell value={r.contingency_t2} onSave={(v) => onSave(c.id, { contingency_t2: v })} />
            <AmountCell value={r.activated_contingency} onSave={(v) => onSave(c.id, { activated_contingency: v })} />
          </tr>
        );
      })}
    </>
  );
}

function AmountCell({
  value,
  onSave,
}: {
  value: number;
  onSave: (v: number) => void;
}) {
  const [local, setLocal] = useState<string>(value === 0 ? "" : String(value));
  const [focused, setFocused] = useState(false);

  // Keep local in sync if parent value changes externally (e.g. another tab
  // committed a save).
  if (!focused && local !== (value === 0 ? "" : String(value))) {
    setLocal(value === 0 ? "" : String(value));
  }

  function commit() {
    const n = local.trim() === "" ? 0 : Number(local.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      setLocal(value === 0 ? "" : String(value));
      return;
    }
    const snapped = Math.round(n * 100) / 100;
    if (snapped !== value) onSave(snapped);
  }

  return (
    <td className="px-3 py-1.5 text-right">
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setLocal(value === 0 ? "" : String(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
        inputMode="decimal"
        placeholder="0"
        className="w-24 bg-transparent border border-transparent hover:border-white/10 focus:border-orange/60 focus:bg-ink rounded px-1.5 py-1 text-right font-mono text-cream/85"
      />
    </td>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-mid mb-1">{label}</div>
      <div className={`text-lg font-medium ${accent ? "text-orange" : "text-cream"}`}>
        {value}
      </div>
    </div>
  );
}
