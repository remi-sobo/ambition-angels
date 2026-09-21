"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import type { TodayObligation } from "@/lib/admin/today";
import {
  SHOW_CAP,
  DEFAULT_NEEDS_YOU_VIEW,
  countObligationsByView,
  filterObligationsByView,
  type NeedsYouView,
} from "@/lib/admin/todayRank";
import ListRow, { ListRows } from "../../_components/ui/ListRow";
import Button from "../../_components/ui/Button";
import Badge from "../../_components/ui/Badge";
import Alert from "../../_components/ui/Alert";
import SegmentedControl from "../../_components/ui/SegmentedControl";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Spec Home, stage H1 — the Needs-you feed. At most SHOW_CAP rows, ranked
 * server-side; "Show all N" expands in place (open decision 1, resolved —
 * /admin/queue's 308 lands here at cutover, not on a new screen). Every row
 * carries its why-line — never a bare checkbox — and resolve/snooze go
 * through the A3 RPCs (the API route re-implements no permission logic).
 *
 * Views: the feed is PER-USER by default ("Mine" — rows whose owner_id is
 * the signed-in person). The org-wide feed used to be everyone's Home, so a
 * teammate's list buried your own. "Unassigned" keeps rows nobody owns one
 * tap away (with a banner on the default view when any exist) so an
 * ownerless task is never silently lost; "Everyone" is the full org feed.
 * The segmented control is link-driven (?needs=…) so the choice survives the
 * router.refresh() that resolve/snooze trigger.
 */
const VIEW_HREF: Record<NeedsYouView, string> = {
  mine: "/admin/today",
  unassigned: "/admin/today?needs=unassigned",
  all: "/admin/today?needs=all",
};

export default function NeedsYou({
  obligations,
  today,
  userId,
  view = DEFAULT_NEEDS_YOU_VIEW,
}: {
  /** The FULL ranked org list; this component filters to `view`. */
  obligations: TodayObligation[];
  today: string;
  /** auth user id of the signed-in person — "Mine" keys on owner_id. */
  userId: string;
  view?: NeedsYouView;
}) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = countObligationsByView(obligations, userId);
  const inView = filterObligationsByView(obligations, view, userId);
  const visible = showAll ? inView : inView.slice(0, SHOW_CAP);
  const hidden = inView.length - SHOW_CAP;

  async function act(row: TodayObligation, action: "resolve" | "snooze", until?: string) {
    setBusyId(row.id);
    setError(null);
    try {
      const r = await fetch("/api/admin/obligations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, source: row.type, sourceId: row.source_id, until }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) {
        setError(j?.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  if (obligations.length === 0) {
    return <p className={TYPE.bodyMuted}>Nothing needs you right now. Enjoy it.</p>;
  }

  const segments = (
    <SegmentedControl<NeedsYouView>
      label="Needs-you view"
      value={view}
      hrefFor={(v) => VIEW_HREF[v]}
      segments={[
        { value: "mine", label: "Mine", hint: counts.mine },
        { value: "unassigned", label: "Unassigned", hint: counts.unassigned },
        { value: "all", label: "Everyone", hint: counts.all },
      ]}
      className="mb-3"
    />
  );

  // The default view never hides ownerless work silently: when any exists,
  // say so and link straight to it.
  const unassignedBanner =
    view === "mine" && counts.unassigned > 0 ? (
      <Alert
        tone="warning"
        className="mb-3"
        action={
          <Link
            href={VIEW_HREF.unassigned}
            className="text-sm font-semibold text-orange hover:text-orange-dark whitespace-nowrap"
          >
            View unassigned →
          </Link>
        }
      >
        {counts.unassigned === 1
          ? "1 item has no owner and could be missed."
          : `${counts.unassigned} items have no owner and could be missed.`}
      </Alert>
    ) : null;

  if (inView.length === 0) {
    return (
      <div>
        {segments}
        {unassignedBanner}
        <p className={TYPE.bodyMuted}>
          {view === "mine"
            ? "Nothing is assigned to you right now."
            : view === "unassigned"
              ? "Every open item has an owner."
              : "Nothing needs anyone right now."}
        </p>
      </div>
    );
  }

  return (
    <div>
      {segments}
      {unassignedBanner}
      {error && (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      )}
      <ListRows>
        {visible.map((row) => {
          const overdue = Boolean(row.due_date && row.due_date < today);
          const dueToday = row.due_date === today;
          return (
            /**
             * Visual System V3 §8 — "For overdue tasks, don't make the entire
             * line visually red. Prioritize task title, then status/due
             * information, then contextual explanation. Use red as a signal,
             * not as dominant typography."
             *
             * So the title stays ink-1 at the body weight whatever the row's
             * state; the ONLY red on an overdue row is the small badge, and
             * the why-line stays quiet underneath. Previously the due chip was
             * a 10px uppercase pill in raw Tailwind red-50/red-700 — off the
             * house palette entirely — and it competed with the title.
             */
            <ListRow
              key={row.id}
              title={row.title}
              href={row.href}
              meta={
                row.due_date ? (
                  <Badge tone={overdue ? "danger" : dueToday ? "accent" : "neutral"}>
                    {overdue ? `Overdue · ${row.due_date}` : dueToday ? "Today" : row.due_date}
                  </Badge>
                ) : null
              }
              context={
                <span className={row.whyRecorded ? "" : "italic text-ink-3"}>{row.why}</span>
              }
              actions={
                <>
                  {row.snoozable && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busyId === row.id}
                      onClick={() =>
                        act(row, "snooze", overdue || dueToday ? tomorrow : nextWeek)
                      }
                      title={`Snooze until ${overdue || dueToday ? tomorrow : nextWeek}`}
                    >
                      Snooze
                    </Button>
                  )}
                  {row.resolvable && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busyId === row.id}
                      onClick={() => act(row, "resolve")}
                      title="Mark done"
                      className="!text-revenue hover:!bg-revenue-bg"
                    >
                      {busyId === row.id ? "…" : "Done"}
                    </Button>
                  )}
                </>
              }
            />
          );
        })}
      </ListRows>
      {hidden > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 !px-0"
        >
          {showAll ? `Show top ${SHOW_CAP}` : `Show all ${inView.length}`}
        </Button>
      )}
    </div>
  );
}
