import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { money } from "../../finance/_components/charts";
import PageHeader from "../../_components/PageHeader";
import StatCard from "../../_components/StatCard";
import { constituentName } from "@/lib/fundraising/display";
import { todayISO } from "../../ops/_types/ops";
import GmailSyncButton from "../_components/GmailSyncButton";
import SuggestedMoves from "../_components/SuggestedMoves";

// Today's Fundraising Moves (Phase 2) — the operator home screen. Answers "who
// needs me today," assembled deterministically from the spine (opportunities +
// gifts). The next-best-action agent layers on later; this is the queue.
export const dynamic = "force-dynamic";

const OPEN_STAGES = ["identify", "qualify", "cultivate", "solicit"];

type ConstituentLite = {
  id: string;
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
} | null;

type OppRow = {
  id: string;
  name: string | null;
  stage: string;
  next_step: string | null;
  next_step_due: string | null;
  expected_close: string | null;
  ask_amount: number | null;
  owner: string | null;
  constituent: ConstituentLite;
};

type GiftRow = {
  id: string;
  amount: number;
  gift_date: string;
  acknowledgment_status: string;
  constituent: ConstituentLite;
};

const fmtDate = (iso: string) =>
  new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const oppName = (o: OppRow) => o.name ?? (o.constituent ? constituentName(o.constituent) : "Unknown");
const profileHref = (c: ConstituentLite) => (c ? `/admin/fundraising/donors/${c.id}` : "/admin/fundraising");

export default async function TodaysMovesPage() {
  const supabase = createServerSupabase();
  const today = todayISO();
  const soon = addDays(today, 30);
  const recentSince = addDays(today, -14);

  const oppSelect =
    "id, name, stage, next_step, next_step_due, expected_close, ask_amount, owner, " +
    "constituent:constituents ( id, type, first_name, last_name, org_name )";
  const giftSelect =
    "id, amount, gift_date, acknowledgment_status, " +
    "constituent:constituents ( id, type, first_name, last_name, org_name )";

  const [overdueRes, closingRes, unownedRes, acksRes, recentRes] = await Promise.all([
    // Overdue next steps on open asks.
    supabase
      .from("opportunities")
      .select(oppSelect)
      .in("stage", OPEN_STAGES)
      .not("next_step", "is", null)
      .lt("next_step_due", today)
      .order("next_step_due", { ascending: true })
      .limit(50),
    // Open asks expected to close within 30 days.
    supabase
      .from("opportunities")
      .select(oppSelect)
      .in("stage", OPEN_STAGES)
      .gte("expected_close", today)
      .lte("expected_close", soon)
      .order("expected_close", { ascending: true })
      .limit(50),
    // Open asks with no owner — need to be claimed.
    supabase
      .from("opportunities")
      .select(oppSelect)
      .in("stage", OPEN_STAGES)
      .is("owner", null)
      .order("ask_amount", { ascending: false, nullsFirst: false })
      .limit(50),
    // Gifts awaiting a thank-you.
    supabase
      .from("gifts")
      .select(giftSelect)
      .eq("acknowledgment_status", "pending")
      .order("gift_date", { ascending: false })
      .limit(50),
    // Recently engaged: gifts in the last 14 days (stewardship).
    supabase
      .from("gifts")
      .select(giftSelect)
      .gte("gift_date", recentSince)
      .order("gift_date", { ascending: false })
      .limit(50),
  ]);

  const overdue = (overdueRes.data ?? []) as unknown as OppRow[];
  const closing = (closingRes.data ?? []) as unknown as OppRow[];
  const unowned = (unownedRes.data ?? []) as unknown as OppRow[];
  const acks = (acksRes.data ?? []) as unknown as GiftRow[];
  const recent = (recentRes.data ?? []) as unknown as GiftRow[];

  const acksValue = acks.reduce((s, g) => s + Number(g.amount), 0);
  const recentValue = recent.reduce((s, g) => s + Number(g.amount), 0);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <PageHeader
        title="Today's Moves"
        subtitle="Who needs you today — across asks, acknowledgments, and recent gifts"
        actions={
          <div className="flex items-center gap-3">
            <GmailSyncButton />
            <Link
              href="/admin/fundraising"
              className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors"
            >
              Major Gifts →
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Overdue moves" value={overdue.length} sub={overdue.length > 0 ? "need a step today" : "all current"} muted={overdue.length === 0} />
        <StatCard label="Closing ≤30d" value={closing.length} sub="open asks" />
        <StatCard label="Thank-yous due" value={acks.length} sub={acks.length > 0 ? money(acksValue) : "all caught up"} muted={acks.length === 0} />
        <StatCard label="Recent gifts" value={recent.length} sub={recent.length > 0 ? `${money(recentValue)} · 14d` : "none yet"} />
      </div>

      <div className="mb-4">
        <SuggestedMoves />
      </div>

      <div className="space-y-4">
        <OppQueue
          title="Overdue next steps"
          hint="Open asks whose next step is past due — do these first."
          rows={overdue}
          accent="text-expense"
          detail={(o) => (
            <>
              {o.next_step && <span className="text-ink-1">{o.next_step}</span>}
              {o.next_step_due && <span className="text-expense font-semibold ml-2">{fmtDate(o.next_step_due)}</span>}
            </>
          )}
        />
        <OppQueue
          title="Asks closing soon"
          hint="Open asks expected to close in the next 30 days."
          rows={closing}
          accent="text-orange"
          detail={(o) => (
            <>
              {o.ask_amount ? <span className="text-ink-1 font-semibold">{money(Number(o.ask_amount))}</span> : null}
              {o.expected_close && <span className="text-ink-2 ml-2">close {fmtDate(o.expected_close)}</span>}
              <span className="text-ink-3 ml-2 capitalize">{o.stage}</span>
            </>
          )}
        />
        <OppQueue
          title="Asks with no owner"
          hint="Open asks nobody has claimed — assign an owner."
          rows={unowned}
          accent="text-ink-2"
          detail={(o) => (
            <>
              {o.ask_amount ? <span className="text-ink-1 font-semibold">{money(Number(o.ask_amount))}</span> : null}
              <span className="text-ink-3 ml-2 capitalize">{o.stage}</span>
            </>
          )}
        />
        <GiftQueue
          title="Thank-yous due"
          hint="Gifts awaiting an acknowledgment."
          rows={acks}
          accent="text-orange"
          href="/admin/fundraising/acknowledgments"
          hrefLabel="Acknowledgments →"
        />
        <GiftQueue
          title="Recently engaged"
          hint="New gifts in the last 14 days — worth a personal touch."
          rows={recent}
          accent="text-revenue"
        />
      </div>
    </div>
  );
}

