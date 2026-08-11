import type { Metadata } from "next";
import Link from "next/link";
import AppStoreButtons from "@/components/AppStoreButtons";
import JoinRoom from "./built-for/JoinRoom";

// /teens — the teen front door, inside the main site chrome (Nav + Footer
// via SiteChrome; the game screens underneath keep their own immersive
// layouts). Two shelves: Find Your Fit (the two matchers, by grade band)
// and Play (the games), then the bridge to the app. Indexable — share-driven
// growth needs search and OG previews. JoinRoom stays on this page because
// the projected room screen tells students to type ambitionangels.org/teens —
// a kid off the wall must be able to enter the code without hunting.
export const metadata: Metadata = {
  title: "For Teens · Games & Quizzes",
  description:
    "Free career games and quizzes for teens. Real jobs, real pay, straight from government data. Find your fit, then try a career on for 30 days.",
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
    href: "/teens/never-heard-of-it",
  },
  {
    name: "The Cut",
    tag: "Ages 14-18",
    blurb: "Six careers on the board, one rule at a time. Your whole class votes on who gets cut.",
    href: "/teens/the-cut",
  },
];

export default function TeensHubPage() {
  return (
    <>
      {/* HERO + FIND YOUR FIT */}
      <section
        className="relative pt-32 pb-16 lg:pt-40 lg:pb-20 bg-ink overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site relative z-10">
          <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4 text-center">
            For Teens &middot; Games, not tests
          </p>
          <h1 className="font-display font-black text-5xl sm:text-6xl lg:text-8xl text-cream leading-[0.95] tracking-tight uppercase text-center mb-5">
            Real jobs. Real pay.<br />
            <span className="text-orange">Find yours.</span>
          </h1>
          <p className="font-body text-base sm:text-lg text-gray-mid text-center max-w-md mx-auto mb-14">
            Every job and every paycheck here is real, straight from government data. Play with them.
          </p>

          {/* FIND YOUR FIT — the two matchers, side by side */}
          <p className="text-xs font-semibold text-cream/50 uppercase tracking-[0.25em] text-center mb-6">
            Start here — find your fit
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-4xl mx-auto">
            {/* Built For — grades 6–8 */}
            <div className="rounded-card-lg border border-orange/40 bg-cream/[0.04] p-8 sm:p-10 text-center flex flex-col hover:border-orange transition-colors">
              <p className="font-heading text-[11px] tracking-[0.25em] uppercase text-cream/50">
                Grades 6&ndash;8
              </p>
              <h2 className="font-display font-black text-4xl sm:text-5xl leading-[0.95] text-cream uppercase mt-3">
                What are you <span className="text-orange">built for</span>?
              </h2>
              <p className="font-body text-cream/70 mt-4 max-w-md mx-auto leading-relaxed flex-1">
                30 quick taps. 8 minutes. Real careers with real pay, matched to how you actually work.
              </p>
              <div className="mt-7">
                <Link
                  href="/teens/built-for"
                  className="inline-block bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold text-lg px-12 py-4 rounded-full"
                >
                  Play
                </Link>
              </div>
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

            {/* Career quiz — ages 14–18 */}
            <div className="rounded-card-lg border border-orange/40 bg-cream/[0.04] p-8 sm:p-10 text-center flex flex-col hover:border-orange transition-colors">
              <p className="font-heading text-[11px] tracking-[0.25em] uppercase text-cream/50">
                Ages 14&ndash;18
              </p>
              <h2 className="font-display font-black text-4xl sm:text-5xl leading-[0.95] text-cream uppercase mt-3">
                Your top <span className="text-orange">10 careers</span>
              </h2>
              <p className="font-body text-cream/70 mt-4 max-w-md mx-auto leading-relaxed flex-1">
                15 questions. 3 minutes. 10 careers matched to who you actually are, with real pay for where you live.
              </p>
              <div className="mt-7">
                <Link
                  href="/teens/career-quiz"
                  className="inline-block bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold text-lg px-12 py-4 rounded-full"
                >
                  Start
                </Link>
              </div>
              <p className="font-body text-sm text-cream/50 mt-4">
                Free &middot; built for your age, not your parents&apos;
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PLAY — the games shelf */}
      <section className="section-pad bg-cream">
        <div className="container-site">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
              Play
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight">
              Got two minutes? Learn what jobs actually pay.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TEEN_GAMES.map((game) => {
              const inner = (
                <>
                  <p className="font-heading text-[10px] tracking-[0.25em] uppercase text-gray-warm">
                    {game.tag}
                  </p>
                  <h3 className="font-display font-black text-3xl text-ink uppercase mt-2 tracking-tight">
                    {game.name}
                  </h3>
                  <p className="font-body text-sm text-gray-warm mt-2 leading-relaxed flex-1">
                    {game.blurb}
                  </p>
                  <p
                    className={`font-heading text-[10px] tracking-[0.25em] uppercase mt-5 ${
                      game.href ? "text-orange" : "text-gray-mid"
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
                  className="bg-white border border-gray-light rounded-card-lg p-7 flex flex-col shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-orange/40 transition-all duration-200"
                >
                  {inner}
                </Link>
              ) : (
                <div
                  key={game.name}
                  className="bg-white border border-gray-light rounded-card-lg p-7 flex flex-col shadow-sm"
                >
                  {inner}
                </div>
              );
            })}
          </div>

          <p className="mt-8 text-xs text-gray-mid">
            Career data: U.S. Department of Labor O*NET&reg; and Bureau of Labor Statistics.
          </p>
        </div>
      </section>

      {/* TAKE IT WITH YOU — the app bridge */}
      <section
        className="section-pad bg-ink relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site relative z-10">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
              Found one you like?
            </p>
            <h2 className="font-heading font-bold text-3xl lg:text-4xl text-cream mb-5 tracking-tight">
              Try it on for 30 days.
            </h2>
            <p className="text-gray-mid text-lg leading-relaxed mb-8">
              The Ambition app puts you inside a real career — a 30-day simulated internship, 15 minutes a day. See what the work feels like, what it pays, and whether it&apos;s you. Free, always.
            </p>
            <div className="flex justify-center">
              <AppStoreButtons variant="lockup" source="teens_hub" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
