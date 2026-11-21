"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import MoreActionsMenu, { type MenuAction } from "@/app/admin/_components/ui/MoreActionsMenu";
import Drawer from "@/app/admin/_components/ui/Drawer";
import Button from "@/app/admin/_components/ui/Button";
import Figure from "@/app/admin/_components/ui/Figure";
import SetBalanceDrawer from "./SetBalanceDrawer";
import RunwayTiers from "./RunwayTiers";
import type { RunwayPledge } from "@/lib/finance/runway";
import { TYPE } from "@/lib/admin/typeScale";

type Horizon = 3 | 6 | 12;

export type BreakdownFigure = { label: string; value: string | null; source: string };
export type BreakdownShare = { label: string; amount: string; pct: number };

export type RunwayDetail = {
  baseline: number;
  baselineSource: "config" | "trailing";
  bankBalance: number;
  mtdSpend: number;
  endCurrentMonth: string;
  horizonEnds: Record<Horizon, string>;
  defaultHorizon: number;
  pledges: RunwayPledge[];
  restrictedInflows: number;
};

/**
 * The snapshot's header controls (V4 Stage G2). Everything that was on the
 * old dashboard and is not the main thing lives one click away here:
 *  - "Set current balance" opens the kit Drawer (also reachable as
 *    ?set=balance, which the cash figure's Refresh link uses);
 *  - "How runway is figured" opens the three runway tiers with the 3, 6 and
 *    12 month projection;
 *  - "Year at a glance" holds the secondary figures and the program, admin
 *    and fundraising split and revenue by source, each with its source;
 *  - links to the forecast, budget, board report, revenue and setup.
 */
export default function SnapshotActions({
  canWrite,
  computedCash,
  anchorDate,
  runway,
  figures,
  functional,
  bySource,
}: {
  canWrite: boolean;
  computedCash: number | null;
  anchorDate: string | null;
  runway: RunwayDetail;
  figures: BreakdownFigure[];
  functional: BreakdownShare[];
  bySource: BreakdownShare[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [runwayOpen, setRunwayOpen] = useState(false);
  const [glanceOpen, setGlanceOpen] = useState(false);

  // ?set=balance opens the drawer (the Refresh link on a stale cash figure).
  useEffect(() => {
    if (params.get("set") === "balance" && canWrite) setBalanceOpen(true);
    if (params.get("show") === "runway") setRunwayOpen(true);
  }, [params, canWrite]);

  const clearParam = () => {
    if (params.get("set") || params.get("show")) router.replace(pathname, { scroll: false });
  };

  const items: MenuAction[] = [
    ...(canWrite ? [{ label: "Set current balance", onSelect: () => setBalanceOpen(true) }] : []),
    { label: "How runway is figured", onSelect: () => setRunwayOpen(true) },
    { label: "Year at a glance", onSelect: () => setGlanceOpen(true) },
    { label: "Open forecast", href: "/admin/finance/forecast" },
    { label: "Pledges and received gifts", href: "/admin/finance/forecast#revenue" },
    { label: "Budget", href: "/admin/finance/budget" },
    { label: "Board report", href: "/admin/finance/reports?view=board" },
    { label: "Finance settings", href: "/admin/settings/finance" },
  ];

  return (
    <>
      <MoreActionsMenu items={items} />
      {canWrite ? (
        <SetBalanceDrawer
          open={balanceOpen}
          onClose={() => {
            setBalanceOpen(false);
            clearParam();
          }}
          computedCash={computedCash}
          anchorDate={anchorDate}
        />
      ) : null}
      <Drawer
        open={runwayOpen}
        onClose={() => {
          setRunwayOpen(false);
          clearParam();
        }}
        width={560}
        title="How runway is figured"
        description="Months the money lasts, three ways, from the same engine as the snapshot."
        footer={
          <Button variant="secondary" href="/admin/finance/forecast">
            Open forecast
          </Button>
        }
      >
        <RunwayTiers
          baseline={runway.baseline}
          baselineSource={runway.baselineSource}
          bankBalance={runway.bankBalance}
          mtdSpend={runway.mtdSpend}
          endCurrentMonth={runway.endCurrentMonth}
          horizonEnds={runway.horizonEnds}
          defaultHorizon={runway.defaultHorizon}
          pledges={runway.pledges}
          restrictedInflows={runway.restrictedInflows}
          framed={false}
        />
      </Drawer>
      <Drawer
        open={glanceOpen}
        onClose={() => setGlanceOpen(false)}
        width={560}
        title="Year at a glance"
        description="The supporting figures behind the snapshot, each with where it comes from."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {figures.map((f) => (
            <Figure key={f.label} layout="card" label={f.label} value={f.value} source={f.source} />
          ))}
        </div>
        <Shares
          title="Spending by function"
          source="This year's spending by each category's class: program, admin or fundraising. The same split a Form 990 reports."
          rows={functional}
          empty="Categorize some spending to see the split."
        />
        <Shares
          title="Money in by source"
          source="Received pledges by source type, plus bank deposits routed by their revenue category. Pipeline is not counted."
          rows={bySource}
          empty="Record received pledges or import deposits to see the mix."
        />
      </Drawer>
    </>
  );
}

function Shares({ title, source, rows, empty }: { title: string; source: string; rows: BreakdownShare[]; empty: string }) {
  return (
    <section className="mt-6">
      <h3 className={TYPE.cardTitle}>{title}</h3>
      <p className="text-xs text-ink-2 mt-1 mb-3">{source}</p>
      {rows.length === 0 ? (
        <p className={TYPE.bodyMuted}>{empty}</p>
      ) : (
        <ul className="divide-y divide-hairline border-y border-hairline">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="flex-1 min-w-0 truncate text-ink-1">{r.label}</span>
              <span className="w-24 h-1.5 rounded-full bg-tile overflow-hidden" aria-hidden>
                <span className="block h-full bg-ink-2" style={{ width: `${Math.min(100, Math.round(r.pct * 100))}%` }} />
              </span>
              <span className="w-12 text-right tabular-nums text-ink-2">{Math.round(r.pct * 100)}%</span>
              <span className="w-24 text-right tabular-nums text-ink-1">{r.amount}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
