"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import CareerQuizModal from "@/components/CareerQuizModal";
import IPhoneMockup from "@/components/IPhoneMockup";
import AnimatedCounter from "@/components/AnimatedCounter";
import AppStoreButtons from "@/components/AppStoreButtons";
import DashboardMockup from "@/components/DashboardMockup";
import { trackEvent } from "@/lib/analytics";
import { HEADLINE_STATS } from "@/lib/stats";

const pillars = [
  {
    icon: "01",
    title: "Pick a career.",
    body: "Entrepreneurship, nursing, game design, wealth management, engineering, and more. Careers most of them have never seen up close.",
  },
  {
    icon: "02",
    title: "Show up to work.",
    body: "Videos, quizzes, and hands-on activities. On a school Chromebook during advisory, or on their phone on the bus. Same internship either way.",
  },
  {
    icon: "03",
    title: "Leave with a direction.",
    body: "By day thirty they know what the work feels like, what it pays, and what the path in actually looks like. Then they try another one.",
  },
];

const guideSupports = [
  {
    title: "A live roster.",
    body: "Every student, their current internship, progress, and last activity. On track, making progress, or needs a check-in.",
  },
  {
    title: "Prompts tied to the work.",
    body: "Not generic career questions. Questions about the internship they are in right now.",
  },
  {
    title: "Follow-ups that surface themselves.",
    body: "The students who went quiet show up at the top of your week, with a note you can send in one click.",
  },
];

const whereItRuns = [
  {
    title: "In school.",
    body: "Advisory, homeroom, or a career-connected learning block. Every student in the room, on the computers they already use, with the teacher watching progress.",
  },
  {
    title: "In programs.",
    body: "After-school, mentoring, juvenile justice, faith communities. Fifteen minutes twice a week, built into time you already run.",
  },
  {
    title: "In community college.",
    body: "Cohort programs where the whole measure of success is helping students land somewhere.",
  },
  {
    title: "On their own.",
    body: "A teen who is not in any of those can download the app and start today. Any adult in their corner can sign up as a Guide and see what they are doing.",
  },
];

const team = [
  {
    name: "Remi Sobomehin",
    title: "CEO",
    quote:
      "My parents ran youth nonprofits throughout my childhood and instilled in me a dedication to serve communities that have been left behind. All of our youth deserve the highest quality investments, and when that reality comes to fruition, we all benefit.",
    initials: "RS",
    photo: "/images/Remi-Sobomehin_edited_edited.jpg",
  },
  {
    name: "Demetric Sanders",
    title: "Tech Partner",
    quote:
      "I overcame childhood adversity to become a first-generation college graduate. At Facebook I worked on the teens team and saw how effectively phones reach young people. I asked why we were not using that for something that actually helps them. Now we are.",
    initials: "DS",
    photo: "/images/deme_edited.jpg",
  },
];

