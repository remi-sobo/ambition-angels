import Link from "next/link";
import PageHeader from "../_components/PageHeader";
import { gatherBriefing } from "@/lib/admin/briefing/gather";
import BriefingCard from "./_components/BriefingCard";

// Executive Briefing v1 (spec Phase 4): a deterministic, ranked, capped daily
// decision feed. Every item is computed from a real spine record (no model
// calls), so opening this page every morning never touches the metered agent.
export const dynamic = "force-dynamic";

export default async function BriefingPage() {
  const briefing = await gatherBriefing();
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
        subtitle={`What the spine says needs a decision · ${today}`}
        actions={
          <Link
            href="/admin/briefing/weekly"
            className="text-xs font-semibold text-orange hover:text-orange-dark"
          >
            Weekly briefing →
          </Link>
        }
      />

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
    </div>
  );
}
