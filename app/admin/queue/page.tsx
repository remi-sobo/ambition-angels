import Link from "next/link";
import PageHeader from "../_components/PageHeader";
import NeedsYouQueueClient from "../_components/NeedsYouQueueClient";
import { getActionQueue, type QueueItem } from "@/lib/admin/actionQueue";
import { getAdminUser, getOrgContext } from "@/lib/admin/auth";
import { addDays, isDueInWindow } from "@/lib/admin/outlook";

// /admin/queue — the drilldown behind the Command Center's 30/60/90 outlook
// chips (?due=30|60|90). Renders the exact action items the chip's "N action
// items due" counted: the same getActionQueue() rows outlookRead feeds into
// buildOutlook, filtered by the same isDueInWindow predicate, so the list and
// the count can never disagree. The list itself is the same interactive queue
// component the Command Center uses (grouped by module, one-click completion).
export const dynamic = "force-dynamic";

const WINDOWS = [30, 60, 90] as const;
type WindowDays = (typeof WINDOWS)[number];

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

export default async function QueueDrilldownPage({
  searchParams,
}: {
  searchParams?: { due?: string | string[] };
}) {
  const raw = Array.isArray(searchParams?.due) ? searchParams?.due[0] : searchParams?.due;
  const days: WindowDays = raw === "60" ? 60 : raw === "90" ? 90 : 30;

  let items: QueueItem[] = [];
  try {
    items = await getActionQueue();
  } catch {
    // never let a queue read error take the page down — show the empty state
  }
  const me = (await getAdminUser()) ?? null;
  const meId = (await getOrgContext())?.userId ?? null;

  // Same today/end math as lib/admin/outlookRead.ts, so the filter here
  // reproduces the chip's count exactly.
  const todayISO = new Date().toISOString().slice(0, 10);
  const endDate = addDays(todayISO, days);
  const due = items.filter((it) => isDueInWindow(it.dueDate, todayISO, endDate));

  return (
    <div className="max-w-4xl px-4 lg:px-8 py-6 lg:py-8">
      <PageHeader
        title="Action queue"
        subtitle={`${due.length} open action item${due.length === 1 ? "" : "s"} due in the next ${days} days (by ${fmtDate(endDate)}) — the count behind the Overview's ${days}d outlook.`}
        actions={
          <Link href="/admin" className="text-xs font-semibold text-orange hover:text-orange-dark">
            ← Back to Overview
          </Link>
        }
      />

      <div className="flex items-center gap-1.5 mb-4">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3 mr-1">
          Window
        </span>
        {WINDOWS.map((w) => (
          <Link
            key={w}
            href={`/admin/queue?due=${w}`}
            aria-current={w === days ? "page" : undefined}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
              w === days
                ? "border-orange bg-orange/10 text-ink-1"
                : "border-outline bg-tile text-ink-2 hover:text-ink-1"
            }`}
          >
            {w}d
          </Link>
        ))}
      </div>

      <section className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
        {due.length === 0 ? (
          <p className="text-sm text-ink-2">
            Nothing is due in the next {days} days — the window is clear.
          </p>
        ) : (
          <NeedsYouQueueClient items={due} me={me} meId={meId} />
        )}
      </section>
    </div>
  );
}
