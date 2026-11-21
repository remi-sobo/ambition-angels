import { StaticTable } from "@/app/admin/_components/ui/DataTable";
import type { BriefContent } from "@/lib/agents/funder-research/types";

export default function WhatTheyCareAbout({
  data,
  defaultOpen = false,
}: {
  data: BriefContent["what_they_care_about"];
  defaultOpen?: boolean;
}) {
  return (
    <details
      {...(defaultOpen ? { open: true } : {})}
      className="rounded-panel border-hairline bg-surface p-6 group"
    >
      <summary className="cursor-pointer select-none text-xs uppercase tracking-wider text-ink-2 hover:text-ink-1">
        What they care about
      </summary>

      <div className="mt-4 space-y-5">
        {data.mission_statement && (
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-3 mb-1">
              Mission
            </div>
            <blockquote className="italic text-ink-1 border-l-2 border-orange/40 pl-3 text-sm">
              {data.mission_statement}
            </blockquote>
          </div>
        )}

        {data.funding_priorities.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-3 mb-2">
              Funding priorities
            </div>
            <ul className="space-y-1.5 text-sm text-ink-1">
              {data.funding_priorities.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-orange/70 shrink-0">▸</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.recent_grants.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-3 mb-2">
              Recent grants
            </div>
            <StaticTable
              label="Recent grants"
              noun={{ one: "grant", many: "grants" }}
              rows={data.recent_grants.map((g, i) => ({ ...g, rowId: String(i) }))}
              getRowId={(g) => g.rowId}
              getRowLabel={(g) => g.recipient}
              columns={[
                { key: "recipient", header: "Recipient", card: "title", render: (g) => <span className="text-ink-1">{g.recipient}</span> },
                { key: "amount", header: "Amount", align: "right", render: (g) => <span className="font-mono">{g.amount ?? "—"}</span> },
                { key: "purpose", header: "Purpose", render: (g) => <span className="text-ink-2">{g.purpose ?? "—"}</span> },
                { key: "year", header: "Year", render: (g) => <span className="text-ink-2 font-mono">{g.year ?? "—"}</span> },
              ]}
            />
          </div>
        )}

        {data.public_statements && (
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-3 mb-1">
              Recent public statements
            </div>
            <p className="text-sm text-ink-1 leading-relaxed">
              {data.public_statements}
            </p>
          </div>
        )}

        {data.what_they_dont_fund && (
          <div className="rounded-control border-l-4 border-orange bg-orange/[0.07] p-4">
            <div className="text-xs uppercase tracking-wider text-orange/90 mb-1 font-bold">
              What they don&apos;t fund
            </div>
            <p className="text-sm text-ink-1 leading-relaxed">
              {data.what_they_dont_fund}
            </p>
          </div>
        )}
      </div>
    </details>
  );
}
