"use client";

// The phone screen. A student taps a career, can change their mind until
// the host cuts, and watches the projector for the reveal. This screen
// never renders a verdict about the person holding it (Phase 5 definition
// of done: nobody's screen ever displays "wrong" pointed at a student) —
// outcomes belong to the room and live on the wall.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRoomState, postRoom, getVoterId } from "../../_components/useRoom";

export default function VoteScreen({ roomCode }: { roomCode: string }) {
  const { state, notFound } = useRoomState(roomCode, 2500);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [votedRound, setVotedRound] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    postRoom(roomCode, "join", { voterId: getVoterId() });
  }, [roomCode]);

  // Restore my vote across a refresh (the DoD refresh case): the server
  // has the row; the highlight comes back from localStorage.
  useEffect(() => {
    if (!state) return;
    const saved = localStorage.getItem(`cut:vote:${state.roomCode}:${state.round}`);
    setMyVote(saved);
    setVotedRound(saved ? state.round : null);
  }, [state?.roomCode, state?.round, state]);

  const vote = useCallback(
    async (soc: string) => {
      if (!state || busy) return;
      setBusy(true);
      const res = await postRoom(roomCode, "vote", { voterId: getVoterId(), soc });
      if (res.ok) {
        setMyVote(soc);
        setVotedRound(state.round);
        localStorage.setItem(`cut:vote:${state.roomCode}:${state.round}`, soc);
      }
      setBusy(false);
    },
    [state, busy, roomCode]
  );

  if (notFound) {
    return (
      <Shell>
        <p className="font-display text-4xl">Room not found</p>
        <p className="font-body text-cream/60 mt-4">Check the code on the screen and try again.</p>
        <Link href="/teens/the-cut" className="font-body text-cream/60 underline underline-offset-4 mt-4">
          Back
        </Link>
      </Shell>
    );
  }
  if (!state) {
    return (
      <Shell>
        <p className="font-heading text-sm tracking-[0.3em] uppercase text-cream/50">Joining&hellip;</p>
      </Shell>
    );
  }
  if (state.expired && state.phase !== "done") {
    return (
      <Shell>
        <p className="font-display text-4xl">This room has closed</p>
      </Shell>
    );
  }

  if (state.phase === "done" && state.survivor) {
    return (
      <Shell>
        <p className="font-heading text-[11px] tracking-[0.3em] uppercase text-cream/50">
          Last career standing
        </p>
        <h1 className="font-display text-5xl leading-[0.95] text-orange mt-3">
          {state.survivor.title}
        </h1>
        <p className="font-body text-cream/70 mt-4 max-w-sm leading-relaxed">{state.survivor.reveal}</p>
        <p className="font-body text-sm text-cream/50 mt-6">The full story is on the big screen.</p>
        <Link
          href="/teens"
          className="mt-8 bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold px-10 py-3.5 rounded-full"
        >
          More games
        </Link>
      </Shell>
    );
  }

  const lastCut = state.history[state.history.length - 1];
  const voted = votedRound === state.round && myVote !== null;

  return (
    <div
      className="min-h-screen bg-ink text-cream flex flex-col"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    >
      <header className="px-5 pt-5 flex items-center justify-between">
        <p className="font-heading text-[11px] tracking-[0.25em] uppercase text-cream/50">
          Room <span className="text-orange font-bold">{state.roomCode}</span>
        </p>
        <p className="font-heading text-[11px] tracking-[0.25em] uppercase text-cream/50">
          Round {state.round + 1}
        </p>
      </header>

      <div className="flex-1 w-full max-w-md mx-auto px-5 py-6 flex flex-col">
        {lastCut && (
          <p className="font-body text-[12px] text-cream/40 mb-3">
            Last round: {lastCut.explain}
          </p>
        )}

        <h1 className="font-display text-3xl leading-[1.02]">{state.rule?.text}</h1>
        <p className="font-body text-sm text-cream/50 mt-2">
          {voted ? "Locked in — tap another to change it." : "Tap your call."}
        </p>

        <div className="flex flex-col gap-2.5 mt-5">
          {state.careers
            .filter((c) => !c.cut)
            .map((c) => {
              const mine = myVote === c.soc && voted;
              return (
                <button
                  key={c.soc}
                  onClick={() => vote(c.soc)}
                  disabled={busy}
                  className={`text-left rounded-card border p-4 transition-colors ${
                    mine
                      ? "border-orange bg-orange/15"
                      : "border-cream/25 bg-cream/[0.04] active:bg-orange/10"
                  }`}
                >
                  <span className="font-display text-xl leading-none">{c.title}</span>
                  <span className="block font-body text-xs text-cream/55 mt-1.5 leading-relaxed">
                    {c.reveal}
                  </span>
                  {mine && (
                    <span className="block font-heading text-[10px] tracking-[0.25em] uppercase text-orange mt-2">
                      Your call
                    </span>
                  )}
                </button>
              );
            })}
        </div>

        {voted && (
          <p className="font-body text-sm text-cream/50 text-center mt-5">
            Watch the big screen for the cut.
          </p>
        )}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-ink text-cream flex flex-col items-center justify-center px-6 text-center"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    >
      {children}
    </div>
  );
}
