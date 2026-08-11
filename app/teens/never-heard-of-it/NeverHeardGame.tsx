"use client";

// Never Heard of It, the whole game (specs/teen-games-v1.md Phase 4).
// The daily response carries clue 1 and a set of answer hashes — never
// the title. The typed guess is normalized and hashed right here in the
// browser (lib/games/guess.ts, the same normalization the server used)
// and compared against the set: a wrong guess costs no round trip, and
// the guess itself never leaves the phone. A miss buys the next clue;
// missing on clue 8 — or giving up — ends the run, and either way the
// full reveal shows, because the reveal is the point. Day state, streak,
// and best live in localStorage only.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { canonicalAnswer } from "@/lib/games/guess";

const TOTAL_CLUES = 8;
const SHARE_URL = "https://www.ambitionangels.org/teens/never-heard-of-it";

type Daily = { day: string; dayNumber: number; clue: string; answers: string[] };
type Reveal = {
  title: string;
  vignette: string | null;
  pay_median: number | null;
  pay_p90: number | null;
  pay_as_of: string;
  education: string | null;
};
type DayState = {
  clues: string[];
  status: "playing" | "solved" | "failed";
  usedClues: number;
};

const fmtPay = (n: number) => `$${n.toLocaleString("en-US")}`;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function shareBlock(dayNumber: number, state: DayState): string {
  const squares =
    state.status === "solved"
      ? "🟧".repeat(state.usedClues - 1) + "🟩" + "⬛".repeat(TOTAL_CLUES - state.usedClues)
      : "🟧".repeat(TOTAL_CLUES);
  return `Never Heard of It #${dayNumber}\n${squares}\n${SHARE_URL}`;
}

