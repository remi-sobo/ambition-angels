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
  manual: "Manual",
};

const SOURCE_CHIP: Record<string, string> = {
  pledge: "bg-revenue-bg text-revenue border-revenue/30",
  grant: "bg-orange/15 text-orange border-orange/30",
  pipeline: "bg-tile text-ink-2 border-outline",
  manual: "bg-[#EFE6D4] text-ink-1 border-outline",
};

const monthLabel = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });

export default function RevenueSchedule({ rows }: { rows: RevenueScheduleRow[] }) {
  if (rows.length === 0) {
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

  return (
    <section className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <SectionTitle />
        <div className="flex items-center gap-4 text-xs">
          <span className="text-ink-2">
            Committed <span className="font-mono text-revenue">{money(committed)}</span>
          </span>
          <span className="text-ink-2">
            Projected <span className="font-mono text-ink-1">{money(projected)}</span>
          </span>
          {restricted > 0 && (
            <span className="text-ink-2">
              Restricted <span className="font-mono text-[#A56A1B]">{money(restricted)}</span>
            </span>
          )}
        </div>
      </div>
      <p className="text-xs text-ink-2 mb-4">
        The dated inflows that feed runway — committed at full value, pipeline weighted by
        probability. Restricted money is flagged and excluded from general-operating runway.
      </p>

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
