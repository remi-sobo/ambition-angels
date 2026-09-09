"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { C, F, card, eyebrow } from "./tokens";

export type ShareableNote = {
  agendaItemId: string;
  itemTitle: string;
  body: string;
  /** ISO timestamp of the last time this note was sent, or null. */
  sentAt: string | null;
};

/**
 * Send your notes to the Chair, after the meeting (spec §5.4, extended).
 *
 * The privacy rule is unchanged and absolute: nobody but the author can read
 * member_notes, and this component does not change that. It offers a separate
 * act — send a copy — which the director takes note by note, deliberately, and
 * which she can decline entirely by ignoring this panel.
 *
 * The copy is frozen when sent, so the panel says "Sent" rather than hiding
 * the note: editing the private note afterwards does not rewrite what the
 * Chair received, and a director should be able to see that plainly.
 */
export default function ShareNotes({
  meetingId,
  notes,
  recipient,
}: {
  meetingId: string;
  notes: ShareableNote[];
  recipient: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(0);

  if (notes.length === 0) return null;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    if (picked.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/board/meetings/${meetingId}/notes/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agendaItemIds: Array.from(picked) }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; sent?: number };
      if (!res.ok) {
        setError(payload.error ?? "Could not send.");
      } else {
        setJustSent(payload.sent ?? picked.size);
        setPicked(new Set());
        router.refresh();
      }
    } catch {
      setError("Network error. Your notes are still saved.");
    }
    setBusy(false);
  }

  return (
    <section className="board-noprint" style={{ ...card, padding: "clamp(24px,3vw,32px)", marginTop: 40 }}>
      <div style={eyebrow}>Your notes</div>
      <h2 style={{ margin: "10px 0 0", fontFamily: F.heading, fontSize: 24, fontWeight: 600, color: C.ink }}>
        Send anything on?
      </h2>
      <p style={{ margin: "10px 0 0", fontSize: 17, lineHeight: 1.6, color: C.charcoal, maxWidth: "60ch" }}>
        Your notes are private and stay private. Nothing below has been seen by anyone. Tick a note to
        send a copy of it to {recipient} — the copy is fixed at the moment you send, so editing the
        note afterwards does not change what they read.
      </p>

      <div style={{ marginTop: 24 }}>
        {notes.map((n, i) => (
          <div
            key={n.agendaItemId}
            style={{
              paddingTop: i === 0 ? 0 : 16,
              paddingBottom: i === notes.length - 1 ? 0 : 16,
              borderBottom: i === notes.length - 1 ? "none" : `1px solid ${C.rule}`,
            }}
          >
            <label style={{ display: "flex", gap: 14, alignItems: "flex-start", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={picked.has(n.agendaItemId)}
                onChange={() => toggle(n.agendaItemId)}
                disabled={busy}
                style={{ flex: "none", width: 18, height: 18, marginTop: 3, accentColor: C.orange }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontFamily: F.heading, fontSize: 16, fontWeight: 600, color: C.ink }}>
                  {n.itemTitle}
                  {n.sentAt && (
                    <span style={{ fontWeight: 400, color: C.muted }}> · Sent</span>
                  )}
                </span>
                <span
                  style={{
                    display: "block",
                    margin: "4px 0 0",
                    fontSize: 15,
                    lineHeight: 1.55,
                    color: C.charcoal,
                    whiteSpace: "pre-wrap",
                    maxWidth: "60ch",
                  }}
                >
                  {n.body}
                </span>
              </span>
            </label>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 24, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || picked.size === 0}
          style={{
            appearance: "none",
            border: "none",
            borderRadius: 4,
            background: picked.size === 0 ? C.ruleStrong : C.ink,
            color: C.cream,
            fontFamily: F.heading,
            fontSize: 15,
            fontWeight: 600,
            padding: "12px 22px",
            cursor: picked.size === 0 || busy ? "default" : "pointer",
          }}
        >
          {busy
            ? "Sending"
            : picked.size === 0
              ? "Choose a note"
              : `Send ${picked.size === 1 ? "1 note" : `${picked.size} notes`}`}
        </button>
        {justSent > 0 && !error && (
          <span style={{ fontSize: 15, color: C.charcoal }}>
            Sent. {recipient} can read {justSent === 1 ? "it" : "them"} in the portal.
          </span>
        )}
        {error && <span style={{ fontSize: 15, color: C.orangeDark }}>{error}</span>}
      </div>
    </section>
  );
}
