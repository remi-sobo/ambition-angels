import Link from "next/link";
import { gatherBriefing } from "@/lib/admin/briefing/gather";
import { StatusChip } from "./StatusChip";
import { SEVERITY_STATUS, SEVERITY_LABEL } from "@/lib/admin/briefing/types";

// "Needs you today" strip (spec Phase 6): the top of the Overview becomes the
// place you start the day, not a metric wall. Drawn from the briefing engine's
// top items (deterministic, no model calls). Read-only here — decisions live on
// the full /admin/briefing feed; each row deep-links to its source.
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
        <Link
          href="/admin/briefing"
          className="text-xs font-semibold text-orange hover:text-orange-dark shrink-0"
        >
          {more > 0 ? `See all (${briefing.items.length}) →` : "Open briefing →"}
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-ink-2">Nothing needs you today — the spine is clear.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {items.map((it) => (
            <li key={it.id}>
              <Link href={it.deepLink} className="flex items-center gap-3 py-2.5 group">
                <StatusChip status={SEVERITY_STATUS[it.severity]}>
                  {SEVERITY_LABEL[it.severity]}
                </StatusChip>
                <span className="text-sm font-medium text-ink-1 min-w-0 truncate group-hover:text-orange">
                  {it.title}
                </span>
                {it.metric && (
                  <span className="ml-auto shrink-0 text-xs font-mono tabular-nums text-ink-2">
                    {it.metric}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
