"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  type FollowUpStatus,
  type MatchedEntity,
  type MeetingRecord,
  type MeetingSuggestedTask,
} from "@/lib/meetings/types";
import { Avatar, StatusPill, SectionTitle } from "../_ui";

type Detail = {
  record: MeetingRecord;
  matched: MatchedEntity[];
  suggestions: MeetingSuggestedTask[];
  linkedTasks: Array<{ id: string; title: string; status: string }>;
  agenda: { agenda: string; generatedAt: string } | null;
};

const fmtAgendaDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function entityHref(e: MatchedEntity): string {
  return e.type === "partner" ? `/admin/partners/${e.id}` : `/admin/fundraising/donors/${e.id}`;
}

const STATUS_CHOICES: FollowUpStatus[] = ["needs_follow_up", "none_needed", "dismissed"];
const STATUS_CHOICE_LABEL: Record<FollowUpStatus, string> = {
  needs_follow_up: "Needs follow-up",
  has_follow_up: "Has follow-up",
  none_needed: "No follow-up needed",
  dismissed: "Dismissed",
};

export default function MeetingDetailClient({ detail }: { detail: Detail }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [storeTranscript, setStoreTranscript] = useState(false);
  const [parsing, setParsing] = useState(false);

  const { record, matched, suggestions, linkedTasks, agenda } = detail;
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
      await api(`/api/admin/meetings/${record.id}/suggestions`, { suggestion_id: suggestionId, action });
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
      {/* Follow-up: the decision surface, led by current status. */}
      <section className="rounded-card-lg border-[1.5px] border-outline bg-surface p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <SectionTitle>Follow-up</SectionTitle>
          <StatusPill status={record.follow_up_status} />
        </div>

        <div className="inline-flex flex-wrap gap-1 p-1 rounded-card bg-tile border border-hairline">
          {STATUS_CHOICES.map((s) => {
            const active = record.follow_up_status === s;
            return (
              <button
                key={s}
                onClick={() => setStatus(s)}
                disabled={busy || active}
                className={`text-[12px] font-medium px-3 py-1.5 rounded-[0.75rem] transition-colors disabled:cursor-default ${
                  active
                    ? "bg-surface text-ink-1 shadow-panel"
                    : "text-ink-2 hover:text-ink-1 hover:bg-surface/60 disabled:opacity-40"
                }`}
              >
                {STATUS_CHOICE_LABEL[s]}
              </button>
            );
          })}
        </div>

        {linkedTasks.length > 0 && (
          <div className="mt-5">
            <h3 className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">
              Follow-up tasks ({linkedTasks.length})
            </h3>
            <ul className="space-y-1.5">
              {linkedTasks.map((t) => {
                const done = t.status === "done";
                return (
                  <li key={t.id} className="flex items-center gap-2.5 text-sm">
                    <span
                      className={`shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full border ${
                        done ? "bg-revenue-bg border-revenue/30 text-revenue" : "border-outline"
                      }`}
                    >
                      {done && (
                        <svg viewBox="0 0 16 16" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                          <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className={done ? "line-through text-ink-3" : "text-ink-1"}>{t.title}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* Who it was with — matched donors / partners, avatars that link out. */}
      <section className="rounded-card-lg border-[1.5px] border-outline bg-surface p-6">
        <SectionTitle>Who it was with</SectionTitle>
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
                className="group inline-flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full bg-tile border border-outline hover:border-orange/40 hover:bg-[#EFE6D4] transition-colors"
              >
                <Avatar entity={e} />
                <span className="inline-flex flex-col leading-tight">
                  <span className="text-[13px] text-ink-1 group-hover:text-orange transition-colors">{e.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-ink-3">
                    {e.type === "partner" ? "Partner" : "Donor"}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Reed's prep agenda — drafted while this meeting was upcoming. Collapsed
          by default: it's context for the recap, not the recap itself. */}
      {agenda && (
        <details className="group rounded-card-lg border-[1.5px] border-outline bg-surface p-6">
          <summary className="flex cursor-pointer items-center justify-between gap-3 list-none">
            <SectionTitle>Reed&apos;s prep agenda</SectionTitle>
            <span className="flex items-center gap-2 text-[11px] text-ink-3">
              {fmtAgendaDate(agenda.generatedAt)}
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </summary>
          <p className="mt-4 text-sm text-ink-1 leading-relaxed whitespace-pre-wrap">{agenda.agenda}</p>
        </details>
      )}

      {/* Notes & follow-ups — Reed's summary, suggestions, and the ingest box. */}
      <section className="rounded-card-lg border-[1.5px] border-outline bg-surface p-6">
        <SectionTitle>Notes &amp; follow-ups</SectionTitle>

        {record.summary ? (
          <div className="mb-5">
            {agenda && (
              <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-orange-light px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-dark">
                Debriefed vs. prep agenda
              </span>
            )}
            <p className="text-sm text-ink-1 leading-relaxed whitespace-pre-wrap">{record.summary}</p>
          </div>
        ) : (
          <p className="text-sm text-ink-2 italic mb-5">
            No summary yet. Paste a transcript below and Reed will draft one plus suggested follow-ups
            {agenda ? ", comparing what happened against your prep agenda" : ""}.
          </p>
        )}

        {pending.length > 0 && (
          <div className="mb-5">
            <h3 className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">
              Reed suggests
            </h3>
            <div className="space-y-1.5">
              {pending.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-3.5 py-2.5 rounded-card border border-outline bg-tile/40"
                >
                  <span className="flex-1 text-sm text-ink-1">{s.suggested_title}</span>
                  {s.suggested_category && (
                    <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-ink-3">
                      {s.suggested_category}
                    </span>
                  )}
                  <button
                    onClick={() => decide(s.id, "accept")}
                    disabled={busy}
                    className="text-[11px] font-semibold px-3 py-1 rounded-full bg-orange text-white hover:bg-orange-dark disabled:opacity-40 transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => decide(s.id, "dismiss")}
                    disabled={busy}
                    className="text-[11px] text-ink-3 hover:text-ink-1 px-2 py-1 rounded-full hover:bg-[#EFE6D4] disabled:opacity-40 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-card border border-dashed border-outline bg-tile/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-light text-orange-dark text-[10px] font-bold">
              R
            </span>
            <label className="text-[11px] uppercase tracking-wider text-ink-2 font-semibold">
              Paste a transcript for Reed
            </label>
          </div>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={5}
            placeholder="Paste the meeting transcript or your notes…"
            className="w-full text-sm rounded-card border border-outline bg-surface p-3 text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange/40"
          />
          <div className="mt-2.5 flex items-center justify-between gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-[11px] text-ink-2 cursor-pointer">
              <input
                type="checkbox"
                checked={storeTranscript}
                onChange={(e) => setStoreTranscript(e.target.checked)}
                className="accent-orange"
              />
              Keep the full transcript on this record (off = summary only)
            </label>
            <button
              onClick={parse}
              disabled={parsing || !transcript.trim()}
              className="text-[13px] font-semibold px-4 py-2 rounded-full bg-orange text-white hover:bg-orange-dark disabled:opacity-50 transition-colors"
            >
              {parsing ? "Reed is reading…" : "Summarize & suggest"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
