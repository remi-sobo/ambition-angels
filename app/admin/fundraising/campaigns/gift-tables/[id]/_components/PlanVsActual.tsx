import { TYPE } from "@/lib/admin/typeScale";
import { Alert, Card } from "@/app/admin/_components/ui";
import { StaticTable } from "@/app/admin/_components/ui/DataTable";
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
        {/* The kit table (V4 P1): cards under 640px. */}
        <div className="mt-3">
          <StaticTable
            label={`By level, frozen on ${snapshot.closedOn}`}
            noun={{ one: "level", many: "levels" }}
            rows={snapshot.levels}
            getRowId={(l) => l.levelId}
            getRowLabel={(l) => l.label}
            minWidth={760}
            columns={[
              { key: "level", header: "Level", card: "title", render: (l) => <span className={TYPE.body}>{l.label}</span> },
              { key: "value", header: "Value", align: "right", render: (l) => <span className="tabular-nums">{formatGiftMoney(l.value)}</span> },
              { key: "needed", header: "Needed", align: "right", render: (l) => <span className="tabular-nums">{l.needed}</span> },
              { key: "placed", header: "Placed", align: "right", render: (l) => <span className="tabular-nums">{l.placed}</span> },
              { key: "gap", header: "Gap", align: "right", render: (l) => <span className="tabular-nums">{l.gap}</span> },
              { key: "committed", header: "Committed", align: "right", render: (l) => <span className="tabular-nums">{l.committed}</span> },
              { key: "committedValue", header: "Committed value", align: "right", render: (l) => <span className="tabular-nums">{formatGiftMoney(l.committedValue)}</span> },
              { key: "conversion", header: "Conversion", align: "right", render: (l) => <span className="tabular-nums">{Math.round(l.conversion * 100)}%</span> },
              {
                key: "now",
                header: "Now",
                align: "right",
                render: (l) => {
                  const now = liveByLevel.get(l.levelId);
                  // A level deleted after close has no live row. Saying so is
                  // better than printing a dash that reads as zero.
                  const nowLabel = !now
                    ? "level removed"
                    : drifted(now.committedValue, l.committedValue)
                      ? formatGiftMoney(now.committedValue)
                      : "unchanged";
                  return <span className={`${TYPE.metadata} tabular-nums`}>{nowLabel}</span>;
                },
              },
            ]}
          />
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
