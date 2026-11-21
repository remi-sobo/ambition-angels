"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
import Button from "@/app/admin/_components/ui/Button";

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
    <Button
      size="sm"
      variant={value ? "strong" : "secondary"}
      onClick={toggle}
      loading={busy}
      aria-pressed={value}
      aria-label={`${value ? onLabel : offLabel}: ${rowLabel}. ${title}`}
      title={title}
    >
      {value ? onLabel : offLabel}
    </Button>
  );
}
