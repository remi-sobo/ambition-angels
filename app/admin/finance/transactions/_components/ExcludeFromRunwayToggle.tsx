"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  transactionId: string;
  initial: boolean;
};

// Inline "exclude from runway" toggle. Flips a transaction out of (or back into)
// month-to-date spend and the burn baseline — useful for one-off capital
// outlays, pass-throughs, or reimbursements that would otherwise distort the
// runway. The dollar still counts in YTD totals and the cash-flow chart; only
// the runway math ignores it. Refreshes so the dashboard tiers re-read.
export default function ExcludeFromRunwayToggle({ transactionId, initial }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !value;
    setBusy(true);
    setValue(next);
    const r = await fetch(`/api/admin/finance/transactions/${transactionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exclude_from_runway: next }),
    });
    if (!r.ok) {
      setValue(!next); // roll back
    } else {
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${
        value
          ? "border-[#A56A1B]/60 bg-[#A56A1B]/15 text-[#A56A1B]"
          : "border-outline text-ink-2 hover:text-ink-1"
      } ${busy ? "opacity-50" : ""}`}
      title={
        value
          ? "Excluded from runway/burn — still counts in YTD and the cash-flow chart"
          : "Counted in runway/burn"
      }
    >
      {value ? "off-runway" : "in runway"}
    </button>
  );
}
