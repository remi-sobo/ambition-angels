"use client";

import { useEffect, useMemo, useState } from "react";

// Scenario forecast. Projects cash month-by-month from today's cash at the
// current burn, then layers user "levers" (one-time or recurring income/
// expense) on top. Baseline (burn only) crosses zero at cash / burn — the same
// runway the dashboard shows — so the scenario line is always read against a
// familiar baseline. Levers persist per-device in localStorage.

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

  return (
    <div className="space-y-6">
      {/* Headline */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Cash on hand" value={money(cashOnHand)} />
        <Stat label="Monthly burn" value={money(monthlyBurn)} sub="trailing 3-month avg" tone="expense" />
        <RunwayStat baseLabel={baseRunway.label} scenLabel={scenRunway.label} better={(scenRunway.months ?? 999) > (baseRunway.months ?? 999)} worse={(scenRunway.months ?? 999) < (baseRunway.months ?? 999)} />
      </section>

      {/* Chart */}
      <section className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
        <h2 className="font-heading font-bold text-ink-1 text-sm mb-1">Projected cash · 24 months</h2>
        <p className="text-xs text-ink-2 mb-4">
          Solid = your scenario. Faint = baseline (burn only, no income). Where a line crosses zero is when you run out.
        </p>
        <Chart baseline={baseline} scenario={scenario} />
      </section>

      {/* Levers */}
      <section className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-heading font-bold text-ink-1 text-sm">What-ifs</h2>
          <div className="flex items-center gap-2 text-[11px]">
            <button onClick={() => add("expense", "monthly")} className="rounded-full bg-tile border-[1.5px] border-outline px-2.5 py-1 hover:bg-[#EFE6D4] text-ink-1">+ Hire / recurring cost</button>
            <button onClick={() => add("income", "one_time")} className="rounded-full bg-tile border-[1.5px] border-outline px-2.5 py-1 hover:bg-[#EFE6D4] text-ink-1">+ Expected gift</button>
            <button onClick={() => add("income", "monthly")} className="rounded-full bg-tile border-[1.5px] border-outline px-2.5 py-1 hover:bg-[#EFE6D4] text-ink-1">+ Recurring income</button>
            <button onClick={reset} className="text-ink-2 hover:text-ink-1 px-1">Reset</button>
          </div>
        </div>

        {levers.length === 0 ? (
          <p className="text-sm text-ink-2">No what-ifs yet — add one above, or this is just the baseline burn-down.</p>
        ) : (
          <ul className="space-y-2">
            {levers.map((l) => (
              <li key={l.id} className="flex items-center gap-2 flex-wrap text-xs bg-tile/40 rounded-card border border-outline px-3 py-2">
                <input type="checkbox" checked={l.enabled} onChange={(e) => update(l.id, { enabled: e.target.checked })} className="accent-orange" />
                <input
                  value={l.label}
                  onChange={(e) => update(l.id, { label: e.target.value })}
                  className="bg-ink border border-outline rounded px-2 py-1 text-ink-1 w-44 min-w-0 flex-1"
                />
                <select
                  value={l.kind}
                  onChange={(e) => update(l.id, { kind: e.target.value as Lever["kind"] })}
                  className="bg-ink border border-outline rounded px-1.5 py-1 text-ink-1"
                >
                  <option value="income">income</option>
                  <option value="expense">expense</option>
                </select>
                <span className="text-ink-2">$</span>
                <input
                  value={String(l.amount)}
                  onChange={(e) => update(l.id, { amount: Math.max(0, Number(e.target.value.replace(/[^0-9.]/g, "")) || 0) })}
                  inputMode="decimal"
                  className="bg-ink border border-outline rounded px-2 py-1 text-ink-1 w-24 [font-variant-numeric:tabular-nums]"
                />
                <select
                  value={l.mode}
                  onChange={(e) => update(l.id, { mode: e.target.value as Lever["mode"] })}
                  className="bg-ink border border-outline rounded px-1.5 py-1 text-ink-1"
                >
                  <option value="one_time">one-time</option>
                  <option value="monthly">/mo</option>
                </select>
                <span className="text-ink-2">{l.mode === "monthly" ? "from" : "in"}</span>
                <select
                  value={l.startMonth}
                  onChange={(e) => update(l.id, { startMonth: Number(e.target.value) })}
                  className="bg-ink border border-outline rounded px-1.5 py-1 text-ink-1"
                >
                  {Array.from({ length: HORIZON }, (_, i) => (
                    <option key={i} value={i}>
                      {monthLabel(i)}
                    </option>
                  ))}
                </select>
                {l.mode === "monthly" && (
                  <>
                    <span className="text-ink-2">to</span>
                    <select
                      value={l.endMonth ?? -1}
                      onChange={(e) => update(l.id, { endMonth: Number(e.target.value) < 0 ? null : Number(e.target.value) })}
                      className="bg-ink border border-outline rounded px-1.5 py-1 text-ink-1"
                    >
                      <option value={-1}>end</option>
                      {Array.from({ length: HORIZON }, (_, i) => (
                        <option key={i} value={i}>
                          {monthLabel(i)}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <button onClick={() => remove(l.id)} aria-label="Remove" className="ml-auto text-ink-3 hover:text-expense">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-ink-3 mt-3">
          Seeded from your secured + projected pledges (projected ones weighted by probability). Edits are saved on this device; “Reset” reloads from your pledges.
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "expense" }) {
  return (
    <div className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
      <div className="text-[10px] uppercase tracking-widest text-ink-2">{label}</div>
      <div className={`mt-1 font-display font-black text-3xl leading-none ${tone === "expense" ? "text-expense" : "text-ink-1"}`}>{value}</div>
      {sub && <div className="mt-2 text-xs text-ink-2">{sub}</div>}
    </div>
  );
}

function RunwayStat({ baseLabel, scenLabel, better, worse }: { baseLabel: string; scenLabel: string; better: boolean; worse: boolean }) {
  return (
    <div className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
      <div className="text-[10px] uppercase tracking-widest text-ink-2">Runway (scenario)</div>
      <div className={`mt-1 font-display font-black text-2xl leading-none ${better ? "text-revenue" : worse ? "text-expense" : "text-ink-1"}`}>{scenLabel}</div>
      <div className="mt-2 text-xs text-ink-2">baseline: {baseLabel}</div>
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
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="#B5482F" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
        <text x={W - padR} y={zeroY - 3} textAnchor="end" fontSize="10" fill="#B5482F">$0</text>
        {/* baseline */}
        <path d={line(baseline)} fill="none" stroke="#9A8B7C" strokeWidth="1.5" opacity="0.55" />
        {/* scenario */}
        <path d={line(scenario)} fill="none" stroke="#C0703C" strokeWidth="2.5" />
        {/* cross-zero marker */}
        {crossIdx > -1 && (
          <>
            <line x1={x(crossIdx)} y1={padT} x2={x(crossIdx)} y2={H - padB} stroke="#B5482F" strokeWidth="1" opacity="0.4" />
            <circle cx={x(crossIdx)} cy={y(scenario[crossIdx])} r="3.5" fill="#B5482F" />
          </>
        )}
        {/* x labels every 3 months */}
        {Array.from({ length: HORIZON }, (_, i) => i).filter((i) => i % 3 === 0).map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#9A8B7C">
            {monthLabel(i)}
          </text>
        ))}
      </svg>
    </div>
  );
}