function QueueShell({
  title,
  hint,
  count,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  hint: string;
  count: number;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-outline flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-heading font-bold text-ink-1 text-sm">
            {title} <span className="text-ink-3 font-normal">· {count}</span>
          </h2>
          <p className="text-[11px] text-ink-3">{hint}</p>
        </div>
        {href && (
          <Link href={href} className="text-[11px] font-semibold text-ink-2 hover:text-orange transition-colors whitespace-nowrap">
            {hrefLabel ?? "Open →"}
          </Link>
        )}
      </div>
      {count === 0 ? <p className="px-5 py-4 text-ink-3 text-sm">Nothing here — nice.</p> : children}
    </section>
  );
}

function OppQueue({
  title,
  hint,
  rows,
  accent,
  detail,
}: {
  title: string;
  hint: string;
  rows: OppRow[];
  accent: string;
  detail: (o: OppRow) => React.ReactNode;
}) {
  const shown = rows.slice(0, 8);
  return (
    <QueueShell title={title} hint={hint} count={rows.length}>
      <ul className="divide-y divide-hairline">
        {shown.map((o) => (
          <li key={o.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 bg-current ${accent}`} />
            <Link href={profileHref(o.constituent)} className="font-medium text-ink-1 hover:text-orange transition-colors truncate max-w-[200px]">
              {oppName(o)}
            </Link>
            <span className="text-xs text-ink-2 truncate">{detail(o)}</span>
          </li>
        ))}
      </ul>
      {rows.length > shown.length && (
        <p className="px-5 py-2 text-[11px] text-ink-3">+{rows.length - shown.length} more</p>
      )}
    </QueueShell>
  );
}

function GiftQueue({
  title,
  hint,
  rows,
  accent,
  href,
  hrefLabel,
}: {
  title: string;
  hint: string;
  rows: GiftRow[];
  accent: string;
  href?: string;
  hrefLabel?: string;
}) {
  const shown = rows.slice(0, 8);
  return (
    <QueueShell title={title} hint={hint} count={rows.length} href={href} hrefLabel={hrefLabel}>
      <ul className="divide-y divide-hairline">
        {shown.map((g) => (
          <li key={g.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 bg-current ${accent}`} />
            <Link
              href={profileHref(g.constituent)}
              className="font-medium text-ink-1 hover:text-orange transition-colors truncate max-w-[200px]"
            >
              {g.constituent ? constituentName(g.constituent) : "Anonymous"}
            </Link>
            <span className="text-ink-1 font-semibold [font-variant-numeric:tabular-nums]">{money(Number(g.amount))}</span>
            <span className="text-xs text-ink-3 ml-auto">{fmtDate(g.gift_date)}</span>
          </li>
        ))}
      </ul>
      {rows.length > shown.length && (
        <p className="px-5 py-2 text-[11px] text-ink-3">+{rows.length - shown.length} more</p>
      )}
    </QueueShell>
  );
}
