import Link from "next/link";
import { TYPE } from "@/lib/admin/typeScale";
import { Card } from "@/app/admin/_components/ui";
import { formatGiftMoney, type FillItem, type WorkGroups } from "@/lib/fundraising/gift-table";

/**
 * Work the table (specs/fundraising-gift-tables.md, Phase 4).
 *
 * The four things a gift table is FOR, once it exists: collect what was
 * promised, move the asks already open, fill the levels that are thin, renew
 * the people nobody asked again.
 *
 * A draft table produces none of them — workGroups() returns empty for any
 * status but active, so this renders nothing rather than putting work in
 * someone's queue for a table nobody has committed to.
 */

const CARDS = [
  {
    key: "collect" as const,
    title: "Collect",
    blurb: "Money already promised. Following up is not fundraising, it is the highest return work available.",
  },
  {
    key: "move" as const,
    title: "Move",
    blurb: "Next steps due this week or already overdue.",
  },
  {
    key: "renew" as const,
    title: "Renew",
    blurb: "Gave before, nobody has asked again. The cheapest list in the building.",
  },
];

export default function WorkCards({ work }: { work: WorkGroups }) {
  const total = work.collect.length + work.move.length + work.fill.length + work.renew.length;
  if (total === 0) return null;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {CARDS.map((c) => {
        const items = work[c.key];
        if (items.length === 0) return null;
        return (
          <Card key={c.key} tone={c.key === "collect" ? "attention" : "default"}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className={TYPE.cardTitle}>{c.title}</h3>
              <span className={TYPE.metadata}>{items.length}</span>
            </div>
            <p className={`${TYPE.metadata} mt-0.5`}>{c.blurb}</p>
            <ul className="mt-3 space-y-1.5">
              {items.slice(0, 8).map((i) => (
                <li key={i.key} className="flex items-baseline justify-between gap-3">
                  <span className={`${TYPE.body} min-w-0 truncate`}>
                    {i.label}
                    <span className={`${TYPE.metadata} ml-2`}>{i.detail}</span>
                  </span>
                  <span
                    className={`${TYPE.metadata} shrink-0 tabular-nums ${
                      i.overdue ? "text-status-critical-text font-semibold" : ""
                    }`}
                  >
                    {i.amount !== null ? formatGiftMoney(i.amount) : ""}
                    {i.dueOn ? ` ${i.dueOn}` : ""}
                  </span>
                </li>
              ))}
              {items.length > 8 && (
                <li className={TYPE.metadata}>and {items.length - 8} more</li>
              )}
            </ul>
          </Card>
        );
      })}

      {work.fill.length > 0 && <FillCard items={work.fill} />}
    </div>
  );
}

/** Fill is the only card sorted by money rather than by date: a level's
 *  shortfall is worth (gap ÷ prospects per gift) × the level's value, and
 *  working them in that order is the difference between a table that closes
 *  and one that is merely busy. */
function FillCard({ items }: { items: FillItem[] }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={TYPE.cardTitle}>Fill</h3>
        <span className={TYPE.metadata}>{items.length}</span>
      </div>
      <p className={`${TYPE.metadata} mt-0.5`}>
        Levels short on names, worst first by dollars at risk.
      </p>
      <ul className="mt-3 space-y-1.5">
        {items.slice(0, 8).map((f) => (
          <li key={f.levelId} className="flex items-baseline justify-between gap-3">
            <span className={TYPE.body}>
              Level {f.label}
              <span className={`${TYPE.metadata} ml-2`}>
                {f.gap} name{f.gap === 1 ? "" : "s"} short
              </span>
            </span>
            <span className={`${TYPE.metadata} tabular-nums`}>
              {formatGiftMoney(f.dollarsAtRisk)} at risk
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The Today's Moves row shape, so the queue and the table agree. */
export function TodayGiftTableRow({
  tableId,
  tableName,
  label,
  detail,
  dueOn,
  overdue,
}: {
  tableId: string;
  tableName: string;
  label: string;
  detail: string;
  dueOn: string | null;
  overdue: boolean;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3 px-5 py-2.5">
      <span className={`${TYPE.body} min-w-0`}>
        {label}
        <span className={`${TYPE.metadata} ml-2`}>{detail}</span>
        <Link
          href={`/admin/fundraising/campaigns/gift-tables/${tableId}`}
          className={`${TYPE.metadata} ml-2 hover:text-orange transition-colors`}
        >
          {tableName}
        </Link>
      </span>
      <span
        className={`${TYPE.metadata} shrink-0 tabular-nums ${
          overdue ? "text-status-critical-text font-semibold" : ""
        }`}
      >
        {dueOn ?? ""}
      </span>
    </li>
  );
}
