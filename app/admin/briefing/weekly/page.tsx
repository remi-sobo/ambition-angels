import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import SectionHeading from "../../_components/SectionHeading";
import { GenerateButton } from "../_components/BriefingControls";
import PageHeader from "../../_components/PageHeader";
import type { BriefingData } from "@/lib/briefing";
import { gatherCrmOverdue, crmTaskHref, type CrmOverdueTask } from "@/lib/admin/crmOverdue";

// AI-narrated weekly briefing (the original Executive Briefing). The daily
// decision feed now lives at /admin/briefing; this weekly edition — narrated
// from live data by the model on the Monday cron — is preserved here.
export const dynamic = "force-dynamic";

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function CrmOverdueGroup({ title, rows }: { title: string; rows: CrmOverdueTask[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-[11px] uppercase tracking-wider text-ink-2 mb-1">
        {title} ({rows.length})
      </div>
      <ul className="space-y-1 text-sm">
        {rows.slice(0, 12).map((t) => (
          <li key={t.id} className="flex items-baseline gap-2">
            <Link href={crmTaskHref(t)} className="font-semibold text-orange hover:text-orange-dark whitespace-nowrap">
              {t.label}
            </Link>
            <span className="text-ink-1 truncate">{t.title}</span>
            <span className="ml-auto text-[11px] text-expense whitespace-nowrap tabular-nums">
              {t.daysOverdue}d overdue
            </span>
          </li>
        ))}
        {rows.length > 12 && <li className="text-[11px] text-ink-3">+{rows.length - 12} more</li>}
      </ul>
    </div>
  );
}

export default async function WeeklyBriefingPage() {
  const supabase = getSupabaseAdmin();
  const [{ data }, crm] = await Promise.all([
    supabase
      .from("briefings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    gatherCrmOverdue(),
  ]);

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
        title="Weekly Briefing"
        subtitle="Narrated from live data — every number is computed, never invented"
        actions={<GenerateButton />}
      />

      <Link href="/admin/briefing" className="inline-block mb-5 text-xs font-semibold text-orange hover:text-orange-dark">
        ← Today’s decision feed
      </Link>

      {crm.total > 0 && (
        <section className="mb-6 bg-surface border-[1.5px] border-expense/30 rounded-card p-5">
          <SectionHeading as="h3" className="mb-3">
            ⏰ Overdue across CRM ({crm.total})
          </SectionHeading>
          <CrmOverdueGroup title="Partners" rows={crm.partners} />
          <CrmOverdueGroup title="Donors" rows={crm.donors} />
        </section>
      )}

      {!b ? (
        <p className="text-sm text-ink-2">
          No briefing yet — generate the first one, or wait for Monday&apos;s edition.
        </p>
      ) : (
        <article className="space-y-6">
          <div className="text-[11px] text-ink-2">
            {b.kind === "weekly" ? "Monday edition" : "On demand"} ·{" "}
            {b.created_at.slice(0, 10)}
            {b.model ? ` · narrated by ${b.model}` : " · data-only (narration unavailable)"}
          </div>

          {b.headline && (
            <h2 className="font-heading font-bold text-xl text-ink-1 leading-snug">
              {b.headline}
            </h2>
          )}

          {b.narrative && (
            <div className="bg-surface border border-orange/20 rounded-card p-5 text-[15px] text-ink-1 leading-relaxed whitespace-pre-wrap">
              {b.narrative}
            </div>
          )}

          {b.priorities.length > 0 && (
            <section>
              <SectionHeading as="h3" className="mb-2">
                Recommended priorities
              </SectionHeading>
              <ol className="space-y-2">
                {b.priorities.map((p, i) => (
                  <li key={i} className="flex gap-3 text-sm text-ink-1">
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
            <SectionHeading as="h3" className="mb-2">
              The week in numbers
            </SectionHeading>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
              {[
                ["Gifts", `${b.data.week.gifts} · ${fmtUsd(b.data.week.giftTotal)}`],
                ["New constituents", String(b.data.week.newConstituents)],
                ["Pipeline moves", String(b.data.week.pipelineMoves)],
                ["Awaiting acknowledgment", String(b.data.todos.pendingAcks)],
              ].map(([label, value]) => (
                <div key={label} className="bg-surface border-[1.5px] border-outline rounded-xl p-3">
                  <div className="text-[10px] uppercase tracking-wider text-ink-2">{label}</div>
                  <div className="font-bold text-ink-1 tabular-nums">{value}</div>
                </div>
              ))}
            </div>
          </section>

          {b.data.deadlines.length > 0 && (
            <section>
              <SectionHeading as="h3" className="mb-2">
                Next two weeks
              </SectionHeading>
              <ul className="space-y-1 text-sm text-ink-1">
                {b.data.deadlines.map((d, i) => (
                  <li key={i}>
                    <span className="text-ink-2 tabular-nums">{d.due}</span> · {d.what}
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
