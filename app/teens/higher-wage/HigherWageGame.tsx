"use client";

// Higher Wage, the whole game (specs/teen-games-v1.md Phase 3). The pair
// arrives without pay — titles, reveal lines, and a signed token — and the
// tap posts the token back to learn both figures and the verdict. Streak
// and best live in localStorage (locked decision 4: no accounts, no new
// persistence). The first pair is prefetched on mount so the Play tap is
// into a live round, and the next pair prefetches while the result is on
// screen, so the pace never waits on the network.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Card = { soc: string; title: string; reveal: string };
type Pair = { token: string; a: Card; b: Card };
type Verdict = {
  correct: boolean;
  a: { soc: string; pay_median: number; pay_as_of: string; education: string | null };
  b: { soc: string; pay_median: number; pay_as_of: string; education: string | null };
};

type Phase =
  | { name: "idle" }
  | { name: "stocking" }
  | { name: "error" }
  | { name: "round"; pair: Pair }
  | { name: "resolving"; pair: Pair; choice: "a" | "b" }
  | { name: "result"; pair: Pair; choice: "a" | "b"; verdict: Verdict }
  | { name: "over"; finalStreak: number };

const BEST_KEY = "hw:best";
const SHARE_URL = "https://www.ambitionangels.org/teens/higher-wage";

const fmtPay = (n: number) => `$${n.toLocaleString("en-US")}`;

async function fetchPair(streak: number, exclude: string[]): Promise<Pair | "stocking" | null> {
  try {
    const res = await fetch("/api/games/higher-wage/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streak, exclude }),
    });
    if (res.status === 503) return "stocking";
    if (!res.ok) return null;
    return (await res.json()) as Pair;
  } catch {
    return null;
  }
}

