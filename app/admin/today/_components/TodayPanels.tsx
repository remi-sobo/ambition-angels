import Link from "next/link";
import type { ReactNode } from "react";
import Card, { CardHeader } from "../../_components/ui/Card";
import Notice from "../../_components/ui/Notice";
import Figure from "../../_components/ui/Figure";
import EmptyState from "../../_components/EmptyState";
import { TYPE } from "@/lib/admin/typeScale";
import { dueLabel, type MineItem } from "@/lib/admin/todayPanels";
import type { DonorNeed } from "@/lib/admin/todayDonors";
import type { CohortRow, FinanceQueue, TeamRow } from "@/lib/admin/todayRole";

/**
 * Today's role panels (V4 Stage C, spec §7; Today.dc.html / TodayPhone.dc.html).
 * Server components: each panel is a kit Card, every row ends in a next step,
 * late items say how late in the danger text color, every number goes through
 * Figure with its source, and an empty panel says why it is empty.
 */

const TONE: Record<ReturnType<typeof dueLabel>["tone"], string> = {
  late: "text-expense font-semibold",
  today: "text-ink-1 font-semibold",
  soon: "text-ink-2",
  none: "text-ink-3",
};

const ROW_LINK =
  "inline-flex items-center justify-center min-h-[44px] min-w-[64px] px-3 rounded-control border border-outline text-sm font-semibold text-ink-1 hover:bg-tile";

export function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function shortDay(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function PanelFooter({ children }: { children: ReactNode }) {
  return <div className="mt-2 border-t border-hairline pt-2">{children}</div>;
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-orange hover:text-orange-dark">
      {children}
    </Link>
  );
}

// ── Mine, and overdue first ─────────────────────────────────────────────────

