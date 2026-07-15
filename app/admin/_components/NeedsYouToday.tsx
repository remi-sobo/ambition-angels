import Link from "next/link";
import { gatherBriefing } from "@/lib/admin/briefing/gather";
import { getActionQueue, type QueueItem } from "@/lib/admin/actionQueue";
import { getAdminUser, getOrgContext } from "@/lib/admin/auth";
import BriefingCard from "../briefing/_components/BriefingCard";
import NeedsYouQueueClient from "./NeedsYouQueueClient";

// THE "Needs you today" section — the Command Center's one list of what
// needs a human. Two layers, one box:
//   1. Briefing signals (top 3): the threshold-crossing alerts from the
//      deterministic briefing engine, rendered as actionable cards
//      (Open / Done / Snooze / Dismiss).
//   2. The action queue: every open item from v_action_items, folded into
//      per-module groups that expand on demand — a set of labeled doors with
//      counts, never a wall of rows. The most urgent group starts open.
// Previously these were two stacked sections ("Needs you today" + "Needs
// you") saying overlapping things; this merges them.
//
// The Ops group is deliberately left out here (Shannon: redundant — those
// tasks already live in the Tasks area and in each view's own task widget).
// Only this Overview surface filters; getActionQueue() itself still carries
// ops rows for the status line, the outlook, and Reed.
export default async function NeedsYouToday() {
  let briefingTop = [] as Awaited<ReturnType<typeof gatherBriefing>>["top"];
  try {
    briefingTop = (await gatherBriefing()).top.slice(0, 3);
  } catch {
    // never let the briefing engine break the Overview
  }

  let items: QueueItem[] = [];
  try {
    items = (await getActionQueue()).filter((it) => it.module !== "ops");
  } catch {
    // ditto for the queue
  }
  const me = (await getAdminUser()) ?? null;
  const meId = (await getOrgContext())?.userId ?? null;

  if (briefingTop.length === 0 && items.length === 0) {
    return (
      <section className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
        <h2 className="font-heading font-semibold text-ink-1 mb-1">Needs you today</h2>
        <p className="text-sm text-ink-2">Nothing needs you — the spine is clear.</p>
      </section>
    );
  }

  return (
    <section className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-heading font-semibold text-ink-1">
          Needs you today
          {items.length > 0 && (
            <span className="ml-2 text-xs font-semibold text-ink-2">{items.length}</span>
          )}
        </h2>
        <Link
          href="/admin/briefing"
          className="text-xs font-semibold text-orange hover:text-orange-dark shrink-0"
        >
          Open briefing →
        </Link>
      </div>

      {briefingTop.length > 0 && (
        <div className="space-y-3 mb-4">
          {briefingTop.map((it) => (
            <BriefingCard key={it.id} item={it} />
          ))}
        </div>
      )}

      <NeedsYouQueueClient items={items} me={me} meId={meId} />
    </section>
  );
}
