"use client";

import { useEffect, useMemo, useState } from "react";
import EmptyState from "../../../_components/EmptyState";
import { TYPE } from "@/lib/admin/typeScale";
import Figure, { SummaryStrip } from "@/app/admin/_components/ui/Figure";
import Button from "@/app/admin/_components/ui/Button";
import Input, { Checkbox, Select } from "@/app/admin/_components/ui/Input";

// Scenario forecast. Projects cash month-by-month from today's cash at the
// current burn, then layers user "levers" (one-time or recurring income/
// expense) on top. Baseline (burn only) crosses zero at cash / burn — the same
// runway the dashboard shows — so the scenario line is always read against a
// familiar baseline. Levers persist per-device in localStorage (a planning
// scratchpad, not a record: nothing here writes to the server).
// V4 Stage G2: figures through the kit Figure with sources, labeled kit
// controls on every lever, kit Buttons.

export type SeedLever = { label: string; amount: number; date: string; status: string };

type Lever = {
  id: string;
  label: string;
  kind: "income" | "expense";
  mode: "one_time" | "monthly";
  amount: number;
  startMonth: number; // 0 = this month
  endMonth: number | null; // monthly only; null = through the horizon
  enabled: boolean;
};

const HORIZON = 24;
const STORAGE_KEY = "bloomos.finance.forecast";

const now = new Date();
function monthLabel(i: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}
function dateToMonthIndex(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const idx = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  return Math.max(0, Math.min(HORIZON - 1, idx));
}
function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
let counter = 0;
const newId = () => `l${Date.now()}-${counter++}`;

function project(startCash: number, burn: number, levers: Lever[]): number[] {
  const out: number[] = [];
  let c = startCash;
  for (let m = 0; m < HORIZON; m++) {
    let net = -burn;
    for (const l of levers) {
      if (!l.enabled) continue;
      const active = l.mode === "one_time" ? m === l.startMonth : m >= l.startMonth && (l.endMonth == null || m <= l.endMonth);
      if (!active) continue;
      net += l.kind === "income" ? l.amount : -l.amount;
    }
    c += net;
    out.push(c);
  }
  return out;
}

function runway(cash: number[], startCash: number): { months: number | null; label: string } {
  if (startCash < 0) return { months: 0, label: "already negative" };
  const idx = cash.findIndex((c) => c < 0);
  if (idx === -1) return { months: null, label: `${HORIZON}+ months` };
  return { months: idx, label: `~${idx} mo · runs out ${monthLabel(idx)}` };
}

