import type { Metadata } from "next";
import ProgramPartnerSignupForm from "./SignupForm";
import PageVisitedEvent from "@/components/PageVisitedEvent";

export const metadata: Metadata = {
  title: "Program Partners — Ambition Angels",
  description:
    "Bring career exposure to the teens in your program. 15 minutes, twice a week. Self-serve from day one.",
  robots: "noindex, nofollow",
};

const dotTexture = {
  backgroundImage:
    "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

const dashboardFeatures = [
  {
    title: "Student Progress",
    body: "See where each teen is in their internship. Who's ahead, who's stalled, who just finished their first career track.",
  },
  {
    title: "Completion Rates",
    body: "Track how many students are completing internships across your whole program. Real numbers you can report.",
  },
  {
    title: "What They're Working On",
    body: "See exactly which internship each student is in right now — marketing, wealth management, game design, nursing, and more.",
  },
  {
    title: "Career Conversation Prompts",
    body: "After each module, you get prompts tied specifically to what that student just learned. Show up to your next 1-on-1 with something real to work from.",
  },
];

const whoCards = [
  { emoji: "🏫", title: "After-School Programs", body: "Add career exposure to your existing curriculum. No new staff. No new budget." },
  { emoji: "🏀", title: "Coaches & Athletic Programs", body: "Give your athletes something to work toward beyond the game. 15 minutes on the bus counts." },
  { emoji: "🙏", title: "Faith Communities", body: "Connect purpose and calling to real career exploration. Works in youth group, Sunday school, or weekly mentorship." },
  { emoji: "⚖️", title: "Juvenile Justice Programs", body: "Career vision is one of the strongest predictors of re-engagement. We've built for this." },
  { emoji: "🏠", title: "Foster Care & Group Homes", body: "Teens in care are often the furthest from career exposure. We meet them where they are." },
  { emoji: "🤝", title: "Mentorship Programs", body: "Give every mentor something concrete to work through with their mentee. The prompts do the heavy lifting." },
];

const steps = [
  {
    num: "01",
    title: "Create your account",
    body: "Sign up as a Program Partner. Takes 3 minutes. You get immediate access to the Guide dashboard.",
  },
  {
    num: "02",
    title: "Get your program code",
    body: "Every program gets a unique code. Share it with your students — that's how they connect to your dashboard.",
  },
  {
    num: "03",
    title: "Create the time",
    body: "Block 15 minutes, twice a week. That's the only thing your program has to do. The rest is self-serve.",
  },
  {
    num: "04",
    title: "Students start learning and earning",
    body: "They pick a career, start their internship, and earn real rewards for finishing. You watch it happen in real time from your dashboard.",
  },
];

function CheckIcon({ dark = false }: { dark?: boolean }) {
  return (
    <svg
      className={`w-3 h-3 flex-shrink-0 mt-0.5 ${dark ? "text-orange" : "text-orange"}`}
      fill="none"
      viewBox="0 0 12 12"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
    </svg>
  );
}

export default function ProgramPartnersPage() {
  return (
    <>
      <PageVisitedEvent name="program_partners_page_visited" />
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="bg-ink section-pad relative overflow-hidden" style={dotTexture}>
        <div className="container-site relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">

            {/* Left */}
            <div className="pt-4 lg:pt-8">
              <div className="inline-block text-xs font-bold text-orange bg-orange/10 border border-orange/30 px-4 py-1.5 rounded-full uppercase tracking-widest mb-6">
                For Program Partners
              </div>
              <h1 className="font-display font-black text-5xl lg:text-6xl xl:text-7xl text-cream mb-6 leading-none tracking-tight uppercase">
                Career exposure. Built into what you&apos;re already doing.
              </h1>
              <p className="text-gray-mid text-lg leading-relaxed mb-10 max-w-lg">
                You&apos;re already in front of teens who need direction. Ambition Angels gives you something real to work with — 30-day career internships, right inside your program. 15 minutes. Twice a week. That&apos;s it.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <a
                  href="#signup"
                  className="bg-orange hover:bg-orange-dark text-white font-semibold px-8 py-4 rounded-full transition-colors text-base min-h-[52px] inline-flex items-center justify-center"
                >
                  Start Now
                </a>
                <a
                  href="mailto:hello@ambitionangels.org"
                  className="bg-cream/5 hover:bg-cream/10 text-cream border border-cream/20 font-semibold px-8 py-4 rounded-full transition-colors text-base min-h-[52px] inline-flex items-center justify-center"
                >
                  Talk to Remi First
                </a>
              </div>
              <p className="text-gray-mid/60 text-sm">Free for every teen. Self-serve from day one.</p>
            </div>

            {/* Right — Hidden Genius quote */}
            <div className="flex flex-col justify-center">
              <div className="bg-cream/5 border border-orange/25 rounded-card-lg p-8 relative">
                <div className="font-display font-black text-5xl text-orange leading-none mb-5">&ldquo;</div>
                <p className="text-cream text-base lg:text-lg leading-relaxed italic mb-6">
                  Our partnership with Ambition Angels has been an incredible value add to our programming. Our geniuses have truly enjoyed using the app. It&apos;s intuitive, user-friendly, and offers an engaging way for them to explore careers across various industries.
                </p>
                <div className="flex items-center gap-4 pt-5 border-t border-cream/10">
                  <div className="w-10 h-10 rounded-full bg-orange/20 border border-orange/30 flex items-center justify-center flex-shrink-0">
                    <span className="font-heading font-bold text-orange text-sm">JO</span>
                  </div>
                  <div>
                    <div className="font-heading font-semibold text-cream text-sm">Janae Osborne</div>
                    <div className="text-gray-mid text-xs">Richmond Site Director · Hidden Genius Project</div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── TWO WAYS IN ──────────────────────────────────────────────── */}
      <section className="section-pad bg-[#F5F4F0]">
        <div className="container-site">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">How It Works</p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight mb-4">
              Two ways to bring Ambition to your teens.
            </h2>
            <p className="text-gray-warm text-lg leading-relaxed">
              Start with either — one goes deeper than the other.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Channel Partner — lighter */}
            <div className="bg-white border border-gray-light rounded-card-lg p-8">
              <div className="inline-block text-xs font-bold text-gray-warm bg-gray-light border border-gray-mid/30 px-3 py-1 rounded-full uppercase tracking-widest mb-5">
                Channel Partner
              </div>
              <h3 className="font-heading font-bold text-2xl text-ink mb-4">Let us introduce it.</h3>
              <p className="text-gray-warm text-sm leading-relaxed mb-6">
                We come to you — via Zoom or in person — and pitch the app directly to your students. They get on, they start learning. You don&apos;t have to do anything except open the door.
              </p>
              <ul className="space-y-3">
                {[
                  "We present to your group (Zoom or in-person)",
                  "Students download and get started same day",
                  "No staff training required",
                  "Free for every teen",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-gray-warm text-sm leading-relaxed">
                    <span className="w-4 h-4 rounded-full bg-orange-light border border-orange/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckIcon />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Program Partner — featured dark */}
            <div className="bg-ink rounded-card-lg p-8 relative overflow-hidden" style={dotTexture}>
              <div className="relative z-10">
                <div className="inline-block text-xs font-bold text-orange bg-orange/15 border border-orange/30 px-3 py-1 rounded-full uppercase tracking-widest mb-5">
                  Program Partner — Recommended
                </div>
                <h3 className="font-heading font-bold text-2xl text-cream mb-4">Make it part of the program.</h3>
                <p className="text-gray-mid text-sm leading-relaxed mb-6">
                  Set aside 15 minutes, twice a week. Students complete their internship modules inside your program time. You get access to the Guide dashboard — see exactly what each student is working on and get career conversation prompts tied to their progress.
                </p>
                <ul className="space-y-3">
                  {[
                    "15 minutes, twice a week — that's the model",
                    "Students work inside your existing program time",
                    "You get the Guide dashboard: progress, completion, conversation prompts",
                    "Prompts are tied to what each student is doing in the app right now",
                    "Works for any size — classroom, small group, 1-on-1",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-gray-mid text-sm leading-relaxed">
                      <span className="w-4 h-4 rounded-full bg-orange/20 border border-orange/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <CheckIcon />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── GUIDE DASHBOARD ──────────────────────────────────────────── */}
      <section className="section-pad bg-ink relative overflow-hidden" style={dotTexture}>
        <div className="container-site relative z-10">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">The Guide Dashboard</p>
            <h2 className="font-display font-black text-5xl lg:text-6xl text-cream uppercase tracking-tight leading-none mb-5">
              You don&apos;t just hand them an app. You stay in the room.
            </h2>
            <p className="text-gray-mid text-lg leading-relaxed">
              Program Partners get their own login. Same app — completely different experience. You see what your teens are working on and get the tools to turn it into a real conversation.
            </p>
          </div>

          {/* 2×2 feature grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
            {dashboardFeatures.map((f) => (
              <div
                key={f.title}
                className="bg-cream/5 border border-cream/10 border-t-[3px] border-t-orange rounded-card-lg p-7"
              >
                <h3 className="font-heading font-bold text-cream text-lg mb-3">{f.title}</h3>
                <p className="text-gray-mid text-sm leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>

          {/* Callout */}
          <div className="border border-orange/30 bg-orange/5 rounded-card-lg p-7">
            <p className="text-cream text-base lg:text-lg leading-relaxed italic">
              &ldquo;The teens who shift their career thinking are almost always connected to an adult who knew what they were doing. The Guide dashboard makes that possible for any program — even if no one ever did it for the adults running it.&rdquo;
            </p>
          </div>
        </div>
      </section>

      {/* ── WHO THIS IS FOR ──────────────────────────────────────────── */}
      <section className="section-pad bg-[#F5F4F0]">
        <div className="container-site">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">Who This Is For</p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight mb-4">
              If you work with teens, this works for you.
            </h2>
            <p className="text-gray-warm text-lg leading-relaxed">
              We&apos;ve seen it work across every type of program. The common thread: an adult who cares and a group of teens who need direction.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {whoCards.map((card) => (
              <div key={card.title} className="bg-white border border-gray-light rounded-card-lg p-7 shadow-sm">
                <div className="text-3xl mb-4">{card.emoji}</div>
                <h3 className="font-heading font-bold text-ink text-base mb-2">{card.title}</h3>
                <p className="text-gray-warm text-sm leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── THE OBJECTION ────────────────────────────────────────────── */}
      <section className="section-pad bg-ink relative overflow-hidden" style={dotTexture}>
        <div className="container-site relative z-10">
          <div className="max-w-3xl mb-10">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">We Know What You&apos;re Thinking</p>
            <h2 className="font-display font-black text-5xl lg:text-6xl text-cream uppercase tracking-tight leading-none mb-8">
              You&apos;re already running a program. You don&apos;t need another thing.
            </h2>
            <div className="space-y-5 text-gray-mid text-lg leading-relaxed">
              <p>
                We hear this every time. And it&apos;s fair. Your frontline staff is stretched. Your program already has a curriculum. The last thing you need is another app to onboard, another thing to explain, another reason for a student to check out.
              </p>
              <p>
                Here&apos;s what actually happens: you create 15 minutes in your schedule twice a week. Students open the app, pick a career, and go. Your staff doesn&apos;t run it. The app does. No training needed, no new lesson plan to build. You just create the time.
              </p>
            </div>
          </div>

          {/* Three stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { label: "Same day", sub: "Students can start the day you sign up" },
              { label: "Self-serve", sub: "No staff training required" },
              { label: "Free", sub: "For every teen, always" },
            ].map((s) => (
              <div key={s.label} className="bg-cream/5 border border-cream/10 rounded-card px-6 py-5 text-center">
                <div className="font-display font-black text-3xl text-orange tracking-tight leading-none mb-2">{s.label}</div>
                <div className="text-gray-mid text-sm leading-snug">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW TO START ─────────────────────────────────────────────── */}
      <section className="section-pad bg-[#F5F4F0]">
        <div className="container-site">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">How It Works</p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight mb-4">
              Four steps to get started — same-day access.
            </h2>
            <p className="text-gray-warm text-lg leading-relaxed">
              We built this to be self-serve from day one. You shouldn&apos;t need to wait for a kickoff call to get your students learning.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {steps.map((step) => (
              <div key={step.num} className="bg-white border border-gray-light rounded-card-lg p-7 shadow-sm flex flex-col">
                <div className="font-display font-black text-4xl text-orange leading-none mb-5">{step.num}</div>
                <h3 className="font-heading font-bold text-ink text-base mb-3">{step.title}</h3>
                <p className="text-gray-warm text-sm leading-relaxed flex-1">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SIGNUP FORM ──────────────────────────────────────────────── */}
      <section
        id="signup"
        className="section-pad bg-ink relative overflow-hidden"
        style={dotTexture}
      >
        <div className="container-site relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">

            {/* Left — copy */}
            <div className="lg:sticky lg:top-32">
              <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">Start Now</p>
              <h2 className="font-display font-black text-5xl lg:text-6xl text-cream uppercase tracking-tight leading-none mb-5">
                Ready to bring Ambition to your program?
              </h2>
              <p className="text-gray-mid text-lg leading-relaxed mb-8">
                Fill this out and you&apos;ll have access same day. No call required. If you want to talk first, just email{" "}
                <a href="mailto:hello@ambitionangels.org" className="text-orange underline underline-offset-2 hover:text-orange-dark transition-colors">
                  hello@ambitionangels.org
                </a>.
              </p>
              {/* Mini checklist */}
              <ul className="space-y-3">
                {[
                  "Free for every teen in your program",
                  "Program code delivered within 24 hours — usually same day",
                  "Guide dashboard login included",
                  "No contract required. Cancel anytime.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-gray-mid text-sm">
                    <span className="w-4 h-4 rounded-full bg-orange/20 border border-orange/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckIcon />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right — form */}
            <div>
              <ProgramPartnerSignupForm />
            </div>

          </div>
        </div>
      </section>
    </>
  );
}
