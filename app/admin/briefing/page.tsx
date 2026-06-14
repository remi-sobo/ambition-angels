import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { GenerateButton } from "./_components/BriefingControls";
import PageHeader from "../_components/PageHeader";
import type { BriefingData } from "@/lib/briefing";

// Executive Briefing (Ring 4, modules/01-command-center.md): the AI chief
// of staff. Numbers come from the metric registry; the model only narrates.
// Weekly editions generate with the Monday cron; this page also generates
// on demand.
export const dynamic = "force-dynamic";

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function BriefingPage() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("briefings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const b = data as
    | {
        headline: string | null;
        narrative: string | null;
        priorities: string[];
        data: BriefingData;
        model: string | null;
        kind: string;
        created_at: string;
      }
    | null;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[800px]">
      <PageHeader
        title="Executive Briefing"
        subtitle="Narrated from live data — every number is computed, never invented"
        actions={<GenerateButton />}
      />

      {!b ? (
        <p className="text-sm text-gray-mid">
          No briefing yet — generate the first one, or wait for Monday&apos;s edition.
        </p>
      ) : (
        <article className="space-y-6">
          <div className="text-[11px] text-gray-mid">
            {b.kind === "weekly" ? "Monday edition" : "On demand"} ·{" "}
            {b.created_at.slice(0, 10)}
            {b.model ? ` · narrated by ${b.model}` : " · data-only (narration unavailable)"}
          </div>

          {b.headline && (
            <h2 className="font-heading font-bold text-xl text-cream leading-snug">
              {b.headline}
            </h2>
          )}

          {b.narrative && (
            <div className="bg-[#161926] border border-orange/20 rounded-card p-5 text-[15px] text-cream/90 leading-relaxed whitespace-pre-wrap">
              {b.narrative}
            </div>
          )}

          {b.priorities.length > 0 && (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-cream/70 mb-2">
                Recommended priorities
              </h3>
              <ol className="space-y-2">
                {b.priorities.map((p, i) => (
                  <li key={i} className="flex gap-3 text-sm text-cream/90">
                    <span className="w-5 h-5 rounded-full bg-orange/15 text-orange text-[11px] font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    {p}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-cream/70 mb-2">
              The week in numbers
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
              {[
                ["Gifts", `${b.data.week.gifts} · ${fmtUsd(b.data.week.giftTotal)}`],
                ["New constituents", String(b.data.week.newConstituents)],
                ["Pipeline moves", String(b.data.week.pipelineMoves)],
                ["Awaiting acknowledgment", String(b.data.todos.pendingAcks)],
              ].map(([label, value]) => (
                <div key={label} className="bg-[#161926] border border-white/10 rounded-xl p-3">
                  <div className="text-[10px] uppercase tracking-wider text-gray-mid">{label}</div>
                  <div className="font-bold text-cream tabular-nums">{value}</div>
                </div>
              ))}
            </div>
          </section>

          {b.data.deadlines.length > 0 && (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-cream/70 mb-2">
                Next two weeks
              </h3>
              <ul className="space-y-1 text-sm text-cream/85">
                {b.data.deadlines.map((d, i) => (
                  <li key={i}>
                    <span className="text-gray-mid tabular-nums">{d.due}</span> · {d.what}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      )}
    </div>
  );
}
