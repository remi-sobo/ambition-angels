import { loadRhythmSnapshot } from "@/lib/admin/ops/rhythm";
import { buildMondayStatus } from "@/lib/admin/ops/statusLine";
import WeekStatusLine from "./WeekStatusLine";

/**
 * Step 1 of the Monday Plan: orient. The deterministic, role-weighted status —
 * the three-second read before the guided pass. Calm if calm, flares where it
 * isn't. Loads the same snapshot the My Week hub uses, so the line is identical
 * in both places (one source of truth, no AI).
 */
export default async function MondayOrient() {
  const snapshot = await loadRhythmSnapshot("monday_plan");
  const status =
    snapshot && snapshot.mode === "monday_plan"
      ? buildMondayStatus(snapshot.who.role, snapshot.counts)
      : null;

  return (
    <section className="rounded-card border-[1.5px] border-outline bg-surface p-6 space-y-3">
      <h2 className="text-xs uppercase tracking-wider text-ink-2">Orient</h2>
      {status ? (
        <>
          <WeekStatusLine status={status} />
          <p className="text-sm text-ink-2">
            {status.tone === "calm"
              ? "A calm read. Walk the week, place what matters, and you're done."
              : "Some of this needs a decision. Clear the carryover first, then place the week against the time you actually have."}
          </p>
        </>
      ) : (
        <p className="text-sm text-ink-2">Couldn&apos;t read this week. Try a refresh.</p>
      )}
    </section>
  );
}