export default function HigherWageGame() {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [started, setStarted] = useState(false);
  // Jobs already shown this run; sent as the exclude list so 20 rounds
  // show 40 distinct occupations (Phase 3 definition of done).
  const seen = useRef<string[]>([]);
  const nextPair = useRef<Promise<Pair | "stocking" | null> | null>(null);

  useEffect(() => {
    setBest(Number(localStorage.getItem(BEST_KEY)) || 0);
    nextPair.current = fetchPair(0, []);
  }, []);

  const bumpBest = useCallback(
    (n: number) => {
      if (n > best) {
        setBest(n);
        localStorage.setItem(BEST_KEY, String(n));
      }
    },
    [best]
  );

  const dealRound = useCallback(async (streakNow: number) => {
    const pending = nextPair.current ?? fetchPair(streakNow, seen.current);
    nextPair.current = null;
    const pair = await pending;
    if (pair === "stocking") return setPhase({ name: "stocking" });
    if (!pair) return setPhase({ name: "error" });
    seen.current.push(pair.a.soc, pair.b.soc);
    setPhase({ name: "round", pair });
  }, []);

  const start = useCallback(() => {
    setStarted(true);
    setStreak(0);
    seen.current = [];
    dealRound(0);
  }, [dealRound]);

  const tap = useCallback(
    async (pair: Pair, choice: "a" | "b") => {
      setPhase({ name: "resolving", pair, choice });
      try {
        const res = await fetch("/api/games/higher-wage/guess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: pair.token, choice }),
        });
        if (res.status === 410) {
          // Token aged out (phone slept mid-round). Deal fresh, keep streak.
          nextPair.current = null;
          return dealRound(streak);
        }
        if (!res.ok) return setPhase({ name: "error" });
        const verdict = (await res.json()) as Verdict;
        if (verdict.correct) {
          const newStreak = streak + 1;
          setStreak(newStreak);
          bumpBest(newStreak);
          nextPair.current = fetchPair(newStreak, seen.current);
        }
        setPhase({ name: "result", pair, choice, verdict });
      } catch {
        setPhase({ name: "error" });
      }
    },
    [streak, bumpBest, dealRound]
  );

  const advance = useCallback(
    (verdict: Verdict) => {
      if (verdict.correct) return dealRound(streak);
      const finalStreak = streak;
      setStreak(0);
      seen.current = [];
      nextPair.current = fetchPair(0, []);
      setPhase({ name: "over", finalStreak });
    },
    [streak, dealRound]
  );

  const share = useCallback(async (finalStreak: number) => {
    const text =
      finalStreak > 0
        ? `I ran a ${finalStreak}-job streak on Higher Wage. Which job pays more?`
        : `Which job pays more? I keep getting these wrong.`;
    try {
      if (navigator.share) {
        await navigator.share({ text, url: SHARE_URL });
      } else {
        await navigator.clipboard.writeText(`${text} ${SHARE_URL}`);
        alert("Copied. Paste it to a friend.");
      }
    } catch {
      /* user closed the sheet */
    }
  }, []);

  return (
    <div
      className="min-h-screen bg-ink text-cream flex flex-col"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    >
      <header className="px-6 pt-6 flex items-center justify-between max-w-2xl w-full mx-auto">
        <Link href="/teens" className="font-body text-sm text-cream/50 hover:text-cream">
          &larr; Games
        </Link>
        <p className="font-heading text-xs tracking-[0.25em] uppercase text-cream/50">
          Streak <span className="text-orange font-bold">{streak}</span>
          {best > 0 && <span className="ml-3">Best {best}</span>}
        </p>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 w-full max-w-2xl mx-auto">
        {(phase.name === "idle" || !started) && phase.name !== "stocking" && phase.name !== "error" ? (
          <div className="text-center">
            <p className="font-heading text-[11px] tracking-[0.3em] uppercase text-cream/50 mb-5">
              Ages 14&ndash;18 &middot; real government pay data
            </p>
            <h1 className="font-display text-6xl sm:text-7xl leading-[0.95]">
              Higher <span className="text-orange">Wage</span>
            </h1>
            <p className="font-body text-lg text-cream/70 mt-6 max-w-sm mx-auto leading-relaxed">
              Two real jobs. Tap the one that pays more. How long can you keep
              the streak alive?
            </p>
            <button
              onClick={start}
              className="mt-9 bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold text-lg px-14 py-4 rounded-full"
            >
              Play
            </button>
            <p className="font-body text-sm text-cream/40 mt-4">Free. Real government pay data.</p>
          </div>
        ) : phase.name === "stocking" ? (
          <div className="text-center max-w-sm">
            <h1 className="font-display text-5xl leading-[0.95]">Almost ready</h1>
            <p className="font-body text-cream/70 mt-5 leading-relaxed">
              We&rsquo;re still stocking this game with careers. Check back soon,
              or play{" "}
              <Link href="/teens/built-for" className="text-orange underline underline-offset-4">
                What Are You Built For
              </Link>{" "}
              while you wait.
            </p>
          </div>
        ) : phase.name === "error" ? (
          <div className="text-center max-w-sm">
            <h1 className="font-display text-5xl leading-[0.95]">Hiccup</h1>
            <p className="font-body text-cream/70 mt-5">Something dropped. One tap brings it back.</p>
            <button
              onClick={() => dealRound(streak)}
              className="mt-7 bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold px-10 py-3.5 rounded-full"
            >
              Deal again
            </button>
          </div>
        ) : phase.name === "over" ? (
          <div className="text-center">
            <p className="font-heading text-[11px] tracking-[0.3em] uppercase text-cream/50 mb-4">
              Run over
            </p>
            <h1 className="font-display text-7xl sm:text-8xl leading-[0.95] text-orange">
              {phase.finalStreak}
            </h1>
            <p className="font-body text-lg text-cream/70 mt-3">
              {phase.finalStreak === 1 ? "round" : "rounds"} in a row
              {phase.finalStreak >= best && phase.finalStreak > 0 && ", your best yet"}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-9">
              <button
                onClick={start}
                className="bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold px-10 py-3.5 rounded-full"
              >
                Run it back
              </button>
              <button
                onClick={() => share(phase.finalStreak)}
                className="border border-cream/30 hover:border-cream text-cream font-heading font-semibold px-10 py-3.5 rounded-full transition-colors"
              >
                Challenge a friend
              </button>
            </div>
          </div>
        ) : (
          // round / resolving / result share one layout so cards don't jump
          <RoundBoard phase={phase} onTap={tap} onAdvance={advance} />
        )}
      </div>

      <footer className="px-6 py-5 text-center">
        <p className="font-body text-[11px] text-cream/30">
          Pay: U.S. Bureau of Labor Statistics, annual median.
        </p>
      </footer>
    </div>
  );
}

