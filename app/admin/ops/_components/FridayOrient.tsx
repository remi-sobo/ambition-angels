import { loadRhythmSnapshot } from "@/lib/admin/ops/rhythm";
import { buildFridayStatus } from "@/lib/admin/ops/statusLine";
import WeekStatusLine from "./WeekStatusLine";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Step 1 of the Friday Close: the status. What's true now, and what didn't
 * close. Same snapshot/builder the hub uses, role-weighted, no AI.
 */
export default async function FridayOrient() {
  const snapshot = await loadRhythmSnapshot("friday_close");
  const status =
    snapshot && snapshot.mode === "friday_close"
      ? buildFridayStatus(snapshot.who.role, snapshot.counts)
      : null;

  return (
    <section className="rounded-card border-[1.5px] border-outline bg-surface p-6 space-y-3">
      <h2 className={TYPE.sectionHeader}>Status</h2>
      {status ? (
        <>
          <WeekStatusLine status={status} />
          <p className="text-sm text-ink-2">
            {status.tone === "calm"
              ? "Clean close. Truth what's left, then put the week down."
              : "Some of this is still open. Truth each task — done, roll it deliberately, or drop it — and clear the follow-ups before the weekend."}
          </p>
        </>
      ) : (
        <p className="text-sm text-ink-2">Couldn&apos;t read this week. Try a refresh.</p>
      )}
    </section>
  );
}
