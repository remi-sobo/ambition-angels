"use client";

// The game (specs/ms-career-game.md "Design direction"). Three screens:
//
// THE DAY — heavy, dark, silent. A hairline timer empties over 60 seconds
// and then simply stops; it never locks anybody out, and the day can be
// pulled back up from the clue screen at any point.
//
// THE CLUES — the money screen. One clue at a time, set big enough to read
// out loud across a noisy table. The clue number is enormous; the unrevealed
// clues sit below as locked slots so the burn-down is visible. Clue 8 is
// fetched from the server only when its slot is reached.
//
// THE ANSWER — a full-screen card turn. The title is the largest type in
// the product, and getting it writes clues_used in the same server call.
//
// No emoji. No confetti. Respect prefers-reduced-motion.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

const CLUE_LABELS = [
  "The problem I solve",
  "What I actually do all day",
  "Three skills that matter",
  "Who is counting on me",
  "Where I work",
  "How you get here",
  "What it pays",
  "The thing nobody knows",
];

const DAY_SECONDS = 60;

type Stage = "day" | "clues" | "answer";

export default function CardClient({
  sessionId,
  socCode,
  dayVignette,
  clues,
}: {
  sessionId: string;
  socCode: string;
  dayVignette: string;
  clues: string[]; // clues 1–7; clue 8 arrives via the reveal route
}) {
  const [stage, setStage] = useState<Stage>("day");
  const [revealed, setRevealed] = useState(1); // 1-based count of visible clues
  const [guessedAt, setGuessedAt] = useState<number | null>(null);
  const [clue8, setClue8] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The day timer: state is the remaining fraction; when it hits zero the
  // bar is simply empty. Nothing flashes, nothing buzzes, nothing advances.
  const [remaining, setRemaining] = useState(DAY_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (stage !== "day") return;
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1 && timerRef.current) clearInterval(timerRef.current);
        return Math.max(0, r - 1);
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stage]);

  const reveal = useCallback(
    async (stageWanted: "clue_8" | "answer") => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/ms/reveal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            soc_code: socCode,
            stage: stageWanted,
            ...(stageWanted === "answer" ? { clues_used: guessedAt ?? 8 } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError("Something went wrong. Tap to try again.");
          return null;
        }
        return data;
      } catch {
        setError("Something went wrong. Tap to try again.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [sessionId, socCode, guessedAt]
  );

  const nextClue = useCallback(async () => {
    if (busy) return;
    if (revealed < 7) {
      setRevealed((r) => r + 1);
      return;
    }
    if (revealed === 7) {
      const data = await reveal("clue_8");
      if (data) {
        setClue8(data.clue8 ?? "");
        setRevealed(8);
      }
    }
  }, [busy, revealed, reveal]);

  const showAnswer = useCallback(async () => {
    if (busy) return;
    const data = await reveal("answer");
    if (data) {
      setTitle(data.title ?? "");
      setStage("answer");
    }
  }, [busy, reveal]);

  // ── THE DAY ──────────────────────────────────────────────────────────────
  if (stage === "day") {
    return (
      <div className="min-h-screen bg-ink text-cream flex flex-col">
        <div className="h-[3px] bg-cream/10">
          <div
            className="h-full bg-orange motion-safe:transition-[width] motion-safe:duration-1000 motion-safe:ease-linear"
            style={{ width: `${(remaining / DAY_SECONDS) * 100}%` }}
          />
        </div>
        <div className="px-5 py-4 flex items-center justify-between">
          <p className="font-heading text-[11px] tracking-[0.3em] uppercase text-cream/40">
            The day · just for you
          </p>
          <span className="font-heading text-[11px] tracking-[0.2em] text-cream/30 tabular-nums">
            {remaining > 0 ? `0:${String(remaining).padStart(2, "0")}` : ""}
          </span>
        </div>
        <div className="flex-1 flex flex-col justify-center px-6 pb-10 max-w-xl mx-auto w-full">
          <p className="font-body text-xl sm:text-2xl leading-relaxed whitespace-pre-wrap">
            {dayVignette}
          </p>
          <p className="font-body text-sm text-cream/40 mt-8">
            Read it like it&rsquo;s your day. Your table never sees this — but they can ask you
            questions, so know it.
          </p>
          <button
            onClick={() => setStage("clues")}
            className="mt-8 self-start bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold text-lg px-10 py-4 rounded-full"
          >
            I know my day &rarr;
          </button>
        </div>
      </div>
    );
  }

  // ── THE ANSWER ───────────────────────────────────────────────────────────
  if (stage === "answer") {
    return (
      <div className="min-h-screen bg-orange text-white flex flex-col [perspective:1200px]">
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center motion-safe:animate-[ms-card-turn_400ms_ease-out]">
          <p className="font-heading text-[11px] tracking-[0.3em] uppercase text-white/60 mb-6">
            The answer
          </p>
          <h1 className="font-display text-6xl sm:text-8xl leading-[0.9] max-w-4xl break-words">
            {title}
          </h1>
          <p className="font-body text-white/70 mt-8">
            {guessedAt ? `Your table got it on clue ${guessedAt}.` : "That one took all eight. They learned the most."}
          </p>
          <p className="font-body text-white/70 mt-1">It&rsquo;s in your deck.</p>
        </div>
        <div className="px-6 pb-10 text-center">
          <Link
            href={`/teens/built-for/results/${sessionId}`}
            className="inline-block bg-white text-orange font-heading font-semibold px-10 py-4 rounded-full hover:bg-cream transition-colors"
          >
            Back to your list
          </Link>
        </div>
      </div>
    );
  }

  // ── THE CLUES ────────────────────────────────────────────────────────────
  const current = revealed; // 1..8
  const currentText = current === 8 ? clue8 ?? "" : clues[current - 1];

  return (
    <div className="min-h-screen bg-ink text-cream flex flex-col">
      <div className="px-5 py-4 flex items-center justify-between">
        <button
          onClick={() => setStage("day")}
          className="font-body text-sm text-cream/50 hover:text-cream transition-colors"
        >
          &larr; My day
        </button>
        <p className="font-heading text-[11px] tracking-[0.3em] uppercase text-cream/40">
          Read out loud · they guess
        </p>
      </div>

      <div className="flex-1 flex flex-col justify-center px-6 max-w-xl mx-auto w-full">
        <div className="flex items-baseline gap-4">
          <span className="font-display text-8xl sm:text-9xl text-orange leading-none tabular-nums">
            {current}
          </span>
          <span className="font-heading text-xs tracking-[0.25em] uppercase text-cream/50">
            {CLUE_LABELS[current - 1]}
          </span>
        </div>
        <p className="font-body text-2xl sm:text-3xl leading-snug mt-6 min-h-[8rem]">
          {currentText}
        </p>

        {/* The burn-down: how many clues are left to spend. */}
        <div className="flex gap-1.5 mt-8">
          {CLUE_LABELS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i < revealed ? "bg-orange" : "bg-cream/15"
              } ${guessedAt != null && i === guessedAt - 1 ? "outline outline-1 outline-cream/60" : ""}`}
            />
          ))}
        </div>

        {error && (
          <button onClick={() => setError(null)} className="font-body text-orange mt-4 text-left">
            {error}
          </button>
        )}

        <div className="mt-8 flex flex-col gap-2.5">
          {revealed < 8 ? (
            <button
              onClick={nextClue}
              disabled={busy}
              className="w-full bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold text-lg px-8 py-4 rounded-full disabled:opacity-60"
            >
              {busy ? "…" : `Next clue (${8 - revealed} left)`}
            </button>
          ) : (
            <button
              onClick={showAnswer}
              disabled={busy}
              className="w-full bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold text-lg px-8 py-4 rounded-full disabled:opacity-60"
            >
              {busy ? "…" : "The answer"}
            </button>
          )}
          {guessedAt == null ? (
            <button
              onClick={() => setGuessedAt(revealed)}
              disabled={busy}
              className="w-full border border-cream/20 hover:border-cream/50 transition-colors text-cream/80 font-heading text-sm px-8 py-3 rounded-full"
            >
              They guessed it — on this clue
            </button>
          ) : (
            <p className="font-body text-sm text-cream/50 text-center py-2">
              Got it on clue {guessedAt}. Read the rest anyway — that&rsquo;s where the learning is.
            </p>
          )}
        </div>
      </div>
      <div className="h-10" />
    </div>
  );
}