function RoundBoard({
  phase,
  onTap,
  onAdvance,
}: {
  phase: Extract<Phase, { name: "round" | "resolving" | "result" }>;
  onTap: (pair: Pair, choice: "a" | "b") => void;
  onAdvance: (verdict: Verdict) => void;
}) {
  const { pair } = phase;
  const verdict = phase.name === "result" ? phase.verdict : null;
  const choice = phase.name === "result" || phase.name === "resolving" ? phase.choice : null;

  return (
    <div className="w-full">
      <p className="font-heading text-[11px] tracking-[0.3em] uppercase text-cream/50 text-center mb-6">
        {verdict ? (verdict.correct ? "Called it" : "Not this time") : "Which pays more?"}
      </p>

      <div className="grid sm:grid-cols-[1fr_auto_1fr] items-stretch gap-3 sm:gap-4">
        {(["a", "b"] as const).map((side, i) => {
          const card = pair[side];
          const pay = verdict?.[side];
          const higher =
            verdict != null &&
            verdict[side].pay_median >= verdict[side === "a" ? "b" : "a"].pay_median;
          const picked = choice === side;
          return (
            <div key={card.soc} className={i === 1 ? "sm:order-3" : ""}>
              <button
                onClick={() => !verdict && phase.name === "round" && onTap(pair, side)}
                disabled={phase.name !== "round"}
                className={`w-full h-full text-left rounded-card-lg border p-6 sm:p-7 transition-colors ${
                  verdict
                    ? higher
                      ? "border-orange bg-orange/10"
                      : "border-cream/15 bg-cream/[0.03] opacity-70"
                    : "border-cream/25 bg-cream/[0.04] hover:border-orange hover:bg-orange/10 active:bg-orange/20"
                } ${picked && !verdict ? "border-orange" : ""}`}
              >
                <h2 className="font-display text-3xl sm:text-4xl leading-[0.95]">{card.title}</h2>
                <p className="font-body text-sm text-cream/60 mt-3 leading-relaxed">{card.reveal}</p>
                <div className="mt-5 min-h-[2.5rem]">
                  {pay ? (
                    <>
                      <p className={`font-display text-3xl ${higher ? "text-orange" : "text-cream/70"}`}>
                        {fmtPay(pay.pay_median)}
                      </p>
                      <p className="font-body text-[11px] text-cream/40 mt-1">
                        median &middot; {pay.pay_as_of}
                        {pay.education ? ` · ${pay.education.toLowerCase()}` : ""}
                      </p>
                    </>
                  ) : (
                    <p className="font-display text-3xl text-cream/25">$ ?</p>
                  )}
                </div>
              </button>
            </div>
          );
        })}
        <div className="hidden sm:flex sm:order-2 items-center">
          <span className="font-heading text-xs tracking-[0.2em] uppercase text-cream/40">vs</span>
        </div>
      </div>

      <div className="text-center mt-7 min-h-[3.25rem]">
        {verdict && (
          <button
            onClick={() => onAdvance(verdict)}
            className="bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold px-12 py-3.5 rounded-full"
          >
            {verdict.correct ? "Next round" : "See my streak"}
          </button>
        )}
      </div>
    </div>
  );
}
