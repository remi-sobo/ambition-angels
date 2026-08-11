"use client";

// The board. Projected in a classroom (host controls in the corner) or
// played solo on one screen (?solo=1 — cards become tappable and the tap
// resolves). The reveal is sequenced tally-first on purpose: the spec's
// mitigation for "25 kids watch three kids play" is that the count shows
// on the wall before the answer does. Outcomes are always the room's —
// "Called it" / "The board wins this one" — never a student's.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useRoomState,
  postRoom,
  getVoterId,
  type CutHistoryEntry,
  type CutRoomView,
} from "../../_components/useRoom";

const fmtPay = (n: number) => `$${n.toLocaleString("en-US")}`;

type Overlay = { entry: CutHistoryEntry; stage: "tally" | "cut" };

export default function BoardScreen({ roomCode }: { roomCode: string }) {
  const search = useSearchParams();
  const hostToken = search.get("host");
  const solo = search.get("solo") === "1";
  const { state, notFound, refresh } = useRoomState(roomCode, solo ? 4000 : 1500);

  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const shownRounds = useRef(-1);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Solo joins itself; a projector never joins (it is not a voter).
  useEffect(() => {
    if (solo) postRoom(roomCode, "join", { voterId: getVoterId() });
  }, [solo, roomCode]);

  // Sequence new history entries: tally first, then the cut.
  useEffect(() => {
    if (!state || overlay) return;
    const next = state.history.find((h) => h.round > shownRounds.current);
    if (!next) return;
    shownRounds.current = next.round;
    setOverlay({ entry: next, stage: "tally" });
    overlayTimer.current = setTimeout(() => {
      setOverlay({ entry: next, stage: "cut" });
      overlayTimer.current = setTimeout(() => setOverlay(null), solo ? 3500 : 5000);
    }, solo ? 2500 : 4000);
  }, [state, overlay, solo]);
  useEffect(() => () => {
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
  }, []);

  // On first load of a room with history (projector refresh), don't replay.
  useEffect(() => {
    if (state && shownRounds.current === -1 && state.history.length > 0 && !overlay) {
      shownRounds.current = state.history[state.history.length - 1].round;
    }
  }, [state, overlay]);

  const resolve = useCallback(
    async (force: boolean) => {
      if (!hostToken) return;
      setBusy(true);
      setNotice(null);
      const res = await postRoom(roomCode, "resolve", { hostToken, force });
      if (!res.ok && res.status === 409 && typeof res.json.error === "string") {
        setNotice(res.json.error);
      }
      await refresh();
      setBusy(false);
    },
    [hostToken, roomCode, refresh]
  );

  const soloTap = useCallback(
    async (soc: string) => {
      if (!state || state.phase !== "vote" || overlay || busy) return;
      setBusy(true);
      await postRoom(roomCode, "vote", { voterId: getVoterId(), soc });
      await resolve(false);
    },
    [state, overlay, busy, roomCode, resolve]
  );

  if (notFound) {
    return (
      <Shell>
        <p className="font-display text-5xl">Room not found</p>
        <Link href="/teens/the-cut" className="font-body text-cream/60 underline underline-offset-4 mt-6">
          Open a new one
        </Link>
      </Shell>
    );
  }
  if (!state) {
    return (
      <Shell>
        <p className="font-heading text-sm tracking-[0.3em] uppercase text-cream/50">Dealing the board…</p>
      </Shell>
    );
  }
  if (state.expired && state.phase !== "done") {
    return (
      <Shell>
        <p className="font-display text-5xl">This room has closed</p>
        <Link href="/teens/the-cut" className="font-body text-cream/60 underline underline-offset-4 mt-6">
          Open a new one
        </Link>
      </Shell>
    );
  }

  const quorumMet = state.votesIn >= state.quorum;

  return (
    <div
      className="min-h-screen bg-ink text-cream flex flex-col"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    >
      {/* Top bar: join line + lives. Big enough for the back row. */}
      <header className="px-6 sm:px-10 pt-6 flex flex-wrap items-center justify-between gap-3 w-full">
        {!solo ? (
          <p className="font-heading text-sm sm:text-base tracking-[0.25em] uppercase text-cream/60">
            ambitionangels.org/teens/the-cut &middot; code{" "}
            <span className="text-orange font-bold">{state.roomCode}</span>
          </p>
        ) : (
          <Link href="/teens/the-cut" className="font-body text-sm text-cream/50 hover:text-cream">
            &larr; The Cut
          </Link>
        )}
        <p className="font-heading text-sm tracking-[0.2em] uppercase text-cream/60">
          Lives{" "}
          <span className="tracking-normal text-lg align-middle">
            {Array.from({ length: 3 }, (_, i) => (
              <span key={i} className={i < state.lives ? "text-orange" : "text-cream/20"}>
                ●
              </span>
            ))}
          </span>
        </p>
      </header>

      <div className="flex-1 w-full max-w-5xl mx-auto px-6 sm:px-10 py-8 flex flex-col">
        {state.phase === "done" && state.survivor ? (
          <Survivor state={state} solo={solo} />
        ) : (
          <>
            {/* The rule — the biggest thing on the wall */}
            <div className="text-center min-h-[7rem] flex flex-col justify-center">
              {overlay ? (
                <RevealOverlay overlay={overlay} state={state} />
              ) : (
                <>
                  <p className="font-heading text-[11px] tracking-[0.3em] uppercase text-cream/50">
                    Round {state.round + 1} &middot; the rule
                  </p>
                  <h1 className="font-display text-4xl sm:text-6xl leading-[1.02] mt-2">
                    {state.rule?.text}
                  </h1>
                </>
              )}
            </div>

            {/* The board */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-8">
              {state.careers.map((c) => {
                const justCut = overlay?.stage === "cut" && overlay.entry.cutSoc === c.soc;
                const tallyCount = overlay ? (overlay.entry.tally[c.soc] ?? 0) : null;
                return (
                  <button
                    key={c.soc}
                    onClick={() => solo && soloTap(c.soc)}
                    disabled={!solo || c.cut || state.phase !== "vote" || overlay !== null}
                    className={`text-left rounded-card border p-4 sm:p-6 transition-all ${
                      c.cut && !justCut
                        ? "border-cream/10 bg-transparent opacity-30"
                        : justCut
                          ? "border-orange bg-orange/15"
                          : solo
                            ? "border-cream/25 bg-cream/[0.04] hover:border-orange hover:bg-orange/10"
                            : "border-cream/25 bg-cream/[0.04]"
                    }`}
                  >
                    <h2 className={`font-display text-2xl sm:text-3xl leading-[0.95] ${c.cut && !justCut ? "line-through" : ""}`}>
                      {c.title}
                    </h2>
                    <p className="font-body text-xs sm:text-sm text-cream/60 mt-2 leading-relaxed">
                      {c.reveal}
                    </p>
                    {overlay && !c.cut && tallyCount !== null && (
                      <p className="font-display text-2xl text-orange mt-3">
                        {tallyCount} {tallyCount === 1 ? "vote" : "votes"}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Host / participation strip */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4 min-h-[3.25rem]">
              {!solo && (
                <>
                  <p className="font-heading text-xs tracking-[0.25em] uppercase text-cream/50">
                    {state.joined} joined &middot; {state.votesIn} voted
                    {!quorumMet && state.joined > 0 && ` · needs ${state.quorum}`}
                  </p>
                  {hostToken && state.phase === "vote" && !overlay && (
                    <>
                      <button
                        onClick={() => resolve(false)}
                        disabled={busy || !quorumMet}
                        className="bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold px-9 py-3 rounded-full disabled:opacity-40"
                      >
                        {busy ? "Cutting…" : "Make the cut"}
                      </button>
                      {!quorumMet && state.joined > 0 && (
                        <button
                          onClick={() => resolve(true)}
                          disabled={busy}
                          className="font-body text-xs text-cream/40 hover:text-cream underline underline-offset-4"
                        >
                          cut without waiting
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
              {notice && <p className="font-body text-sm text-orange">{notice}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RevealOverlay({ overlay, state }: { overlay: Overlay; state: CutRoomView }) {
  if (overlay.stage === "tally") {
    return (
      <>
        <p className="font-heading text-[11px] tracking-[0.3em] uppercase text-cream/50">
          Votes are in
        </p>
        <h1 className="font-display text-4xl sm:text-6xl leading-[1.02] mt-2 text-cream/80">
          The room has spoken&hellip;
        </h1>
      </>
    );
  }
  const cutCareer = state.careers.find((c) => c.soc === overlay.entry.cutSoc);
  return (
    <>
      <p className="font-heading text-[11px] tracking-[0.3em] uppercase text-orange">
        {overlay.entry.roomRight ? "Called it" : "The board wins this one"}
      </p>
      <h1 className="font-display text-4xl sm:text-6xl leading-[1.02] mt-2">
        Cut: <span className="text-orange">{cutCareer?.title}</span>
      </h1>
      <p className="font-body text-base sm:text-xl text-cream/70 mt-3 max-w-2xl mx-auto">
        {overlay.entry.explain}
      </p>
    </>
  );
}

function Survivor({ state, solo }: { state: CutRoomView; solo: boolean }) {
  const s = state.survivor!;
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <p className="font-heading text-[11px] tracking-[0.3em] uppercase text-cream/50">
        Last career standing
      </p>
      <h1 className="font-display text-5xl sm:text-7xl leading-[0.95] text-orange mt-3">{s.title}</h1>
      <p className="font-body text-lg sm:text-2xl text-cream/80 mt-6 max-w-2xl leading-relaxed">
        {s.vignette ?? s.reveal}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 mt-8">
        <p className="font-display text-3xl sm:text-4xl">{fmtPay(s.pay_median)}</p>
        {s.pay_p90 && (
          <p className="font-body text-cream/60 text-sm sm:text-base">
            top earners {fmtPay(s.pay_p90)}
          </p>
        )}
        {s.education && (
          <p className="font-body text-cream/60 text-sm sm:text-base">{s.education}</p>
        )}
      </div>
      <p className="font-heading text-xs tracking-[0.25em] uppercase text-cream/50 mt-10">
        {state.lives > 0
          ? `The ${solo ? "run" : "room"} finished with ${state.lives} ${state.lives === 1 ? "life" : "lives"}`
          : "The board took every life. Rematch?"}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
        <Link
          href="/teens/the-cut"
          className="bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold px-10 py-3.5 rounded-full"
        >
          New board
        </Link>
        <Link
          href="/teens"
          className="border border-cream/30 hover:border-cream text-cream font-heading font-semibold px-10 py-3.5 rounded-full transition-colors"
        >
          All games
        </Link>
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
