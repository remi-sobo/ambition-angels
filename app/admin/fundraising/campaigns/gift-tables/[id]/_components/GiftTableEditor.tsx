"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { userMessage, networkMessage } from "@/lib/admin/errors";
import { TYPE } from "@/lib/admin/typeScale";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/app/admin/_components/ui";

/**
 * Gift table editors (specs/fundraising-gift-tables.md, Phase 2).
 *
 * Same convention as the rest of Fundraising: call the admin API, then
 * router.refresh() so every derived figure — goal, shape, gaps, the verdict —
 * is recomputed on the server from the saved rows. Nothing derived is held in
 * client state, because a number cached in the browser is the first place a
 * gift table starts lying.
 */

type Cadence = "one_time" | "annual" | "monthly";

export type LevelDraft = {
  id?: string;
  label: string;
  amount: number | string;
  cadence: Cadence;
  term_years: number | null;
  gifts_needed: number | string;
  prospects_per_gift: number | string;
  purpose: string;
};

const CADENCE_LABEL: Record<Cadence, string> = {
  one_time: "One-time",
  annual: "Per year",
  monthly: "Per month",
};

// ── Status ──────────────────────────────────────────────────────────────────

/**
 * Draft ⇄ active. A draft feeds nothing: no queues, no donor chips, no work.
 * Going active is therefore a real decision and gets its own control rather
 * than hiding inside the settings form.
 */
export function StatusControl({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (status === "closed" || status === "archived") {
    return <span className={TYPE.metadata}>{status}</span>;
  }

  const next = status === "active" ? "draft" : "active";
  const go = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/fundraising/gift-tables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: next }),
      });
      if (!res.ok) {
        toast.error(userMessage(res, await res.json().catch(() => ({}))));
        return;
      }
      toast.success(
        next === "active"
          ? "Table is active. Its next steps will reach Today's Moves."
          : "Back to draft. It no longer feeds any queue.",
      );
      router.refresh();
    } catch {
      toast.error(networkMessage());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <span className={TYPE.metadata}>{status === "active" ? "Active" : "Draft"}</span>
      <Button variant={status === "active" ? "secondary" : "primary"} size="sm" onClick={go} disabled={busy}>
        {busy ? "Saving…" : status === "active" ? "Back to draft" : "Make it active"}
      </Button>
    </div>
  );
}

// ── Levels ──────────────────────────────────────────────────────────────────

/**
 * The shape of the ask. Amounts stay NATIVE to their cadence — $25,000 once,
 * $25,000 a year, $500 a month — and the page derives what each is worth on
 * this table's basis. Typing an already-annualized figure here is the mistake
 * the EPA workbook's per-year column invites, so the field says which it wants.
 */
