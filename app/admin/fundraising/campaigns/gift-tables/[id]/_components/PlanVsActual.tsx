import { TYPE } from "@/lib/admin/typeScale";
import { Alert, Card } from "@/app/admin/_components/ui";
import {
  formatGiftMoney,
  type ClosedSnapshot,
  type LevelSlot,
} from "@/lib/fundraising/gift-table";

/**
 * Plan vs actual (specs/fundraising-gift-tables.md, Phase 5).
 *
 * The frozen close reading, level by level, beside what the spine says NOW.
 *
 * It does not silently re-derive. A gift lands late, a stage gets corrected, a
 * level is edited for next year — and a "what happened" figure computed months
 * afterwards answers a different question than the one anyone asked at close.
 * So the snapshot is the record, the live column is context, and where they
 * disagree the page says so out loud. A number that quietly changed is worse
 * than one that is merely old.
 */

const drifted = (a: number, b: number) => Math.abs(a - b) >= 0.005;

export default function PlanVsActual({
  snapshot,
  slots,
  liveGoal,
  liveShape,
}: {
  snapshot: ClosedSnapshot;
  slots: LevelSlot[];
  liveGoal: number;
  liveShape: number;
}) {
  const liveByLevel = new Map(slots.map((s) => [s.level.id, s]));
  const committedAtClose = snapshot.levels.reduce((a, l) => a + l.committedValue, 0);
  const liveCommitted = slots.reduce((a, s) => a + s.committedValue, 0);

  const moved =
    drifted(snapshot.goal, liveGoal) ||
    drifted(snapshot.shape, liveShape) ||
    drifted(committedAtClose, liveCommitted);

  return (
    <div className="space-y-3">
      {moved && (
        <Alert tone="info">
          The spine has moved since this table was closed. The frozen column is
          what it looked like on {snapshot.closedOn}. The live column is today.
          Neither is wrong; they answer different questions.
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Goal at close" value={snapshot.goal} live={liveGoal} />
        <Figure label="Shape at close" value={snapshot.shape} live={liveShape} />
        <Figure label="Committed at close" value={committedAtClose} live={liveCommitted} />
      </div>

      <Card>
        <h3 className={TYPE.cardTitle}>By level, frozen on {snapshot.closedOn}</h3>
        <p className={`${TYPE.metadata} mt-0.5`}>
          Conversion is placed names that became committed money. It is the number
          next year&rsquo;s table should be built on, and the one nobody writes down.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className={TYPE.tableHeader}>
                <th className="py-1.5 pr-3">Level</th>
                <th className="py-1.5 pr-3 text-right">Value</th>
                <th className="py-1.5 pr-3 text-right">Needed</th>
                <th className="py-1.5 pr-3 text-right">Placed</th>
                <th className="py-1.5 pr-3 text-right">Gap</th>
                <th className="py-1.5 pr-3 text-right">Committed</th>
                <th className="py-1.5 pr-3 text-right">Value</th>
                <th className="py-1.5 pr-3 text-right">Conversion</th>
                <th className="py-1.5 text-right">Now</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.levels.map((l) => {
                const now = liveByLevel.get(l.levelId);
                // A level deleted after close has no live row. Saying so is
                // better than printing a dash that reads as zero.
                const nowLabel = !now
                  ? "level removed"
                  : drifted(now.committedValue, l.committedValue)
                    ? formatGiftMoney(now.committedValue)
                    : "unchanged";
                return (
                  <tr key={l.levelId} className="border-t border-hairline">
                    <td className={`${TYPE.body} py-1.5 pr-3`}>{l.label}</td>
                    <td className={`${TYPE.body} py-1.5 pr-3 text-right tabular-nums`}>
                      {formatGiftMoney(l.value)}
                    </td>
                    <td className={`${TYPE.body} py-1.5 pr-3 text-right tabular-nums`}>{l.needed}</td>
                    <td className={`${TYPE.body} py-1.5 pr-3 text-right tabular-nums`}>{l.placed}</td>
                    <td className={`${TYPE.body} py-1.5 pr-3 text-right tabular-nums`}>{l.gap}</td>
                    <td className={`${TYPE.body} py-1.5 pr-3 text-right tabular-nums`}>{l.committed}</td>
                    <td className={`${TYPE.body} py-1.5 pr-3 text-right tabular-nums`}>
                      {formatGiftMoney(l.committedValue)}
                    </td>
                    <td className={`${TYPE.body} py-1.5 pr-3 text-right tabular-nums`}>
                      {Math.round(l.conversion * 100)}%
                    </td>
                    <td className={`${TYPE.metadata} py-1.5 text-right tabular-nums`}>{nowLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Figure({ label, value, live }: { label: string; value: number; live: number }) {
  const moved = drifted(value, live);
  return (
    <Card>
      <p className={TYPE.metadata}>{label}</p>
      <p className={`${TYPE.cardMetric} tabular-nums`}>{formatGiftMoney(value)}</p>
      <p className={`${TYPE.metadata} mt-0.5`}>
        {moved ? `${formatGiftMoney(live)} now` : "unchanged since close"}
      </p>
    </Card>
  );
}
