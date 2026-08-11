import type { Metadata } from "next";
import Link from "next/link";
import JoinRoom from "./built-for/JoinRoom";

// /teens games hub (specs/c1d2c9e2-teengamesv1): the shelf the games sit on.
// Built For is the hero — full width, labeled honestly with its grade band
// (locked decision 2) — with the three teen games below as coming-soon cards
// until each one ships. Indexable (locked decision 6): share-driven growth
// needs search and OG previews, unlike the unlisted /ms pilot this replaces.
// JoinRoom lives here as well as on the game landing, because the projected
// room screen tells students to type ambitionangels.org/teens — a kid off
// the wall must be able to enter the code without hunting through a hub.
export const metadata: Metadata = {
  title: "Games — Ambition Angels",
  description:
    "Free career games for teens. Real jobs, real pay, no sign-up, no email.",
};

const TEEN_GAMES: { name: string; tag: string; blurb: string; href?: string }[] = [
  {
    name: "Higher Wage",
    tag: "Ages 14-18",
    blurb: "Two jobs. Tap the one that pays more. How long can you keep the streak alive?",
    href: "/teens/higher-wage",
  },
  {
    name: "Never Heard of It",
    tag: "Ages 14-18",
    blurb: "One mystery career a day, eight clues to name it. Same job for everyone, everywhere.",
  },
  {
    name: "The Cut",
    tag: "Ages 14-18",
    blurb: "Six careers on the board, one rule at a time. Your whole class votes on who gets cut.",
  },
];

export default function TeensHubPage() {
  return (
    <div
      className="min-h-screen bg-ink text-cream flex flex-col"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    >
      <div className="flex-1 w-full max-w-3xl mx-auto px-6 py-14 sm:py-20">
        <p className="font-heading text-[11px] tracking-[0.3em] uppercase text-cream/50 text-center">
          Games, not tests
        </p>
        <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl leading-[0.95] text-center mt-4">
          Real jobs. Real pay. <span className="text-orange">Play one.</span>
        </h1>
        <p className="font-body text-base sm:text-lg text-cream/60 text-center mt-5 max-w-md mx-auto">
          No sign-up, no email, nothing to lose.
        </p>

        {/* Hero: the game that exists */}
        <div className="mt-12 rounded-card-lg border border-orange/40 bg-cream/[0.04] p-8 sm:p-10 text-center">
          <p className="font-heading text-[11px] tracking-[0.25em] uppercase text-cream/50">
            Grades 6&ndash;8
          </p>
          <h2 className="font-display text-4xl sm:text-5xl leading-[0.95] mt-3">
            What are you <span className="text-orange">built for</span>?
          </h2>
          <p className="font-body text-cream/70 mt-4 max-w-md mx-auto leading-relaxed">
            30 quick taps. 8 minutes. Real careers with real pay, matched to
            how you actually work.
          </p>
          <Link
            href="/teens/built-for"
            className="mt-7 inline-block bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold text-lg px-12 py-4 rounded-full"
          >
            Play
          </Link>
          <div className="flex flex-col items-center">
            <JoinRoom />
            <Link
              href="/teens/built-for/deck"
              className="font-body text-sm text-cream/50 hover:text-cream underline underline-offset-4 mt-3"
            >
              Played before? Open your deck
            </Link>
          </div>
        </div>

        {/* The three teen games — live ones link, the rest are honest about
            not existing yet */}
        <div className="mt-8 grid sm:grid-cols-3 gap-4">
          {TEEN_GAMES.map((game) => {
            const inner = (
              <>
                <p className="font-heading text-[10px] tracking-[0.25em] uppercase text-cream/40">
                  {game.tag}
                </p>
                <h3 className="font-display text-2xl mt-2">{game.name}</h3>
                <p className="font-body text-sm text-cream/60 mt-2 leading-relaxed flex-1">
                  {game.blurb}
                </p>
                <p
                  className={`font-heading text-[10px] tracking-[0.25em] uppercase mt-4 ${
                    game.href ? "text-orange" : "text-orange/80"
                  }`}
                >
                  {game.href ? "Play now →" : "Coming soon"}
                </p>
              </>
            );
            return game.href ? (
              <Link
                key={game.name}
                href={game.href}
                className="rounded-card border border-orange/40 bg-cream/[0.04] p-6 flex flex-col hover:border-orange transition-colors"
              >
                {inner}
              </Link>
            ) : (
              <div
                key={game.name}
                className="rounded-card border border-cream/15 bg-cream/[0.03] p-6 flex flex-col"
              >
                {inner}
              </div>
            );
          })}
        </div>
      </div>
      <footer className="px-6 py-5 text-center">
        <p className="font-body text-[11px] text-cream/30">
          Career data: U.S. Department of Labor O*NET&reg; and Bureau of Labor Statistics.
        </p>
      </footer>
    </div>
  );
}
