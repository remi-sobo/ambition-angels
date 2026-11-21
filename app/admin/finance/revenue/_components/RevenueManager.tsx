"use client";

// Revenue (V4 Stage G2): one Figure strip with sources, the expected inflows
// (committed and projected) and the money received this year on DataTable v2,
// and the manual commitment form in the kit Drawer. Every write goes through
// saveAction; money rule, nothing optimistic: the lists change after the
// server confirms and the page re-reads.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import type { RevenueScheduleRow } from "@/lib/finance/schedule";
import { TYPE } from "@/lib/admin/typeScale";
import Figure, { SummaryStrip } from "@/app/admin/_components/ui/Figure";
import DataTable, { type DataTableColumn } from "@/app/admin/_components/ui/DataTable";
import Drawer from "@/app/admin/_components/ui/Drawer";
import Button from "@/app/admin/_components/ui/Button";
import Badge, { type BadgeTone } from "@/app/admin/_components/ui/Badge";
import Notice from "@/app/admin/_components/ui/Notice";
import { CheckboxField, DateField, SelectField, TextField } from "@/app/admin/_components/ui/Field";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";

export type Commitment = {
  id: string;
  year: number;
  source_type: "foundation" | "individual" | "corporate" | "government" | "accelerator" | "earned" | "other";
  source_name: string;
  amount: number;
  status: "secured" | "projected" | "received";
  expected_date: string | null;
  probability: number | null;
  restricted: boolean;
  restricted_to: string | null;
  notes: string | null;
};

export type ReceivedGift = { id: string; label: string; date: string; amount: number };

const SOURCE_TYPES: Array<Commitment["source_type"]> = [
  "foundation",
  "individual",
  "corporate",
  "government",
  "accelerator",
  "earned",
  "other",
];

const SOURCE_LABEL: Record<string, string> = {
  pledge: "Pledge",
  grant: "Grant",
  pipeline: "Pipeline",
  commitment: "Commitment",
  manual: "Manual",
};
const SOURCE_TONE: Record<string, BadgeTone> = {
  pledge: "success",
  grant: "accent",
  pipeline: "neutral",
  commitment: "success",
  manual: "neutral",
};

const SPEC = { sortable: [], defaultSort: null, pageSize: 1000 } as const;