export function LevelsEditor({ tableId, levels }: { tableId: string; levels: LevelDraft[] }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<LevelDraft[]>(levels);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const patch = (i: number, change: Partial<LevelDraft>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...change } : row)));

  const add = () =>
    setRows((r) => [
      ...r,
      {
        label: String(r.length + 1).padStart(2, "0"),
        amount: "",
        cadence: "one_time",
        term_years: null,
        gifts_needed: 1,
        prospects_per_gift: 4,
        purpose: "",
      },
    ]);

  const remove = (i: number) => setRows((r) => r.filter((_, j) => j !== i));

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/fundraising/gift-tables/${tableId}/levels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          levels: rows.map((r) => ({
            id: r.id,
            label: r.label,
            amount: Number(r.amount),
            cadence: r.cadence,
            term_years: r.cadence === "annual" ? r.term_years : null,
            gifts_needed: Number(r.gifts_needed),
            prospects_per_gift: Number(r.prospects_per_gift),
            purpose: r.purpose,
          })),
        }),
      });
      if (!res.ok) {
        setError(userMessage(res, await res.json().catch(() => ({}))));
        return;
      }
      toast.success("Levels saved.");
      router.refresh();
    } catch {
      setError(networkMessage());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      {rows.length === 0 && (
        <p className={TYPE.bodyMuted}>
          No levels yet. Start at the top: the lead gift is usually around a fifth of the goal.
        </p>
      )}

      <div className="space-y-4">
        {rows.map((row, i) => (
          <div key={row.id ?? `new-${i}`} className="rounded-panel border border-hairline p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <Field label="Level">
                <Input
                  value={row.label}
                  onChange={(e) => patch(i, { label: e.target.value })}
                  placeholder="01"
                />
              </Field>
              <Field
                label="Gift size"
                hint={
                  row.cadence === "monthly"
                    ? "per month"
                    : row.cadence === "annual"
                      ? "per year"
                      : "one gift"
                }
              >
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={row.amount}
                  onChange={(e) => patch(i, { amount: e.target.value })}
                  placeholder="25000"
                />
              </Field>
              <Field label="Cadence">
                <Select
                  value={row.cadence}
                  onChange={(e) =>
                    patch(i, {
                      cadence: e.target.value as Cadence,
                      term_years: e.target.value === "annual" ? (row.term_years ?? 3) : null,
                    })
                  }
                >
                  {(Object.keys(CADENCE_LABEL) as Cadence[]).map((c) => (
                    <option key={c} value={c}>
                      {CADENCE_LABEL[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              {row.cadence === "annual" ? (
                <Field label="Term" hint="years, held flat">
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    value={row.term_years ?? ""}
                    onChange={(e) =>
                      patch(i, { term_years: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                </Field>
              ) : (
                <div className="hidden lg:block" />
              )}
              <Field label="Gifts needed">
                <Input
                  type="number"
                  min="1"
                  value={row.gifts_needed}
                  onChange={(e) => patch(i, { gifts_needed: e.target.value })}
                />
              </Field>
              <Field label="Prospects per gift" hint="4 major · 3 mid · 1 appeal">
                <Input
                  type="number"
                  min="1"
                  value={row.prospects_per_gift}
                  onChange={(e) => patch(i, { prospects_per_gift: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-3 flex items-end gap-3">
              <Field label="What it buys" className="flex-1" hint="The sentence the ask is made with.">
                <Input
                  value={row.purpose}
                  onChange={(e) => patch(i, { purpose: e.target.value })}
                  placeholder="One school year, start to finish."
                />
              </Field>
              <Button variant="ghost" size="sm" onClick={() => remove(i)} type="button">
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={add} type="button">
          Add a level
        </Button>
        <Button size="sm" onClick={save} disabled={busy} type="button">
          {busy ? "Saving…" : "Save levels"}
        </Button>
      </div>
      <p className={TYPE.metadata}>
        Removing a level that already has names placed at it is refused. Move the names first.
      </p>
    </Card>
  );
}

// ── Settings ────────────────────────────────────────────────────────────────

export type TableDraft = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  target: number;
  multiplier: number;
  goal_round_to: number | null;
  coverage_basis: "window" | "annual" | "full_term";
  default_term_years: number;
  monthly_modeled_years: number;
  target_rationale: string;
  multiplier_rationale: string;
  notes: string;
};

export function GiftTableSettings({ table }: { table: TableDraft }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<TableDraft>(table);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (change: Partial<TableDraft>) => setForm((f) => ({ ...f, ...change }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/fundraising/gift-tables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          name: form.name,
          starts_on: form.starts_on,
          ends_on: form.ends_on,
          target: Number(form.target),
          multiplier: Number(form.multiplier),
          goal_round_to: form.goal_round_to === null ? null : Number(form.goal_round_to),
          coverage_basis: form.coverage_basis,
          default_term_years: Number(form.default_term_years),
          monthly_modeled_years: Number(form.monthly_modeled_years),
          target_rationale: form.target_rationale,
          multiplier_rationale: form.multiplier_rationale,
          notes: form.notes,
        }),
      });
      if (!res.ok) {
        setError(userMessage(res, await res.json().catch(() => ({}))));
        return;
      }
      toast.success("Saved. Every figure on this page recomputed.");
      router.refresh();
    } catch {
      setError(networkMessage());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" className="lg:col-span-3">
            <Input value={form.name} onChange={(e) => set({ name: e.target.value })} required />
          </Field>
          <Field label="Window opens">
            <Input
              type="date"
              value={form.starts_on}
              onChange={(e) => set({ starts_on: e.target.value })}
              required
            />
          </Field>
          <Field label="Window closes">
            <Input
              type="date"
              value={form.ends_on}
              onChange={(e) => set({ ends_on: e.target.value })}
              required
            />
          </Field>
          <Field
            label="Coverage basis"
            hint="What one figure on this table means."
          >
            <Select
              value={form.coverage_basis}
              onChange={(e) => set({ coverage_basis: e.target.value as TableDraft["coverage_basis"] })}
            >
              <option value="window">Window: what lands inside these dates</option>
              <option value="annual">Per year: one year at a time</option>
              <option value="full_term">Full term: the whole commitment</option>
            </Select>
          </Field>

          <Field label="Target" hint="What the window must raise.">
            <Input
              type="number"
              min="0"
              step="1"
              value={form.target}
              onChange={(e) => set({ target: Number(e.target.value) })}
            />
          </Field>
          <Field label="Multiplier" hint="Slippage. 1.2 is a working push.">
            <Input
              type="number"
              min="0.1"
              step="0.05"
              value={form.multiplier}
              onChange={(e) => set({ multiplier: Number(e.target.value) })}
            />
          </Field>
          <Field label="Round the goal to" hint="Blank takes the exact product.">
            <Input
              type="number"
              min="1"
              step="1"
              value={form.goal_round_to ?? ""}
              onChange={(e) =>
                set({ goal_round_to: e.target.value === "" ? null : Number(e.target.value) })
              }
              placeholder="1000"
            />
          </Field>

          <Field label="Default term" hint="Years, for annual levels that don't set their own.">
            <Input
              type="number"
              min="1"
              max="20"
              value={form.default_term_years}
              onChange={(e) => set({ default_term_years: Number(e.target.value) })}
            />
          </Field>
          <Field label="Monthly modelled over" hint="Years. Always shown as estimated.">
            <Input
              type="number"
              min="1"
              max="20"
              value={form.monthly_modeled_years}
              onChange={(e) => set({ monthly_modeled_years: Number(e.target.value) })}
            />
          </Field>
        </div>

        <Field
          label="Why this target"
          hint="A gift table that can't say why it's built on this number is a spreadsheet."
        >
          <Textarea
            rows={3}
            value={form.target_rationale}
            onChange={(e) => set({ target_rationale: e.target.value })}
          />
        </Field>
        <Field label="Why this multiplier">
          <Textarea
            rows={2}
            value={form.multiplier_rationale}
            onChange={(e) => set({ multiplier_rationale: e.target.value })}
          />
        </Field>
        <Field label="Notes">
          <Textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>

        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
      </form>
    </Card>
  );
}
