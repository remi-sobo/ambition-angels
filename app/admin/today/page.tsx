import Link from "next/link";
import PageShell from "../_components/ui/PageShell";
import Card, { CardHeader } from "../_components/ui/Card";
import Metric from "../_components/Metric";
import EmptyState from "../_components/EmptyState";
import NeedsYou from "./_components/NeedsYou";
import TalkToLog from "./_components/TalkToLog";
import {
  BoardSummaryPanel,
  CohortsPanel,
  DonorsPanel,
  FinanceQueuePanel,
  MinePanel,
  MoneyPanel,
  MyDayStrip,
  TeamPanel,
  fmtTime,
  moneySentence,
  usd,
  type MoneyView,
} from "./_components/TodayPanels";
import { getTodayData } from "@/lib/admin/today";
import { getAdminUser, getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { getEntitlements, hasFeature } from "@/lib/admin/entitlements";
import { getRolePermissions } from "@/lib/admin/rolePermissions";
import { getFinanceSnapshot } from "@/lib/admin/finance";
import { getMyDisplayName } from "@/lib/admin/profile";
import { getMetricCatalog } from "@/lib/admin/metrics/catalog";
import { createServerSupabase } from "@/lib/supabase/server";
import { decisionLine, dueLabel, panelsOf, selectTodayPanels, type Me } from "@/lib/admin/todayPanels";
import {
  loadBoardSummary,
  loadDonorsNeedMe,
  loadFinanceQueue,
  loadMine,
  loadMyCohorts,
  loadTeamWeek,
} from "@/lib/admin/todayRole";
import { TYPE } from "@/lib/admin/typeScale";
import SetupChecklist from "./_components/SetupChecklist";
import { loadSetupFacts } from "@/lib/admin/setupChecklist-server";
import { checklistView, showChecklist } from "@/lib/admin/setupChecklist";

/**
 * Today by role (V4 Stage C, spec §7; Today.dc.html and TodayPhone.dc.html).
 *
 * Panels are chosen by PERMISSION (selectTodayPanels reads the role's
 * permissions, never its name) and filled by ASSIGNMENT (owner_id, with the
 * older text owner as the fallback; lib/admin/todayRole.ts). One decision
 * line in plain words at the top; the one primary action is Talk to log (or
 * the old quick add for an org without ai.capture). Organization Health stays
 * the second tab of Home (the shell's tab row).
 *
 * Money needs the module AND the role: getFinanceSnapshot reads through the
 * service role, so RLS can't hide it; board_viewer (no finance.read) never
 * sees cash or runway, and staff (finance.read for the Finance pages) keep
 * Today on their own work, per the prototype's "owners and finance only".
 */
export const dynamic = "force-dynamic";

const MISSION_PREFERENCE = ["attendance_rate", "enrolled_in_cohort", "reached_all_time", "active_on_platform"];

function greeting(): string {
  const hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Los_Angeles" }));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function staleAnchor(reconciledAt: string | null): boolean {
  if (!reconciledAt) return true;
  return Math.floor((Date.now() - new Date(reconciledAt).getTime()) / 86400000) > 4;
}

export default async function TodayPage() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <PageShell>
        <h1 className={TYPE.pageTitle}>Today</h1>
        <p className={`${TYPE.bodyMuted} mt-1.5`}>Sign in to see what needs you.</p>
      </PageShell>
    );
  }

  const [data, ents, perms, handle, displayName] = await Promise.all([
    getTodayData(),
    getEntitlements(ctx.orgId),
    getRolePermissions(ctx.role),
    getAdminUser(),
    getMyDisplayName(),
  ]);
  if (!data) return null;

  const layout = selectTodayPanels({ permissions: perms, features: Array.from(ents) });
  const panels = panelsOf(layout);
  const today = data.todayISO;
  const me: Me = { userId: ctx.userId, handle };
  const supabase = createServerSupabase();
  const can = new Set(perms);

  const showFinance = hasFeature(ents, "modules.finance") && (await ctxHasPermission(ctx, "finance.read")) && panels.has("money");
  const fin = showFinance ? await getFinanceSnapshot() : null;
  const money: MoneyView | null = fin
    ? {
        cash: fin.cashOnHand,
        runwayMonths: fin.runwayMonths,
        burn: fin.burn3mo,
        reconciledAt: fin.cfg.reconciledAt,
        stale: staleAnchor(fin.cfg.reconciledAt),
      }
    : null;

  const [mine, donors, team, financeQueue, cohorts, board] = await Promise.all([
    panels.has("mine")
      ? loadMine(supabase, ctx.orgId, me, today, { ops: can.has("ops.read"), fundraising: can.has("fundraising.read") })
      : Promise.resolve(null),
    panels.has("donorsNeedMe") ? loadDonorsNeedMe(supabase, ctx.orgId, me, today) : Promise.resolve(null),
    panels.has("teamWeek") ? loadTeamWeek(supabase, ctx.orgId, me, today) : Promise.resolve(null),
    panels.has("financeQueue") ? loadFinanceQueue(supabase, ctx.orgId) : Promise.resolve(null),
    panels.has("myCohorts") ? loadMyCohorts(supabase, ctx.orgId, me, today) : Promise.resolve(null),
    panels.has("boardSummary") ? loadBoardSummary(supabase, ctx.orgId, today) : Promise.resolve(null),
  ]);

  const mineItems = mine?.items ?? [];
  const late = mineItems.filter((i) => i.due && i.due < today);
  const line = decisionLine({
    layout: layout.kind,
    mine: {
      late: late.length,
      dueToday: mineItems.filter((i) => i.due === today).length,
      first: late[0]?.title ?? null,
    },
    money: money ? { runwayMonths: money.runwayMonths, stale: money.stale } : null,
    financeQueue: financeQueue ? { uncategorized: financeQueue.uncategorized, proposals: financeQueue.proposals } : null,
    captureWaiting: mineItems.filter((i) => i.id.startsWith("capture:")).length,
  });

  // Board viewer: mission figures from the catalog (read-only).
  let missionKeys: string[] = [];
  if (panels.has("boardSummary")) {
    const catalog = await getMetricCatalog();
    const program = catalog.filter((m) => m.active && m.department === "program");
    missionKeys = [
      ...MISSION_PREFERENCE.filter((k) => program.some((m) => m.metric_key === k)),
      ...program.map((m) => m.metric_key).filter((k) => !MISSION_PREFERENCE.includes(k)),
    ].slice(0, 3);
  }

  const dateLine = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });
  const shortDate = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric", timeZone: "UTC",
  });
  const firstName = (displayName ?? handle ?? "").split(/\s+/)[0];
  const hello = `${greeting()}${firstName ? `, ${firstName.charAt(0).toUpperCase()}${firstName.slice(1)}` : ""}`;
  const nowIso = new Date().toISOString();
  const nextEvent = data.myDay.events.find((e) => !e.allDay && e.start >= nowIso) ?? null;
  const orgWide = layout.readOnly ? [] : data.obligations;

  const top = new Set(layout.top);

  // V4 Stage F: the setup checklist, owners and admins only, until done or dismissed.
  const canManageOrg = await ctxHasPermission(ctx, "org.manage");
  const setup = canManageOrg ? await loadSetupFacts(ctx.orgId, ents) : null;
  const setupView = setup && showChecklist(setup, canManageOrg) ? checklistView(setup) : null;

  return (
    <PageShell>
      {/* Header: greeting, date, the decision line, ONE primary action. */}
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className={TYPE.pageTitle}>{hello}</h1>
          <p className={`${TYPE.metadata} mt-1`}>
            <span className="hidden sm:inline">{dateLine}</span>
            <span className="sm:hidden">{shortDate}</span> · {ctx.orgName}
          </p>
          <p className={`${TYPE.body} mt-2 max-w-[70ch]`} data-testid="today-decision">
            {line}
          </p>
        </div>
        {layout.primary && (
          <div className="hidden lg:block shrink-0">
            <TalkToLog mode={layout.primary} currentUser={handle} />
          </div>
        )}
      </header>

      {setupView && <SetupChecklist view={setupView} supportEmail={setup?.supportEmail ?? null} />}

      {/* Phone: look someone up (spec §10), one tap from Today. */}
      <Link
        href="/admin/lookup"
        className="lg:hidden mb-4 flex min-h-[44px] items-center gap-2.5 rounded-control border border-outline bg-surface px-3 text-sm text-ink-2"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        Look someone up
      </Link>

      {/* Desktop: the thin my-day strip sits under the header. */}
      {top.has("myDay") && (
        <div className="hidden lg:block mb-4">
          <MyDayStrip events={data.myDay.events} drafts={data.myDay.pendingDrafts} nowIso={nowIso} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          {top.has("financeQueue") && financeQueue && <FinanceQueuePanel queue={financeQueue} />}
          {top.has("mine") && mine && (
            <>
              <div className="hidden lg:block">
                <MinePanel items={mine.items} today={today} cap={6} failed={mine.failed} />
              </div>
              <div className="lg:hidden">
                <MinePanel items={mine.items} today={today} cap={4} failed={mine.failed} />
              </div>
            </>
          )}
          {top.has("boardSummary") && board && (
            <BoardSummaryPanel next={board.next} last={board.last}>
              {missionKeys.length === 0 ? (
                <div className="mt-3 border-t border-hairline pt-3">
                  <EmptyState
                    label="program metrics"
                    hint="Mission figures read the Metric Catalog. Once a program metric is defined, it shows here."
                    action={
                      <Link href="/admin/impact/kpis" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-orange hover:text-orange-dark">
                        Open the Metric Catalog
                      </Link>
                    }
                  />
                </div>
              ) : (
                <div className="mt-3 border-t border-hairline pt-3">
                  <p className={`${TYPE.cardLabel} mb-2`}>Mission</p>
                  <ul className="space-y-3">
                    {missionKeys.map((key) => (
                      <li key={key} className="flex items-center justify-between gap-2">
                        <Metric metricKey={key} showName />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </BoardSummaryPanel>
          )}
        </div>

        <div className="space-y-4">
          {money && (
            <>
              <div className="hidden lg:block">
                <MoneyPanel money={money} />
              </div>
              {/* Phone: the three-cell money strip (TodayPhone). */}
              <section aria-label="Money" className="lg:hidden rounded-panel border border-hairline bg-surface">
                <div className="flex items-center justify-between px-4 pt-3">
                  <h2 className={TYPE.cardTitle}>Money</h2>
                  <Link href="/admin/finance" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-orange">
                    Open Finance
                  </Link>
                </div>
                <p className={`${TYPE.metadata} px-4`}>{moneySentence(money)}</p>
                <div className="mt-2 grid grid-cols-3 divide-x divide-hairline border-t border-hairline">
                  <div className="p-3 min-w-0">
                    <p className={TYPE.metadata}>Cash</p>
                    <p className="font-semibold tabular-nums truncate">{money.reconciledAt ? usd(money.cash) : "No data yet"}</p>
                    <p className="text-[11px] text-ink-2">{money.reconciledAt ? (money.stale ? "Out of date" : "Bank balance") : "No balance entered"}</p>
                  </div>
                  <div className="p-3 min-w-0">
                    <p className={TYPE.metadata}>Runway</p>
                    <p className="font-semibold tabular-nums truncate">{money.runwayMonths == null ? "No data yet" : `${money.runwayMonths.toFixed(1)} mo`}</p>
                    <p className="text-[11px] text-ink-2">At 3-month average spend</p>
                  </div>
                  <div className="p-3 min-w-0">
                    <p className={TYPE.metadata}>Spend</p>
                    <p className="font-semibold tabular-nums truncate">{usd(money.burn)}</p>
                    <p className="text-[11px] text-ink-2">Monthly, last 3 months</p>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* Phone: my day as the next-meeting card (TodayPhone). */}
          {top.has("myDay") && (
            <div className="lg:hidden">
              <Card>
                <CardHeader title="My day" />
                {nextEvent ? (
                  <p className={TYPE.body}>
                    <span className="font-semibold">{fmtTime(nextEvent.start)}</span> · {nextEvent.title}
                  </p>
                ) : (
                  <p className={TYPE.bodyMuted}>No more meetings today.</p>
                )}
                {data.myDay.pendingDrafts > 0 && (
                  <Link href="/admin/inbox" className="mt-1 inline-flex min-h-[44px] items-center text-sm font-semibold text-orange">
                    {data.myDay.pendingDrafts} draft{data.myDay.pendingDrafts === 1 ? "" : "s"} to approve
                  </Link>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>

      {layout.below.length > 0 && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {layout.below.includes("mine") && mine && <MinePanel items={mine.items} today={today} cap={6} failed={mine.failed} />}
          {layout.below.includes("donorsNeedMe") && donors && <DonorsPanel items={donors.items} owned={donors.owned} failed={donors.failed} />}
          {layout.below.includes("myCohorts") && cohorts && <CohortsPanel rows={cohorts.rows} failed={cohorts.failed} />}
          {layout.below.includes("teamWeek") && team && <TeamPanel rows={team.rows} failed={team.failed} />}
        </div>
      )}

      {/* The org-wide list stays one click away (it is not personal: thank-yous,
          reconciliation and attendance rows have no owner). */}
      {orgWide.length > 0 && (
        <details className="mt-4 rounded-panel border border-hairline bg-surface">
          <summary className="flex min-h-[44px] cursor-pointer items-center px-4 text-sm font-semibold text-ink-1">
            Everything open in the organization ({orgWide.length})
            {orgWide.some((o) => o.due_date && o.due_date < today) && (
              <span className="ml-2 text-expense">{dueLabel(orgWide[0].due_date, today).tone === "late" ? "oldest is late" : ""}</span>
            )}
          </summary>
          <div className="px-4 pb-4">
            <NeedsYou obligations={orgWide} today={today} />
          </div>
        </details>
      )}
    </PageShell>
  );
}
