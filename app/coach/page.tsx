import type { Metadata } from "next";
import CoachSignupForm from "./CoachSignupForm";
import PageVisitedEvent from "@/components/PageVisitedEvent";

export const metadata: Metadata = {
  title: "Become an Ambition Coach",
  description:
    "Meet four times with a student who wants to get into your field. Tell them what the work is really like. They leave with three next steps.",
  openGraph: {
    title: "Become an Ambition Coach",
    description:
      "Meet four times with a student who wants to get into your field. Tell them what the work is really like. They leave with three next steps.",
  },
};

const dotTexture = {
  backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

const sessions = [
  {
    n: "1",
    name: "How you got here",
    body: "Tell them how you got into the field, including what didn't go to plan. They tell you why they want this work. By the end, they should know what the job looks like on a normal day.",
  },
  {
    n: "2",
    name: "How people get in",
    body: "The training or degree that actually matters, the cheapest route that works, and the entry-level jobs most people don't know about. What would you do if you were starting at their age?",
  },
  {
    n: "3",
    name: "What the work takes",
    body: "The skills you use every week and what hiring managers look for. How your field has changed in the last few years, and what new hires need now that you didn't.",
  },
  {
    n: "4",
    name: "Next steps",
    body: "They read you their three next steps, each with a date in the next 90 days. You help make them specific. If you can make one introduction, great. It's not required.",
  },
];

const hours = [
  { label: "Call with Remi", time: "20 min" },
  { label: "Four sessions", time: "45 min each" },
  { label: "Prep before each", time: "about 15 min" },
  { label: "Total", time: "about 5 hours" },
];

const faqs = [
  {
    q: "Do I need to be senior?",
    a: "No. If you're a few years into the job, you may be the best coach, because you still remember how you got in. What matters is that you do the work they want to do.",
  },
  {
    q: "Who are the students?",
    a: "Young adults, 18 to 24, in programs we partner with, like EOYDC in East Oakland. Most are in college or just out. Many are the first in their family to go after the field they picked.",
  },
  {
    q: "Is it in person?",
    a: "Usually on video. If you live near each other and want to meet in person, that's fine too.",
  },
  {
    q: "What if they decide the field isn't for them?",
    a: "That's a good outcome. Better to find out in four conversations than after a year of school. Be honest about the work. You're not recruiting.",
  },
  {
    q: "What do I have to prepare?",
    a: "Very little. Before each session we send you a one-page guide with what to cover and what the student has been working on.",
  },
  {
    q: "What do I sign?",
    a: "A short volunteer agreement. The student schedules every session and writes their own plan.",
  },
  {
    q: "Is signing up a commitment?",
    a: "No. It tells us you're open to it. Remi reaches out for a short call first, and you see a student's profile before anything is set.",
  },
];

export default function CoachPage() {
  return (
    <>
      <PageVisitedEvent name="coach_page_visited" />

      {/* HERO */}
      <section className="bg-ink section-pad relative overflow-hidden" style={dotTexture}>
        <div className="container-site relative z-10">
          <div className="max-w-3xl">
            <div className="inline-block text-xs font-heading font-semibold text-orange bg-orange/10 border border-orange/30 px-4 py-1.5 rounded-full uppercase tracking-widest mb-6">
              Ambition Coach
            </div>
            <h1 className="font-display font-black text-5xl sm:text-6xl lg:text-7xl text-cream mb-6 leading-[0.95] tracking-tight uppercase">
              Help one student understand your field.
            </h1>
            <p className="text-gray-mid text-lg leading-relaxed mb-10 max-w-2xl">
              Meet four times. Tell them what the work is really like. Help them leave with three next steps.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href="#signup"
                className="bg-orange hover:bg-orange-dark text-white font-heading font-semibold px-8 py-4 rounded-full transition-colors text-base min-h-[52px] inline-flex items-center justify-center"
              >
                Sign up to coach
              </a>
              <a
                href="#how"
                className="bg-cream/5 hover:bg-cream/10 text-cream border border-cream/20 font-heading font-semibold px-8 py-4 rounded-full transition-colors text-base min-h-[52px] inline-flex items-center justify-center"
              >
                How it works
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* PROOF */}
      <section className="bg-cream section-pad">
        <div className="container-site grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-12 items-center">
          <div>
            <div className="text-xs font-heading font-semibold text-orange uppercase tracking-widest mb-4">Why it matters</div>
            <h2 className="font-heading font-bold text-3xl lg:text-4xl text-ink leading-tight mb-5">
              Most students have never talked to anyone who does the job they picked.
            </h2>
            <p className="text-charcoal text-lg leading-relaxed">
              So they choose a major or a training program without asking someone who does the work. Four honest
              conversations with you can save them a lot of time and money.
            </p>
          </div>
          <figure className="bg-white border border-gray-light rounded-card-lg p-8 lg:p-10">
            <div className="text-xs font-heading font-semibold text-gray-warm uppercase tracking-widest mb-4">Our first coach</div>
            <blockquote className="font-heading font-semibold text-ink text-xl lg:text-2xl leading-snug mb-5">
              A student who wanted to work in marketing met four times with a director of marketing at NVIDIA. He did the
              work between sessions and went on to land a marketing job at a local company.
            </blockquote>
            <figcaption className="text-charcoal text-sm">
              In the student&apos;s words after session two: &ldquo;I got a lot of clarity on my plan forward.&rdquo;
            </figcaption>
          </figure>
        </div>
      </section>

      {/* HOW */}
      <section id="how" className="bg-white section-pad scroll-mt-20">
        <div className="container-site">
          <div className="max-w-2xl mb-12">
            <div className="text-xs font-heading font-semibold text-orange uppercase tracking-widest mb-4">How it works</div>
            <h2 className="font-heading font-bold text-3xl lg:text-4xl text-ink leading-tight">
              Four sessions, about 45 minutes each. We send you the agenda.
            </h2>
          </div>
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {sessions.map((s) => (
              <li key={s.n} className="bg-cream rounded-card p-6 flex flex-col">
                <div className="font-display font-black text-5xl text-orange leading-none mb-4">{s.n}</div>
                <h3 className="font-heading font-semibold text-ink text-lg mb-2">{s.name}</h3>
                <p className="text-charcoal text-sm leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-12 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-8 items-start">
            <div className="border border-gray-light rounded-card p-6 lg:p-8">
              <div className="text-xs font-heading font-semibold text-gray-warm uppercase tracking-widest mb-3">
                What they leave with
              </div>
              <h3 className="font-heading font-bold text-ink text-2xl mb-3">Three next steps, in writing</h3>
              <p className="text-charcoal leading-relaxed">
                The student writes a short plan: the career they&apos;re going after, what they learned from you, what they
                still need, and three things they&apos;ll do in the next 90 days, each with a date. You give feedback. You
                don&apos;t write it.
              </p>
            </div>
            <div className="bg-ink text-cream rounded-card p-6 lg:p-8" style={dotTexture}>
              <div className="text-xs font-heading font-semibold text-orange uppercase tracking-widest mb-4">Your time</div>
              <dl className="divide-y divide-cream/10">
                {hours.map((h) => (
                  <div key={h.label} className="flex justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <dt className="text-gray-mid text-sm">{h.label}</dt>
                    <dd className="font-heading font-semibold text-cream text-sm tabular-nums">{h.time}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-cream section-pad">
        <div className="container-site">
          <h2 className="font-heading font-bold text-3xl lg:text-4xl text-ink leading-tight mb-10">Questions coaches ask</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
            {faqs.map((f) => (
              <div key={f.q}>
                <h3 className="font-heading font-semibold text-ink text-lg mb-2">{f.q}</h3>
                <p className="text-charcoal leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SIGNUP */}
      <section id="signup" className="bg-ink section-pad scroll-mt-20" style={dotTexture}>
        <div className="container-site grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-12 lg:gap-16 items-start">
          <div>
            <div className="text-xs font-heading font-semibold text-orange uppercase tracking-widest mb-4">Sign up</div>
            <h2 className="font-display font-black text-4xl lg:text-5xl text-cream uppercase leading-[0.95] mb-6">
              Raise your hand.
            </h2>
            <p className="text-gray-mid text-lg leading-relaxed mb-6">
              Tell us what you do. Signing up is not a commitment. When a student wants to get into your field, Remi
              reaches out first and shares their profile. You decide from there.
            </p>
            <p className="text-gray-mid text-sm leading-relaxed">
              Questions first? Email{" "}
              <span className="text-cream select-all">remi@ambitionangels.org</span>
            </p>
          </div>
          <div className="bg-white/[0.03] border border-white/10 rounded-card-lg p-6 sm:p-8">
            <CoachSignupForm />
          </div>
        </div>
      </section>
    </>
  );
}
