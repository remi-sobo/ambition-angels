"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { C, F, eyebrow } from "./tokens";

/**
 * Private notes on an agenda item (spec §5.4).
 *
 * Three rules, absolute: notes are visible only to the director who wrote
 * them, never to other directors, never to board_admin, and never aggregated
 * or summarized anywhere. RLS ("own notes") enforces it in the database; the
 * write path below goes through the user-scoped client so that policy
 * actually applies.
 *
 * A visible saved indicator is not decoration. The V2 audit's judgment stands:
 * an unsaved note lost during a live meeting is the worst failure this product
 * can have. So: autosave on a 900ms debounce, again on blur, a "Saved" stamp
 * for two seconds, and a localStorage write-through so a note survives a
 * reload even if the network dropped.
 */
export default function NoteBox({
  meetingId,
  agendaItemId,
  initial,
}: {
  meetingId: string;
  agendaItemId: string;
  initial: string;
}) {
  const storageKey = `aa-board-note-${meetingId}-${agendaItemId}`;
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stamp = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(initial);

  // Recover a draft the server never received (a reload mid-meeting on a bad
  // connection). The server copy wins when it is newer than what we cached.
  useEffect(() => {
    try {
      const cached = window.localStorage.getItem(storageKey);
      if (cached !== null && cached !== initial && initial === "") setValue(cached);
    } catch {
      /* private browsing */
    }
  }, [storageKey, initial]);

  const save = useCallback(
    async (body: string) => {
      if (body === lastSaved.current) return;
      setState("saving");
      try {
        const res = await fetch(`/api/board/meetings/${meetingId}/notes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ agendaItemId, body }),
        });
        if (!res.ok) throw new Error("save failed");
        lastSaved.current = body;
        setState("saved");
        if (stamp.current) clearTimeout(stamp.current);
        stamp.current = setTimeout(() => setState("idle"), 2000);
      } catch {
        setState("error");
      }
    },
    [meetingId, agendaItemId],
  );

  function onChange(next: string) {
    setValue(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      /* private browsing */
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(next), 900);
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (stamp.current) clearTimeout(stamp.current);
    },
    [],
  );

  return (
    <div className="board-noprint" style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${C.rule}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={eyebrow}>Your notes</span>
        <span style={{ fontSize: 15, color: C.muted }}>Only you can see these.</span>
        {state === "saving" && <span style={{ fontSize: 15, color: C.muted }}>Saving</span>}
        {state === "saved" && <span style={{ fontSize: 15, color: C.charcoal }}>Saved</span>}
        {state === "error" && (
          <span style={{ fontSize: 15, color: C.orangeDark }}>
            Not saved yet — kept on this device, retrying when you type again.
          </span>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          save(value);
        }}
        placeholder="Your notes"
        style={{
          width: "100%",
          minHeight: 88,
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
    </div>
  );
}
