import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import AnimatedCounter from "@/components/AnimatedCounter";
import { MESA } from "@/lib/mesa";

const MESA_DESCRIPTION = `A career-readiness partnership between Ambition Angels and MESA at ${MESA.collegeName}: real career exposure, a team that guides students, and a coach for the ones ready to go further.`;

export const metadata: Metadata = {
  title: "MESA Partnership",
  description: MESA_DESCRIPTION,
  alternates: { canonical: "/mesa" },
  openGraph: {
    title: "Ambition Angels x MESA Partnership",
    description: MESA_DESCRIPTION,
    url: "/mesa",
    type: "website",
    images: ["/opengraph-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ambition Angels x MESA Partnership",
    description: MESA_DESCRIPTION,
  },
};

const dotTexture = {
  backgroundImage:
    "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

// The signature three-layer progression. `meter` is the fill width of each
// layer's audience bar, narrowing left to right from all students to the few.
const layers = [
  {
    num: "01",
    layer: "Exposure",
    title: "The Ambition app",
    body: `Every one of your ${MESA.studentCount} students gets the Ambition app. They pick real career internships, work 15 minutes a day on the phone they already have, and earn a ${MESA.rewardPerInternship} gift card for every internship they finish. We fund up to ${MESA.internshipsPerStudent} per student.`,
    tag: `All ${MESA.studentCount} students`,
    meter: "w-full",
  },
  {
    num: "02",
    layer: "Conversations",
    title: "The Guide",
    body: "You and your MESA team get the Guide dashboard. See what every student is exploring, follow their progress, and get conversation prompts tied to exactly what they are working on. You set the accountability. Kids come and go. The adults stay.",
    tag: "You and your team",
    meter: "w-[55%]",
  },
  {
    num: "03",
    layer: "Connections",
    title: "The Ambition Coach",
    body: "When a student gets serious about a direction, we connect them one to one with a professional who actually does that job. Four sessions over four weeks, virtual, focused on turning a goal into a plan. We source the coaches from our network.",
    tag: "The students ready to go further",
    meter: "w-[26%]",
  },
];

const aaProvides = [
  `App access for all ${MESA.studentCount} students`,
  `${MESA.rewardPerInternship} in gift card rewards per completed internship, up to ${MESA.internshipsPerStudent} per student, fully funded by us`,
  "The Guide dashboard for your MESA team, plus onboarding on how to use it",
  "Coach matching from our professional network for students who are ready",
  "A start-of-year onboarding session with your students, virtual or in person",
];

const mesaProvides = [
  `${MESA.studentCount} enrolled students for the pilot year`,
  `Orientation and a ${MESA.launchWindow} launch`,
  "Guide-side accountability and encouragement throughout the year",
  "Help identifying the students ready for a coach",
  "A space, virtual or in person, for the onboarding session",
];

const stats = [
  { value: String(MESA.studentCount), label: "Students in the pilot" },
  { value: String(MESA.internshipsPerStudent), label: "Internships funded per student" },
  { value: MESA.rewardPerInternship, label: "Earned per completed internship" },
  { value: String(MESA.coachingSessions), label: "Coaching sessions for students ready to go deeper" },
];

const timeline = [
  {
    when: "August",
    title: "Orientations",
    body: "MESA runs student orientations and gauges interest.",
  },
  {
    when: MESA.launchWindow,
    title: "Launch",
    body: "Students download the app and start their first internship. We onboard them.",
  },
  {
    when: "Through the year",
    title: "Explore and earn",
    body: "Students complete internships, your team guides, the serious few get matched with coaches.",
  },
  {
    when: "End of year",
    title: "Review",
    body: "We look at what worked and decide where this goes next.",
  },
];

export default function MesaPage() {
  return (
    <>
      {/* ── A1 · HERO ────────────────────────────────────────────────────── */}
      <section
        className="relative flex items-center overflow-hidden bg-ink min-h-[88vh]"
        style={dotTexture}
      >
        <Image
          src="/images/doodles/Doodle 62@3x.png"
          alt=""
          width={140}
          height={140}
          className="absolute top-10 right-8 opacity-20 -rotate-12 hidden sm:block"
          aria-hidden="true"
        />

        <div className="container-site relative z-10 pt-32 pb-24 lg:pt-40 lg:pb-32">
          <div className="flex items-center gap-4 mb-8 fade-up">
            <span className="font-heading font-bold text-cream text-base sm:text-lg tracking-tight">
              Ambition Angels
            </span>
            <span className="text-gray-mid text-xl font-light" aria-hidden="true">
              ✕
            </span>
            <span className="inline-flex items-center bg-cream rounded-xl px-3 py-2">
              <Image
                src={MESA.logo.src}
                alt={MESA.logo.alt}
                width={MESA.logo.width}
                height={MESA.logo.height}
                className="h-7 w-auto sm:h-8"
                priority
              />
            </span>
          </div>

          <p className="text-xs font-bold text-orange uppercase tracking-widest mb-5 fade-up stagger-1">
            {MESA.lockup}
          </p>

          <h1 className="font-display font-black text-5xl sm:text-6xl lg:text-7xl text-cream leading-none tracking-tight uppercase mb-6 max-w-4xl fade-up stagger-2">
            A career-readiness partnership for MESA students.
          </h1>

          <p className="text-gray-mid text-lg leading-relaxed max-w-2xl mb-10 fade-up stagger-3">
            Ambition Angels and MESA at {MESA.collegeName} are piloting a full
            career pathway for {MESA.studentCount} students this year: real
            career exposure, a team that guides them, and a coach for the ones
            ready to go further.
          </p>

          <div className="flex flex-col sm:flex-row flex-wrap gap-3 fade-up stagger-4">
            <Link
              href="/mesa/students"
              className="bg-orange hover:bg-orange-dark text-white font-semibold text-base px-8 py-4 rounded-full transition-colors min-h-[52px] inline-flex items-center justify-center"
            >
              See the student experience
            </Link>
            <a
              href={`mailto:${MESA.contactEmail}`}
              className="bg-cream/10 hover:bg-cream/20 text-cream border border-cream/20 font-semibold text-base px-8 py-4 rounded-full transition-colors min-h-[52px] inline-flex items-center justify-center"
            >
              Talk to us
            </a>
          </div>
        </div>
      </section>

      {/* ── A2 · THE SHARED PROBLEM ──────────────────────────────────────── */}
      <section className="section-pad bg-cream">
        <div className="container-site">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
            <div>
              <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4 fade-up">
                Why this partnership
              </p>
              <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight mb-6 fade-up stagger-1">
                MESA gets them in the door. We help them walk through it.
              </h2>
              <div className="space-y-4 text-gray-warm leading-relaxed">
                <p className="fade-up stagger-2">
                  MESA finds the students who are too often overlooked:
                  first-generation, low-income, and serious about a future in STEM
                  and beyond. The hard part comes next. Knowing a career exists is
                  not the same as believing you belong in it.
                </p>
                <p className="fade-up stagger-3">
                  Most students here do not have a parent&apos;s best friend in the
                  industry to call. What they need is exposure to real careers, an
                  adult tracking their progress, and a direct line to someone who
                  already does the job. That is exactly what this partnership
                  provides.
                </p>
              </div>
            </div>

            {/* Pull quote, styled like the homepage testimonials, attributed
                softly to the model rather than a person. */}
            <div className="lg:pt-10 fade-up stagger-2">
              <blockquote className="bg-white border border-gray-light rounded-card-lg p-8 lg:p-10 shadow-sm">
                <div className="font-display font-black text-6xl text-orange leading-none mb-3 -mt-1" aria-hidden="true">
                  &ldquo;
                </div>
                <p className="text-charcoal text-lg lg:text-xl leading-relaxed font-medium">
                  The student who chooses the research lab over the easy trip
                  almost always has someone in her corner who helped her see what
                  mattered.
                </p>
                <footer className="mt-6 pt-5 border-t border-gray-light text-xs font-semibold text-gray-warm uppercase tracking-widest">
                  The pattern we keep seeing
                </footer>
              </blockquote>
            </div>
          </div>
        </div>
      </section>

      {/* ── A3 · THE MODEL (SIGNATURE: connected, narrowing progression) ──── */}
      <section
        className="section-pad bg-ink relative overflow-hidden"
        style={dotTexture}
      >
        <div className="container-site relative z-10">
          <div className="max-w-2xl mb-14">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4 fade-up">
              How it works
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-cream tracking-tight leading-tight fade-up stagger-1">
              Three layers. One pathway.
            </h2>
            <p className="text-gray-mid text-base leading-relaxed mt-5 fade-up stagger-2">
              One connected progression, not three loose programs. It starts wide
              with all {MESA.studentCount} students and narrows to the few ready
              to go further.
            </p>
          </div>

          <div className="relative">
            {/* Desktop connector line, threaded through the node centers.
                The nodes (ring-ink) sit on top and mask where it crosses. */}
            <div
              className="hidden lg:block absolute top-7 left-[16.666%] right-[16.666%] h-0.5 -translate-y-1/2 bg-gradient-to-r from-orange via-orange/70 to-orange/25"
              aria-hidden="true"
            />

            <ol className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-5">
              {layers.map((l, i) => (
                <li
                  key={l.num}
                  className={`relative flex flex-col items-center fade-up stagger-${i + 1}`}
                >
                  {/* Mobile vertical connector from the previous card */}
                  {i > 0 && (
                    <div
                      className="lg:hidden absolute left-1/2 -translate-x-1/2 -top-10 w-0.5 h-10 bg-gradient-to-b from-orange/25 to-orange/60"
                      aria-hidden="true"
                    />
                  )}

                  {/* Number node — centered so the connector runs through it */}
                  <span className="relative z-10 w-14 h-14 rounded-full bg-orange text-white font-display font-black text-2xl flex items-center justify-center flex-shrink-0 ring-8 ring-ink mb-5">
                    {l.num}
                  </span>

                  <div className="bg-ink-soft border border-white/10 rounded-card-lg p-7 w-full flex-1 flex flex-col">
                    <div className="text-xs font-bold text-orange uppercase tracking-widest mb-1">
                      {l.layer}
                    </div>
                    <div className="font-heading font-semibold text-cream text-lg tracking-tight mb-3">
                      {l.title}
                    </div>

                    <p className="text-gray-mid text-sm leading-relaxed flex-1 mb-6">
                      {l.body}
                    </p>

                    {/* Audience meter — the fill narrows across the three layers */}
                    <div className="mt-auto">
                      <div className="h-2 w-full rounded-full bg-orange/15 overflow-hidden">
                        <div className={`h-full rounded-full bg-orange ${l.meter}`} />
                      </div>
                      <div className="mt-2.5 text-xs font-semibold text-cream uppercase tracking-widest">
                        {l.tag}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ── A4 · WHO DOES WHAT (the MOU core) ────────────────────────────── */}
      <section className="section-pad bg-cream">
        <div className="container-site">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4 fade-up">
              The commitment
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight fade-up stagger-1">
              Clear lanes. No surprises.
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ambition Angels */}
            <div className="bg-white border border-gray-light rounded-card-lg p-8 shadow-sm fade-up stagger-1">
              <div className="inline-block text-xs font-bold text-orange uppercase tracking-widest bg-orange-light border border-orange/20 rounded-full px-3 py-1 mb-6">
                Ambition Angels provides
              </div>
              <ul className="space-y-4">
                {aaProvides.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-charcoal text-sm leading-relaxed">
                    <span className="w-5 h-5 rounded-full bg-orange flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* MESA */}
            <div className="bg-white border border-gray-light rounded-card-lg p-8 shadow-sm fade-up stagger-2">
              <div className="inline-block text-xs font-bold text-charcoal uppercase tracking-widest bg-gray-light border border-gray-mid/40 rounded-full px-3 py-1 mb-6">
                MESA at {MESA.collegeName} provides
              </div>
              <ul className="space-y-4">
                {mesaProvides.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-charcoal text-sm leading-relaxed">
                    <span className="w-5 h-5 rounded-full bg-charcoal flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-6 text-sm text-gray-warm leading-relaxed max-w-2xl">
            This is a working overview of our pilot, not a binding contract. It
            exists so everyone knows the plan.
          </p>
        </div>
      </section>

      {/* ── A5 · THE PILOT AT A GLANCE ───────────────────────────────────── */}
      <section
        className="py-16 lg:py-20 bg-ink relative overflow-hidden"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site relative z-10">
          <p className="text-xs font-bold text-orange uppercase tracking-widest mb-10 text-center fade-up">
            By the numbers
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center fade-up">
                <div className="font-display font-black text-5xl lg:text-6xl text-orange mb-1 tracking-tight">
                  <AnimatedCounter value={stat.value} />
                </div>
                <div className="text-gray-mid text-sm leading-snug max-w-[180px] mx-auto">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── A6 · TIMELINE ────────────────────────────────────────────────── */}
      <section className="section-pad bg-cream">
        <div className="container-site">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4 fade-up">
              The year ahead
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight fade-up stagger-1">
              From orientation to a real pathway.
            </h2>
          </div>

          <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {timeline.map((node, i) => (
              <li key={node.title} className={`relative fade-up stagger-${i + 1}`}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-3.5 h-3.5 rounded-full bg-orange flex-shrink-0 ring-4 ring-orange/15" aria-hidden="true" />
                  {/* connector to the next node (desktop) */}
                  {i < timeline.length - 1 && (
                    <span className="hidden lg:block flex-1 h-0.5 bg-gradient-to-r from-orange/40 to-orange/10" aria-hidden="true" />
                  )}
                </div>
                <div className="text-xs font-bold text-orange uppercase tracking-widest mb-2">
                  {node.when}
                </div>
                <h3 className="font-heading font-semibold text-ink text-lg mb-2 tracking-tight">
                  {node.title}
                </h3>
                <p className="text-gray-warm text-sm leading-relaxed">{node.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── A7 · THE BIGGER PICTURE (restrained) ─────────────────────────── */}
      <section className="section-pad bg-orange-light">
        <div className="container-site">
          <div className="max-w-2xl">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4 fade-up">
              Where this could go
            </p>
            <h2 className="font-heading font-bold text-3xl lg:text-4xl text-ink tracking-tight leading-tight mb-5 fade-up stagger-1">
              One college now. A model that could travel.
            </h2>
            <p className="text-charcoal text-lg leading-relaxed fade-up stagger-2">
              MESA reaches first-generation STEM students across more than 90
              California community colleges. We are starting with one. If this
              pilot moves the needle for your students, there is a real path to
              taking it further, together.
            </p>
          </div>
        </div>
      </section>

      {/* ── A8 · FOOTER CTA ──────────────────────────────────────────────── */}
      <section
        className="section-pad bg-ink relative overflow-hidden"
        style={dotTexture}
      >
        <div className="container-site relative z-10 text-center">
          <h2 className="font-heading font-bold text-3xl lg:text-4xl text-cream tracking-tight leading-tight mb-4 fade-up">
            Questions about the partnership?
          </h2>
          <p className="text-gray-mid text-lg leading-relaxed max-w-xl mx-auto mb-9 fade-up stagger-1">
            We will keep this page current as the plan evolves. Reach out any
            time.
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center fade-up stagger-2">
            <a
              href={`mailto:${MESA.contactEmail}`}
              className="bg-orange hover:bg-orange-dark text-white font-semibold text-base px-8 py-4 rounded-full transition-colors min-h-[52px] inline-flex items-center justify-center"
            >
              Email Remi
            </a>
            <Link
              href="/mesa/students"
              className="bg-cream/10 hover:bg-cream/20 text-cream border border-cream/20 font-semibold text-base px-8 py-4 rounded-full transition-colors min-h-[52px] inline-flex items-center justify-center"
            >
              See what students see
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
