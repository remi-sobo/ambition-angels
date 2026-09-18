import Link from "next/link";
import type { ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";
import { Badge, Card, PageSection } from "@/app/admin/_components/ui";
import {
  formatGiftMoney,
  tableGoal,
  tableShape,
  type CoverageBasis,
  type GiftLevel,
  type GiftTable,
} from "@/lib/fundraising/gift-table";

/**
 * The Gift tables section of Campaigns (specs/fundraising-gift-tables.md,
 * Phase 2, Open decision 1).
 *
 * It lives here rather than behind a sixth fundraising tab: the V2 nav folded
 * Plan into Campaigns on purpose, and a gift table IS a campaign's plan. One
 * row per table, showing the two numbers that never merge — what the window
 * must raise with slippage on top, and what the levels actually add up to.
 */

export type GiftTableRow = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  status: string;
  target: number | string;
  multiplier: number | string;
  goal_round_to: number | null;
  coverage_basis: string;
  default_term_years: number;
  monthly_modeled_years: number;
};

export type GiftLevelRow = {
  gift_table_id: string;
  amount: number | string;
  cadence: string;
  term_years: number | null;
  gifts_needed: number;
  prospects_per_gift: number;
};

const BASIS_LABEL: Record<CoverageBasis, string> = {
  window: "window",
  annual: "per year",
  full_term: "full term",
};

const STATUS_TONE: Record<string, "neutral" | "success" | "accent"> = {
  draft: "neutral",
  active: "success",
  closed: "accent",
  archived: "neutral",
};

export default function GiftTablesSection({
  tables,
  levels,
  action,
  showArchived = false,
}: {
  tables: GiftTableRow[];
  levels: GiftLevelRow[];
  action?: ReactNode;
  /** Viewing the archive rather than the working list. */
  showArchived?: boolean;
}) {
  return (
    <PageSection
      title={showArchived ? "Archived gift tables" : "Gift tables"}
      action={action}
    >
      {/* Archived tables are hidden, never deleted. The way back is a link,
          not a setting somebody has to know exists. */}
      <p className={`${TYPE.metadata} mb-3`}>
        <Link
          href={showArchived ? "/admin/fundraising/campaigns" : "/admin/fundraising/campaigns?archived=1"}
          className="hover:text-orange transition-colors"
        >
          {showArchived ? "Back to the working list" : "Show archived tables"}
        </Link>
      </p>

      {tables.length === 0 ? (
        <Card>
          <p className={TYPE.bodyMuted}>
            {showArchived
              ? "Nothing archived. A table is archived after it is closed, when it should stop appearing in the list."
              : "No gift tables yet. A gift table turns a target into a shape: how many gifts, at what size. Then into the names who could give them."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {tables.map((t) => {
            const table: GiftTable = {
              id: t.id,
              name: t.name,
              startsOn: t.starts_on,
              endsOn: t.ends_on,
              status: t.status as GiftTable["status"],
              target: Number(t.target ?? 0),
              multiplier: Number(t.multiplier ?? 1),
              goalRoundTo: t.goal_round_to === null ? null : Number(t.goal_round_to),
              coverageBasis: t.coverage_basis as CoverageBasis,
              defaultTermYears: Number(t.default_term_years ?? 1),
              monthlyModeledYears: Number(t.monthly_modeled_years ?? 1),
            };
            const mine: GiftLevel[] = levels
              .filter((l) => l.gift_table_id === t.id)
              .map((l, i) => ({
                id: `${t.id}-${i}`,
                label: "",
                amount: Number(l.amount),
                cadence: l.cadence as GiftLevel["cadence"],
                termYears: l.term_years === null ? null : Number(l.term_years),
                giftsNeeded: Number(l.gifts_needed),
                prospectsPerGift: Number(l.prospects_per_gift),
                sort: i,
              }));
            const goal = tableGoal(table);
            const shape = tableShape(mine, table);
            const prospects = mine.reduce((s, l) => s + l.prospectsPerGift * l.giftsNeeded, 0);

            return (
              <Card key={t.id} as="article">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className={TYPE.cardTitle}>
                    <Link
                      href={`/admin/fundraising/campaigns/gift-tables/${t.id}`}
                      className="hover:text-orange transition-colors"
                    >
                      {t.name}
                    </Link>
                  </h3>
                  <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{t.status}</Badge>
                </div>
                <p className={`${TYPE.metadata} mt-0.5`}>
                  {t.starts_on} → {t.ends_on} · {BASIS_LABEL[table.coverageBasis] ?? t.coverage_basis} basis
                </p>
                {mine.length === 0 ? (
                  <p className={`${TYPE.bodyMuted} mt-3`}>
                    No levels yet. The shape is the next decision.
                  </p>
                ) : (
                  <p className={`${TYPE.body} mt-3 tabular-nums`}>
                    <span className="font-semibold">{formatGiftMoney(shape)}</span>{" "}
                    <span className={TYPE.bodyMuted}>on the table against a</span>{" "}
                    <span className="font-semibold">{formatGiftMoney(goal)}</span>{" "}
                    <span className={TYPE.bodyMuted}>
                      goal · {mine.reduce((s, l) => s + l.giftsNeeded, 0)} gifts ·{" "}
                      {prospects} prospects needed
                    </span>
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </PageSection>
  );
}
