"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TYPE } from "@/lib/admin/typeScale";
import Button from "@/app/admin/_components/ui/Button";
import { DateField, SelectField, TextField } from "@/app/admin/_components/ui/Field";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";

export type FinConfig = {
  current_year: number;
  fiscal_year_start_month: number;
  fundraising_goal: number | null;
  contingency_unlock_threshold: number | null;
  cash_starting_balance: number | null;
  cash_starting_date: string | null;
  monthly_burn_baseline: number | null;
  forward_horizon_months: number | null;
  runway_target_months: number | null;
};

type Props = { initial: FinConfig };

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const str = (n: number | null) => (n === null ? "" : String(n));
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[$,\s]/g, "")));

// Finance setup (V4 Stage G2, the Settings archetype): one section per job,
// each with labeled kit fields and its own Save, through saveAction. A save
// sends only that section's fields, so saving the goal never touches cash.
export default function ConfigEditor({ initial }: Props) {
  const router = useRouter();
  const save = useSaveAction();

  const [year, setYear] = useState(String(initial.current_year));
  const [fyMonth, setFyMonth] = useState(String(initial.fiscal_year_start_month));
  const [goal, setGoal] = useState(str(initial.fundraising_goal));
  const [threshold, setThreshold] = useState(str(initial.contingency_unlock_threshold));
  const [startBal, setStartBal] = useState(str(initial.cash_starting_balance));
  const [startDate, setStartDate] = useState(initial.cash_starting_date ?? "");
  const [baseline, setBaseline] = useState(str(initial.monthly_burn_baseline));
  const [horizon, setHorizon] = useState(str(initial.forward_horizon_months));
  const [runwayTarget, setRunwayTarget] = useState(str(initial.runway_target_months));
  const [saving, setSaving] = useState<string | null>(null);

  async function saveSection(key: string, body: Record<string, unknown>) {
    setSaving(key);
    const r = await save({ request: { url: "/api/admin/finance/config", method: "POST", body }, success: "Saved" });
    setSaving(null);
    if (r.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      <Section
        title="Fiscal year"
        hint="Decides which budget rows are current. Most US nonprofits run January to December. The organization's fiscal year is also set under Settings, Organization."
        saving={saving === "fy"}
        onSave={() => saveSection("fy", { current_year: Number(year), fiscal_year_start_month: Number(fyMonth) })}
      >
        <TextField label="Current fiscal year" value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" />
        <SelectField
          label="Fiscal year starts"
          value={fyMonth}
          onChange={(e) => setFyMonth(e.target.value)}
          options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
        />
      </Section>

      <Section
        title="Fundraising goal"
        hint="From the budget workbook. Contingency unlocks when received plus secured crosses the goal times the threshold."
        saving={saving === "goal"}
        onSave={() => saveSection("goal", { fundraising_goal: num(goal), contingency_unlock_threshold: num(threshold) })}
      >
        <TextField label="Goal" value={goal} onChange={(e) => setGoal(e.target.value)} inputMode="decimal" placeholder="1200000" />
        <TextField
          label="Contingency unlock threshold"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          inputMode="decimal"
          placeholder="1.09"
          hint="1.09 means 109% of the goal."
        />
      </Section>

      <Section
        title="Starting cash position"
        hint="Cash on hand as of this date. Cash and runway start here, then add every transaction dated after it. If your statements start January 1, use the balance from December 31."
        saving={saving === "cash"}
        onSave={() => saveSection("cash", { cash_starting_balance: num(startBal), cash_starting_date: startDate || null })}
      >
        <TextField label="Starting balance" value={startBal} onChange={(e) => setStartBal(e.target.value)} inputMode="decimal" placeholder="120000" />
        <DateField label="As of" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </Section>

      <Section
        title="Runway"
        hint="The burn baseline is the monthly spend runway divides by: a number you can defend, a touch above your real average. Leave it blank to use the 3-month average. The horizon is how far ahead projected runway counts pledges not yet in."
        saving={saving === "runway"}
        onSave={() =>
          saveSection("runway", {
            monthly_burn_baseline: num(baseline),
            forward_horizon_months: num(horizon),
            runway_target_months: num(runwayTarget),
          })
        }
      >
        <TextField label="Monthly burn baseline" value={baseline} onChange={(e) => setBaseline(e.target.value)} inputMode="decimal" placeholder="50000" />
        <TextField label="Projection window (months)" value={horizon} onChange={(e) => setHorizon(e.target.value)} inputMode="numeric" placeholder="3" />
        <TextField label="Runway target (months)" value={runwayTarget} onChange={(e) => setRunwayTarget(e.target.value)} inputMode="numeric" placeholder="6" />
      </Section>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
  onSave,
  saving,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <section className="bg-surface border border-hairline rounded-panel p-5">
      <h2 className={TYPE.cardTitle}>{title}</h2>
      {hint ? <p className={`${TYPE.bodyMuted} mt-1 mb-4`}>{hint}</p> : null}
      <div className="grid sm:grid-cols-2 gap-4">{children}</div>
      <div className="flex justify-end mt-4">
        <Button variant="secondary" onClick={onSave} loading={saving}>
          {saving ? "Saving" : `Save ${title.toLowerCase()}`}
        </Button>
      </div>
    </section>
  );
}
