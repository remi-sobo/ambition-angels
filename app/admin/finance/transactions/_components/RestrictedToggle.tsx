"use client";

import FlagToggle from "./FlagToggle";

// Inline "restricted funds" toggle. Money given for a specific program cannot
// be spent on general operations, and the 990 reports net assets with and
// without donor restrictions.
export default function RestrictedToggle({
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
      field="restricted"
      initial={initial}
      onLabel="Restricted"
      offLabel="Unrestricted"
      title={initial ? "Restricted to a specific purpose" : "Can be spent on anything"}
      rowLabel={rowLabel}
    />
  );
}
