"use client";

import FlagToggle from "./FlagToggle";

// Inline "exclude from runway" toggle. Takes a one-off outlay, pass-through or
// reimbursement out of month-to-date spend and the burn baseline. The dollar
// still counts in year-to-date totals and the cash chart; only runway ignores it.
export default function ExcludeFromRunwayToggle({
  transactionId,
  initial,
  rowLabel,
}: {
  transactionId: string;
  initial: boolean;
  rowLabel: string;
}) {
  return (
    <FlagToggle
      transactionId={transactionId}
      field="exclude_from_runway"
      initial={initial}
      onLabel="Left out of runway"
      offLabel="In runway"
      title="Left out of runway and burn. Still counts in year-to-date totals and the cash chart."
      rowLabel={rowLabel}
    />
  );
}
