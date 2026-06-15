"use client";

import { useState } from "react";

type Props = {
  transactionId: string;
  initial: boolean;
};

// Inline "restricted funds" boolean toggle. Restricted-fund tracking matters
// for nonprofit accounting — money given for a specific program cannot be
// spent on general operations, and the 990 reports on net assets with/
// without donor restrictions. We expose this as a one-click pill that
// flips state; the restricted_to label is editable on the row's detail
// flow (not in this PR).
export default function RestrictedToggle({ transactionId, initial }: Props) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !value;
    setBusy(true);
    setValue(next);
    const r = await fetch(`/api/admin/finance/transactions/${transactionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restricted: next }),
    });
    if (!r.ok) {
      setValue(!next); // roll back
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
          ? "border-orange/60 bg-orange/15 text-orange"
          : "border-outline text-ink-2 hover:text-ink-1 hover:border-outline"
      } ${busy ? "opacity-50" : ""}`}
      title={value ? "Restricted to a specific purpose" : "Unrestricted"}
    >
      {value ? "restricted" : "unrestricted"}
    </button>
  );
}
