import Link from "next/link";
import { gatherBriefing } from "@/lib/admin/briefing/gather";
import BriefingCard from "../briefing/_components/BriefingCard";

// "Needs you today" strip (spec Phase 6): the top of the Overview becomes the
// place you start the day, not a metric wall. Drawn from the briefing engine's
// top items (deterministic, no model calls). Each item renders as the full
// BriefingCard — the why-line plus Open / Done / Snooze / Dismiss (with Undo) —
// so the strip is actionable in place, not just a list of links.
export default async function BriefingStrip({ limit = 4 }: { limit?: number }) {
  let briefing;
  try {
    briefing = await gatherBriefing();
  } catch {
    return null; // never let the strip break the Overview
  }
  const items = briefing.top.slice(0, limit);
  const more = briefing.items.length - items.length;

  return (
    <section className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-heading font-semibold text-ink-1">Needs you today</h2>
        <Link href="/admin/briefing" className="text-xs font-semibold text-orange hover:text-orange-dark shrink-0">
          {more > 0 ? `See all (${briefing.items.length}) →` : "Open briefing →"}
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-ink-2">Nothing needs you today — the spine is clear.</p>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <BriefingCard key={it.id} item={it} />
          ))}
        </div>
      )}
    </section>
  );
}
