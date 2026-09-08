"use client";

import { useRef, useState } from "react";
import type { Question } from "@/lib/board/data";
import { C, F, card, eyebrow } from "./tokens";

/**
 * "Anything you want answered before Wednesday?" (spec §5.3)
 *
 * Asynchronous rather than live, deliberately. On a five-person Zoom call a
 * live question queue splits the CEO's attention while presenting and gives
 * directors a way to raise something without saying it out loud, which is the
 * wrong habit for a board this size. What it solves is the real problem: not
 * knowing what the board is thinking until the meeting has started. Three
 * questions about one agenda item is a signal to give it more time.
 *
 * A director sees her own questions and their answers. board_admin sees all of
 * them, with the asker named. Nothing is board-wide.
 */
export default function QuestionBox({ meetingId, existing }: { meetingId: string; existing: Question[] }) {
  const [items, setItems] = useState(existing);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirmRef = useRef<HTMLDivElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !body.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/board/meetings/${meetingId}/questions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload?.error ?? "Could not send that. Try again.");
        return;
      }
      setItems((prev) => [payload.question as Question, ...prev]);
      setBody("");
      // Peak-end: the confirmation scrolls itself into view rather than
      // appearing silently below the fold.
      requestAnimationFrame(() =>
        confirmRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      );
    } catch {
      setError("Could not send that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ ...card, padding: 28 }}>
      <h3 style={{ margin: 0, fontFamily: F.heading, fontSize: 20, fontWeight: 600, color: C.ink }}>
        Questions on the materials
      </h3>
      <p style={{ margin: "6px 0 0", fontSize: 15, lineHeight: 1.55, color: C.muted }}>
        Anything you want answered before the meeting? Remi sees this; other directors do not.
      </p>

      <form onSubmit={submit} style={{ marginTop: 16 }}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Your question"
          style={{
            width: "100%",
            minHeight: 96,
            border: `1px solid ${C.rule}`,
            borderRadius: 6,
            background: C.cream,
            padding: "14px 16px",
            fontSize: 17,
            lineHeight: 1.55,
            color: C.ink,
            resize: "vertical",
            outline: "none",
            fontFamily: F.body,
          }}
        />
        {error && <p style={{ margin: "10px 0 0", fontSize: 15, color: C.orangeDark }}>{error}</p>}
        <button
          type="submit"
          disabled={busy || !body.trim()}
          style={{
            marginTop: 12,
            height: 44,
            padding: "0 20px",
            borderRadius: 999,
            border: "none",
            background: busy || !body.trim() ? C.grayLight : C.ink,
            color: busy || !body.trim() ? C.charcoal : C.cream,
            fontFamily: F.body,
            fontSize: 15,
            fontWeight: 600,
            cursor: busy || !body.trim() ? "default" : "pointer",
          }}
        >
          {busy ? "Sending" : "Send to Remi"}
        </button>
      </form>

      {items.length > 0 && (
        <div ref={confirmRef} style={{ marginTop: 24, paddingTop: 18, borderTop: `1px solid ${C.rule}` }}>
          <div style={eyebrow}>What you have asked</div>
          {items.map((q) => (
            <div key={q.id} style={{ marginTop: 14 }}>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: C.ink }}>{q.body}</p>
              {q.answer_body ? (
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: 15,
                    lineHeight: 1.55,
                    color: C.charcoal,
                    borderLeft: `2px solid ${C.ink}`,
                    paddingLeft: 12,
                  }}
                >
                  {q.answer_body}
                </p>
              ) : (
                <div style={{ fontSize: 15, color: C.muted, marginTop: 4 }}>Sent. Not answered yet.</div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
