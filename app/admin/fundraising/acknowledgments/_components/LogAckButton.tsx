"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ACK_CHANNELS, CHANNEL_LABEL, type AckChannel } from "@/lib/fundraising/ack-channels";
import { TYPE } from "@/lib/admin/typeScale";

// Manually log a thank-you that has NO gift behind it — a proactive donor note,
// a foundation/DAF grant acknowledgment, a volunteer or board thank-you, a
// milestone touch. The gift queue above is auto-generated; this is the manual
// "add" path. It posts to /api/admin/acknowledgments/log, which records the
// touch and can spawn a linked follow-up task on the Ops queue.

type SubjectKind = "constituent" | "volunteer" | "milestone";

const SUBJECT_OPTIONS: { value: SubjectKind; label: string }[] = [
  { value: "constituent", label: "Donor" },
  { value: "volunteer", label: "Volunteer" },
  { value: "milestone", label: "Milestone" },
];

type Picked = { id: string; name: string };

export default function LogAckButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subjectType, setSubjectType] = useState<SubjectKind>("constituent");
  const [channel, setChannel] = useState<AckChannel>("call");
  const [note, setNote] = useState("");
  const [createTask, setCreateTask] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Donor typeahead.
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [results, setResults] = useState<Picked[]>([]);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (picked || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const mySeq = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/constituents/search?q=${encodeURIComponent(query.trim())}`
        );
        const j = await res.json().catch(() => ({}));
        if (mySeq !== seq.current) return; // a newer keystroke won
        const rows = (j.results ?? []) as Array<{ kind: string; id: string | null; name: string }>;
        setResults(rows.filter((r) => r.kind === "constituent" && r.id).map((r) => ({ id: r.id as string, name: r.name })));
      } catch {
        if (mySeq === seq.current) setResults([]);
      } finally {
        if (mySeq === seq.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, picked]);

  const reset = () => {
    setSubjectType("constituent");
    setChannel("call");
    setNote("");
    setCreateTask(false);
    setDueDate("");
    setQuery("");
    setPicked(null);
    setResults([]);
    setError("");
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const submit = async () => {
    if (!picked) {
      setError("Pick a donor first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/acknowledgments/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_type: subjectType,
          subject_id: picked.id,
          subject_label: picked.name,
          channel,
          note: note.trim() || undefined,
          create_task: createTask,
          task_due_date: createTask && dueDate ? dueDate : undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      close();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors"
      >
        + Log a thank-you
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-lg mt-16 bg-tile border-[1.5px] border-outline rounded-card-lg p-5 space-y-4 shadow-tile">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-bold text-ink-1 text-base">Log a thank-you</h2>
          <button onClick={close} className={`text-ink-2 hover:${TYPE.body}`}>
            Close
          </button>
        </div>
        <p className="text-[11px] text-ink-2 leading-relaxed">
          For a thank-you with no gift behind it — a proactive note, a grant acknowledgment, a
          volunteer or board thank-you. Gift receipts stay in the queue above. No tax-deductible
          language is ever attached here.
        </p>

        {/* Subject type */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {SUBJECT_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setSubjectType(o.value)}
              aria-pressed={subjectType === o.value}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                subjectType === o.value
                  ? "bg-orange text-white border-orange"
                  : "bg-tile text-ink-2 border-outline hover:text-ink-1"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Donor picker */}
        {picked ? (
          <div className="flex items-center gap-3 bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2">
            <span className="text-sm text-ink-1 font-medium flex-1 truncate">{picked.name}</span>
            <button
              onClick={() => {
                setPicked(null);
                setQuery("");
              }}
              className="text-xs font-semibold text-ink-2 hover:text-ink-1"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a donor by name or org…"
              className={`w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 ${TYPE.body} focus:outline-none focus:border-orange/40`}
            />
            {(searching || results.length > 0) && (
              <ul className="absolute z-10 mt-1 w-full bg-tile border-[1.5px] border-outline rounded-lg overflow-hidden shadow-tile max-h-56 overflow-y-auto">
                {searching && results.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-ink-2">Searching…</li>
                ) : (
                  results.map((r) => (
                    <li key={r.id}>
                      <button
                        onClick={() => {
                          setPicked(r);
                          setResults([]);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-ink-1 hover:bg-orange/10 transition-colors"
                      >
                        {r.name}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        )}

        {/* Channel */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {ACK_CHANNELS.map((ch) => (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              aria-pressed={channel === ch}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                channel === ch
                  ? "bg-orange text-white border-orange"
                  : "bg-tile text-ink-2 border-outline hover:text-ink-1"
              }`}
            >
              {CHANNEL_LABEL[ch]}
            </button>
          ))}
        </div>

        {/* Note */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="What you said, or a short note for the record (optional)."
          className={`w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 ${TYPE.body} leading-relaxed placeholder-ink-3 focus:outline-none focus:border-orange/40`}
        />

        {/* Follow-up task */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-1 cursor-pointer">
            <input
              type="checkbox"
              checked={createTask}
              onChange={(e) => setCreateTask(e.target.checked)}
              className="accent-orange"
            />
            Add a follow-up task on the Ops queue
          </label>
          {createTask && (
            <div className="flex items-center gap-2 pl-6">
              <span className="text-[11px] text-ink-2">Due</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="bg-tile border-[1.5px] border-outline rounded-lg px-2 py-1 text-ink-1 text-xs focus:outline-none focus:border-orange/40"
              />
              <span className="text-[11px] text-ink-3">defaults to a week out</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap pt-1">
          <button
            onClick={submit}
            disabled={busy || !picked}
            className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50"
          >
            {busy ? "Logging…" : "Log thank-you"}
          </button>
          <button
            onClick={close}
            disabled={busy}
            className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors"
          >
            Cancel
          </button>
          {error && <span className="text-expense text-xs">{error}</span>}
        </div>
      </div>
    </div>
  );
}
