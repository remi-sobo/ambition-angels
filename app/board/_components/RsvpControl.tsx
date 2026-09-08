"use client";

import { useState } from "react";
import { C, F } from "./tokens";

/**
 * RSVP, as three explicit buttons.
 *
 * The V2 audit flagged preselecting "Yes" as a judgment call and said to leave
 * it alone if the affirmative act belongs on the record. For a board where
 * quorum is 3 of 5 it does: "she has not answered" and "she said yes" are
 * different facts, and collapsing them would make the tally a guess.
 */
export default function RsvpControl({
  meetingId,
  current,
}: {
  meetingId: string;
  current: "yes" | "no" | "unsure" | null;
}) {
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);

  async function pick(next: "yes" | "no" | "unsure") {
    if (busy) return;
    const previous = value;
    setValue(next);
    setBusy(true);
    try {
      const res = await fetch(`/api/board/meetings/${meetingId}/rsvp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rsvp: next }),
      });
      if (!res.ok) setValue(previous);
    } catch {
      setValue(previous);
    } finally {
      setBusy(false);
    }
  }

  const options: { key: "yes" | "no" | "unsure"; label: string }[] = [
    { key: "yes", label: "Yes" },
    { key: "no", label: "No" },
    { key: "unsure", label: "Not sure" },
  ];

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => pick(o.key)}
            aria-pressed={on}
            style={{
              height: 44,
              padding: "0 20px",
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: F.body,
              fontSize: 15,
              fontWeight: 600,
              background: on ? C.ink : C.white,
              color: on ? C.cream : C.ink,
              border: on ? "none" : `1px solid ${C.ruleStrong}`,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
