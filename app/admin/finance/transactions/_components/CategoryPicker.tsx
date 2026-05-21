"use client";

import { useState, useTransition } from "react";
import type { FinCategory } from "@/lib/finance/types";

type Props = {
  transactionId: string;
  initialCategoryId: string | null;
  categories: FinCategory[];
};

// Inline category picker. Native <select> with <optgroup> by group_name —
// 75ish categories is small enough that a custom combobox would be a
// downgrade, and native selects are accessible by default. Save is fire-
// and-forget with optimistic local state and an inline status hint.
export default function CategoryPicker({
  transactionId,
  initialCategoryId,
  categories,
}: Props) {
  const [value, setValue] = useState<string>(initialCategoryId ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, startTransition] = useTransition();

  // Group categories by group_name in source order so optgroups follow the
  // taxonomy order from fin_categories.sort_order.
  const groups: Array<{ name: string; items: FinCategory[] }> = [];
  for (const c of categories) {
    let g = groups.find((x) => x.name === c.group_name);
    if (!g) {
      g = { name: c.group_name, items: [] };
      groups.push(g);
    }
    g.items.push(c);
  }

  async function save(next: string) {
    setValue(next);
    setStatus("saving");
    const r = await fetch(`/api/admin/finance/transactions/${transactionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: next === "" ? null : next }),
    });
    if (!r.ok) {
      setStatus("error");
      return;
    }
    setStatus("saved");
    startTransition(() => {
      // Brief "Saved" hint, then reset.
      setTimeout(() => setStatus("idle"), 1200);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => save(e.target.value)}
        className={`bg-ink border rounded px-2 py-1 text-xs text-cream max-w-[14rem] ${
          value === ""
            ? "border-amber-400/40 text-amber-200"
            : "border-white/10"
        }`}
      >
        <option value="">— Uncategorized —</option>
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
      {status === "saving" && (
        <span className="text-[10px] text-gray-mid">saving…</span>
      )}
      {status === "saved" && (
        <span className="text-[10px] text-emerald-300">saved</span>
      )}
      {status === "error" && (
        <span className="text-[10px] text-red-300">error</span>
      )}
    </div>
  );
}
