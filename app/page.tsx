"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import CareerQuizModal from "@/components/CareerQuizModal";
import AnimatedCounter from "@/components/AnimatedCounter";
import { DoodleStar, DoodleSquiggle, DoodleCircle, DoodleZigzag, DoodleDots, DoodleArrow } from "@/components/Doodles";

const pillars = [
  {
    icon: "01",
    title: "Pick your path",
    body: "Internships in entrepreneurship, sales, game design, dental hygiene, wealth management, and more. Careers they may never have considered before.",
  },
  {
    icon: "02",
    title: "Show up to work",
    body: "Videos, quizzes, and activities built for the phone screen. 15 minutes a day. No commute. No classroom.",
  },
  {
    icon: "03",
    title: "Earn for your effort",
    body: "Complete an internship and earn gift cards from brands you actually use. Their time has real value. We prove it.",
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

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll(".fade-up").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <CareerQuizModal isOpen={quizOpen} onClose={() => setQuizOpen(false)} />

      {/* HERO */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden">
        {/* Full-bleed photo — teen positioned left */}
        <div className="absolute inset-0">
          <Image
            src="/images/hero-image.jpg"
            alt="Teen looking forward with phone in hand"
            fill
            priority
            className="object-cover object-[30%_center]"
          />
        </div>

        {/* Lighter overlay — just a soft gradient from right so text is readable */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to left, #0E0E0Ef0 0%, #0E0E0Ecc 35%, #0E0E0E55 55%, transparent 75%)",
          }}
        />

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-ink to-transparent" />

        {/* Dot grid — visible on dark right side, fades on bright left */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: "radial-gradient(circle, #E8500A 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            mixBlendMode: "overlay",
          }}
        />

        {/* Content — anchored RIGHT */}
        <div className="container-site relative z-10 pt-32 pb-28 lg:pt-44 lg:pb-36">
          <div className="max-w-lg ml-auto">
            <div className="inline-block text-xs font-medium text-orange bg-orange/10 border border-orange/30 px-4 py-1.5 rounded-full uppercase tracking-widest mb-6">
              Freshman Year to Career
            </div>
            <h1 className="font-heading font-bold text-5xl lg:text-6xl text-cream mb-5 leading-none tracking-tight">
              Career exposure.{" "}
              <span className="text-orange">In their pocket.</span>
            </h1>
            <p className="text-gray-mid text-base lg:text-lg mb-8 leading-relaxed">
              Real internships. Real careers. On the phone
              he already has. Free for every student.
            </p>
            <div className="flex flex-wrap gap-4 mb-6">
              <button
                onClick={() => setQuizOpen(true)}
                className="bg-orange hover:bg-orange-dark text-white font-semibold text-base px-8 py-4 rounded-full transition-colors duration-200 shadow-lg shadow-orange/30"
              >
                Take the Career Quiz
              </button>
              <Link
                href="/donate"
                className="bg-cream/10 hover:bg-cream/20 text-cream font-semibold text-base px-8 py-4 rounded-full transition-colors duration-200 border border-cream/20"
              >
                Support the Mission
              </Link>
            </div>
            {/* App download buttons */}
            <div className="flex flex-wrap gap-3 mb-4">
              <a
                href="https://apps.apple.com/us/app/ambition-shape-your-future/id1557562279"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-cream/10 hover:bg-cream/20 text-cream text-sm font-medium px-4 py-2.5 rounded-xl transition-colors border border-cream/10"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                Download for iOS
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.theambitionapp.ambitionappRN&pcampaignid=web_share"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-cream/10 hover:bg-cream/20 text-cream text-sm font-medium px-4 py-2.5 rounded-xl transition-colors border border-cream/10"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3.18 23.76c.3.17.64.22.99.14l12.45-7.19-2.78-2.78-10.66 9.83zm-1.81-20.1c-.22.3-.35.7-.35 1.18v18.32c0 .48.13.88.36 1.18l.06.06 10.26-10.26v-.24L1.43 3.6l-.06.06zm20.43 8.83l-2.9-1.68-3.06 3.06 3.06 3.06 2.91-1.69c.83-.48.83-1.27-.01-1.75zM4.17.38L16.62 7.57l-2.78 2.78L3.18.52C3.5.35 3.86.28 4.17.38z" />
                </svg>
                Download for Android
              </a>
            </div>
            <p className="text-gray-mid/70 text-xs">
              Free career quiz &middot; No signup required
            </p>
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <section className="bg-ink py-12 lg:py-16 relative overflow-hidden">
        <DoodleStar className="absolute top-4 right-8 w-8 h-8 text-orange/30 rotate-12" />
        <DoodleDots className="absolute bottom-3 left-8 w-16 h-6 text-orange/20" />
        <div className="container-site">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="fade-up stagger-1">
              <AnimatedCounter target="3500" suffix="+" label="Teens reached" />
            </div>
            <div className="fade-up stagger-2">
              <AnimatedCounter target="87" suffix="%" label="From Title I schools" />
            </div>
            <div className="fade-up stagger-3 text-center">
              <div className="font-heading font-bold text-4xl lg:text-5xl text-orange mb-1">
                3 of 4
              </div>
              <div className="text-gray-mid text-sm">Complete the full internship</div>
            </div>
            <div className="fade-up stagger-4">
              <AnimatedCounter target="36" label="States represented" />
            </div>
          </div>
        </div>
      </section>

      {/* THE PROBLEM */}
      <section className="section-pad">
        <div className="container-site">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div>
              <p className="text-xs font-medium text-orange uppercase tracking-widest mb-2 fade-up">
                The Gap
              </p>
              <DoodleSquiggle className="w-20 h-4 text-orange mb-4 fade-up" />
              <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink mb-6 tracking-tight fade-up stagger-1">
                Schools prepare students for tests. Not careers.
              </h2>
              <div className="space-y-4 text-gray-warm leading-relaxed">
                <p className="fade-up stagger-2">
                  Teens from low-income communities graduate knowing academic
                  subjects but not how to navigate a workforce that is changing
                  faster than any curriculum can keep up with.
                </p>
                <p className="fade-up stagger-3">
                  Youth not connected to a viable career path by age 25 face a
                  lifetime of unemployment, poverty, and housing instability. And
                  the programs built to help them have never been able to reach
                  them at scale.
                </p>
                <div className="border-l-4 border-orange pl-6 py-2 fade-up stagger-4">
                  <p className="font-bold text-ink text-xl lg:text-2xl leading-snug">
                    95% of teens have a smartphone. They are on it 8 hours a day.
                    We meet them there.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-orange-light border border-orange/10 rounded-card-lg p-8 lg:p-10 fade-up">
              <div className="space-y-6">
                {[
                  { pct: "95%", label: "of teens own a smartphone" },
                  { pct: "8 hrs", label: "average daily screen time" },
                  { pct: "11%", label: "attend after-school programming" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-5">
                    <div className="font-heading font-bold text-3xl lg:text-4xl text-orange flex-shrink-0 w-24">
                      {item.pct}
                    </div>
                    <div className="text-charcoal text-sm leading-snug">
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* THE SOLUTION */}
      <section className="section-pad bg-ink">
        <div className="container-site">
          <div className="max-w-2xl mb-14">
            <DoodleZigzag className="w-20 h-6 text-orange/60 mb-4" />
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4 fade-up">
              The Ambition Approach
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-cream mb-6 tracking-tight fade-up stagger-1">
              Instead of paying adults to develop young people, we reward teens
              for developing themselves.
            </h2>
            <p className="text-gray-mid text-lg leading-relaxed fade-up stagger-2">
              The Ambition app delivers 30-day simulated internships in real
              careers. 15 minutes a day. Students pick their path, build technical
              and life skills, and earn gift cards when they complete an
              internship.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {pillars.map((p, i) => (
              <div
                key={p.icon}
                className={`bg-cream/5 border border-cream/10 rounded-card p-7 hover:bg-cream/10 hover:shadow-xl hover:shadow-orange/10 hover:-translate-y-1 border-b-2 border-b-transparent hover:border-b-orange/40 transition-all duration-200 cursor-default fade-up stagger-${i + 1}`}
              >
                <div className="font-heading font-bold text-7xl lg:text-8xl text-orange/20 mb-4 leading-none">
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
              className="bg-orange hover:bg-orange-dark text-white font-semibold px-7 py-3.5 rounded-full transition-colors duration-200 text-sm"
            >
              See How the App Works
            </Link>
            <Link
              href="/curriculum"
              className="bg-cream/10 hover:bg-cream/20 text-cream font-semibold px-7 py-3.5 rounded-full transition-colors duration-200 text-sm"
            >
              Explore Internships
            </Link>
          </div>
        </div>
      </section>

      {/* VIDEO SECTION */}
      <section className="section-pad bg-gray-light">
        <div className="container-site">
          <div className="max-w-2xl mx-auto text-center mb-10">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4 fade-up">
              Meet Our Students
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink mb-4 tracking-tight fade-up stagger-1">
              See the mission in action.
            </h2>
            <p className="text-gray-warm leading-relaxed fade-up stagger-2">
              Real students. Real internships. Real futures being built.
            </p>
          </div>
          <div className="max-w-3xl mx-auto rounded-card-lg overflow-hidden bg-ink ring-2 ring-orange/20 aspect-video">
            <video
              className="w-full h-full object-cover"
              controls
              poster="/images/hero-image.jpg"
              preload="none"
            >
              <source src="/images/TeenExampleWebAA%20(2).mp4" type="video/mp4" />
            </video>
          </div>
        </div>
      </section>

      {/* TEAM */}
      <section className="section-pad">
        <div className="container-site">
          <div className="max-w-xl mb-12 relative overflow-visible">
            <DoodleCircle className="absolute -top-6 -right-4 w-16 h-16 text-orange/20" />
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4 fade-up">
              Who Built This
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

      {/* DONATE CTA */}
      <section className="section-pad bg-orange">
        <div className="container-site text-center">
          <p className="text-white/70 text-sm uppercase tracking-widest mb-4 font-medium fade-up">
            Join the Mission
          </p>
          <h2 className="font-heading font-bold text-4xl lg:text-5xl text-white mb-4 max-w-2xl mx-auto leading-tight tracking-tight fade-up stagger-1">
            Your support unlocks their future.
          </h2>
          <div className="w-16 h-1 bg-white/40 mx-auto mb-8 rounded-full fade-up stagger-2" />
          <p className="text-white/80 text-lg mb-10 max-w-prose mx-auto leading-relaxed fade-up stagger-2">
            3 out of 4 teens who start an Ambition internship finish it. Most
            come back for more. A small investment from you can go a long way.
            Become an Ambition Angel today.
          </p>
          <DoodleArrow className="w-16 h-12 text-white/40 mx-auto mb-4 rotate-90" />
          <div className="flex flex-wrap gap-4 justify-center fade-up stagger-3">
            <Link
              href="/donate"
              className="bg-white text-orange hover:bg-orange-light font-semibold px-8 py-4 rounded-full transition-colors duration-200 text-base"
            >
              Donate Now
            </Link>
            <button
              onClick={() => setQuizOpen(true)}
              className="bg-orange-dark hover:bg-ink text-white font-semibold px-8 py-4 rounded-full transition-colors duration-200 text-base border border-white/20"
            >
              Take the Career Quiz
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