export function MinePanel({
  items,
  today,
  cap,
  failed,
}: {
  items: MineItem[];
  today: string;
  cap: number;
  failed: string[];
}) {
  const late = items.filter((i) => i.due && i.due < today).length;
  const shown = items.slice(0, cap);
  return (
    <Card>
      <CardHeader
        title="Mine, and overdue first"
        hint={
          <>
            Assigned to you{late > 0 ? <> · <span className="font-semibold text-expense">{late} late</span></> : null}
          </>
        }
      />
      {failed.length > 0 && (
        <div className="mb-3">
          <Notice tone="partial" title="Part of this list could not load.">
            Missing: {failed.join(", ")}. What is shown is still yours.
          </Notice>
        </div>
      )}
      {shown.length === 0 ? (
        <p className={`${TYPE.bodyMuted} py-2`}>Nothing is assigned to you right now. New work assigned to you lands here.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {shown.map((i) => {
            const d = dueLabel(i.due, today);
            return (
              <li key={i.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className={`${TYPE.body} font-semibold truncate`}>{i.title}</p>
                  <p className={`${TYPE.metadata} truncate`}>
                    <span className={`sm:hidden ${TONE[d.tone]}`}>{d.text} · </span>
                    {i.kindLabel}
                    {i.context ? ` · ${i.context}` : ""}
                  </p>
                </div>
                <span className={`hidden sm:block shrink-0 text-[13px] ${TONE[d.tone]}`}>{d.text}</span>
                <Link href={i.href} className={ROW_LINK} aria-label={`${i.action}: ${i.title}`}>
                  {i.action}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > cap && (
        <PanelFooter>
          <FooterLink href="/admin/work/tasks">
            {items.length - cap} more assigned to you
          </FooterLink>
        </PanelFooter>
      )}
    </Card>
  );
}

// ── Money at a glance ───────────────────────────────────────────────────────

export type MoneyView = {
  cash: number;
  runwayMonths: number | null;
  burn: number;
  reconciledAt: string | null;
  stale: boolean;
};

export function moneySentence(m: MoneyView): string {
  if (m.stale) return "The cash balance is out of date, so runway may be off.";
  if (m.runwayMonths == null) return "Runway needs a spending history to work out.";
  return m.runwayMonths >= 6
    ? `On track. Runway is steady and above 6 months.`
    : `Runway is under 6 months. Worth a look this week.`;
}

export function MoneyPanel({ money }: { money: MoneyView }) {
  const anchor = money.reconciledAt ? `From the bank balance, updated ${shortDay(money.reconciledAt)}` : "No bank balance has been entered yet";
  return (
    <Card padded={false}>
      <div className="p-4 pb-2">
        <CardHeader
          className="mb-1"
          title="Money at a glance"
          hint="Owners and finance only"
          action={
            <Link href="/admin/finance" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-orange hover:text-orange-dark">
              Open Finance
            </Link>
          }
        />
        <p className={`${TYPE.body} ${money.stale ? "text-status-watch-text font-semibold" : ""}`}>{moneySentence(money)}</p>
      </div>
      <div className="divide-y divide-hairline border-t border-hairline">
        <Figure
          label="Cash on hand"
          value={money.reconciledAt ? usd(money.cash) : null}
          source={anchor}
          freshness={money.stale ? "stale" : "fresh"}
          refreshHref="/admin/finance"
        />
        <Figure
          label="Runway"
          value={money.runwayMonths == null ? null : `${money.runwayMonths.toFixed(1)} months`}
          source={`At ${usd(money.burn)} average monthly spend, last 3 months`}
          freshness={money.stale ? "stale" : "fresh"}
        />
      </div>
    </Card>
  );
}

// ── My day (a thin strip) ───────────────────────────────────────────────────

export type DayEvent = { id: string; title: string; start: string; allDay: boolean };

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
}

export function MyDayStrip({ events, drafts, nowIso }: { events: DayEvent[]; drafts: number; nowIso: string }) {
  const upcoming = events.filter((e) => e.allDay || e.start >= nowIso);
  const next = upcoming.find((e) => !e.allDay) ?? upcoming[0] ?? null;
  return (
    <section aria-label="My day" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-panel border border-hairline bg-surface px-4 py-2.5">
      <span className={`${TYPE.metadata} font-semibold uppercase tracking-wide`}>My day</span>
      {next ? (
        <span className={TYPE.body}>
          <span className="font-semibold tabular-nums">{next.allDay ? "All day" : fmtTime(next.start)}</span> {next.title}
          {upcoming.length > 1 ? <span className="text-ink-2"> · then {upcoming.length - 1} more</span> : null}
        </span>
      ) : (
        <span className={TYPE.bodyMuted}>{events.length > 0 ? "No more meetings today." : "Nothing on your calendar today."}</span>
      )}
      {drafts > 0 && (
        <Link href="/admin/inbox" className="ml-auto inline-flex min-h-[44px] items-center text-sm font-semibold text-orange hover:text-orange-dark">
          {drafts} draft{drafts === 1 ? "" : "s"} to approve
        </Link>
      )}
    </section>
  );
}

// ── Donors who need me ──────────────────────────────────────────────────────

export function DonorsPanel({ items, owned, failed }: { items: DonorNeed[]; owned: number; failed: boolean }) {
  const shown = items.slice(0, 5);
  return (
    <Card>
      <CardHeader title="Donors who need me" hint="Your donors: late next steps, gifts not thanked, lapsing" />
      {failed && (
        <div className="mb-3">
          <Notice tone="partial" title="Some gift or ask history could not load.">
            A donor may be missing from this list.
          </Notice>
        </div>
      )}
      {owned === 0 ? (
        <EmptyState
          label="donors assigned to you"
          hint="Assign an owner on Donors & Funders and your donors show up here when they need a touch."
          action={<FooterLink href="/admin/fundraising/donors-funders">Open Donors &amp; Funders</FooterLink>}
        />
      ) : shown.length === 0 ? (
        <p className={`${TYPE.bodyMuted} py-2`}>All {owned} of your donors are in good shape.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {shown.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className={`${TYPE.body} font-semibold truncate`}>{d.name}</p>
                <p className={`text-xs mt-0.5 ${d.urgent ? "text-expense font-semibold" : "text-ink-2"}`}>{d.why}</p>
              </div>
              <Link href={d.href} className={ROW_LINK} aria-label={`${d.action}: ${d.name}`}>
                {d.action}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {items.length > shown.length && (
        <PanelFooter>
          <FooterLink href="/admin/fundraising/donors-funders">Show {items.length - shown.length} more</FooterLink>
        </PanelFooter>
      )}
    </Card>
  );
}

// ── Team this week ──────────────────────────────────────────────────────────

export function TeamPanel({ rows, failed }: { rows: TeamRow[]; failed: boolean }) {
  return (
    <Card>
      <CardHeader title="Team this week" hint="Stuck and finished, since Monday" />
      {failed && rows.length === 0 ? (
        <Notice tone="danger" title="The team's tasks could not load.">Refresh the page to try again.</Notice>
      ) : rows.length === 0 ? (
        <p className={`${TYPE.bodyMuted} py-2`}>Nobody is stuck, and nothing was finished yet this week.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {rows.map((r, i) => (
            <li key={`${r.who}-${i}`} className="flex items-center gap-3 py-2.5">
              <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tile text-xs font-semibold text-ink-2">
                {r.who.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`${TYPE.body} truncate`}>
                  <span className="font-semibold">{r.who}</span> {r.what}
                </p>
                <p className={`text-xs mt-0.5 ${r.tone === "warn" ? "text-expense font-semibold" : "text-ink-2"}`}>{r.state}</p>
              </div>
              <Link href={r.href} className={ROW_LINK} aria-label={`See ${r.who}'s tasks`}>
                See
              </Link>
            </li>
          ))}
        </ul>
      )}
      <PanelFooter>
        <FooterLink href="/admin/work/tasks">See all team work</FooterLink>
      </PanelFooter>
    </Card>
  );
}

// ── Finance: the books queue ────────────────────────────────────────────────

export function FinanceQueuePanel({ queue }: { queue: FinanceQueue }) {
  return (
    <Card>
      <CardHeader title="The books" hint="Transactions to categorize and gifts to reconcile" />
      <div className="grid grid-cols-2 divide-x divide-hairline rounded-panel border border-hairline">
        <Figure
          label="Not categorized"
          value={queue.uncategorized}
          source="Bank transactions with no category, as of now"
          href="/admin/finance/transactions"
        />
        <Figure label="Proposed gifts" value={queue.proposals} source="Waiting in Reconcile, as of now" href="/admin/finance/reconcile" />
      </div>
      {queue.recent.length > 0 && (
        <ul className="mt-3 divide-y divide-hairline">
          {queue.recent.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className={`${TYPE.body} truncate`}>{t.description}</p>
                <p className={TYPE.metadata}>{shortDay(t.date)}</p>
              </div>
              <span className="shrink-0 tabular-nums text-sm font-semibold">{usd(t.amount)}</span>
              <Link href="/admin/finance/transactions" className={ROW_LINK} aria-label={`Categorize ${t.description}`}>
                Categorize
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <Notice tone="info" title="Bills due are not tracked yet.">
          BloomOS has no bills list today. Upcoming money in is on the Finance snapshot.
        </Notice>
      </div>
    </Card>
  );
}

// ── Staff: my cohorts ───────────────────────────────────────────────────────

export function CohortsPanel({ rows, failed }: { rows: CohortRow[]; failed: boolean }) {
  return (
    <Card>
      <CardHeader title="My cohorts" hint="Cohorts assigned to you" />
      {failed ? (
        <Notice tone="danger" title="Your cohorts could not load.">Refresh the page to try again.</Notice>
      ) : rows.length === 0 ? (
        <p className={`${TYPE.bodyMuted} py-2`}>No cohorts are assigned to you yet.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className={`${TYPE.body} font-semibold truncate`}>{c.name}</p>
                <p className={`text-xs mt-0.5 ${c.unrecorded > 0 ? "text-expense font-semibold" : "text-ink-2"}`}>
                  {c.unrecorded > 0
                    ? `${c.unrecorded} session${c.unrecorded === 1 ? "" : "s"} waiting for attendance`
                    : c.next
                      ? `Next session ${shortDay(c.next)}`
                      : "No sessions scheduled"}
                </p>
              </div>
              <Link href={`/admin/cohorts/${c.id}`} className={ROW_LINK} aria-label={`Open ${c.name}`}>
                {c.unrecorded > 0 ? "Take roll" : "Open"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── Board viewer: a read-only summary ───────────────────────────────────────

export function BoardSummaryPanel({
  next,
  last,
  children,
}: {
  next: { id: string; meeting_date: string; title: string } | null;
  last: { id: string; meeting_date: string; title: string; minutes_status: string } | null;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader title="Board summary" hint="Read only" />
      <ul className="divide-y divide-hairline">
        <li className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className={`${TYPE.body} font-semibold`}>Next board meeting</p>
            <p className={TYPE.metadata}>{next ? `${next.title}, ${shortDay(next.meeting_date)}` : "None scheduled yet"}</p>
          </div>
          <Link href="/admin/organization/board" className={ROW_LINK}>
            Open
          </Link>
        </li>
        <li className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className={`${TYPE.body} font-semibold`}>Last meeting</p>
            <p className={TYPE.metadata}>
              {last ? `${last.title}, ${shortDay(last.meeting_date)} · minutes ${last.minutes_status === "approved" ? "approved" : "in draft"}` : "No past meetings on file"}
            </p>
          </div>
        </li>
        <li className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className={`${TYPE.body} font-semibold`}>Organization Health</p>
            <p className={TYPE.metadata}>How the organization is doing, module by module</p>
          </div>
          <Link href="/admin/organization-health" className={ROW_LINK}>
            Open
          </Link>
        </li>
      </ul>
      {children}
    </Card>
  );
}
