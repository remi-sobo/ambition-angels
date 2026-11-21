"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { money } from "../../_components/charts";
import RunwayTiers from "../../_components/RunwayTiers";
import SetBalanceForm from "../../_components/SetBalanceForm";
import type { RunwayPledge } from "@/lib/finance/runway";
import { TYPE } from "@/lib/admin/typeScale";
import Button from "@/app/admin/_components/ui/Button";
import Badge, { type BadgeTone } from "@/app/admin/_components/ui/Badge";
import Notice from "@/app/admin/_components/ui/Notice";
import { TextField } from "@/app/admin/_components/ui/Field";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";

type Horizon = 3 | 6 | 12;

// The Friday close (V4 Stage G2: kit Buttons, Badges, Fields; every write
// through saveAction, none optimistic). Freshness: current when touched within
// a week, out of date after, "never" when it has not happened.
function freshness(iso: string | null): { label: string; tone: BadgeTone } {
  if (!iso) return { label: "never", tone: "neutral" };
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  const label = days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  return { label, tone: days > 7 ? "warning" : "success" };
}

export default function CloseWizard(props: {
  lastImportAt: string | null;
  lastSyncAt: string | null;
  lastBalanceAt: string | null;
  lastClosedAt: string | null;
  uncategorizedCount: number;
  cashOnHand: number;
  anchorDate: string | null;
  baseline: number | null;
  burn3mo: number;
  runwayInputs: {
    baseline: number;
    baselineSource: "config" | "trailing";
    bankBalance: number;
    mtdSpend: number;
  };
  endCurrentMonth: string;
  horizonEnds: Record<Horizon, string>;
  defaultHorizon: number;
  runwayPledges: RunwayPledge[];
}) {
  const router = useRouter();
  const imp = freshness(props.lastImportAt);
  const sync = freshness(props.lastSyncAt);
  const bal = freshness(props.lastBalanceAt);

  return (
    <ol className="space-y-3">
      <Step n={1} title="Import the bank CSV" status={<Badge tone={imp.tone}>Last import {imp.label}</Badge>}>
        <p className={`${TYPE.bodyMuted} mb-3`}>
          Upload this week&apos;s bank export. New transactions are de-duplicated and categorized on import.
        </p>
        <Button variant="secondary" href="/admin/settings/finance/upload">
          Open importer
        </Button>
      </Step>

      <Step
        n={2}
        title="Clear uncategorized"
        status={
          props.uncategorizedCount === 0 ? (
            <Badge tone="success">All categorized</Badge>
          ) : (
            <Badge tone="warning">{props.uncategorizedCount} to review</Badge>
          )
        }
      >
        <p className={`${TYPE.bodyMuted} mb-3`}>
          Uncategorized spending still counts toward burn, but the budget and the program, admin and fundraising split
          need a category.
        </p>
        <Button variant="secondary" href="/admin/finance/transactions?category=uncategorized">
          {props.uncategorizedCount === 0 ? "Review transactions" : `Categorize ${props.uncategorizedCount}`}
        </Button>
      </Step>

      <Step n={3} title="Sync and confirm pledges" status={<Badge tone={sync.tone}>HubSpot synced {sync.label}</Badge>}>
        <p className={`${TYPE.bodyMuted} mb-3`}>
          Refresh HubSpot, then fix stale dates or amounts. Pledges count at full value toward the due and projected
          tiers; restricted and undated ones do not.
        </p>
        <Button variant="secondary" href="/admin/finance/forecast">
          Open pledges
        </Button>
      </Step>

      <Step n={4} title="Set the bank balance" status={<Badge tone={bal.tone}>Balance set {bal.label}</Badge>}>
        <SetBalanceForm
          computedCash={props.cashOnHand}
          anchorDate={props.anchorDate}
          onSaved={() => router.refresh()}
          layout="row"
        />
      </Step>

      <Step
        n={5}
        title="Confirm the burn baseline"
        status={
          props.baseline != null ? (
            <Badge tone="success">{money(props.baseline)} a month set</Badge>
          ) : (
            <Badge tone="warning">Using the {money(props.burn3mo)} 3-month average</Badge>
          )
        }
      >
        <BaselineForm baseline={props.baseline} burn3mo={props.burn3mo} onSaved={() => router.refresh()} />
      </Step>

      <Step n={6} title="Review and stamp the close" status={null}>
        <p className={`${TYPE.bodyMuted} mb-4`}>
          Runway as it stands now. If it looks right, stamp the close so every screen shows the figures as reconciled
          today.
        </p>
        <RunwayTiers
          baseline={props.runwayInputs.baseline}
          baselineSource={props.runwayInputs.baselineSource}
          bankBalance={props.runwayInputs.bankBalance}
          mtdSpend={props.runwayInputs.mtdSpend}
          endCurrentMonth={props.endCurrentMonth}
          horizonEnds={props.horizonEnds}
          defaultHorizon={props.defaultHorizon}
          pledges={props.runwayPledges}
          framed={false}
        />
        <StampButton lastClosedAt={props.lastClosedAt} onStamped={() => router.refresh()} />
      </Step>
    </ol>
  );
}

