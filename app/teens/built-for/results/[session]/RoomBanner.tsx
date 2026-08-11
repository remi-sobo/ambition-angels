"use client";

// Group-mode banner (Phase 5). Shown only for sessions that joined a room.
// Polls room state until the tables are dealt, then tells this student —
// and only this student — which table they sit at and links to their round
// card. The wall never shows a career; this banner is how the assignment
// arrives.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type YouState = { table: number; socCode: string } | null;

export default function RoomBanner({
  sessionId,
  roomCode,
  handle,
}: {
  sessionId: string;
  roomCode: string;
  handle: string;
}) {
  const [tablesUp, setTablesUp] = useState(false);
  const [you, setYou] = useState<YouState>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/ms/room/${encodeURIComponent(roomCode)}?session=${encodeURIComponent(sessionId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();
      setTablesUp(Boolean(data.tables));
      setYou(data.you ?? null);
    } catch {
      // transient; next poll retries
    }
  }, [roomCode, sessionId]);

  useEffect(() => {
    void poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [poll]);

  return (
    <div className="rounded-2xl border border-orange/50 px-5 py-4 mb-8">
      <p className="font-heading text-[11px] tracking-[0.25em] uppercase text-cream/50">
        Room {roomCode} · you are <span className="text-orange">{handle}</span>
      </p>
      {!tablesUp ? (
        <p className="font-body text-sm text-cream/70 mt-2">
          While the room fills: explore any career below. When the tables go up, this banner
          tells you where to sit.
        </p>
      ) : you ? (
        <>
          <p className="font-heading font-semibold text-lg mt-2">
            You&rsquo;re at Table {you.table}.
          </p>
          <p className="font-body text-sm text-cream/70 mt-1">
            Your round card is dealt. Nobody else can see it. Read your day silently, then read
            the clues out loud.
          </p>
          <Link
            href={`/teens/built-for/card/${sessionId}/${you.socCode}`}
            className="inline-block mt-3 bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold px-8 py-3 rounded-full"
          >
            Open my round card
          </Link>
        </>
      ) : (
        <p className="font-body text-sm text-cream/70 mt-2">
          Tables are up. You joined after the deal. Ask your facilitator to re-deal, or explore
          on your own below.
        </p>
      )}
    </div>
  );
}
