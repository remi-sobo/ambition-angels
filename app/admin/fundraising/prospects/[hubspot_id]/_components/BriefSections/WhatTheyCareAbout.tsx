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
      className="rounded-card border border-white/10 bg-black/30 p-6 group"
    >
      <summary className="cursor-pointer select-none text-xs uppercase tracking-wider text-gray-mid hover:text-cream">
        What they care about
      </summary>

      <div className="mt-4 space-y-5">
        {data.mission_statement && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-cream/50 mb-1">
              Mission
            </div>
            <blockquote className="italic text-cream/85 border-l-2 border-orange/40 pl-3 text-sm">
              {data.mission_statement}
            </blockquote>
          </div>
        )}

        {data.funding_priorities.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-cream/50 mb-2">
              Funding priorities
            </div>
            <ul className="space-y-1.5 text-sm text-cream/85">
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
            <div className="text-[10px] uppercase tracking-wider text-cream/50 mb-2">
              Recent grants
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-gray-mid border-b border-white/10">
                    <th className="text-left font-medium pb-2 pr-4">Recipient</th>
                    <th className="text-right font-medium pb-2 pr-4">Amount</th>
                    <th className="text-left font-medium pb-2 pr-4">Purpose</th>
                    <th className="text-left font-medium pb-2">Year</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.recent_grants.map((g, i) => (
                    <tr key={i} className="text-cream/85">
                      <td className="py-2 pr-4">{g.recipient}</td>
                      <td className="py-2 pr-4 text-right font-mono">
                        {g.amount ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-cream/70">
                        {g.purpose ?? "—"}
                      </td>
                      <td className="py-2 text-cream/60 font-mono">
                        {g.year ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {data.public_statements && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-cream/50 mb-1">
              Recent public statements
            </div>
            <p className="text-sm text-cream/85 leading-relaxed">
              {data.public_statements}
            </p>
          </div>
        )}

        {data.what_they_dont_fund && (
          <div className="rounded-lg border-l-4 border-orange bg-orange/[0.07] p-4">
            <div className="text-[10px] uppercase tracking-wider text-orange/90 mb-1 font-bold">
              What they don&apos;t fund
            </div>
            <p className="text-sm text-cream leading-relaxed">
              {data.what_they_dont_fund}
            </p>
          </div>
        )}
      </div>
    </details>
  );
}
