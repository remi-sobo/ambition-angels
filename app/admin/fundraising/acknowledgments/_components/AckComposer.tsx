"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Per-gift composer: AI drafts the personal note (draft-then-approve into
// an editable textarea); the compliance block is shown read-only and is
// rebuilt server-side at send time — editing it here is impossible by
// design.
export default function AckComposer({
  giftId,
  donorEmail,
  complianceBlock,
}: {
  giftId: string;
  donorEmail: string | null;
  complianceBlock: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"" | "draft" | "send" | "mark">("");
  const [error, setError] = useState("");
  const [subject, setSubject] = useState("Thank you for supporting Ambition Angels");
  const [note, setNote] = useState("");

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

  const mark = async () => {
    if (!confirm("Mark this gift as thanked outside the system (letter, call, in person)?")) return;
    setBusy("mark");
    setError("");
    try {
      const res = await fetch("/api/admin/acknowledgments/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gift_id: giftId }),
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
          Compose
        </button>
        <button
          onClick={mark}
          disabled={busy === "mark"}
          className="text-[11px] font-semibold text-gray-mid hover:text-cream transition-colors disabled:opacity-50"
        >
          {busy === "mark" ? "Saving…" : "Mark as thanked"}
        </button>
        {error && <span className="text-red-400 text-xs">{error}</span>}
      </span>
    );
  }

  return (
    <div className="w-full mt-3 bg-[#13151f] border border-white/10 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="flex-1 min-w-[260px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-cream text-sm focus:outline-none focus:border-orange/40"
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
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={5}
        placeholder="The personal note — write it yourself or draft with AI, then edit freely. Review before sending: AI drafts are suggestions, not sends."
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-cream text-sm leading-relaxed placeholder-gray-mid focus:outline-none focus:border-orange/40"
      />
      <div className="text-[11px] text-gray-mid leading-relaxed bg-white/5 border border-white/10 rounded-lg px-3 py-2 whitespace-pre-wrap">
        <span className="text-white/40 font-semibold uppercase tracking-wider text-[10px] block mb-1">
          Appended automatically (IRS receipt language — not editable)
        </span>
        {complianceBlock}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={send}
          disabled={busy !== "" || !note.trim() || !donorEmail}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50"
        >
          {busy === "send" ? "Sending…" : `Send to ${donorEmail ?? "(no email on file)"}`}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={busy !== ""}
          className="text-xs font-semibold text-gray-mid hover:text-cream transition-colors"
        >
          Close
        </button>
        {error && <span className="text-red-400 text-xs">{error}</span>}
      </div>
    </div>
  );
}