export default function NeverHeardGame() {
  const [daily, setDaily] = useState<Daily | null>(null);
  const [offToday, setOffToday] = useState(false);
  const [error, setError] = useState(false);
  const [state, setState] = useState<DayState | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [guess, setGuess] = useState("");
  const [miss, setMiss] = useState(false);
  const [busy, setBusy] = useState(false);
  const [streak, setStreak] = useState(0);
  const [copied, setCopied] = useState(false);

  const stateKey = (day: string) => `nhoi:state:${day}`;

  const persist = useCallback((day: string, next: DayState) => {
    setState(next);
    localStorage.setItem(stateKey(day), JSON.stringify(next));
  }, []);

  // Streak bookkeeping happens once, the moment a day ends.
  const closeDay = useCallback((day: string, solved: boolean) => {
    const prev = JSON.parse(localStorage.getItem("nhoi:streak") ?? "{}") as {
      lastDay?: string;
      count?: number;
    };
    if (prev.lastDay === day) return; // refresh after finishing — already counted
    const yesterday = new Date(Date.parse(day) - 86_400_000).toISOString().slice(0, 10);
    const count = solved ? (prev.lastDay === yesterday ? (prev.count ?? 0) + 1 : 1) : 0;
    localStorage.setItem("nhoi:streak", JSON.stringify({ lastDay: day, count }));
    setStreak(count);
  }, []);

  const fetchReveal = useCallback(async (): Promise<Reveal | null> => {
    try {
      const res = await fetch("/api/games/daily/reveal", { method: "POST" });
      if (!res.ok) return null;
      return (await res.json()) as Reveal;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/games/daily", { cache: "no-store" });
        if (res.status === 503) return setOffToday(true);
        if (!res.ok) return setError(true);
        const d = (await res.json()) as Daily;
        setDaily(d);
        const saved = localStorage.getItem(stateKey(d.day));
        const s: DayState = saved
          ? (JSON.parse(saved) as DayState)
          : { clues: [d.clue], status: "playing", usedClues: 1 };
        setState(s);
        if (!saved) localStorage.setItem(stateKey(d.day), JSON.stringify(s));
        if (s.status !== "playing") setReveal(await fetchReveal());
        const st = JSON.parse(localStorage.getItem("nhoi:streak") ?? "{}") as { count?: number };
        setStreak(st.count ?? 0);
      } catch {
        setError(true);
      }
    })();
  }, [fetchReveal]);

  const finish = useCallback(
    async (day: string, next: DayState) => {
      persist(day, next);
      closeDay(day, next.status === "solved");
      setReveal(await fetchReveal());
    },
    [persist, closeDay, fetchReveal]
  );

  const submitGuess = useCallback(async () => {
    if (!daily || !state || state.status !== "playing" || busy) return;
    const canonical = canonicalAnswer(guess);
    if (!canonical) return;
    setBusy(true);
    setMiss(false);
    const hash = await sha256Hex(canonical);
    if (daily.answers.includes(hash)) {
      await finish(daily.day, { ...state, status: "solved", usedClues: state.clues.length });
    } else if (state.clues.length >= TOTAL_CLUES) {
      await finish(daily.day, { ...state, status: "failed", usedClues: TOTAL_CLUES });
    } else {
      setMiss(true);
      try {
        const res = await fetch("/api/games/daily/clue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ n: state.clues.length + 1 }),
        });
        if (res.ok) {
          const j = (await res.json()) as { clue: string };
          persist(daily.day, { ...state, clues: [...state.clues, j.clue] });
        }
      } catch {
        /* clue fetch failed — the guess still counted, try again */
      }
    }
    setGuess("");
    setBusy(false);
  }, [daily, state, guess, busy, finish, persist]);

  const giveUp = useCallback(async () => {
    if (!daily || !state || state.status !== "playing" || busy) return;
    setBusy(true);
    await finish(daily.day, { ...state, status: "failed", usedClues: state.clues.length });
    setBusy(false);
  }, [daily, state, busy, finish]);

  const share = useCallback(async () => {
    if (!daily || !state) return;
    const text = shareBlock(daily.dayNumber, state);
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* user closed the sheet */
    }
  }, [daily, state]);

  return (
    <div
      className="min-h-screen bg-ink text-cream flex flex-col"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    >
      <header className="px-6 pt-6 flex items-center justify-between max-w-xl w-full mx-auto">
        <Link href="/teens" className="font-body text-sm text-cream/50 hover:text-cream">
          &larr; Games
        </Link>
        <p className="font-heading text-xs tracking-[0.25em] uppercase text-cream/50">
          {daily ? `#${daily.dayNumber}` : ""}
          {streak > 0 && <span className="ml-3">Streak {streak}</span>}
        </p>
      </header>

      <div className="flex-1 w-full max-w-xl mx-auto px-6 py-8 flex flex-col">
        <h1 className="font-display text-4xl sm:text-5xl leading-[0.95] text-center">
          Never heard <span className="text-orange">of it</span>
        </h1>

        {offToday ? (
          <p className="font-body text-cream/70 text-center mt-10 leading-relaxed">
            No mystery job today — come back tomorrow. Meanwhile,{" "}
            <Link href="/teens/higher-wage" className="text-orange underline underline-offset-4">
              Higher Wage
            </Link>{" "}
            never sleeps.
          </p>
        ) : error ? (
          <p className="font-body text-cream/70 text-center mt-10">
            Something dropped — refresh to try again.
          </p>
        ) : !daily || !state ? (
          <p className="font-heading text-xs tracking-[0.3em] uppercase text-cream/40 text-center mt-10">
            Loading today&rsquo;s job&hellip;
          </p>
        ) : state.status === "playing" ? (
          <>
            <p className="font-body text-sm text-cream/50 text-center mt-2">
              One real job. Name it in eight clues.
            </p>
            <ol className="mt-7 space-y-2.5">
              {state.clues.map((clue, i) => (
                <li key={i} className="rounded-card border border-cream/20 bg-cream/[0.04] px-4 py-3">
                  <span className="font-heading text-[10px] tracking-[0.25em] uppercase text-orange">
                    Clue {i + 1} of {TOTAL_CLUES}
                  </span>
                  <p className="font-body text-[15px] text-cream/85 mt-1 leading-relaxed">{clue}</p>
                </li>
              ))}
            </ol>

            <form
              className="mt-6 flex items-center gap-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                submitGuess();
              }}
            >
              <input
                type="text"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder="What's the job?"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="go"
                className="flex-1 bg-transparent border border-cream/25 focus:border-orange outline-none rounded-2xl px-4 py-3.5 font-body text-cream placeholder:text-cream/25"
              />
              <button
                type="submit"
                disabled={busy || !canonicalAnswer(guess)}
                className="bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold px-7 py-3.5 rounded-full disabled:opacity-40"
              >
                Guess
              </button>
            </form>
            {miss && (
              <p className="font-body text-sm text-orange mt-3 text-center">
                Not it — here&rsquo;s another clue.
              </p>
            )}
            <button
              onClick={giveUp}
              disabled={busy}
              className="font-body text-xs text-cream/35 hover:text-cream underline underline-offset-4 mt-6 mx-auto"
            >
              Show me the answer
            </button>
          </>
        ) : (
          reveal && (
            <div className="text-center mt-6">
              <p className="font-heading text-[11px] tracking-[0.3em] uppercase text-cream/50">
                {state.status === "solved"
                  ? `Got it in ${state.usedClues} ${state.usedClues === 1 ? "clue" : "clues"}`
                  : "Today's job was"}
              </p>
              <h2 className="font-display text-5xl sm:text-6xl leading-[0.95] text-orange mt-3">
                {reveal.title}
              </h2>
              {reveal.vignette && (
                <p className="font-body text-cream/75 mt-5 leading-relaxed text-left sm:text-center">
                  {reveal.vignette}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 mt-6">
                {reveal.pay_median && (
                  <p className="font-display text-3xl">{fmtPay(reveal.pay_median)}</p>
                )}
                {reveal.pay_p90 && (
                  <p className="font-body text-cream/60 text-sm">
                    top earners {fmtPay(reveal.pay_p90)}
                  </p>
                )}
                {reveal.education && (
                  <p className="font-body text-cream/60 text-sm">{reveal.education}</p>
                )}
              </div>
              <p className="font-body text-[11px] text-cream/40 mt-2">
                median pay &middot; {reveal.pay_as_of}
              </p>

              <div className="font-body text-2xl tracking-[0.1em] mt-8" aria-hidden>
                {state.status === "solved"
                  ? "🟧".repeat(state.usedClues - 1) + "🟩" + "⬛".repeat(TOTAL_CLUES - state.usedClues)
                  : "🟧".repeat(TOTAL_CLUES)}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 mt-7">
                <button
                  onClick={share}
                  className="bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold px-10 py-3.5 rounded-full"
                >
                  {copied ? "Copied!" : "Share it"}
                </button>
                <Link
                  href="/teens"
                  className="border border-cream/30 hover:border-cream text-cream font-heading font-semibold px-10 py-3.5 rounded-full transition-colors"
                >
                  More games
                </Link>
              </div>
              <p className="font-body text-sm text-cream/40 mt-6">New job at midnight Pacific.</p>
            </div>
          )
        )}
      </div>

      <footer className="px-6 py-5 text-center">
        <p className="font-body text-[11px] text-cream/30">
          Career data: U.S. Department of Labor O*NET&reg; and Bureau of Labor Statistics.
        </p>
      </footer>
    </div>
  );
}
