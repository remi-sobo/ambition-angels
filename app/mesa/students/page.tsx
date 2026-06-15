import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import AppStoreButtons from "@/components/AppStoreButtons";
import StudentSignup from "./StudentSignup";
import { MESA } from "@/lib/mesa";

const STUDENTS_DESCRIPTION = `Explore real careers on your phone and earn a ${MESA.rewardPerInternship} gift card every time you finish an internship. Free for MESA students at ${MESA.collegeName}.`;

export const metadata: Metadata = {
  title: "Get Paid to Explore Careers | MESA",
  description: STUDENTS_DESCRIPTION,
  alternates: { canonical: "/mesa/students" },
  openGraph: {
    title: "Get paid to figure out your future | MESA x Ambition Angels",
    description: STUDENTS_DESCRIPTION,
    url: "/mesa/students",
    type: "website",
    images: ["/opengraph-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Get paid to figure out your future | MESA x Ambition Angels",
    description: STUDENTS_DESCRIPTION,
  },
};

const dotTexture = {
  backgroundImage:
    "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

const benefits = [
  {
    title: "Explore real careers",
    body: "Tech, healthcare, game design, business, and more. Pick what you are curious about. 15 minutes a day, on your phone.",
  },
  {
    title: "Earn real money",
    body: `Finish an internship, get a ${MESA.rewardPerInternship} gift card from brands you actually use. Up to ${MESA.internshipsPerStudent} of them.`,
  },
  {
    title: "Get a real coach",
    body: "When you find your thing, we connect you with someone who actually does that job. Four sessions to build your plan.",
  },
];

const steps = [
  { num: "01", title: "Download the app", body: "Free on iPhone and Android." },
  { num: "02", title: "Pick your path", body: "Choose a career internship that sounds interesting. You can switch later." },
  { num: "03", title: "Show up 15 minutes a day", body: "Watch, answer, do. No commute. No classroom." },
  { num: "04", title: "Finish and earn", body: `Complete it and your ${MESA.rewardPerInternship} gift card is yours.` },
];

// STEM-led, then breadth. Pulled from the live curriculum tracks.
const tracks = [
  "Software Engineering",
  "Registered Nursing",
  "Game Design",
  "UX/UI Design",
  "Physical Therapy",
  "Mental Health Therapy",
  "Firefighting",
  "Entrepreneurship",
  "Wealth Management",
  "Sales",
  "Marketing",
  "Event Planning",
];

const testimonials = [
  {
    quote:
      "I never knew what I wanted to do. After the entrepreneurship internship, I started selling custom bracelets at school. I make $200 a month now.",
    name: "Destiny M.",
    meta: "10th Grade · Oakland, CA",
    initials: "DM",
  },
  {
    quote:
      "I did the nursing internship and it clicked. I know exactly what I am doing after high school. No one in my family has ever worked in healthcare.",
    name: "Aaliyah R.",
    meta: "12th Grade · Richmond, CA",
    initials: "AR",
  },
];

const faqs = [
  {
    q: "Is it actually free?",
    a: "Yes. Always. We are a nonprofit and your MESA program covers nothing out of your pocket.",
  },
  {
    q: "Do I need any experience?",
    a: "No. These are made for people exploring, not experts.",
  },
  {
    q: "How long does an internship take?",
    a: "30 days, about 15 minutes a day.",
  },
  {
    q: "What's the catch?",
    a: "There isn't one. You explore careers, we reward you for finishing, and your MESA team helps you keep going.",
  },
  {
    q: "Who is behind this?",
    a: "Ambition Angels, a nonprofit that puts career exposure in every pocket, partnering with your MESA program.",
  },
];

export default function MesaStudentsPage() {
  return (
    <>
      {/* ── B1 · HERO (mobile-first) ─────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-ink" style={dotTexture}>
        <Image
          src="/images/doodles/Doodle 70@3x.png"
          alt=""
          width={200}
          height={150}
          className="absolute top-24 right-0 opacity-15 pointer-events-none"
          aria-hidden="true"
        />

        <div className="container-site relative z-10 pt-28 pb-16 sm:pt-32 sm:pb-20">
          <div className="flex items-center gap-3 mb-7 fade-up">
            <span className="inline-flex items-center bg-cream rounded-lg px-2.5 py-1.5">
              <Image
                src={MESA.logo.src}
                alt={MESA.logo.alt}
                width={MESA.logo.width}
                height={MESA.logo.height}
                className="h-6 w-auto"
                priority
              />
            </span>
            <span className="text-gray-mid text-base font-light" aria-hidden="true">
              ✕
            </span>
            <span className="font-heading font-bold text-cream text-sm tracking-tight">
              Ambition Angels
            </span>
          </div>

          <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4 fade-up stagger-1">
            MESA x Ambition Angels
          </p>

          <h1 className="font-display font-black text-5xl sm:text-6xl text-cream leading-[0.95] tracking-tight uppercase mb-5 fade-up stagger-2">
            Get paid to <span className="text-orange">figure out your future.</span>
          </h1>

          <p className="text-gray-mid text-lg leading-relaxed mb-8 max-w-xl fade-up stagger-3">
            Explore real careers on your phone. Earn a {MESA.rewardPerInternship}{" "}
            gift card every time you finish an internship. Built for MESA
            students at {MESA.collegeName}.
          </p>

          <div className="fade-up stagger-4">
            <AppStoreButtons variant="lockup" source="mesa_students_hero" />
            <p className="text-gray-mid/70 text-sm font-semibold mt-4">
              Free. Always. No catch.
            </p>
          </div>
        </div>
      </section>

      {/* ── B2 · WHAT YOU GET ────────────────────────────────────────────── */}
      <section className="section-pad bg-cream">
        <div className="container-site">
          <p className="text-xs font-bold text-orange uppercase tracking-widest mb-8 fade-up">
            Here&apos;s the deal
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {benefits.map((b, i) => (
              <div
                key={b.title}
                className={`bg-white border border-gray-light rounded-card-lg p-7 shadow-sm fade-up stagger-${i + 1}`}
              >
                <h2 className="font-heading font-bold text-ink text-xl mb-3 tracking-tight">
                  {b.title}
                </h2>
                <p className="text-gray-warm text-sm leading-relaxed">{b.body}</p>
              </div>
            ))}
          </div>

          {/* Reassurance line */}
          <div className="mt-5 bg-orange-light border border-orange/20 rounded-card p-5 sm:p-6 fade-up">
            <p className="text-charcoal text-sm sm:text-base leading-relaxed">
              <span className="font-semibold text-ink">
                Your MESA team has your back.
              </span>{" "}
              {MESA.directorName} and the team can see your progress and help you
              keep going.
            </p>
          </div>
        </div>
      </section>

      {/* ── B3 · HOW IT WORKS ────────────────────────────────────────────── */}
      <section className="section-pad bg-ink relative overflow-hidden" style={dotTexture}>
        <div className="container-site relative z-10">
          <p className="text-xs font-bold text-orange uppercase tracking-widest mb-8 fade-up">
            Start in two minutes
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((s, i) => (
              <div
                key={s.num}
                className={`bg-ink-soft border border-white/10 rounded-card p-6 fade-up stagger-${i + 1}`}
              >
                <div className="font-display font-black text-5xl text-orange leading-none mb-4 tracking-tight">
                  {s.num}
                </div>
                <h3 className="font-heading font-semibold text-cream text-base mb-2 tracking-tight">
                  {s.title}
                </h3>
                <p className="text-gray-mid text-sm leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── B4 · WHAT YOU CAN EXPLORE ────────────────────────────────────── */}
      <section className="section-pad bg-cream">
        <div className="container-site">
          <p className="text-xs font-bold text-orange uppercase tracking-widest mb-3 fade-up">
            The careers
          </p>
          <h2 className="font-heading font-bold text-3xl lg:text-4xl text-ink tracking-tight leading-tight mb-8 max-w-2xl fade-up stagger-1">
            Pick something you are curious about.
          </h2>
          <ul className="flex flex-wrap gap-2.5 fade-up stagger-2">
            {tracks.map((t) => (
              <li
                key={t}
                className="bg-white border border-gray-light rounded-full px-4 py-2.5 text-sm font-medium text-charcoal"
              >
                {t}
              </li>
            ))}
          </ul>
          <Link
            href="/curriculum"
            className="inline-flex items-center mt-8 text-orange font-semibold text-sm hover:text-orange-dark transition-colors min-h-[44px]"
          >
            See all internships &rarr;
          </Link>
        </div>
      </section>

      {/* ── B5 · THE MONEY IS REAL ───────────────────────────────────────── */}
      <section className="section-pad bg-orange-dark relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
          aria-hidden="true"
        />
        <div className="container-site relative z-10">
          <p className="text-xs font-bold text-orange-light uppercase tracking-widest mb-4 fade-up">
            About that {MESA.rewardPerInternship}
          </p>
          <h2 className="font-heading font-bold text-4xl lg:text-5xl text-white tracking-tight leading-tight mb-5 max-w-2xl fade-up stagger-1">
            Your time has value. We pay it.
          </h2>
          <p className="text-white text-lg leading-relaxed max-w-2xl fade-up stagger-2">
            Every internship you finish earns a {MESA.rewardPerInternship} gift
            card from real brands. This is not points. This is not a maybe.
            Finish the work, get the reward.
          </p>
        </div>
      </section>

      {/* ── B6 · SOCIAL PROOF ────────────────────────────────────────────── */}
      <section className="section-pad bg-ink relative overflow-hidden" style={dotTexture}>
        <div className="container-site relative z-10">
          <p className="text-xs font-bold text-orange uppercase tracking-widest mb-8 fade-up">
            From students like you
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {testimonials.map((t, i) => (
              <div
                key={t.name}
                className={`bg-ink-soft border border-white/10 rounded-card-lg p-7 flex flex-col fade-up stagger-${i + 1}`}
              >
                <div className="font-display font-black text-6xl text-orange leading-none mb-3 -mt-1" aria-hidden="true">
                  &ldquo;
                </div>
                <p className="text-white/75 text-sm leading-relaxed flex-1 mb-6">
                  {t.quote}
                </p>
                <div className="flex items-center gap-3 pt-4 border-t border-white/10">
                  <div className="w-10 h-10 rounded-full bg-orange/10 border border-orange/30 flex items-center justify-center flex-shrink-0">
                    <span className="font-heading font-bold text-orange text-xs">{t.initials}</span>
                  </div>
                  <div>
                    <div className="font-heading font-semibold text-white text-sm">{t.name}</div>
                    <div className="text-[#999] text-xs">{t.meta}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── B7 · FAQ ─────────────────────────────────────────────────────── */}
      <section className="section-pad bg-cream">
        <div className="container-site max-w-2xl">
          <p className="text-xs font-bold text-orange uppercase tracking-widest mb-8 fade-up">
            Real questions
          </p>
          <div className="flex flex-col gap-3">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="group bg-white border border-gray-light rounded-card p-5 shadow-sm fade-up"
              >
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-heading font-semibold text-ink text-base min-h-[28px]">
                  {f.q}
                  <svg
                    className="w-5 h-5 text-orange flex-shrink-0 transition-transform group-open:rotate-45"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </summary>
                <p className="text-gray-warm text-sm leading-relaxed mt-3">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── B8 · FINAL CTA + SIGNUP ──────────────────────────────────────── */}
      <section className="section-pad bg-ink relative overflow-hidden" style={dotTexture}>
        <div className="container-site relative z-10 max-w-xl mx-auto text-center">
          <h2 className="font-display font-black text-5xl sm:text-6xl text-cream tracking-tight leading-none uppercase mb-6 fade-up">
            Ready? <span className="text-orange">Start now.</span>
          </h2>

          <div className="flex justify-center fade-up stagger-1">
            <AppStoreButtons variant="lockup" source="mesa_students_footer" />
          </div>

          <div className="mt-10 pt-8 border-t border-white/10 text-left fade-up stagger-2">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-3 text-center">
              Started already?
            </p>
            <p className="text-gray-mid text-sm leading-relaxed mb-5 text-center">
              Drop your name so your MESA team knows you are in.
            </p>
            <StudentSignup />
          </div>
        </div>
      </section>
    </>
  );
}
