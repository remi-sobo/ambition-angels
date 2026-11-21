"use client";

import { useState } from "react";
import Figure from "@/app/admin/_components/ui/Figure";
import Button from "@/app/admin/_components/ui/Button";
import SetBalanceDrawer from "./SetBalanceDrawer";
import { cashFigure } from "@/lib/finance/dashboard";

// Cash on hand with "Set current balance" (V4 Stage G2: a kit Figure with its
// source and freshness, and the kit Drawer for the form). Shown on the import
// hub; the snapshot opens the same drawer from its header.
export default function ReconcileCard({
  computedCash,
  anchorDate,
  reconciledAt,
}: {
  computedCash: number;
  anchorDate: string | null;
  reconciledAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const fig = cashFigure({ cashOnHand: computedCash, anchorDate, reconciledAt, partial: false }, new Date(), "#");
  return (
    <>
      <Figure
        layout="card"
        label={fig.label}
        value={fig.value}
        source={fig.source}
        freshness={fig.freshness}
        onRefresh={() => setOpen(true)}
        action={
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            Set current balance
          </Button>
        }
      />
      <SetBalanceDrawer
        open={open}
        onClose={() => setOpen(false)}
        computedCash={fig.value === null ? null : computedCash}
        anchorDate={anchorDate}
      />
    </>
  );
}
