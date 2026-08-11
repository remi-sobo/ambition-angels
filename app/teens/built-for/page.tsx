import type { Metadata } from "next";
import Link from "next/link";
import JoinRoom from "./JoinRoom";

// Built For landing (specs/ms-career-game.md): one screen, one button, no
// marketing. Lives under the /teens games hub; indexable now that the hub is
// a share-driven public surface (specs/c1d2c9e2-teengamesv1 locked decision
// 6). Session, room, and facilitator screens below stay noindex.
export const metadata: Metadata = {
  title: "What Are You Built For — Ambition Angels",
  description: "An 8-minute career game for middle schoolers. Real careers with real pay, matched to how you work.",
};

export default function MsLandingPage() {
  return (
    <div
      className="min-h-screen bg-ink text-cream flex flex-col"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    >
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <p className="font-heading text-[11px] tracking-[0.3em] uppercase text-cream/50 mb-6">
          A game, not a test
        </p>
        <h1 className="font-display text-6xl sm:text-7xl lg:text-8xl leading-[0.95] max-w-3xl">
          Find out what you&rsquo;re <span className="text-orange">built for</span>
        </h1>
        <p className="font-body text-lg sm:text-xl text-cream/70 mt-8 max-w-md leading-relaxed">
          30 quick taps. 8 minutes. Real jobs with real pay, matched to how you
          actually work.
        </p>
        <Link
          href="/teens/built-for/assess"
          className="mt-10 inline-block bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold text-lg px-12 py-4 rounded-full"
        >
          Start
        </Link>
        <p className="font-body text-sm text-cream/40 mt-5">
          Free. 8 minutes. Your deck saves with a code.
        </p>
        <JoinRoom />
        <Link
          href="/teens/built-for/deck"
          className="font-body text-sm text-cream/50 hover:text-cream underline underline-offset-4 mt-6"
        >
          Played before? Open your deck
        </Link>
      </div>
      <footer className="px-6 py-5 text-center">
        <p className="font-body text-[11px] text-cream/30">
          Career data: U.S. Department of Labor O*NET&reg; and Bureau of Labor Statistics.
        </p>
      </footer>
    </div>
  );
}
