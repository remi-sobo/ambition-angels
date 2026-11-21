"use client";

import { saveAction } from "@/lib/admin/saveAction";
import Input, { Textarea } from "@/app/admin/_components/ui/Input";
import Button from "@/app/admin/_components/ui/Button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  type FollowUpStatus,
  type MatchedEntity,
  type MeetingRecord,
  type MeetingSuggestedTask,
} from "@/lib/meetings/types";
import { Avatar, StatusPill, SectionTitle } from "../_ui";

type ConnectResult = {
  type: "constituent" | "partner";
  id: string;
  name: string;
  subtitle: string;
};

type Detail = {
  record: MeetingRecord;
  matched: MatchedEntity[];
  suggestions: MeetingSuggestedTask[];
  linkedTasks: Array<{ id: string; title: string; status: string }>;
  agenda: { agenda: string; generatedAt: string } | null;
  recurring: boolean;
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
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [storeTranscript, setStoreTranscript] = useState(false);
  const [parsing, setParsing] = useState(false);

  const { record, matched, suggestions, linkedTasks, agenda, recurring } = detail;
  const pending = suggestions.filter((s) => s.status === "pending");

  // Every write on this record goes through saveAction (V4 Stage G): a
  // failure is said in a toast and nothing on screen pretends it saved.
  async function api(url: string, body: unknown, failure: string, method: "POST" | "PATCH" = "POST") {
    const r = await saveAction({ request: { url, method, body }, failure, toast });
    if (r.ok) startTransition(() => router.refresh());
    return r.ok;
  }

  async function setStatus(status: FollowUpStatus, applyToSeries = false) {
    setBusy(true);
    await api(
      `/api/admin/meetings/${record.id}`,
      { follow_up_status: status, ...(applyToSeries ? { apply_to_series: true } : {}) },
      "Couldn't update. Try again.",
      "PATCH",
    );
    setBusy(false);
  }

  async function parse() {
    if (!transcript.trim()) return;
    setParsing(true);
    const ok = await api(
      `/api/admin/meetings/${record.id}/transcript`,
      { transcript, store_transcript: storeTranscript },
      "Couldn't parse the transcript. Try again.",
    );
    if (ok) setTranscript("");
    setParsing(false);
  }

  async function decide(suggestionId: string, action: "accept" | "dismiss") {
    setBusy(true);
    await api(`/api/admin/meetings/${record.id}/suggestions`, { suggestion_id: suggestionId, action }, "Couldn't save. Try again.");
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      {/* Follow-up: the decision surface, led by current status. */}
      <section className="rounded-panel-lg border-hairline bg-surface p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <SectionTitle>Follow-up</SectionTitle>
          <StatusPill status={record.follow_up_status} />
        </div>

        <div className="inline-flex flex-wrap gap-1 p-1 rounded-panel bg-tile border border-hairline">
          {STATUS_CHOICES.map((s) => {
            const active = record.follow_up_status === s;
            return (
              <button
                key={s}
                onClick={() => setStatus(s)}
                disabled={busy || active}
                className={`text-xs font-medium px-3 py-1.5 rounded-[0.75rem] transition-colors disabled:cursor-default ${
                  active
                    ? "bg-surface text-ink-1"
                    : "text-ink-2 hover:text-ink-1 hover:bg-surface/60 disabled:opacity-40"
                }`}
              >
                {STATUS_CHOICE_LABEL[s]}
              </button>
            );
          })}
        </div>

        {/* Recurring events (basketball practice, family meetings…) come back
            every week — offer a permanent opt-out for the whole series. */}
        {recurring && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setStatus("dismissed", true)}
              disabled={busy}
              className="text-xs font-medium px-3 py-1.5 rounded-full border border-hairline text-ink-2 hover:text-ink-1 hover:bg-tile disabled:opacity-40 transition-colors"
            >
              Never needs follow-up. Dismiss all future occurrences
            </button>
            <span className="text-xs text-ink-3">
              This is a recurring event. Excluding it also hides it from Upcoming.
            </span>
          </div>
        )}

        {linkedTasks.length > 0 && (
          <div className="mt-5">
            <h3 className="text-xs uppercase tracking-wider text-ink-3 mb-2">
              Follow-up tasks ({linkedTasks.length})
            </h3>
            <ul className="space-y-1.5">
              {linkedTasks.map((t) => {
                const done = t.status === "done";
                return (
                  <li key={t.id} className="flex items-center gap-2.5 text-sm">
                    <span
                      className={`shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full border ${
                        done ? "bg-revenue-bg border-revenue/30 text-revenue" : "border-hairline"
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
      <section className="rounded-panel-lg border-hairline bg-surface p-6">
        <SectionTitle>Who it was with</SectionTitle>
        {matched.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-2 italic">
              No matched donor or partner. This meeting is in the unmatched tray.
            </p>
            <ConnectEntity meetingId={record.id} />
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {matched.map((e) => (
              <Link
                key={`${e.type}:${e.id}`}
                href={entityHref(e)}
                className="group inline-flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full bg-tile border border-hairline hover:border-orange/40 hover:bg-tile transition-colors"
              >
                <Avatar entity={e} />
                <span className="inline-flex flex-col leading-tight">
                  <span className="text-sm text-ink-1 group-hover:text-orange transition-colors">{e.name}</span>
                  <span className="text-xs uppercase tracking-wider text-ink-3">
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
        <details className="group rounded-panel-lg border-hairline bg-surface p-6">
          <summary className="flex cursor-pointer items-center justify-between gap-3 list-none">
            <SectionTitle>Reed&apos;s prep agenda</SectionTitle>
            <span className="flex items-center gap-2 text-xs text-ink-3">
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
      <section className="rounded-panel-lg border-hairline bg-surface p-6">
        <SectionTitle>Notes &amp; follow-ups</SectionTitle>

        {record.summary ? (
          <div className="mb-5">
            {agenda && (
              <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-orange-light px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-orange-dark">
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
            <h3 className="text-xs uppercase tracking-wider text-ink-3 mb-2">
              Reed suggests
            </h3>
            <div className="space-y-1.5">
              {pending.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-3.5 py-2.5 rounded-panel border border-hairline bg-tile/40"
                >
                  <span className="flex-1 text-sm text-ink-1">{s.suggested_title}</span>
                  {s.suggested_category && (
                    <span className="hidden sm:inline text-xs uppercase tracking-wider text-ink-3">
                      {s.suggested_category}
                    </span>
                  )}
                  <button
                    onClick={() => decide(s.id, "accept")}
                    disabled={busy}
                    className="text-xs font-semibold px-3 py-1 rounded-full bg-orange text-white hover:bg-orange-dark disabled:opacity-40 transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => decide(s.id, "dismiss")}
                    disabled={busy}
                    className="text-xs text-ink-3 hover:text-ink-1 px-2 py-1 rounded-full hover:bg-tile disabled:opacity-40 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-panel border border-dashed border-hairline bg-tile/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-light text-orange-dark text-xs font-bold">
              R
            </span>
            <label htmlFor={`transcript-${record.id}`} className="text-xs uppercase tracking-wider text-ink-2 font-semibold">
              Paste a transcript for Reed
            </label>
          </div>
          <Textarea
            id={`transcript-${record.id}`}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={5}
            placeholder="Paste the meeting transcript or your notes"
          />
          <div className="mt-2.5 flex items-center justify-between gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
              <input
                type="checkbox"
                checked={storeTranscript}
                onChange={(e) => setStoreTranscript(e.target.checked)}
                className="accent-orange"
              />
              Keep the full transcript on this record (off = summary only)
            </label>
            <Button type="button" onClick={parse} disabled={!transcript.trim()} loading={parsing}>
              {parsing ? "Reed is reading" : "Summarize and suggest"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Manual connect control for the unmatched tray: search the CRM for a donor or
 * partner and link them to this meeting. Persists via the meeting's `connect`
 * route (which fans out to the timeline), then refreshes so the newly connected
 * entity shows in "Who it was with".
 */
function ConnectEntity({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ConnectResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/meetings/${meetingId}/connect?q=${encodeURIComponent(term)}`);
        const json = (await r.json()) as { results?: ConnectResult[] };
        if (mine === seq.current) setResults(json.results ?? []);
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, meetingId]);

  async function connect(entity: ConnectResult) {
    setSaving(true);
    const r = await saveAction({
      request: { url: `/api/admin/meetings/${meetingId}/connect`, method: "POST", body: { entity_type: entity.type, entity_id: entity.id } },
      failure: "Couldn't connect. Try again.",
      success: `Connected ${entity.name}`,
      toast,
    });
    setSaving(false);
    if (!r.ok) return;
    setQ("");
    setResults([]);
    startTransition(() => router.refresh());
  }

  return (
    <div className="rounded-panel border border-dashed border-hairline bg-tile/30 p-4">
      <label htmlFor={`connect-${meetingId}`} className="text-xs uppercase tracking-wider text-ink-2 font-semibold">
        Connect a donor or partner
      </label>
      <Input
        id={`connect-${meetingId}`}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        disabled={saving}
        placeholder="Search the CRM by name"
        className="mt-2"
      />
      {q.trim().length >= 2 && (
        <div className="mt-2 space-y-1">
          {searching && results.length === 0 ? (
            <p className="text-xs text-ink-3 px-1 py-1.5">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-xs text-ink-3 px-1 py-1.5">No matches.</p>
          ) : (
            results.map((e) => (
              <button
                key={`${e.type}:${e.id}`}
                onClick={() => connect(e)}
                disabled={saving}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-panel text-left hover:bg-tile disabled:opacity-40 transition-colors"
              >
                <Avatar entity={{ type: e.type, id: e.id, name: e.name, matchedEmail: null }} />
                <span className="min-w-0 flex flex-col leading-tight">
                  <span className="text-sm text-ink-1 truncate">{e.name}</span>
                  <span className="text-xs uppercase tracking-wider text-ink-3 truncate">
                    {e.type === "partner" ? "Partner" : "Donor"} · {e.subtitle}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
