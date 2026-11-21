"use client";

import { useState, useMemo } from "react";
import EmptyState from "../../../_components/EmptyState";
import type { FinCategory } from "@/lib/finance/types";
import { TYPE } from "@/lib/admin/typeScale";
import Figure, { SummaryStrip } from "@/app/admin/_components/ui/Figure";
import DataTable, { type DataTableColumn } from "@/app/admin/_components/ui/DataTable";
import Input from "@/app/admin/_components/ui/Input";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";

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

type AmountField = "base_amount" | "contingency_t1" | "contingency_t2" | "activated_contingency";

const SPEC = { sortable: [], defaultSort: null, pageSize: 500 } as const;

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function parseAmount(s: string): number {
  return s.trim() === "" ? 0 : Number(s.replace(/[$,\s]/g, ""));
}

// Inline budget editor (V4 Stage G2: one DataTable v2 per category group, a
// Figure strip with sources, labeled kit inputs). Typing stages a local edit;
// blur or Enter saves through saveAction. Money rule: no optimistic change.
// Totals move only after the server confirms, and a failed save puts the cell
// back and says so.
export default function BudgetEditor({ year, categories, initialBudget }: Props) {
  const save = useSaveAction();
  const expenseCats = useMemo(() => categories.filter((c) => c.kind === "expense"), [categories]);

  const [rows, setRows] = useState<Map<string, BudgetRow>>(() => {
    const byCat = new Map(initialBudget.map((r) => [r.category_id, r]));
    const m = new Map<string, BudgetRow>();
    for (const c of expenseCats) {
      m.set(
        c.id,
        byCat.get(c.id) ?? { year, category_id: c.id, base_amount: 0, contingency_t1: 0, contingency_t2: 0, activated_contingency: 0 },
      );
    }
    return m;
  });

  async function saveCell(categoryId: string, field: AmountField, value: number): Promise<boolean> {
    const r = await save({
      request: { url: "/api/admin/finance/budget", method: "POST", body: { year, category_id: categoryId, [field]: value } },
    });
    if (!r.ok) return false;
    setRows((m) => {
      const c = new Map(m);
      const ex = c.get(categoryId);
      if (ex) c.set(categoryId, { ...ex, [field]: value });
      return c;
    });
    return true;
  }

  const groups: Array<{ name: string; items: FinCategory[] }> = [];
  for (const c of expenseCats) {
    let g = groups.find((x) => x.name === c.group_name);
    if (!g) {
      g = { name: c.group_name, items: [] };
      groups.push(g);
    }
    g.items.push(c);
  }

  function totalFor(items: FinCategory[]) {
    let base = 0;
    let t1 = 0;
    let t2 = 0;
    let act = 0;
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

  if (expenseCats.length === 0) {
    return (
      <EmptyState
        label="budget lines"
        hint="The budget mirrors your category list. Import the workbook, or add categories under Finance settings and the lines appear here."
      />
    );
  }

  const grand = totalFor(expenseCats);
  const src = `Sum of ${expenseCats.length} spending lines in the ${year} budget, as saved`;

  const amountColumn = (field: AmountField, header: string): DataTableColumn<FinCategory> => ({
    key: field,
    header,
    align: "right",
    render: (c) => {
      const r = rows.get(c.id);
      return r ? (
        <AmountCell label={`${header} for ${c.display_name}`} value={r[field]} onSave={(v) => saveCell(c.id, field, v)} />
      ) : null;
    },
  });

  const columns: DataTableColumn<FinCategory>[] = [
    {
      key: "name",
      header: "Line item",
      card: "title",
      render: (c) => <span className="text-ink-1 font-semibold">{c.display_name}</span>,
    },
    amountColumn("base_amount", "Base"),
    amountColumn("contingency_t1", "Tier 1"),
    amountColumn("contingency_t2", "Tier 2"),
    amountColumn("activated_contingency", "Activated"),
  ];

  return (
    <div className="space-y-6">
      <SummaryStrip label="Budget totals">
        <Figure label="Total budget" value={`$${fmt(grand.total)}`} source={`Base plus activated contingency, ${year}`} />
        <Figure label="Base budget" value={`$${fmt(grand.base)}`} source={src} />
        <Figure label="Tier 1 contingency" value={`$${fmt(grand.t1)}`} source="Unlocks at the first fundraising threshold" />
        <Figure label="Tier 2 contingency" value={`$${fmt(grand.t2)}`} source="Unlocks at the second threshold" />
        <Figure label="Activated" value={`$${fmt(grand.act)}`} source="Contingency switched on so far" />
      </SummaryStrip>

      {groups.map((g) => {
        const t = totalFor(g.items);
        return (
          <section key={g.name} aria-label={g.name}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h2 className={TYPE.cardTitle}>{g.name}</h2>
              <p className="text-[13px] text-ink-2 tabular-nums">
                Base ${fmt(t.base)} · Tier 1 ${fmt(t.t1)} · Tier 2 ${fmt(t.t2)} · Activated ${fmt(t.act)}
              </p>
            </div>
            <DataTable
              label={`${g.name} budget lines`}
              noun={{ one: "line", many: "lines" }}
              columns={columns}
              data={{ rows: g.items, total: g.items.length, page: 0, pageSize: SPEC.pageSize }}
              getRowId={(c) => c.id}
              getRowLabel={(c) => c.display_name}
              spec={SPEC}
              state={{ page: 0, sort: null }}
              baseHref="/admin/finance/budget"
            />
          </section>
        );
      })}
    </div>
  );
}

function AmountCell({ label, value, onSave }: { label: string; value: number; onSave: (v: number) => Promise<boolean> }) {
  const shown = value === 0 ? "" : String(value);
  const [local, setLocal] = useState<string>(shown);
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);

  // Follow the saved value when not editing.
  if (!focused && !saving && local !== shown) setLocal(shown);

  async function commit() {
    const n = parseAmount(local);
    if (!Number.isFinite(n) || n < 0) {
      setLocal(shown);
      return;
    }
    const snapped = Math.round(n * 100) / 100;
    if (snapped === value) return;
    setSaving(true);
    const ok = await onSave(snapped);
    setSaving(false);
    if (!ok) setLocal(shown);
  }

  return (
    <Input
      aria-label={label}
      value={local}
      disabled={saving}
      aria-busy={saving || undefined}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        void commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setLocal(shown);
          (e.target as HTMLInputElement).blur();
        }
      }}
      inputMode="decimal"
      placeholder="0"
      className="w-28 text-right tabular-nums ml-auto"
    />
  );
}
