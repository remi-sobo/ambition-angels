"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ACK_CHANNELS, CHANNEL_LABEL, type AckChannel } from "@/lib/fundraising/ack-channels";

export type AckTemplateLite = {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
};

// Per-gift composer, now channel-aware. Email drafts the personal note (AI or
// by hand) and sends through Resend; the offline channels (letter, call, text,
// in person) log the touch on the donor timeline. The compliance block is
// shown read-only and rebuilt server-side at send time — editing it here is
// impossible by design, and it only appears for the channels that carry a
// written receipt (email, letter).
export default function AckComposer({
  giftId,
  donorName,
  donorEmail,
  complianceBlock,
  templates,
  defaultChannel,
}: {
  giftId: string;
  donorName: string;
  donorEmail: string | null;
  complianceBlock: string;
  templates: AckTemplateLite[];
  defaultChannel?: AckChannel | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Honor the donor's preferred channel when they have one.
  const [channel, setChannel] = useState<AckChannel>(defaultChannel ?? "email");
  const [busy, setBusy] = useState<"" | "draft" | "send" | "log">("");
  const [error, setError] = useState("");
  const [subject, setSubject] = useState("Thank you for supporting Ambition Angels");
  const [note, setNote] = useState("");

  const firstName = donorName.split(/\s+/)[0] || "friend";
  const personalize = (s: string) => s.replace(/\{\{\s*first_name\s*\}\}/gi, firstName);
  const channelTemplates = templates.filter((t) => t.channel === channel);

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (t.subject) setSubject(personalize(t.subject));
    setNote(personalize(t.body));
  };

  const draft = async () => {
    setBusy("draft");
    setError("");
    try {
      const res = await fetch("/api/admin/acknowledgments/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gift_id: giftId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setNote(j.draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setBusy("");
    }
  };

  const send = async () => {
    setBusy("send");
    setError("");
    try {
      const res = await fetch("/api/admin/acknowledgments/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gift_id: giftId, subject, personal_note: note }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      if (j.warning) setError(j.warning);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy("");
    }
  };

  const log = async () => {
    if (!confirm(`Log this thank-you as ${CHANNEL_LABEL[channel].toLowerCase()}?`)) return;
    setBusy("log");
    setError("");
    try {
      const res = await fetch("/api/admin/acknowledgments/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gift_id: giftId, channel, note }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      if (j.warning) setError(j.warning);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy("");
    }
  };

  if (!open) {
    return (
      <span className="flex items-center gap-3">
        <button
          onClick={() => setOpen(true)}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors"
        >
          Thank
        </button>
        {error && <span className="text-expense text-xs">{error}</span>}
      </span>
    );
  }

  const isEmail = channel === "email";
  const isLetter = channel === "letter";
  // A letter for a $250+ gift doubles as the written receipt, so the compliance
  // block rides along; email always carries it.
  const showCompliance = isEmail || isLetter;

  return (
    <div className="w-full mt-3 bg-tile border-[1.5px] border-outline rounded-xl p-4 space-y-3">
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

      {channelTemplates.length > 0 && (
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) applyTemplate(e.target.value);
          }}
          className="bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-xs focus:outline-none focus:border-orange/40"
        >
          <option value="">Use a template…</option>
          {channelTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}

      {isEmail && (
        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 min-w-[260px] bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm focus:outline-none focus:border-orange/40"
            placeholder="Subject"
          />
          <button
            onClick={draft}
            disabled={busy !== ""}
            className="text-xs font-semibold text-orange bg-orange/10 border border-orange/30 px-3 py-2 rounded-lg hover:bg-orange/20 transition-colors disabled:opacity-50"
          >
            {busy === "draft" ? "Drafting…" : note ? "✦ Redraft with AI" : "✦ Draft with AI"}
          </button>
        </div>
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={isEmail || isLetter ? 5 : 3}
        placeholder={
          isEmail || isLetter
            ? "The personal note — write it yourself or draft with AI, then edit freely. Review before sending."
            : `What you said when you ${CHANNEL_LABEL[channel].toLowerCase()}ed (optional — a short script or note for the record).`
        }
        className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm leading-relaxed placeholder-ink-3 focus:outline-none focus:border-orange/40"
      />

      {showCompliance && (
        <div className="text-[11px] text-ink-2 leading-relaxed bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 whitespace-pre-wrap">
          <span className="text-ink-3 font-semibold uppercase tracking-wider text-[10px] block mb-1">
            Appended automatically (IRS receipt language — not editable)
          </span>
          {complianceBlock}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {isEmail ? (
          <button
            onClick={send}
            disabled={busy !== "" || !note.trim() || !donorEmail}
            className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50"
          >
            {busy === "send" ? "Sending…" : `Send to ${donorEmail ?? "(no email on file)"}`}
          </button>
        ) : (
          <button
            onClick={log}
            disabled={busy !== ""}
            className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50"
          >
            {busy === "log" ? "Logging…" : `Log ${CHANNEL_LABEL[channel].toLowerCase()}`}
          </button>
        )}
        <button
          onClick={() => setOpen(false)}
          disabled={busy !== ""}
          className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors"
        >
          Close
        </button>
        {error && <span className="text-expense text-xs">{error}</span>}
      </div>
    </div>
  );
}
