"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  FOLLOW_UP_LABEL,
  type FollowUpStatus,
  type MatchedEntity,
  type MeetingRecord,
  type MeetingSuggestedTask,
} from "@/lib/meetings/types";

type Detail = {
  record: MeetingRecord;
  matched: MatchedEntity[];
  suggestions: MeetingSuggestedTask[];
  linkedTasks: Array<{ id: string; title: string; status: string }>;
};

function entityHref(e: MatchedEntity): string {
  return e.type === "partner"
    ? `/admin/partners/${e.id}`
    : `/admin/fundraising/donors/${e.id}`;
}

export default function MeetingDetailClient({ detail }: { detail: Detail }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [storeTranscript, setStoreTranscript] = useState(false);
  const [parsing, setParsing] = useState(false);

  const { record, matched, suggestions, linkedTasks } = detail;
  const pending = suggestions.filter((s) => s.status === "pending");

  async function api(url: string, body: unknown) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  }

  async function setStatus(status: FollowUpStatus) {
    setBusy(true);
    try {
      await api(`/api/admin/meetings/${record.id}`, { follow_up_status: status });
      startTransition(() => router.refresh());
    } catch (e) {
      console.error(e);
      alert("Couldn't update. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function parse() {
    if (!transcript.trim()) return;
    setParsing(true);
    try {
      await api(`/api/admin/meetings/${record.id}/transcript`, {
        transcript,
        store_transcript: storeTranscript,
      });
      setTranscript("");
      startTransition(() => router.refresh());
    } catch (e) {
      console.error(e);
      alert("Couldn't parse the transcript. Try again.");
    } finally {
      setParsing(false);
    }
  }

  async function decide(suggestionId: string, action: "accept" | "dismiss") {
    setBusy(true);
    try {
      await api(`/api/admin/meetings/${record.id}/suggestions`, {
        suggestion_id: suggestionId,
        action,
      });
      startTransition(() => router.refresh());
    } catch (e) {
      console.error(e);
      alert("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Follow-up status */}
      <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
        <h2 className="text-xs uppercase tracking-wider text-ink-2 mb-3">Follow-up</h2>
        <p className="text-sm text-ink-1 mb-3">
          Status:{" "}
          <span className="font-semibold">{FOLLOW_UP_LABEL[record.follow_up_status]}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {(["needs_follow_up", "none_needed", "dismissed"] as FollowUpStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              disabled={busy || record.follow_up_status === s}
              className={`text-[11px] font-medium px-2.5 py-1 rounded border transition-colors disabled:opacity-40 ${
                record.follow_up_status === s
                  ? "bg-orange/15 text-orange border-orange/30"
                  : "bg-tile text-ink-1 border-outline hover:bg-[#EFE6D4]"
              }`}
            >
              {FOLLOW_UP_LABEL[s]}
            </button>
          ))}
        </div>
        {linkedTasks.length > 0 && (
          <div className="mt-4">
            <h3 className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">
              Follow-up tasks ({linkedTasks.length})
            </h3>
            <ul className="space-y-1">
              {linkedTasks.map((t) => (
                <li key={t.id} className="text-sm text-ink-1 flex items-center gap-2">
                  <span className={t.status === "done" ? "line-through text-ink-3" : ""}>
                    {t.title}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-ink-3">{t.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Matched entities */}
      <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
        <h2 className="text-xs uppercase tracking-wider text-ink-2 mb-3">Who it was with</h2>
        {matched.length === 0 ? (
          <p className="text-sm text-ink-2 italic">
            No matched donor or partner — this meeting is in the unmatched tray.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {matched.map((e) => (
              <Link
                key={`${e.type}:${e.id}`}
                href={entityHref(e)}
                className="inline-flex items-center gap-1 text-[12px] text-ink-1 hover:text-orange bg-tile border border-outline rounded-full px-2.5 py-1 transition-colors"
              >
                <span className="text-ink-3">{e.type === "partner" ? "◆" : "♥"}</span>
                {e.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Summary + suggestions */}
      <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
        <h2 className="text-xs uppercase tracking-wider text-ink-2 mb-3">
          Notes &amp; follow-ups
        </h2>
        {record.summary ? (
          <p className="text-sm text-ink-1 mb-4 whitespace-pre-wrap">{record.summary}</p>
        ) : (
          <p className="text-sm text-ink-2 italic mb-4">
            No summary yet. Paste a transcript below and Reed will draft one plus
            suggested follow-ups.
          </p>
        )}

        {pending.length > 0 && (
          <div className="mb-4 space-y-1.5">
            <h3 className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">
              Suggested follow-ups
            </h3>
            {pending.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-outline bg-surface"
              >
                <span className="flex-1 text-sm text-ink-1">{s.suggested_title}</span>
                {s.suggested_category && (
                  <span className="text-[10px] uppercase tracking-wider text-ink-3">
                    {s.suggested_category}
                  </span>
                )}
                <button
                  onClick={() => decide(s.id, "accept")}
                  disabled={busy}
                  className="text-[11px] font-medium px-2.5 py-1 rounded bg-orange/15 text-orange border border-orange/30 hover:bg-orange/25 disabled:opacity-40"
                >
                  Accept
                </button>
                <button
                  onClick={() => decide(s.id, "dismiss")}
                  disabled={busy}
                  className="text-[11px] text-ink-2 hover:text-ink-1 px-2 py-1 rounded hover:bg-[#EFE6D4] disabled:opacity-40"
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-outline pt-4">
          <label className="block text-[10px] uppercase tracking-wider text-ink-3 mb-2">
            Paste transcript or notes
          </label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={6}
            placeholder="Paste the meeting transcript or your notes…"
            className="w-full text-sm rounded-lg border border-outline bg-tile/40 p-3 text-ink-1 placeholder:text-ink-3"
          />
          <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-[11px] text-ink-2">
              <input
                type="checkbox"
                checked={storeTranscript}
                onChange={(e) => setStoreTranscript(e.target.checked)}
              />
              Keep the full transcript on this record (off = summary only)
            </label>
            <button
              onClick={parse}
              disabled={parsing || !transcript.trim()}
              className="text-xs font-medium px-3 py-1.5 rounded bg-orange/15 text-orange border border-orange/30 hover:bg-orange/25 disabled:opacity-50"
            >
              {parsing ? "Reed is reading…" : "Summarize & suggest"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