function money(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `$${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
const monthLabel = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
const dayLabel = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function RevenueManager({
  year,
  goal,
  scheduleRows,
  commitments,
  receivedGifts,
  receivedGiftsTotal,
}: {
  year: number;
  goal: number;
  scheduleRows: RevenueScheduleRow[];
  commitments: Commitment[];
  receivedGifts: ReceivedGift[];
  receivedGiftsTotal: number;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const save = useSaveAction();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [src, setSrc] = useState<Commitment["source_type"]>("foundation");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [stat, setStat] = useState<Commitment["status"]>("secured");
  const [prob, setProb] = useState("");
  const [date, setDate] = useState("");
  const [restricted, setRestricted] = useState(false);
  const [restrictedTo, setRestrictedTo] = useState("");

  const committedRows = [...scheduleRows].filter((r) => r.confidence === "committed").sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  const projectedRows = [...scheduleRows].filter((r) => r.confidence === "projected").sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  const committedTotal = committedRows.reduce((s, r) => s + r.gross_amount, 0);
  const projectedTotal = projectedRows.reduce((s, r) => s + r.weighted_amount, 0);

  // Received money = the gifts ledger only (the single source of truth). A
  // "received" manual commitment duplicates its eventual gift, so it isn't
  // counted or listed here: record landed money as a gift.
  const totalReceived = receivedGiftsTotal;
  const hard = totalReceived + committedTotal;
  const goalPct = goal > 0 ? (hard / goal) * 100 : 0;
  const goalPctProj = goal > 0 ? ((hard + projectedTotal) / goal) * 100 : 0;

  function resetForm() {
    setFormOpen(false);
    setEditingId(null);
    setSrc("foundation");
    setName("");
    setAmount("");
    setStat("secured");
    setProb("");
    setDate("");
    setRestricted(false);
    setRestrictedTo("");
    setError(null);
  }
  function startAdd() {
    resetForm();
    setFormOpen(true);
  }
  function startEdit(c: Commitment) {
    setEditingId(c.id);
    setSrc(c.source_type);
    setName(c.source_name);
    setAmount(String(c.amount));
    setStat(c.status);
    setProb(c.probability === null ? "" : String(Math.round(c.probability * 100)));
    setDate(c.expected_date ?? "");
    setRestricted(c.restricted);
    setRestrictedTo(c.restricted_to ?? "");
    setError(null);
    setFormOpen(true);
  }
  async function submit() {
    if (!name.trim() || !amount) {
      setError("Source name and amount are required.");
      return;
    }
    setBusy(true);
    setError(null);
    const fields = {
      source_type: src,
      source_name: name.trim(),
      amount: Number(amount.replace(/[$,\s]/g, "")),
      status: stat,
      probability: prob === "" ? null : Number(prob) / 100,
      expected_date: date || null,
      restricted,
      restricted_to: restricted ? restrictedTo : null,
    };
    const r = await save({
      request: {
        url: editingId ? `/api/admin/finance/revenue/${editingId}` : "/api/admin/finance/revenue",
        method: editingId ? "PATCH" : "POST",
        body: editingId ? fields : { year, ...fields },
      },
      success: editingId ? "Commitment saved" : "Commitment added",
      failure: false,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    resetForm();
    router.refresh();
  }
  async function remove(id: string) {
    const ok = await confirm({
      title: "Delete this commitment?",
      body: "Its scheduled revenue leaves the runway.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const r = await save({ request: { url: `/api/admin/finance/revenue/${id}`, method: "DELETE" }, success: "Commitment deleted" });
    setBusy(false);
    if (r.ok) router.refresh();
  }

  const manualFor = (r: RevenueScheduleRow) =>
    r.source_type === "manual" ? commitments.find((c) => c.id === r.source_id) ?? null : null;

  const scheduleColumns = (weighted: boolean): DataTableColumn<RevenueScheduleRow>[] => [
    {
      key: "label",
      header: "Inflow",
      card: "title",
      render: (r) => (
        <span className="min-w-0">
          <span className="text-ink-1 font-semibold">{r.label}</span>
          {r.needs_schedule ? (
            <span className="block text-xs text-status-watch-text">Awarded but not split into payments: counted as one lump</span>
          ) : null}
          {r.restricted ? (
            <span className="block text-xs text-status-watch-text">Restricted{r.restricted_to ? `: ${r.restricted_to}` : ""}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (r) => <Badge tone={SOURCE_TONE[r.source_type] ?? "neutral"}>{SOURCE_LABEL[r.source_type] ?? r.source_type}</Badge>,
    },
    { key: "month", header: "Expected", className: "text-ink-2 tabular-nums whitespace-nowrap", render: (r) => monthLabel(r.month) },
    {
      key: "amount",
      header: weighted ? "Weighted" : "Amount",
      align: "right",
      className: "tabular-nums",
      render: (r) =>
        weighted ? (
          <span className="text-ink-2" title={`${money(r.gross_amount)} ask, weighted`}>
            {money(r.weighted_amount)}
          </span>
        ) : (
          <span className="text-ink-1">{money(r.gross_amount)}</span>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (r) => {
        const manual = manualFor(r);
        return manual ? (
          <span className="inline-flex gap-1">
            <Button size="sm" variant="quiet" onClick={() => startEdit(manual)} aria-label={`Edit ${r.label}`}>
              Edit
            </Button>
            <Button size="sm" variant="quiet" onClick={() => void remove(manual.id)} disabled={busy} aria-label={`Delete ${r.label}`}>
              Delete
            </Button>
          </span>
        ) : (
          <span className="text-xs text-ink-2">From {SOURCE_LABEL[r.source_type] ?? "its source"}</span>
        );
      },
    },
  ];

  const giftColumns: DataTableColumn<ReceivedGift>[] = [
    { key: "label", header: "From", card: "title", render: (g) => <span className="text-ink-1">{g.label}</span> },
    { key: "date", header: "Date", className: "text-ink-2 tabular-nums", render: (g) => dayLabel(g.date) },
    { key: "amount", header: "Amount", align: "right", className: "tabular-nums text-status-healthy-text font-semibold", render: (g) => money(g.amount) },
  ];

  return (
    <div className="space-y-6">
      <SummaryStrip label="Revenue figures">
        <Figure label="Received" value={money(totalReceived)} source={`From the gifts ledger, ${year} so far`} />
        <Figure label="Committed" value={money(committedTotal)} source="Signed, not yet in the bank, at full value" />
        <Figure label="Projected" value={money(projectedTotal)} source="Open pipeline, weighted by chance of closing" />
        <Figure
          label="Toward the goal"
          value={goal > 0 ? `${goalPct.toFixed(0)}%` : null}
          compare={goal > 0 ? `${goalPctProj.toFixed(0)}% with pipeline` : undefined}
          source={goal > 0 ? `Received plus committed, of the ${money(goal)} goal` : "Set a fundraising goal in finance settings"}
        />
      </SummaryStrip>

      <section aria-labelledby="inflows-title">
        <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 id="inflows-title" className={TYPE.cardTitle}>
              Expected inflows
            </h3>
            <p className={`${TYPE.bodyMuted} mt-1 max-w-reading`}>
              Dated money still to come. Grants, pledges and pipeline flow in on their own; rows marked Manual are one-offs
              added here.
            </p>
          </div>
          <Button variant="secondary" onClick={startAdd}>
            Add a commitment
          </Button>
        </div>
        {committedRows.length === 0 && projectedRows.length === 0 ? (
          <p className={`${TYPE.bodyMuted} bg-surface border border-hairline rounded-panel p-6`}>
            No dated inflows yet. Awarded grants, scheduled pledges and weighted pipeline appear here once they have an amount and a
            date.
          </p>
        ) : (
          <div className="space-y-4">
            {committedRows.length > 0 ? (
              <div>
                <p className="text-[13px] text-ink-2 mb-2">
                  <span className="font-semibold text-ink-1">Committed, {money(committedTotal)}.</span> Grants, pledges and signed
                  commitments at full value.
                </p>
                <DataTable
                  label="Committed inflows"
                  noun={{ one: "inflow", many: "inflows" }}
                  columns={scheduleColumns(false)}
                  data={{ rows: committedRows, total: committedRows.length, page: 0, pageSize: SPEC.pageSize }}
                  getRowId={(r) => `${r.source_type}-${r.source_id}-${r.month}`}
                  getRowLabel={(r) => r.label}
                  spec={SPEC}
                  state={{ page: 0, sort: null }}
                  baseHref="/admin/finance/forecast"
                />
              </div>
            ) : null}
            {projectedRows.length > 0 ? (
              <div>
                <p className="text-[13px] text-ink-2 mb-2">
                  <span className="font-semibold text-ink-1">Projected pipeline, {money(projectedTotal)}.</span> Open asks,
                  weighted by their chance of closing, not committed yet.
                </p>
                <DataTable
                  label="Projected pipeline"
                  noun={{ one: "ask", many: "asks" }}
                  columns={scheduleColumns(true)}
                  data={{ rows: projectedRows, total: projectedRows.length, page: 0, pageSize: SPEC.pageSize }}
                  getRowId={(r) => `${r.source_type}-${r.source_id}-${r.month}`}
                  getRowLabel={(r) => r.label}
                  spec={SPEC}
                  state={{ page: 0, sort: null }}
                  baseHref="/admin/finance/forecast"
                />
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section aria-labelledby="received-title">
        <h3 id="received-title" className={TYPE.cardTitle}>
          Received this year
        </h3>
        <p className={`${TYPE.bodyMuted} mt-1 mb-3`}>
          Money that has landed in {year}, from the gifts ledger (HubSpot closed-won and manual gifts both land there).
        </p>
        <DataTable
          label={`Received in ${year}`}
          noun={{ one: "gift", many: "gifts" }}
          columns={giftColumns}
          data={{ rows: receivedGifts, total: receivedGifts.length, page: 0, pageSize: SPEC.pageSize }}
          getRowId={(g) => g.id}
          getRowLabel={(g) => g.label}
          spec={SPEC}
          state={{ page: 0, sort: null }}
          baseHref="/admin/finance/forecast"
          emptyMessage="Nothing received yet this year."
        />
      </section>

      <Drawer
        open={formOpen}
        onClose={resetForm}
        title={editingId ? "Edit commitment" : "Add a commitment"}
        description="A one-off inflow that is not a grant, pledge or open ask. It counts toward runway once it has a date."
        footer={
          <>
            <Button variant="secondary" onClick={resetForm} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!name || !amount} loading={busy}>
              {busy ? "Saving" : editingId ? "Save changes" : "Add commitment"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {error ? (
            <Notice tone="danger" title="Not saved.">
              {error}
            </Notice>
          ) : null}
          <TextField label="Source name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Harlow Family Fund" />
          <TextField label="Amount" required value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="50000" />
          <DateField label="Expected date" value={date} onChange={(e) => setDate(e.target.value)} hint="Undated money is left out of runway." />
          <SelectField
            label="Status"
            value={stat}
            onChange={(e) => setStat(e.target.value as Commitment["status"])}
            options={[
              { value: "secured", label: "Secured" },
              { value: "projected", label: "Projected" },
            ]}
          />
          {stat === "projected" ? (
            <TextField label="Chance it closes (%)" value={prob} onChange={(e) => setProb(e.target.value)} inputMode="decimal" placeholder="50" />
          ) : null}
          <SelectField
            label="Source type"
            value={src}
            onChange={(e) => setSrc(e.target.value as Commitment["source_type"])}
            options={SOURCE_TYPES.map((s) => ({ value: s, label: cap(s) }))}
          />
          <CheckboxField label="Restricted to a purpose" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
          {restricted ? (
            <TextField label="Restricted to" value={restrictedTo} onChange={(e) => setRestrictedTo(e.target.value)} placeholder="Summer program" />
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}
