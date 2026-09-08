"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { C, F } from "./tokens";

type Item = { id: string; title: string; duration_minutes: number | null };

/**
 * The chair's control bar (spec §5.4). board_admin only — it renders because
 * of the role, never because of a toggle.
 *
 * Two fixes the V2 audit demanded, made here rather than carried over:
 *  - Adjourn is pushed to the far right with a 32px gap and sits behind a
 *    confirm that names what happens. It ends the meeting for everyone and it
 *    was 18px from the button the chair presses six times in ninety minutes.
 *  - Elapsed time runs against the item's own time box, going muted → ink →
 *    orange as it overruns, so the chair can see the overrun without doing
 *    arithmetic mid-sentence.
 */
export default function ChairBar({
  meetingId,
  status,
  items,
  currentId,
}: {
  meetingId: string;
  status: "upcoming" | "live" | "closed";
  items: Item[];
  currentId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const index = currentId ? items.findIndex((i) => i.id === currentId) : -1;
  const current = index >= 0 ? items[index] : null;

  // The clock restarts when the chair advances.
  useEffect(() => {
    if (status !== "live" || !currentId) return;
    setStartedAt(Date.now());
    setElapsed(0);
  }, [currentId, status]);

  useEffect(() => {
    if (status !== "live" || !startedAt) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt, status]);

  async function act(action: string, extra?: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/board/meetings/${meetingId}/live`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const box = (current?.duration_minutes ?? 0) * 60;
  const over = box > 0 && elapsed > box;
  const near = box > 0 && !over && elapsed > box * 0.8;
  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div
      className="board-noprint"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        background: C.ink,
        color: C.cream,
        borderTop: `1px solid rgb(250 250 248 / 0.12)`,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        {status === "upcoming" && (
          <>
            <button type="button" onClick={() => act("start")} disabled={busy} style={pill(C.orange, C.white)}>
              {busy ? "Starting" : "Start the meeting"}
            </button>
            <span style={{ fontSize: 15, color: "#C8C6BE" }}>
              Directors see the live agenda the moment you do.
            </span>
          </>
        )}

        {status === "live" && (
          <>
            <button
              type="button"
              onClick={() => act("prev")}
              disabled={busy || index <= 0}
              style={ghost(index <= 0)}
            >
              Previous
            </button>

            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <div style={{ fontSize: 15, color: "#C8C6BE" }}>
                On now{current?.duration_minutes ? ` · ${current.duration_minutes} min box` : ""}
              </div>
              <div
                style={{
                  fontFamily: F.heading,
                  fontSize: 17,
                  fontWeight: 500,
                  color: C.cream,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {current?.title ?? "Not started"}
              </div>
            </div>

            <div style={{ flex: "none", textAlign: "right" }}>
              <div style={{ fontSize: 15, color: "#C8C6BE" }}>Elapsed</div>
              <div
                style={{
                  fontFamily: "var(--font-display), 'Big Shoulders Display', sans-serif",
                  fontWeight: 800,
                  fontSize: 28,
                  lineHeight: 1,
                  color: over ? C.orange : near ? C.cream : "#C8C6BE",
                }}
              >
                {mm}:{ss}
              </div>
            </div>

            <button
              type="button"
              onClick={() => act("next")}
              disabled={busy || index >= items.length - 1}
              style={pill(C.cream, C.ink)}
            >
              Next item
            </button>

            {/* The 32px gap the audit asked for: Adjourn is never adjacent to
                the button pressed six times a meeting. */}
            <span style={{ flex: "none", width: 32 }} />

            {!confirming ? (
              <button type="button" onClick={() => setConfirming(true)} style={ghost(false)}>
                Adjourn
              </button>
            ) : (
              <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, lineHeight: 1.35, color: "#C8C6BE" }}>
                  Adjourn and lock the agenda?
                  <br />
                  Minutes go to Shannon.
                </span>
                <button type="button" onClick={() => setConfirming(false)} style={ghost(false)}>
                  Keep going
                </button>
                <button type="button" onClick={() => act("adjourn")} disabled={busy} style={pill(C.orange, C.white)}>
                  {busy ? "Adjourning" : "Adjourn"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function pill(bg: string, fg: string): React.CSSProperties {
  return {
    height: 44,
    padding: "0 22px",
    border: "none",
    borderRadius: 999,
    background: bg,
    color: fg,
    fontFamily: F.body,
    fontSize: 17,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

function ghost(disabled: boolean): React.CSSProperties {
  return {
    height: 44,
    padding: "0 18px",
    border: "1px solid rgb(250 250 248 / 0.2)",
    borderRadius: 999,
    background: "transparent",
    color: disabled ? "rgb(250 250 248 / 0.35)" : "#C8C6BE",
    fontFamily: F.body,
    fontSize: 17,
    fontWeight: 500,
    cursor: disabled ? "default" : "pointer",
    whiteSpace: "nowrap",
  };
}