export default function ForecastBoard({
  cashOnHand,
  monthlyBurn,
  seeds,
}: {
  cashOnHand: number;
  monthlyBurn: number;
  seeds: SeedLever[];
}) {
  const seedLevers = useMemo<Lever[]>(
    () =>
      seeds.map((s) => ({
        id: newId(),
        label: s.label + (s.status === "projected" ? " (weighted)" : ""),
        kind: "income" as const,
        mode: "one_time" as const,
        amount: s.amount,
        startMonth: dateToMonthIndex(s.date),
        endMonth: null,
        enabled: true,
      })),
    [seeds]
  );

  const [levers, setLevers] = useState<Lever[]>(seedLevers);

  // Hydrate a saved scenario after mount (keeps SSR markup stable).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setLevers(JSON.parse(raw) as Lever[]);
    } catch {
      /* non-fatal */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = (next: Lever[]) => {
    setLevers(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* non-fatal */
    }
  };

  const update = (id: string, patch: Partial<Lever>) => persist(levers.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const remove = (id: string) => persist(levers.filter((l) => l.id !== id));
  const add = (kind: Lever["kind"], mode: Lever["mode"]) =>
    persist([
      ...levers,
      {
        id: newId(),
        label: kind === "expense" ? (mode === "monthly" ? "New hire / recurring cost" : "One-time cost") : mode === "monthly" ? "Recurring income" : "Expected gift",
        kind,
        mode,
        amount: kind === "expense" && mode === "monthly" ? 7000 : 25000,
        startMonth: 1,
        endMonth: null,
        enabled: true,
      },
    ]);
  const reset = () => persist(seedLevers);

  const baseline = useMemo(() => project(cashOnHand, monthlyBurn, []), [cashOnHand, monthlyBurn]);
  const scenario = useMemo(() => project(cashOnHand, monthlyBurn, levers), [cashOnHand, monthlyBurn, levers]);
  const baseRunway = runway(baseline, cashOnHand);
  const scenRunway = runway(scenario, cashOnHand);

  const burnSrc = "Average spending over the last three active months";
  return (
    <div className="space-y-6">
      <SummaryStrip label="Forecast figures">
        <Figure label="Cash on hand" value={money(cashOnHand)} source="From the snapshot: the balance you set plus transactions since" />
        <Figure label="Monthly burn" value={monthlyBurn > 0 ? money(monthlyBurn) : null} source={monthlyBurn > 0 ? burnSrc : "No spending imported yet"} />
        <Figure
          label="Runway, this scenario"
          value={scenRunway.label}
          compare={`Baseline: ${baseRunway.label}`}
          compareTone={(scenRunway.months ?? 999) < (baseRunway.months ?? 999) ? "danger" : "muted"}
          source="Cash on hand less burn, plus the what-ifs below that are switched on"
        />
      </SummaryStrip>

      <section className="bg-surface border border-hairline rounded-panel p-5">
        <h2 className={`${TYPE.cardTitle} mb-1`}>Projected cash, next 24 months</h2>
        <p className={`${TYPE.bodyMuted} mb-4`}>
          Solid is your scenario. Faint is the baseline: burn only, no income. Where a line crosses zero is when you run out.
        </p>
        <Chart baseline={baseline} scenario={scenario} />
      </section>

      <section className="bg-surface border border-hairline rounded-panel p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className={TYPE.cardTitle}>What-ifs</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="secondary" onClick={() => add("expense", "monthly")}>
              Add a hire or recurring cost
            </Button>
            <Button size="sm" variant="secondary" onClick={() => add("income", "one_time")}>
              Add an expected gift
            </Button>
            <Button size="sm" variant="secondary" onClick={() => add("income", "monthly")}>
              Add recurring income
            </Button>
            <Button size="sm" variant="quiet" onClick={reset}>
              Reset
            </Button>
          </div>
        </div>

        {levers.length === 0 ? (
          <EmptyState
            label="what-ifs"
            hint="Stack a hire, a grant landing or a slip with the buttons above. Until then this is the baseline burn-down."
          />
        ) : (
          <ul className="divide-y divide-hairline border-y border-hairline">
            {levers.map((l) => (
              <li key={l.id} className="flex items-center gap-2 flex-wrap py-2.5 text-[13px]">
                <Checkbox
                  aria-label={`Count ${l.label} in the scenario`}
                  checked={l.enabled}
                  onChange={(e) => update(l.id, { enabled: e.target.checked })}
                />
                <Input
                  aria-label="What-if name"
                  value={l.label}
                  onChange={(e) => update(l.id, { label: e.target.value })}
                  className="w-44 min-w-0 flex-1 text-[13px]"
                />
                <Select
                  aria-label={`Money in or out for ${l.label}`}
                  value={l.kind}
                  onChange={(e) => update(l.id, { kind: e.target.value as Lever["kind"] })}
                  className="w-32 text-[13px]"
                >
                  <option value="income">Money in</option>
                  <option value="expense">Money out</option>
                </Select>
                <Input
                  aria-label={`Amount for ${l.label}`}
                  value={String(l.amount)}
                  onChange={(e) => update(l.id, { amount: Math.max(0, Number(e.target.value.replace(/[^0-9.]/g, "")) || 0) })}
                  inputMode="decimal"
                  className="w-28 tabular-nums text-[13px]"
                />
                <Select
                  aria-label={`How often for ${l.label}`}
                  value={l.mode}
                  onChange={(e) => update(l.id, { mode: e.target.value as Lever["mode"] })}
                  className="w-32 text-[13px]"
                >
                  <option value="one_time">One time</option>
                  <option value="monthly">Every month</option>
                </Select>
                <Select
                  aria-label={l.mode === "monthly" ? `First month for ${l.label}` : `Month for ${l.label}`}
                  value={l.startMonth}
                  onChange={(e) => update(l.id, { startMonth: Number(e.target.value) })}
                  className="w-28 text-[13px]"
                >
                  {Array.from({ length: HORIZON }, (_, i) => (
                    <option key={i} value={i}>
                      {monthLabel(i)}
                    </option>
                  ))}
                </Select>
                {l.mode === "monthly" ? (
                  <Select
                    aria-label={`Last month for ${l.label}`}
                    value={l.endMonth ?? -1}
                    onChange={(e) => update(l.id, { endMonth: Number(e.target.value) < 0 ? null : Number(e.target.value) })}
                    className="w-28 text-[13px]"
                  >
                    <option value={-1}>No end</option>
                    {Array.from({ length: HORIZON }, (_, i) => (
                      <option key={i} value={i}>
                        {monthLabel(i)}
                      </option>
                    ))}
                  </Select>
                ) : null}
                <Button
                  size="sm"
                  variant="quiet"
                  iconOnly
                  aria-label={`Remove ${l.label}`}
                  onClick={() => remove(l.id)}
                  className="ml-auto"
                >
                  <svg aria-hidden viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-ink-2 mt-3">
          Seeded from your secured and projected pledges (projected ones weighted by their chance of closing). Edits are saved on
          this device only; Reset reloads from your pledges.
        </p>
      </section>
    </div>
  );
}

function Chart({ baseline, scenario }: { baseline: number[]; scenario: number[] }) {
  const W = 900;
  const H = 220;
  const padL = 8;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  const all = [...baseline, ...scenario, 0];
  const max = Math.max(...all);
  const min = Math.min(...all);
  const span = max - min || 1;
  const x = (i: number) => padL + (i / (HORIZON - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB);
  const line = (arr: number[]) => arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const zeroY = y(0);
  const crossIdx = scenario.findIndex((c) => c < 0);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 560 }} role="img" aria-label="Projected cash chart">
        {/* zero line */}
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="#B0462E" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
        <text x={W - padR} y={zeroY - 3} textAnchor="end" fontSize="10" fill="#B0462E">$0</text>
        {/* baseline */}
        <path d={line(baseline)} fill="none" stroke="#9A8B7C" strokeWidth="1.5" opacity="0.55" />
        {/* scenario */}
        <path d={line(scenario)} fill="none" stroke="#C0703C" strokeWidth="2.5" />
        {/* cross-zero marker */}
        {crossIdx > -1 && (
          <>
            <line x1={x(crossIdx)} y1={padT} x2={x(crossIdx)} y2={H - padB} stroke="#B0462E" strokeWidth="1" opacity="0.4" />
            <circle cx={x(crossIdx)} cy={y(scenario[crossIdx])} r="3.5" fill="#B0462E" />
          </>
        )}
        {/* x labels every 3 months */}
        {Array.from({ length: HORIZON }, (_, i) => i).filter((i) => i % 3 === 0).map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" className="fill-ink-3">
            {monthLabel(i)}
          </text>
        ))}
      </svg>
    </div>
  );
}
