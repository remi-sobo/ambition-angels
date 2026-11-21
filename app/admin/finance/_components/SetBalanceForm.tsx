"use client";

import { useState } from "react";
import Button from "@/app/admin/_components/ui/Button";
import { DateField, TextField } from "@/app/admin/_components/ui/Field";
import Notice from "@/app/admin/_components/ui/Notice";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
import { balanceDrift } from "@/lib/finance/dashboard";

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/**
 * "Set current balance": anchor cash to the real bank number (V4 Stage G2,
 * kit fields and saveAction). Shared by the snapshot's drawer and step 4 of
 * the Friday close. Money rule: no optimistic change; the figure updates
 * after the server confirms and the page re-reads.
 */
export default function SetBalanceForm({
  computedCash,
  anchorDate,
  onSaved,
  onCancel,
  layout = "stack",
}: {
  computedCash: number | null;
  anchorDate: string | null;
  onSaved: () => void;
  onCancel?: () => void;
  layout?: "stack" | "row";
}) {
  const save = useSaveAction();
  const today = new Date().toISOString().slice(0, 10);
  const [balance, setBalance] = useState("");
  const [asOf, setAsOf] = useState(today);
  const [busy, setBusy] = useState(false);

  const entered = balance.trim() === "" ? null : Number(balance.replace(/[$,\s]/g, ""));
  const valid = entered !== null && Number.isFinite(entered);
  const drift = valid && asOf === today && computedCash !== null ? balanceDrift(entered!, computedCash) : null;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    const r = await save({
      request: { url: "/api/admin/finance/reconcile", method: "POST", body: { balance: entered, as_of: asOf } },
      success: "Balance set",
    });
    setBusy(false);
    if (r.ok) {
      setBalance("");
      onSaved();
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        {computedCash !== null ? (
          <>
            BloomOS figures <span className="text-ink-1 font-semibold">{fmtMoney(computedCash)}</span>
            {anchorDate ? <> from the balance set on {anchorDate}</> : null}.{" "}
          </>
        ) : null}
        Enter the real balance from your bank. Cash on hand becomes this number plus any transactions dated after it.
      </p>
      <div className={layout === "row" ? "flex flex-wrap items-end gap-3" : "grid gap-4"}>
        <TextField
          label="Bank balance"
          required
          inputMode="decimal"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          placeholder={computedCash !== null ? String(Math.round(computedCash)) : "125000"}
          controlSize={layout === "row" ? "md" : "lg"}
          className={layout === "row" ? "w-44" : undefined}
        />
        <DateField
          label="As of"
          required
          value={asOf}
          onChange={(e) => setAsOf(e.target.value)}
          controlSize={layout === "row" ? "md" : "lg"}
        />
        {layout === "row" ? (
          <Button onClick={submit} disabled={!valid} loading={busy}>
            {busy ? "Saving" : "Set balance"}
          </Button>
        ) : null}
      </div>
      {drift && drift.kind === "gap" ? (
        <Notice tone="warning" title={`${fmtMoney(drift.amount)} ${drift.direction} than BloomOS figures.`}>
          A gap usually means some transactions are not imported yet. Setting the balance fixes cash on hand either way.
        </Notice>
      ) : drift && drift.kind === "match" ? (
        <Notice tone="success" title="Matches what BloomOS figures.">
          You are reconciled.
        </Notice>
      ) : null}
      {layout === "stack" ? (
        <div className="flex justify-end gap-2">
          {onCancel ? (
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          ) : null}
          <Button onClick={submit} disabled={!valid} loading={busy}>
            {busy ? "Saving" : "Set balance"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
