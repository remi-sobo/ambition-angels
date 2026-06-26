"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Step of the Friday Close: recap the meetings. This-week meetings still at
 * needs_follow_up, each with its staged suggestions. Accept (creates a linked
 * ops_task, server-guarded against double-accept) or dismiss each, then mark the
 * meeting recapped. For a fundraiser, every donor conversation's follow-up lives
 * or dies here. Framing over the existing accept/dismiss + follow-up routes.
 */

export type RecapSuggestion = { id: string; title: string; category: string | null };
export type RecapMeeting = {
  id: string;
  title: string;
  occurredAt: string;
  suggestions: RecapSuggestion[];
};

export default function MeetingRecap({ meetings }: { meetings: RecapMeeting[] }) {
  if (meetings.length === 0) {
    return (
      <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
        <h2 className="text-xs uppercase tracking-wider text-ink-2 mb-2">Recap the meetings</h2>
        <p className="text-sm text-revenue">
          No meetings need follow-up this week. Nothing leaked.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-card border-[1.5px] border-outline bg-surface p-6 space-y-4">
      <div>
        <h2 className="text-xs uppercase tracking-wider text-ink-2">Recap the meetings</h2>
        <p className="text-sm text-ink-2 mt-1">
          {meetings.length} meeting{meetings.length === 1 ? "" : "s"} from this week still need a
          follow-up call. Accept the tasks worth doing, dismiss the rest, then mark each recapped.
        </p>
      </div>
      {meetings.map((m) => (
        <MeetingCard key={m.id} meeting={m} />
      ))}
    </section>
  );
}

function MeetingCard({ meeting }: { meeting: RecapMeeting }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Suggestions resolved optimistically so a card visibly empties as you work.
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  async function act(key: string, fn: () => Promise<Response>) {
    setBusyKey(key);
    try {
      const r = await fn();
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      startTransition(() => router.refresh());
    } catch (e) {
      console.error("Recap action failed:", e);
      alert("Couldn't save that. Try again.");
    } finally {
      setBusyKey(null);
    }
  }

  function suggestionAction(suggestionId: string, action: "accept" | "dismiss") {
    return act(`${suggestionId}:${action}`, async () => {
      const res = await fetch(`/api/admin/meetings/${meeting.id}/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion_id: suggestionId, action }),
      });
      if (res.ok) setResolved((s) => new Set(s).add(suggestionId));
      return res;
    });
  }

  function markRecapped() {
    return act("recap", () =>
      fetch(`/api/admin/meetings/${meeting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ follow_up_status: "none_needed" }),
      })
    );
  }

  const pending = meeting.suggestions.filter((s) => !resolved.has(s.id));
  const when = new Date(meeting.occurredAt).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="rounded-card-lg border-[1.5px] border-outline bg-tile/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Link
          href={`/admin/meetings/${meeting.id}`}
          className="text-sm font-semibold text-ink-1 hover:text-orange truncate"
        >
          {meeting.title || "Untitled meeting"}
        </Link>
        <span className="text-[11px] text-ink-3 font-mono shrink-0">{when}</span>
      </div>

      {pending.length > 0 ? (
        <div className="space-y-1.5">
          {pending.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg border-[1.5px] border-outline bg-surface shadow-panel"
            >
              <span className="text-sm text-ink-1 flex-1 truncate">{s.title}</span>
              {s.category && (
                <span className="shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border bg-status-neutral-bg text-ink-2 border-outline">
                  {s.category}
                </span>
              )}
              <button
                onClick={() => suggestionAction(s.id, "accept")}
                disabled={busyKey !== null}
                className="shrink-0 text-[11px] font-medium px-2.5 py-1 rounded bg-orange/15 text-orange border border-orange/30 hover:bg-orange/25 disabled:opacity-50 transition-colors"
              >
                Accept
              </button>
              <button
                onClick={() => suggestionAction(s.id, "dismiss")}
                disabled={busyKey !== null}
                className="shrink-0 text-[11px] font-medium px-2.5 py-1 rounded text-ink-2 hover:text-ink-1 hover:bg-[#EFE6D4] border border-transparent disabled:opacity-50 transition-colors"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-ink-3 italic">
          {meeting.suggestions.length === 0
            ? "No suggested tasks. Recap it and move on."
            : "All suggestions handled."}
        </p>
      )}

      <button
        onClick={markRecapped}
        disabled={busyKey !== null}
        className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-tile text-ink-1 border-[1.5px] border-outline hover:bg-[#EFE6D4] disabled:opacity-50 transition-colors"
      >
        {busyKey === "recap" ? "Saving…" : "Mark recapped — nothing else"}
      </button>
    </div>
  );
}
