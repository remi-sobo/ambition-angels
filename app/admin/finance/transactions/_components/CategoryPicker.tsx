"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FinCategory } from "@/lib/finance/types";
import { Select } from "@/app/admin/_components/ui/Input";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
import CategoryOptions from "../../_components/CategoryOptions";

type Props = {
  transactionId: string;
  initialCategoryId: string | null;
  categories: FinCategory[];
  /** Spoken row name: "Category for Zoom subscription, Nov 18". */
  label: string;
};

// Inline category picker on a transaction row. A labeled kit Select with
// <optgroup> by group_name. Saves through saveAction and is NOT optimistic
// (the money rule): the select shows the saved value only once the server
// says so, and a failure toasts and leaves the old value in place.
export default function CategoryPicker({ transactionId, initialCategoryId, categories, label }: Props) {
  const router = useRouter();
  const save = useSaveAction();
  const [value, setValue] = useState<string>(initialCategoryId ?? "");
  const [saving, setSaving] = useState(false);

  async function onChange(next: string) {
    setSaving(true);
    const r = await save({
      request: {
        url: `/api/admin/finance/transactions/${transactionId}`,
        method: "PATCH",
        body: { category_id: next === "" ? null : next },
      },
      success: "Category saved",
    });
    setSaving(false);
    if (r.ok) {
      setValue(next);
      router.refresh();
    }
  }

  return (
    <Select
      aria-label={label}
      value={value}
      disabled={saving}
      aria-busy={saving || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full max-w-[15rem] text-[13px] ${value === "" ? "!border-status-watch/60 text-status-watch-text" : ""}`}
    >
      <option value="">Uncategorized</option>
      <CategoryOptions categories={categories} />
    </Select>
  );
}