function Step({ n, title, status, children }: { n: number; title: string; status: ReactNode; children: ReactNode }) {
  return (
    <li className="bg-surface border border-hairline rounded-panel p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold bg-tile text-ink-1 border border-hairline"
          >
            {n}
          </span>
          <h3 className={TYPE.cardTitle}>
            <span className="sr-only">Step {n}: </span>
            {title}
          </h3>
        </div>
        {status}
      </div>
      <div className="sm:pl-10">{children}</div>
    </li>
  );
}

function BaselineForm({ baseline, burn3mo, onSaved }: { baseline: number | null; burn3mo: number; onSaved: () => void }) {
  const save = useSaveAction();
  const [value, setValue] = useState(baseline === null ? "" : String(baseline));
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const v = value.trim() === "" ? null : Number(value.replace(/[$,\s]/g, ""));
    const r = await save({
      request: { url: "/api/admin/finance/config", method: "POST", body: { monthly_burn_baseline: v } },
      success: "Baseline saved",
    });
    setBusy(false);
    if (r.ok) onSaved();
  }

  return (
    <div>
      <p className={`${TYPE.bodyMuted} mb-3`}>
        The monthly spend runway divides by. Leave it blank to use the 3-month average (now{" "}
        <span className="text-ink-1 font-semibold">{money(burn3mo)} a month</span>).
      </p>
      <div className="flex items-end gap-3 flex-wrap">
        <TextField
          label="Baseline per month"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="50000"
          controlSize="md"
          className="w-44"
        />
        <Button onClick={submit} loading={busy} variant="secondary">
          {busy ? "Saving" : "Save baseline"}
        </Button>
      </div>
    </div>
  );
}

function StampButton({ lastClosedAt, onStamped }: { lastClosedAt: string | null; onStamped: () => void }) {
  const save = useSaveAction();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // Contract 7 (Spec Finance N1): the close is a gated exit. A 409 means
  // reconciliation proposals are still pending; a reports.approve holder can
  // waive on the record. The waiver names the period and travels with it.
  const [blocked, setBlocked] = useState<{ pending: number; period: string; artifactType: string } | null>(null);
  const [waiveReason, setWaiveReason] = useState("");

  async function stamp() {
    setBusy(true);
    let body: { blocked?: boolean; pending?: number; period?: string; artifact_type?: string } | null = null;
    const r = await save({
      request: async () => {
        const res = await fetch("/api/admin/finance/close", { method: "POST" });
        body = await res.clone().json().catch(() => null);
        return res;
      },
      // A 409 "blocked" is a state to show, not an error toast.
      failure: false,
      success: "Close stamped",
    });
    setBusy(false);
    const b = body as { blocked?: boolean; pending?: number; period?: string; artifact_type?: string } | null;
    if (!r.ok && r.status === 409 && b?.blocked) {
      setBlocked({ pending: b.pending ?? 0, period: b.period ?? "", artifactType: b.artifact_type ?? "" });
      return;
    }
    if (!r.ok) toast.error(r.message);
    if (r.ok) {
      setBlocked(null);
      onStamped();
    }
  }

  async function waiveAndStamp() {
    if (!blocked || busy) return;
    setBusy(true);
    const r = await save({
      request: {
        url: "/api/admin/export-waivers",
        method: "POST",
        body: { artifact_type: blocked.artifactType, artifact_id: blocked.period, reason: waiveReason.trim() || null },
      },
    });
    setBusy(false);
    if (r.ok) await stamp();
  }

  const stamped = lastClosedAt
    ? new Date(lastClosedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={stamp} loading={busy}>
          {busy ? "Stamping" : "Mark reconciled as of today"}
        </Button>
        {stamped ? <span className="text-[13px] text-status-healthy-text">Reconciled as of {stamped}</span> : null}
      </div>
      {blocked ? (
        <Notice
          tone="warning"
          title={`${blocked.pending} reconcile proposal${blocked.pending === 1 ? "" : "s"} still pending for ${blocked.period}.`}
        >
          Resolve them in the inbox above, or close anyway on the record (owners and admins only).
          <div className="flex items-end gap-2 flex-wrap mt-3">
            <TextField
              label="Why close anyway?"
              hint="Goes in the audit record."
              value={waiveReason}
              onChange={(e) => setWaiveReason(e.target.value)}
              maxLength={500}
              controlSize="md"
              className="flex-1 min-w-[220px]"
            />
            <Button variant="secondary" onClick={waiveAndStamp} disabled={busy}>
              Waive and close
            </Button>
          </div>
        </Notice>
      ) : null}
    </div>
  );
}
