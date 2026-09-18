"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { userMessage, networkMessage } from "@/lib/admin/errors";
import { TYPE } from "@/lib/admin/typeScale";
import {
  Alert,
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/app/admin/_components/ui";

/**
 * The level drawer (specs/fundraising-gift-tables.md, Phase 3).
 *
 * Clicking a level opens the names placed at it, then the candidate pools
 * beneath them. That order is the argument: a level is not a number of
 * dollars, it is a list of people, and the pools exist to make the list
 * longer.
 *
 * Pools load on open, not with the page. They read across constituents,
 * opportunities, gifts, pledges, recurring plans and the bench, which is the
 * spec's named "rollup cost" failure mode.
 */

export type PlacementView = {
  id: string;
  constituentId: string;
  displayName: string;
  householdId: string | null;
  state: string;
  targetAmount: number | null;
  linked: boolean;
  staleClose: boolean;
  doNotContact: boolean;
  capacityScore: number | null;
  affinityScore: number | null;
  connectionScore: number | null;
  readinessScore: number | null;
  warmPath: string | null;
  whyNote: string | null;
  nextStep: string | null;
  nextStepDue: string | null;
  owner: string | null;
  capacityHint: string | null;
  affinityHint: string | null;
};

type PoolRow = {
  constituentId: string | null;
  benchId?: string | null;
  label: string;
  detail: string;
  amount: number | null;
  doNotContact: boolean;
  placeable: boolean;
  pastDue?: boolean;
};

type PoolsPayload = Record<string, { total: number; rows: PoolRow[] }>;

const POOL_LABELS: Record<string, string> = {
  active_asks: "Active asks",
  pledged: "Pledged",
  renewals: "Renewals",
  lapsed: "Lapsed",
  upgrades: "Upgrade candidates",
  bench: "Prospect bench",
  recurring: "Recurring",
};

const STATE_TONE: Record<string, "neutral" | "success" | "accent" | "warning"> = {
  committed: "success",
  pledged: "accent",
  asked: "warning",
  on_hold: "neutral",
};

const SCORE_FIELDS = [
  { key: "capacity_score", label: "Capacity", view: "capacityScore", hint: "capacityHint" },
  { key: "affinity_score", label: "Affinity", view: "affinityScore", hint: "affinityHint" },
  { key: "connection_score", label: "Connection", view: "connectionScore", hint: null },
  { key: "readiness_score", label: "Readiness", view: "readinessScore", hint: null },
] as const;

const money = (v: number | null) =>
  v === null ? "" : `$${Math.round(v).toLocaleString("en-US")}`;

export default function LevelDrawer({
  tableId,
  levelId,
  levelLabel,
  needed,
  placements,
  owners,
  canWrite,
}: {
  tableId: string;
  levelId: string;
  levelLabel: string;
  needed: number;
  placements: PlacementView[];
  owners: { value: string; label: string }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [poolData, setPoolData] = useState<PoolsPayload | null>(null);
  const [poolKey, setPoolKey] = useState<string>("renewals");
  const [loadingPools, setLoadingPools] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadPools = useCallback(async () => {
    setLoadingPools(true);
    try {
      const res = await fetch(`/api/admin/fundraising/gift-tables/${tableId}/pools`);
      if (!res.ok) {
        setError(userMessage(res, await res.json().catch(() => ({}))));
        return;
      }
      const body = await res.json();
      setPoolData(body.pools as PoolsPayload);
    } catch {
      setError(networkMessage());
    } finally {
      setLoadingPools(false);
    }
  }, [tableId]);

  useEffect(() => {
    if (open && !poolData && canWrite) void loadPools();
  }, [open, poolData, canWrite, loadPools]);

  const place = async (row: PoolRow) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/fundraising/gift-tables/${tableId}/placements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level_id: levelId,
          constituent_id: row.constituentId ?? undefined,
          prospect_id: row.constituentId ? undefined : row.benchId,
          target_amount: row.amount ?? undefined,
        }),
      });
      if (!res.ok) {
        setError(userMessage(res, await res.json().catch(() => ({}))));
        return;
      }
      toast.success(`${row.label} placed at level ${levelLabel}.`);
      setPoolData(null);
      router.refresh();
    } catch {
      setError(networkMessage());
    } finally {
      setBusy(false);
    }
  };

  /**
   * Start ask opens a real opportunity on the org's default pipeline and links
   * it to the placement. From then on the placement's status follows the
   * stage and its target displays the ask.
   *
   * Expected close is deliberately NOT collected here and so stays null: a
   * fabricated close date makes a forecast nobody chose. It is set on the
   * opportunity when somebody actually knows.
   */
  const startAsk = async (p: PlacementView) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/fundraising/gift-tables/${tableId}/placements/${p.id}/start-ask`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ask_amount: p.targetAmount ?? undefined,
            next_step: p.nextStep ?? undefined,
            next_step_due: p.nextStepDue ?? undefined,
            owner: p.owner ?? undefined,
          }),
        },
      );
      if (!res.ok) {
        setError(userMessage(res, await res.json().catch(() => ({}))));
        return;
      }
      toast.success(`Ask opened for ${p.displayName}. This placement now follows it.`);
      router.refresh();
    } catch {
      setError(networkMessage());
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: PlacementView) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/fundraising/gift-tables/${tableId}/placements?placement_id=${p.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        toast.error(userMessage(res, await res.json().catch(() => ({}))));
        return;
      }
      toast.success(`${p.displayName} removed from this level. Their scores are kept.`);
      setPoolData(null);
      router.refresh();
    } catch {
      toast.error(networkMessage());
    } finally {
      setBusy(false);
    }
  };

  const placed = placements.length;

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {placed} of {needed}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={`Level ${levelLabel}`}
        description={`${placed} of ${needed} qualified prospects. A name counts here only once it is placed.`}
      >
        <div className="space-y-6">
          {error && <Alert tone="danger">{error}</Alert>}

          <section>
            <h3 className={`${TYPE.cardTitle} mb-2`}>Placed</h3>
            {placements.length === 0 ? (
              <p className={TYPE.bodyMuted}>
                Nobody is placed at this level yet. The pools below are where the names come from.
              </p>
            ) : (
              <ul className="space-y-2">
                {placements.map((p) => (
                  <li key={p.id} className="rounded-panel border border-hairline p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/admin/fundraising/donors-funders/${p.constituentId}`}
                          className={`${TYPE.body} font-medium hover:text-orange transition-colors`}
                        >
                          {p.displayName}
                        </Link>
                        {p.householdId && (
                          <span className={`${TYPE.metadata} ml-2`}>household</span>
                        )}
                        {p.doNotContact && (
                          <Badge tone="neutral" className="ml-2">
                            no contact
                          </Badge>
                        )}
                        {p.staleClose && (
                          <Badge tone="warning" className="ml-2">
                            close date passed
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {p.targetAmount !== null && (
                          <span className={`${TYPE.body} tabular-nums`}>{money(p.targetAmount)}</span>
                        )}
                        <Badge tone={STATE_TONE[p.state] ?? "neutral"}>{p.state}</Badge>
                      </div>
                    </div>

                    {p.warmPath && (
                      <p className={`${TYPE.body} mt-2`}>
                        <span className={TYPE.cardLabel}>Warm path. </span>
                        {p.warmPath}
                      </p>
                    )}
                    <p className={`${TYPE.metadata} mt-1`}>
                      {[
                        p.capacityScore && `capacity ${p.capacityScore}`,
                        p.affinityScore && `affinity ${p.affinityScore}`,
                        p.connectionScore && `connection ${p.connectionScore}`,
                        p.readinessScore && `readiness ${p.readinessScore}`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Not scored yet"}
                      {p.nextStep ? ` · next: ${p.nextStep}` : ""}
                      {p.nextStepDue ? ` (${p.nextStepDue})` : ""}
                      {p.owner ? ` · ${p.owner}` : ""}
                    </p>

                    {canWrite && (
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(editing === p.id ? null : p.id)}
                        >
                          {editing === p.id ? "Close" : "Edit"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => remove(p)} disabled={busy}>
                          Remove
                        </Button>
                        {!p.linked && !p.doNotContact && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => startAsk(p)}
                            disabled={busy}
                          >
                            Start ask
                          </Button>
                        )}
                      </div>
                    )}

                    {editing === p.id && (
                      <PlacementEditor
                        tableId={tableId}
                        placement={p}
                        owners={owners}
                        onDone={() => {
                          setEditing(null);
                          router.refresh();
                        }}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canWrite && (
            <section>
              <h3 className={`${TYPE.cardTitle} mb-2`}>Candidates</h3>
              <p className={`${TYPE.metadata} mb-3`}>
                Nothing here counts toward the level until it is placed.
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {Object.keys(POOL_LABELS).map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    variant={poolKey === k ? "primary" : "secondary"}
                    onClick={() => setPoolKey(k)}
                  >
                    {POOL_LABELS[k]}
                    {poolData?.[k] ? ` ${poolData[k].total}` : ""}
                  </Button>
                ))}
              </div>

              {loadingPools && <p className={TYPE.bodyMuted}>Reading the spine…</p>}
              {poolData && !loadingPools && (
                <ul className="space-y-1">
                  {(poolData[poolKey]?.rows ?? []).map((row, i) => (
                    <li
                      key={`${row.constituentId ?? row.benchId ?? i}`}
                      className={`flex items-center justify-between gap-3 rounded-control px-3 py-2 ${
                        row.placeable ? "bg-tile" : "bg-tile opacity-60"
                      }`}
                    >
                      <div className="min-w-0">
                        <span className={`${TYPE.body} font-medium`}>{row.label}</span>
                        <span className={`${TYPE.metadata} block`}>
                          {row.detail}
                          {row.pastDue ? " · past due" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {row.amount !== null && (
                          <span className={`${TYPE.metadata} tabular-nums`}>{money(row.amount)}</span>
                        )}
                        {row.placeable ? (
                          <Button size="sm" variant="secondary" onClick={() => place(row)} disabled={busy}>
                            Place
                          </Button>
                        ) : (
                          <span className={TYPE.metadata}>
                            {row.doNotContact ? "no contact" : "needs a record"}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                  {(poolData[poolKey]?.rows ?? []).length === 0 && (
                    <li className={TYPE.bodyMuted}>Nobody in this pool right now.</li>
                  )}
                </ul>
              )}
            </section>
          )}
        </div>
      </Modal>
    </>
  );
}

/** Scores, warm path, next step, owner. Four factors, scored separately and
 *  never averaged: a 5 for capacity and a 1 for readiness means cultivate,
 *  and an average of 3 would hide that. */
function PlacementEditor({
  tableId,
  placement,
  owners,
  onDone,
}: {
  tableId: string;
  placement: PlacementView;
  owners: { value: string; label: string }[];
  onDone: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    capacity_score: placement.capacityScore,
    affinity_score: placement.affinityScore,
    connection_score: placement.connectionScore,
    readiness_score: placement.readinessScore,
    warm_path: placement.warmPath ?? "",
    why_note: placement.whyNote ?? "",
    next_step: placement.nextStep ?? "",
    next_step_due: placement.nextStepDue ?? "",
    owner: placement.owner ?? "",
    target_amount: placement.targetAmount,
  });

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        placement_id: placement.id,
        capacity_score: form.capacity_score,
        affinity_score: form.affinity_score,
        connection_score: form.connection_score,
        readiness_score: form.readiness_score,
        warm_path: form.warm_path,
        why_note: form.why_note,
        next_step: form.next_step,
        next_step_due: form.next_step_due || null,
        owner: form.owner,
      };
      // A linked placement's target is the opportunity's ask and read-only.
      if (!placement.linked) payload.target_amount = form.target_amount;

      const res = await fetch(`/api/admin/fundraising/gift-tables/${tableId}/placements`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(userMessage(res, await res.json().catch(() => ({}))));
        return;
      }
      toast.success("Saved.");
      onDone();
    } catch {
      setError(networkMessage());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 border-t border-hairline pt-3">
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SCORE_FIELDS.map((f) => {
          const hint = f.hint ? (placement[f.hint] as string | null) : null;
          return (
            <Field key={f.key} label={f.label} hint={hint ?? undefined}>
              <Select
                value={String(form[f.key as keyof typeof form] ?? "")}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    [f.key]: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
              >
                <option value="">Not scored</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
          );
        })}
      </div>

      <Field
        label="Warm path"
        hint="Who knows them, how well, and whether that person will make the introduction."
      >
        <Input
          value={form.warm_path}
          onChange={(e) => setForm((s) => ({ ...s, warm_path: e.target.value }))}
          placeholder="Susan knows her well and will make the intro."
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Next step">
          <Input
            value={form.next_step}
            onChange={(e) => setForm((s) => ({ ...s, next_step: e.target.value }))}
          />
        </Field>
        <Field label="By when">
          <Input
            type="date"
            value={form.next_step_due}
            onChange={(e) => setForm((s) => ({ ...s, next_step_due: e.target.value }))}
          />
        </Field>
        <Field label="Owner">
          <Select
            value={form.owner}
            onChange={(e) => setForm((s) => ({ ...s, owner: e.target.value }))}
          >
            <option value="">Unassigned</option>
            {owners.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {!placement.linked && (
        <Field label="Target ask">
          <Input
            type="number"
            min="0"
            value={form.target_amount ?? ""}
            onChange={(e) =>
              setForm((s) => ({
                ...s,
                target_amount: e.target.value === "" ? null : Number(e.target.value),
              }))
            }
          />
        </Field>
      )}
      {placement.linked && (
        <p className={TYPE.metadata}>
          This placement follows its ask, so the amount is read-only here. Change it on the
          opportunity.
        </p>
      )}

      <Field label="Why this name">
        <Textarea
          rows={2}
          value={form.why_note}
          onChange={(e) => setForm((s) => ({ ...s, why_note: e.target.value }))}
        />
      </Field>

      <Button size="sm" onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
