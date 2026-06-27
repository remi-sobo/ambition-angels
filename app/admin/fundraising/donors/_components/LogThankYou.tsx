"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ACK_CHANNELS, CHANNEL_LABEL, type AckChannel } from "@/lib/fundraising/ack-channels";

// Log a proactive, non-gift thank-you (no gift behind it, so no receipt
// language). Reusable across constituent / opportunity / volunteer / milestone
// subjects. Records the touch on the subject's timeline via /acknowledgments/log.
export default function LogThankYou({
  subjectType,
  subjectId,
  subjectLabel,
}: {
  subjectType: "constituent" | "opportunity" | "volunteer" | "milestone";
  subjectId: string;
  subjectLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<AckChannel>("email");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/acknowledgments/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_type: subjectType,
          subject_id: subjectId,
          subject_label: subjectLabel,
          channel,
          note,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setOpen(false);
      setNote("");
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
        className="text-[11px] font-semibold px-3 py-1.5 rounded-full border border-outline text-ink-2 hover:text-ink-1 transition-colors"
      >
        Log thank-you
      </button>
    );
  }

  return (
    <div className="w-full mt-2 bg-tile border-[1.5px] border-outline rounded-xl p-4 space-y-3">
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
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="A short note for the record (optional)."
        className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm leading-relaxed placeholder-ink-3 focus:outline-none focus:border-orange/40"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50"
        >
          {busy ? "Saving…" : `Log ${CHANNEL_LABEL[channel].toLowerCase()} thank-you`}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={busy}
          className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors"
        >
          Cancel
        </button>
        {error && <span className="text-expense text-xs">{error}</span>}
      </div>
    </div>
  );
}
