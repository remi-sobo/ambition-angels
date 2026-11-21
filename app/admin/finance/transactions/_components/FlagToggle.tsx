"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";

/**
 * One boolean flag on a transaction row (restricted, exclude from runway),
 * as a pressed/unpressed pill. Saves through saveAction with no optimistic
 * change (money rule): the pill flips when the server confirms.
 */
export default function FlagToggle({
  transactionId,
  field,
  initial,
  onLabel,
  offLabel,
  title,
  rowLabel,
}: {
  transactionId: string;
  field: "restricted" | "exclude_from_runway";
  initial: boolean;
  onLabel: string;
  offLabel: string;
  title: string;
  /** Spoken row name for the accessible label. */
  rowLabel: string;
}) {
  const router = useRouter();
  const save = useSaveAction();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !value;
    setBusy(true);
    const r = await save({
      request: { url: `/api/admin/finance/transactions/${transactionId}`, method: "PATCH", body: { [field]: next } },
    });
    setBusy(false);
    if (r.ok) {
      setValue(next);
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={value}
      aria-label={`${value ? onLabel : offLabel}: ${rowLabel}. ${title}`}
      title={title}
      className={`inline-flex items-center min-h-[32px] px-2.5 rounded-full border text-xs font-medium transition-colors ${
        value ? "border-accent bg-accent-soft text-orange-dark" : "border-hairline text-ink-2 hover:text-ink-1 hover:bg-tile"
      } ${busy ? "opacity-60 cursor-wait" : ""}`}
    >
      {value ? onLabel : offLabel}
    </button>
  );
}
