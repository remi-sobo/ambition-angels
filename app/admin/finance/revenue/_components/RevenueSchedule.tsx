import { money } from "../../_components/charts";
import type { RevenueScheduleRow } from "@/lib/finance/schedule";

// Money-centric read of the canonical revenue schedule (v_revenue_schedule):
// every expected inflow as a dated, typed, restricted-flagged row — the exact
// rows that feed runway. This is the single read surface the spec wires the
// revenue page onto so it can never disagree with the dashboard again.

const SOURCE_LABEL: Record<string, string> = {
  pledge: "Pledge",
  grant: "Grant",
  pipeline: "Pipeline",
  commitment: "Commitment",
  manual: "Manual",
};

const SOURCE_CHIP: Record<string, string> = {
  pledge: "bg-revenue-bg text-revenue border-revenue/30",
  grant: "bg-orange/15 text-orange border-orange/30",
  pipeline: "bg-tile text-ink-2 border-outline",
  commitment: "bg-revenue-bg text-revenue border-revenue/30",
  manual: "bg-[#EFE6D4] text-ink-1 border-outline",
};

const monthLabel = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });

export default function RevenueSchedule({
  rows,
  goal = 0,
  received = 0,
}: {
  rows: RevenueScheduleRow[];
  /** Fundraising goal for the year — drives the progress bar. */
  goal?: number;
  /** Actual money landed this year (gifts) — the hard floor of goal progress. */
  received?: number;
}) {
  if (rows.length === 0 && received === 0) {
    return (
      <section className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5 sm:p-6">
        <SectionTitle />
        <div className="text-sm text-ink-2 py-6 text-center border border-dashed border-outline rounded-card">
          No dated inflows yet. Awarded grants, scheduled pledge installments, and open
          weighted pipeline appear here as soon as they have an amount and a date.
        </div>
      </section>
    );
  }

  // Sort by date; committed vs projected totals for the header.
  const sorted = [...rows].sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0));
  let committed = 0;
  let projected = 0;
  let restricted = 0;
  for (const r of rows) {
    if (r.restricted) restricted += r.confidence === "committed" ? r.gross_amount : r.weighted_amount;
    else if (r.confidence === "committed") committed += r.gross_amount;
    else projected += r.weighted_amount;
  }

  // Goal progress: received + secured is the hard money; weighted pipeline is
  // the softer layer behind it.
  const hard = received + committed + restricted;
  const goalPct = goal > 0 ? (hard / goal) * 100 : 0;
  const goalPctWithProj = goal > 0 ? ((hard + projected) / goal) * 100 : 0;

  return (
    <section className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <SectionTitle />
        <div className="flex items-center gap-4 text-xs">
          <span className="text-ink-2">
            Received <span className="font-mono text-revenue">{money(received)}</span>
          </span>
          <span className="text-ink-2">
            Committed <span className="font-mono text-revenue">{money(committed + restricted)}</span>
          </span>
          <span className="text-ink-2">
            Projected <span className="font-mono text-ink-1">{money(projected)}</span>
          </span>
        </div>
      </div>
      <p className="text-xs text-ink-2 mb-4">
        The dated inflows that feed runway — committed at full value, pipeline weighted by
        probability. Restricted money is flagged and excluded from general-operating runway.
      </p>

      {goal > 0 && (
        <div className="mb-5">
          <div className="relative h-6 rounded-full bg-tile overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-orange/25" style={{ width: `${Math.min(100, goalPctWithProj)}%` }} />
            <div className="absolute inset-y-0 left-0 bg-orange" style={{ width: `${Math.min(100, goalPct)}%` }} />
            <div className="absolute inset-0 flex items-center justify-between px-3 text-[10px] text-ink-1 font-medium">
              <span>{goalPct.toFixed(0)}% hard</span>
              <span className="text-ink-2">{goalPctWithProj.toFixed(0)}% w/ weighted pipeline</span>
            </div>
          </div>
          <div className="mt-1.5 text-[11px] text-ink-2">
            {money(hard)} received + committed toward {money(goal)} goal
            {restricted > 0 && <> · {money(restricted)} of it restricted</>}
          </div>
        </div>
      )}

      <ul className="divide-y divide-hairline">
        {sorted.map((r) => (
          <li
            key={`${r.source_type}-${r.source_id}`}
            className="grid grid-cols-[5.5rem_1fr_auto] sm:grid-cols-[6rem_7rem_1fr_auto] items-center gap-3 py-2 text-sm"
          >
            <span className="font-mono text-xs text-ink-2">{monthLabel(r.month)}</span>
            <span className="hidden sm:block">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${SOURCE_CHIP[r.source_type] ?? SOURCE_CHIP.manual}`}>
                {SOURCE_LABEL[r.source_type] ?? r.source_type}
              </span>
            </span>
            <span className="min-w-0 truncate text-ink-1" title={r.label}>
              {r.label}
              {r.needs_schedule && (
                <span className="ml-2 text-[10px] text-[#A56A1B]" title="Awarded but not tranched — counted as a lump at the period start">
                  needs schedule
                </span>
              )}
              {r.restricted && (
                <span className="ml-2 text-[10px] text-[#A56A1B]">
                  restricted{r.restricted_to ? ` · ${r.restricted_to}` : ""}
                </span>
              )}
            </span>
            <span className="text-right font-mono [font-variant-numeric:tabular-nums]">
              {r.confidence === "committed" ? (
                <span className="text-ink-1">{money(r.gross_amount)}</span>
              ) : (
                <span className="text-ink-2" title={`${money(r.gross_amount)} ask, weighted`}>
                  {money(r.weighted_amount)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionTitle() {
  return (
    <h2 className="font-heading font-bold text-ink-1 text-lg">
      Revenue schedule
      <span className="ml-2 text-[10px] uppercase tracking-wider text-ink-2 font-normal align-middle">
        canonical · feeds runway
      </span>
    </h2>
  );
}
