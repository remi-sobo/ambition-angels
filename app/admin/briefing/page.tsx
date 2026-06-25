import Link from "next/link";
import PageHeader from "../_components/PageHeader";
import { gatherBriefingView } from "@/lib/admin/briefing/gather";
import { getNarrative } from "@/lib/admin/briefing/narrate";
import BriefingCard from "./_components/BriefingCard";
import NarrativeHero from "./_components/NarrativeHero";
import PulseStrip from "./_components/PulseStrip";
import FundraisingPriorities from "./_components/FundraisingPriorities";
import FollowUps from "./_components/FollowUps";
import TodayAgenda from "../_components/overview/TodayAgenda";

// Executive Briefing v2 (spec Phase 1): an AI-narrated morning brief over a
// deterministic engine. The ranked decision feed and pulse strip are computed
// from real spine records (no model calls); a cached Sonnet narrative phrases
// those facts on top, regenerated at most once a day.
export const dynamic = "force-dynamic";

export default async function BriefingPage() {
  const { briefing, pulse, followups, fundraising } = await gatherBriefingView();
  const narrative = await getNarrative(briefing, pulse, followups);
  const today = new Date(briefing.computedAt).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const rest = briefing.items.slice(briefing.top.length);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[800px]">
      <PageHeader
        title="Needs you today"
        subtitle={`Your morning brief · ${today}`}
        actions={
          <Link
            href="/admin/briefing/weekly"
            className="text-xs font-semibold text-orange hover:text-orange-dark"
          >
            Weekly briefing →
          </Link>
        }
      />

      {/* Lead with Today: the agenda sits above the verdict (spec Phase 4). */}
      <div className="mb-6">
        <TodayAgenda />
      </div>

      <NarrativeHero narrative={narrative} />
      <PulseStrip pulse={pulse} />

      {briefing.top.length === 0 ? (
        <div className="rounded-card border-[1.5px] border-outline bg-surface shadow-panel p-10 text-center">
          <div className="font-heading font-semibold text-lg text-ink-1">Nothing needs you today.</div>
          <div className="text-sm text-ink-2 mt-1">{today} — the spine is clear.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {briefing.top.map((it) => (
            <BriefingCard key={it.id} item={it} />
          ))}

          {briefing.restCount > 0 && (
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-ink-2 hover:text-ink-1 px-1 py-2 select-none">
                See all ({briefing.restCount} more)
              </summary>
              <div className="space-y-3 mt-3">
                {rest.map((it) => (
                  <BriefingCard key={it.id} item={it} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <div className="mt-6">
        <FundraisingPriorities moves={fundraising} />
        <FollowUps followups={followups} />
      </div>
    </div>
  );
}
