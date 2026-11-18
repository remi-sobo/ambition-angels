import type { Metadata } from "next";
import CoachSignupForm from "./CoachSignupForm";
import PageVisitedEvent from "@/components/PageVisitedEvent";

export const metadata: Metadata = {
  title: "Become an Ambition Coach",
  description:
    "Four conversations, about five hours, with a young person trying to get into your field. They leave with a written plan and a first move.",
  openGraph: {
    title: "Become an Ambition Coach",
    description:
      "Four conversations, about five hours, with a young person trying to get into your field. They leave with a written plan and a first move.",
  },
};

const dotTexture = {
  backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

const sessions = [
  {
    n: "1",
    name: "The reality check",
    body: "You share your path, the real version. They tell you why they want this field. Together you get clear on what the job is and what it isn't.",
  },
  {
    n: "2",
    name: "The map",
    body: "What actually gets someone in. The credential that matters, the cheapest real route, the entry roles nobody talks about, and what you'd do if you were starting at their age.",
  },
  {
    n: "3",
    name: "The work",
    body: "Skills, resume, and how your field is changing. What you did three years ago that you don't do now, and what new hires need that you didn't.",
  },
  {
    n: "4",
    name: "The move",
    body: "They read their plan back to you. Three dated actions for the next 90 days. If you can, one introduction to a person or opportunity. One is enough.",
  },
];

const hours = [
  { label: "Orientation call", time: "20 min" },
  { label: "Four sessions", time: "45 min each" },
  { label: "Prep per session", time: "about 15 min" },
  { label: "Total", time: "about 5 hours" },
];

const faqs = [
  {
    q: "Do I need to be senior?",
    a: "No. Someone a few years into the work is often the best coach, because the path is still fresh. What matters is that you do the job they're trying to get.",
  },
  {
    q: "Who are the students?",
    a: "Young adults, 18 to 24, reached through programs we partner with, like EOYDC in East Oakland. Most are in college or just out, and the first in their family to aim at the field they've picked.",
  },
  {
    q: "Is it in person?",
    a: "Virtual by default. If you and your student are both local and want to meet for coffee, great.",
  },
  {
    q: "What if they decide the field isn't for them?",
    a: "That counts as a win. Better to learn it in four conversations than after years and tuition. Your job is to be honest, not to recruit.",
  },
  {
    q: "What do I have to prepare?",
    a: "Almost nothing. Before each session we send a one-page card with what to cover and what your student has been working on. You show up as yourself.",
  },
  {
    q: "What do I sign?",
    a: "A short volunteer agreement and a 20-minute orientation call with Remi. The student schedules every session and writes the plan.",
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
              Four conversations. One young person. A real plan.
            </h1>
            <p className="text-gray-mid text-lg leading-relaxed mb-10 max-w-2xl">
              A young person has picked your field and has nobody in it to ask. You meet four times. They leave with a
              written Ambition Plan and a first move. It takes about five hours of your time.
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
                See how it works
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* PROOF */}
      <section className="bg-cream section-pad">
        <div className="container-site grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-12 items-center">
          <div>
            <div className="text-xs font-heading font-semibold text-orange uppercase tracking-widest mb-4">Why it works</div>
            <h2 className="font-heading font-bold text-3xl lg:text-4xl text-ink leading-tight mb-5">
              The right person, four times, changes the direction.
            </h2>
            <p className="text-charcoal text-lg leading-relaxed">
              Most young people can&apos;t name anyone who does the job they want. They make big decisions about school and
              money without ever asking someone who knows. One honest conversation fixes a lot. Four, with a plan at the
              end, gets them moving.
            </p>
          </div>
          <figure className="bg-white border border-gray-light rounded-card-lg p-8 lg:p-10">
            <div className="text-xs font-heading font-semibold text-gray-warm uppercase tracking-widest mb-4">Our first coach</div>
            <blockquote className="font-heading font-semibold text-ink text-xl lg:text-2xl leading-snug mb-5">
              A student who wanted to get into marketing was matched with a director of marketing at NVIDIA. They met four
              times. He took the coaching seriously and went on to land a marketing job with a local company.
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
              Four sessions, in order. We hand you the agenda.
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
              <h3 className="font-heading font-bold text-ink text-2xl mb-3">The Ambition Plan</h3>
              <p className="text-charcoal leading-relaxed">
                A written plan in their own words: the career they&apos;re pursuing, what they learned about the work, the
                skills and experience they still need, how the field is changing, and their next three moves with dates.
                The student writes it. You react to it.
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
          <h2 className="font-heading font-bold text-3xl lg:text-4xl text-ink leading-tight mb-10">Good questions</h2>
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
              Tell us what you do. When a student is heading into your field, Remi will reach out with their profile. You
              decide from there.
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
