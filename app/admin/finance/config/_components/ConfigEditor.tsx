"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type FinConfig = {
  current_year: number;
  fiscal_year_start_month: number;
  fundraising_goal: number | null;
  contingency_unlock_threshold: number | null;
  cash_starting_balance: number | null;
  cash_starting_date: string | null;
};

type Props = { initial: FinConfig };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function ConfigEditor({ initial }: Props) {
  const router = useRouter();

  const [year, setYear] = useState(String(initial.current_year));
  const [fyMonth, setFyMonth] = useState(String(initial.fiscal_year_start_month));
  const [goal, setGoal] = useState(initial.fundraising_goal === null ? "" : String(initial.fundraising_goal));
  const [threshold, setThreshold] = useState(
    initial.contingency_unlock_threshold === null ? "" : String(initial.contingency_unlock_threshold)
  );
  const [startBal, setStartBal] = useState(
    initial.cash_starting_balance === null ? "" : String(initial.cash_starting_balance)
  );
  const [startDate, setStartDate] = useState(initial.cash_starting_date ?? "");

  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setStatus("saving");
    setError(null);
    const body: Record<string, unknown> = {};
    body.current_year = Number(year);
    body.fiscal_year_start_month = Number(fyMonth);
    body.fundraising_goal = goal === "" ? null : Number(goal.replace(/,/g, ""));
    body.contingency_unlock_threshold = threshold === "" ? null : Number(threshold);
    body.cash_starting_balance = startBal === "" ? null : Number(startBal.replace(/,/g, ""));
    body.cash_starting_date = startDate || null;

    const r = await fetch("/api/admin/finance/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setStatus("error");
      setError(j.error ?? "Save failed");
      return;
    }
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1500);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Section
        title="Fiscal year"
        hint="The fiscal year determines which budget rows are 'current'. Most US nonprofits use calendar year — fiscal year starts January."
      >
        <Field label="Current fiscal year">
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            inputMode="numeric"
            className="bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1 w-32"
          />
        </Field>
        <Field label="Fiscal year starts">
          <select
            value={fyMonth}
            onChange={(e) => setFyMonth(e.target.value)}
            className="bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section
        title="Fundraising goal"
        hint="From the budget workbook Donations tab. Contingency unlocks when received + secured crosses (goal × threshold)."
      >
        <Field label="Goal ($)">
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            inputMode="decimal"
            placeholder="1247982"
            className="bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1 w-40"
          />
        </Field>
        <Field label="Contingency unlock threshold">
          <input
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            inputMode="decimal"
            placeholder="1.09"
            className="bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1 w-24"
          />
        </Field>
      </Section>

      <Section
        title="Starting cash position"
        hint="Cash on hand as of this date. Runway and cash-position math start from here, then add all transactions dated after this. If you only upload statements going back to (say) 2026-01-01, set the starting balance to whatever was in the bank on 2025-12-31."
      >
        <Field label="Starting balance ($)">
          <input
            value={startBal}
            onChange={(e) => setStartBal(e.target.value)}
            inputMode="decimal"
            placeholder="121589"
            className="bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1 w-40"
          />
        </Field>
        <Field label="As of date">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1"
          />
        </Field>
      </Section>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          disabled={status === "saving"}
          onClick={save}
          className="px-4 py-2 rounded-lg bg-orange hover:bg-orange-dark text-white text-sm font-medium disabled:opacity-40"
        >
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
        {status === "saved" && <span className="text-xs text-revenue">Saved</span>}
        {status === "error" && error && <span className="text-xs text-expense">{error}</span>}
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
      <h2 className="text-sm uppercase tracking-wider text-orange font-medium mb-1">{title}</h2>
      {hint && <p className="text-xs text-ink-2 mb-4 max-w-2xl">{hint}</p>}
      <div className="grid sm:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-ink-2 mb-1">{label}</span>
      {children}
    </label>
  );
}