export default function Home() {
  const [quizOpen, setQuizOpen] = useState(false);

  return (
    <>
      <CareerQuizModal isOpen={quizOpen} onClose={() => setQuizOpen(false)} />

      {/* HERO -- split screen */}
      <section className="relative min-h-[92vh] flex overflow-hidden">

        {/* LEFT -- photo fills this column */}
        <div className="relative w-full lg:w-[58%] min-h-[40vh] lg:min-h-0 overflow-hidden">
          <div className="absolute inset-0" data-parallax="0.12">
            <div className="absolute inset-0 scale-110">
              <Image
                src="/images/hero-image.jpg"
                alt="Teen with phone, looking forward"
                fill
                priority
                className="object-cover object-center"
              />
            </div>
          </div>
          {/* Subtle bottom fade on mobile only */}
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-ink to-transparent lg:hidden" />
        </div>

        {/* RIGHT -- ink panel with dot texture */}
        <div
          className="relative flex-1 lg:w-[42%] bg-ink flex items-center"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        >
          {/* Doodle 62 -- staircase upward arrow -- top-left of this panel */}
          <Image
            src="/images/doodles/Doodle 62@3x.png"
            alt=""
            width={120}
            height={120}
            className="absolute top-8 left-6 opacity-25 -rotate-12"
            aria-hidden="true"
          />

          <div className="px-8 lg:px-12 py-20 pt-32 lg:pt-20 max-w-xl w-full">
            <div className="inline-block text-xs font-medium text-orange bg-orange/10 border border-orange/30 px-4 py-1.5 rounded-full uppercase tracking-widest mb-6 fade-up">
              Freshman Year to Career
            </div>

            <h1 className="font-display font-black text-5xl lg:text-6xl text-cream mb-5 leading-none tracking-tight uppercase fade-up stagger-1">
              Career exposure.<br />
              <span className="text-orange">In their pocket.</span><br />
              <span className="text-orange">In their classroom.</span>
            </h1>

            <p className="font-body text-gray-mid text-base lg:text-lg mb-8 leading-relaxed max-w-sm fade-up stagger-2">
              Ambition delivers real careers through thirty-day simulated internships. On the web during class or program time, and on the phone everywhere else. Free for every student.
            </p>

            {/* Primary CTAs — the school ask leads */}
            <div className="flex flex-wrap gap-3 fade-up stagger-3">
              <Link
                href="/schools"
                onClick={() => trackEvent("schools_cta_clicked", { source: "home_hero" })}
                className="bg-orange hover:bg-orange-dark text-white font-semibold text-base px-8 py-4 rounded-full transition-colors duration-200 shadow-lg shadow-orange/30 min-h-[52px] inline-flex items-center"
              >
                Bring Ambition to your students
              </Link>
              <a
                href="#get-the-app"
                className="bg-cream/10 hover:bg-cream/20 text-cream font-semibold text-base px-8 py-4 rounded-full transition-colors duration-200 border border-cream/20 min-h-[52px] inline-flex items-center"
              >
                Get the app
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* THE AMBITION APPROACH */}
      <section
        className="section-pad bg-ink"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site">
          <div className="max-w-2xl mb-14">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4 fade-up">
              The Ambition Approach
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-cream mb-6 tracking-tight fade-up stagger-1">
              Thirty days inside a real career. Then they pick another one.
            </h2>
            <p className="text-gray-mid text-lg leading-relaxed fade-up stagger-2">
              Every internship has a fictional employer, real work, and something they actually build by the end. Fifteen minutes a day.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {pillars.map((p, i) => (
              <div
                key={p.icon}
                className={`bg-cream/5 border border-cream/10 rounded-card p-7 hover:bg-cream/10 hover:shadow-xl hover:shadow-orange/10 hover:-translate-y-1 border-b-2 border-b-transparent hover:border-b-orange/40 transition-all duration-200 cursor-default fade-up stagger-${i + 1}`}
              >
                <div className="font-display font-black text-8xl lg:text-9xl text-orange/20 mb-5 leading-none tracking-tight">
                  {p.icon}
                </div>
                <h3 className="font-heading font-semibold text-xl text-cream mb-3 tracking-tight">
                  {p.title}
                </h3>
                <p className="text-gray-mid text-sm leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/the-app"
              className="bg-orange hover:bg-orange-dark text-white font-semibold px-7 py-3.5 rounded-full transition-colors duration-200 text-sm min-h-[44px] inline-flex items-center"
            >
              See the Platform
            </Link>
            <Link
              href="/curriculum"
              className="bg-cream/10 hover:bg-cream/20 text-cream font-semibold px-7 py-3.5 rounded-full transition-colors duration-200 text-sm min-h-[44px] inline-flex items-center"
            >
              Explore Careers
            </Link>
          </div>
        </div>
      </section>

      {/* STATS BAR — proof it works */}
      <section
        className="bg-ink py-12 lg:py-16 relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site relative z-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8" data-stagger="120">
            {HEADLINE_STATS.map((stat) => (
              <div key={stat.label} className="reveal text-center relative">
                {stat.note && (
                  <Image
                    src="/images/doodles/Doodle 70@3x.png"
                    alt=""
                    width={220}
                    height={160}
                    className="opacity-20 absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/4 pointer-events-none"
                    aria-hidden="true"
                  />
                )}
                <div className="font-display font-black text-5xl lg:text-6xl text-orange mb-1 tracking-tight relative z-10">
                  <AnimatedCounter value={stat.value} />
                </div>
                <div className="text-gray-mid text-sm relative z-10">{stat.label}</div>
                {stat.note && (
                  <div className="text-gray-mid/60 text-xs relative z-10 mt-1 leading-snug max-w-[160px] mx-auto">
                    {stat.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THE OUTCOME — future orientation */}
      <section className="section-pad">
        <div className="container-site">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4 fade-up">
                The Outcome
              </p>
              <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink mb-6 tracking-tight leading-tight fade-up stagger-1">
                A teen who can picture their future starts working toward it.
              </h2>
              <div className="space-y-4 text-gray-warm leading-relaxed">
                <p className="fade-up stagger-2">
                  Future orientation is a teen&apos;s belief that their future is worth working toward right now. It is one of the strongest predictors of whether a young person stays connected to school and work into their twenties.
                </p>
                <p className="fade-up stagger-3">
                  Across more than 1,000 teens, the piece we track most closely — whether a teen is actually taking steps toward a career instead of just imagining one — went up 14%.
                </p>
                <p className="font-semibold text-ink fade-up stagger-3">
                  They do the work. They leave on their way to a career that pays.
                </p>
              </div>
              <Link
                href="/impact"
                className="mt-8 inline-flex items-center bg-orange hover:bg-orange-dark text-white font-semibold px-7 py-3.5 rounded-full transition-colors duration-200 text-sm min-h-[44px] fade-up stagger-4"
              >
                See the full results
              </Link>
            </div>

            {/* Orange big number card */}
            <div
              className="relative bg-orange rounded-card-lg p-12 lg:p-14 text-center overflow-hidden fade-up"
              style={{
                backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
            >
              <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/[0.07]" />
              <span className="font-display font-black text-[6rem] lg:text-[8rem] text-white leading-none tracking-tight block">
                14%
              </span>
              <p className="text-white/85 text-base leading-relaxed mt-4 max-w-sm mx-auto">
                Increase in teens taking real steps toward a career — not just imagining one.
              </p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-white/70">
                Pre and post · 1,000+ teens
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* THE GUIDE LAYER — for the adults in their corner */}
      <section
        className="section-pad bg-[#F5F4F0] relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.07) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site relative z-10">
          <div className="max-w-2xl mb-12 fade-up">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">
              For the Adults in Their Corner
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight mb-5">
              They do the internship. You see all of it.
            </h2>
            <p className="text-gray-warm text-lg leading-relaxed">
              Every teacher, counselor, mentor, and parent gets a dashboard. Who is moving and who stalled. What each teen is working on today. And a prompt tied to that exact internship, so the career conversation is ready before you sit down.
            </p>
          </div>

          {/* Dashboard mockup full width, phone beside it */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-10 items-end mb-12 fade-up">
            <DashboardMockup frame="group" />
            <div className="hidden lg:block scale-[0.62] origin-bottom -my-24">
              <IPhoneMockup />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {guideSupports.map((s, i) => (
              <div
                key={s.title}
                className={`bg-white border border-gray-light rounded-card-lg p-7 shadow-sm fade-up stagger-${i + 1}`}
              >
                <h3 className="font-heading font-bold text-ink text-lg mb-2 tracking-tight">{s.title}</h3>
                <p className="text-gray-warm text-sm leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-4 fade-up">
            <Link
              href="/the-app#dashboard"
              className="inline-flex items-center bg-orange hover:bg-orange-dark text-white font-semibold px-7 py-3.5 rounded-full transition-colors text-sm min-h-[44px]"
            >
              See the dashboard
            </Link>
            <Link
              href="/for-adults#waitlist"
              className="inline-flex items-center bg-ink/[0.06] hover:bg-ink/[0.12] text-ink border border-ink/15 font-semibold px-7 py-3.5 rounded-full transition-colors text-sm min-h-[44px]"
            >
              Sign up as a Guide
            </Link>
          </div>
        </div>
      </section>

      {/* WHERE IT RUNS */}
      <section
        className="section-pad bg-ink relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site relative z-10">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4 fade-up">
              Where It Runs
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-cream tracking-tight leading-tight fade-up stagger-1">
              Is this a school thing or an app? Yes.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {whereItRuns.map((card, i) => (
              <div
                key={card.title}
                className={`bg-cream/5 border border-cream/10 rounded-card-lg p-7 hover:bg-cream/10 hover:border-orange/30 transition-all duration-200 fade-up stagger-${(i % 4) + 1}`}
              >
                <h3 className="font-heading font-bold text-cream text-xl mb-3 tracking-tight">{card.title}</h3>
                <p className="text-gray-mid text-sm leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-10">
            <Link
              href="/schools"
              className="inline-flex items-center bg-orange hover:bg-orange-dark text-white font-semibold px-7 py-3.5 rounded-full transition-colors text-sm min-h-[44px]"
            >
              Bring Ambition to your students
            </Link>
          </div>
        </div>
      </section>

      {/* THE PROBLEM */}
      <section className="section-pad">
        <div className="container-site">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div>
              <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4 fade-up">
                The Gap
              </p>
              <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink mb-6 tracking-tight fade-up stagger-1">
                Schools can&apos;t do it alone.
              </h2>
              <div className="space-y-4 text-gray-warm leading-relaxed">
                <p className="fade-up stagger-2">
                  Teens from low-income communities graduate knowing academic
                  subjects but not how to make their way in a workforce that is changing
                  faster than any curriculum can keep up with.
                </p>
                <p className="fade-up stagger-3">
                  Youth not connected to a viable career path by age 25 are more
                  likely to face unemployment, poverty, and housing instability. And
                  the programs built to help them have never been able to reach
                  them at scale.
                </p>
              </div>
            </div>
            <div
              className="bg-orange-light border border-orange/10 rounded-card-lg p-8 lg:p-10 fade-up relative overflow-hidden"
              style={{
                backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.15) 1px, transparent 1px)",
                backgroundSize: "18px 18px",
              }}
            >
              <div className="space-y-6">
                {[
                  { pct: "95%", label: "of teens own a smartphone" },
                  { pct: "8 hrs", label: "average daily screen time" },
                  { pct: "Under 5", label: "careers most teens have been exposed to — usually whatever their parents do" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-5">
                    <div className="font-display font-black text-3xl lg:text-4xl text-orange flex-shrink-0 w-28 lg:w-32 tracking-tight">
                      {item.pct}
                    </div>
                    <div className="text-charcoal text-sm leading-snug">
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Capstone — the conclusion the three stats lead to */}
              <div className="mt-8 pt-6 border-t border-orange/20">
                <p className="font-display font-black text-3xl lg:text-5xl text-orange tracking-tight leading-[1.05] text-right">
                  We meet them there.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS — dark treatment */}
      <section
        className="py-16 lg:py-20 bg-ink relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site relative z-10">
          <p className="text-xs font-semibold text-orange uppercase tracking-widest mb-10 text-center fade-up">
            From the students
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                quote: "I never knew what I wanted to do. After the entrepreneurship internship, I started selling custom bracelets at school. I make $200 a month now.",
                name: "Destiny M.",
                grade: "10th Grade",
                location: "Oakland, CA",
                initials: "DM",
              },
              {
                quote: "The wealth management track changed how I think about money. I taught my mom what I learned and I am starting to think I might have a future here.",
                name: "Marcus T.",
                grade: "11th Grade",
                location: "East Palo Alto, CA",
                initials: "MT",
              },
              {
                quote: "I did the nursing internship and it clicked. I know exactly what I am doing after high school. No one in my family has ever worked in healthcare.",
                name: "Aaliyah R.",
                grade: "12th Grade",
                location: "Richmond, CA",
                initials: "AR",
              },
            ].map((t, i) => (
              <div
                key={t.name}
                className={`bg-ink-soft border border-white/10 rounded-card-lg p-7 hover:border-white/20 hover:-translate-y-0.5 transition-all duration-200 fade-up stagger-${i + 1} flex flex-col`}
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
                    <div className="text-[#999] text-xs">{t.grade} &middot; {t.location}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* APP SHOWCASE — where "Get the app" lands */}
      <section
        id="get-the-app"
        className="section-pad bg-[#F5F4F0] relative overflow-hidden scroll-mt-24"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.07) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

            {/* Text */}
            <div className="reveal">
              <p className="text-xs font-medium text-orange uppercase tracking-widest mb-3">The App</p>
              <h2 className="font-display font-black text-5xl lg:text-6xl text-[#0E0E0E] mb-6 leading-none tracking-tight uppercase">
                Everywhere<br /><span className="text-orange">class<br />isn&apos;t.</span>
              </h2>
              <p className="text-charcoal text-lg leading-relaxed mb-8 max-w-lg">
                The same thirty-day internships, on their phone. A teen who is not in a school or program can download Ambition and start today — and a teen who is can keep going on the bus, at practice, at home. Free for every student.
              </p>
              <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-start">
                <AppStoreButtons variant="lockup" source="home_app_showcase" />
              </div>
              <div className="mt-6 flex flex-wrap gap-4 items-center">
                <Link
                  href="/the-app#demo"
                  onClick={() => trackEvent("app_demo_teaser_clicked", { source: "home" })}
                  className="group inline-flex items-center gap-3 bg-ink hover:bg-charcoal text-cream font-semibold pl-3 pr-6 py-2.5 rounded-full transition-all hover:-translate-y-0.5 shadow-lg text-sm min-h-[48px]"
                >
                  <span className="flex items-center justify-center w-9 h-9 rounded-full bg-orange text-white">
                    <svg className="w-4 h-4 translate-x-px" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                  Try the interactive demo
                </Link>
                <button
                  onClick={() => {
                    trackEvent("career_quiz_cta_clicked");
                    setQuizOpen(true);
                  }}
                  className="text-orange font-semibold text-sm hover:text-orange-dark transition-colors min-h-[44px]"
                >
                  Or take the career quiz &rarr;
                </button>
              </div>
            </div>

            {/* iPhone mockup — floats gently, links into the live demo */}
            <div className="flex justify-center lg:justify-end reveal reveal-scale">
              <Link
                href="/the-app#demo"
                aria-label="See the interactive app demo"
                onClick={() => trackEvent("app_demo_teaser_clicked", { source: "home_mockup" })}
                className="group relative animate-float"
              >
                <div
                  className="absolute -inset-8 rounded-full bg-orange/20 blur-3xl animate-glow pointer-events-none"
                  aria-hidden="true"
                />
                <div className="relative transition-transform duration-300 group-hover:scale-[1.03]">
                  <IPhoneMockup />
                </div>
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* TEAM */}
      <section
        className="section-pad bg-[#F5F4F0] relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.07) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site">
          <div className="max-w-xl mb-12">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4 fade-up">
              The People Behind This
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight fade-up stagger-1">
              Built by people who lived the gap and refused to accept it.
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {team.map((person, i) => (
              <div
                key={person.name}
                className={`bg-white border border-gray-light rounded-card-lg p-8 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 fade-up stagger-${i + 1}`}
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 border-2 border-orange/30">
                    <Image
                      src={person.photo}
                      alt={person.name}
                      width={64}
                      height={64}
                      className="w-full h-full object-cover object-top"
                    />
                  </div>
                  <div>
                    <div className="font-heading font-semibold text-ink">
                      {person.name}
                    </div>
                    <div className="text-gray-warm text-sm">{person.title}</div>
                  </div>
                </div>
                <blockquote className="text-charcoal leading-relaxed text-sm border-l-4 border-orange pl-4">
                  &ldquo;{person.quote}&rdquo;
                </blockquote>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <Link
              href="/about"
              className="text-orange font-medium text-sm hover:text-orange-dark transition-colors duration-200"
            >
              Learn about our full team and advisory board &rarr;
            </Link>
          </div>
        </div>
      </section>

    </>
  );
}
