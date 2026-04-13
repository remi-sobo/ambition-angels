"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import CareerQuizModal from "@/components/CareerQuizModal";
import IPhoneMockup from "@/components/IPhoneMockup";
import { useDonateModal } from "@/components/DonateModalProvider";

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
    body: "Complete an internship and earn gift cards from brands you actually use. Their time has real value. We honor that.",
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
  const { openModal: openDonateModal } = useDonateModal();

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

      {/* HERO -- split screen */}
      <section className="relative min-h-[92vh] flex overflow-hidden">

        {/* LEFT -- photo fills this column */}
        <div className="relative w-full lg:w-[58%] min-h-[50vh] lg:min-h-0">
          <Image
            src="/images/hero-image.jpg"
            alt="Teen with phone, looking forward"
            fill
            priority
            className="object-cover object-center"
          />
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
            <div className="inline-block text-xs font-medium text-orange bg-orange/10 border border-orange/30 px-4 py-1.5 rounded-full uppercase tracking-widest mb-6">
              Freshman Year to Career
            </div>

            <h1 className="font-display font-black text-6xl lg:text-7xl text-cream mb-5 leading-none tracking-tight uppercase">
              Career<br />
              exposure.<br />
              <span className="text-orange">In their<br />pocket.</span>
            </h1>

            <p className="font-body text-gray-mid text-base lg:text-lg mb-8 leading-relaxed max-w-sm">
              Take internships. See real careers. On the phone they already have. Free for every student.
            </p>

            {/* App store buttons — primary */}
            <p className="text-gray-mid/50 text-xs uppercase tracking-widest font-semibold mb-3">
              Available now — free for every student.
            </p>
            <div className="flex flex-wrap gap-3 mb-6">
              <a
                href="https://apps.apple.com/us/app/ambition-shape-your-future/id1557562279"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 bg-cream text-ink font-semibold px-5 py-3.5 rounded-xl transition-all hover:bg-cream/90 active:scale-95 min-h-[52px] shadow-lg"
              >
                <svg className="w-6 h-6 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                <div className="text-left leading-tight">
                  <div className="text-[10px] font-normal opacity-70">Download on the</div>
                  <div className="text-sm font-bold">App Store</div>
                </div>
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.theambitionapp.ambitionappRN"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 bg-cream text-ink font-semibold px-5 py-3.5 rounded-xl transition-all hover:bg-cream/90 active:scale-95 min-h-[52px] shadow-lg"
              >
                <svg className="w-6 h-6 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3.18 23.76c.3.17.64.22.99.14l12.45-7.19-2.78-2.78-10.66 9.83zm-1.81-20.1c-.22.3-.35.7-.35 1.18v18.32c0 .48.13.88.36 1.18l.06.06 10.26-10.26v-.24L1.43 3.6l-.06.06zm20.43 8.83l-2.9-1.68-3.06 3.06 3.06 3.06 2.91-1.69c.83-.48.83-1.27-.01-1.75zM4.17.38L16.62 7.57l-2.78 2.78L3.18.52C3.5.35 3.86.28 4.17.38z" />
                </svg>
                <div className="text-left leading-tight">
                  <div className="text-[10px] font-normal opacity-70">Get it on</div>
                  <div className="text-sm font-bold">Google Play</div>
                </div>
              </a>
            </div>

            {/* Secondary CTAs */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setQuizOpen(true)}
                className="bg-orange hover:bg-orange-dark text-white font-semibold text-base px-8 py-4 rounded-full transition-colors duration-200 shadow-lg shadow-orange/30 min-h-[52px]"
              >
                Take the Career Quiz
              </button>
              <button
                onClick={openDonateModal}
                className="bg-cream/10 hover:bg-cream/20 text-cream font-semibold text-base px-8 py-4 rounded-full transition-colors duration-200 border border-cream/20 min-h-[52px] inline-flex items-center"
              >
                Support the Mission
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <section
        className="bg-ink py-12 lg:py-16 relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site relative z-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="fade-up stagger-1 text-center">
              <div className="font-display font-black text-5xl lg:text-6xl text-orange mb-1 tracking-tight">3,500+</div>
              <div className="text-gray-mid text-sm">Teens reached</div>
            </div>
            <div className="fade-up stagger-2 text-center">
              <div className="font-display font-black text-5xl lg:text-6xl text-orange mb-1 tracking-tight">87%</div>
              <div className="text-gray-mid text-sm">From Title I schools</div>
            </div>
            {/* 14% stat — dashed oval centered on the number */}
            <div className="fade-up stagger-3 text-center">
              <div className="relative inline-block align-top">
                <Image
                  src="/images/doodles/Doodle 70@3x.png"
                  alt=""
                  width={280}
                  height={200}
                  className="opacity-20 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <div className="font-display font-black text-5xl lg:text-6xl text-orange mb-1 tracking-tight relative z-10">14%</div>
              </div>
              <div className="text-gray-mid text-sm">Increase in future orientation</div>
            </div>
            <div className="fade-up stagger-4 text-center">
              <div className="font-display font-black text-5xl lg:text-6xl text-orange mb-1 tracking-tight">4,500+</div>
              <div className="text-gray-mid text-sm">Modules completed</div>
            </div>
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
                  subjects but not how to navigate a workforce that is changing
                  faster than any curriculum can keep up with.
                </p>
                <p className="fade-up stagger-3">
                  Youth not connected to a viable career path by age 25 are more
                  likely to face unemployment, poverty, and housing instability. And
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
                  { pct: "11%", label: "attend after-school programming" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-5">
                    <div className="font-display font-black text-3xl lg:text-4xl text-orange flex-shrink-0 w-24 tracking-tight">
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

      {/* DOODLE DIVIDER */}
      <div className="bg-cream flex justify-center py-2 overflow-hidden">
        <Image src="/images/doodles/Doodle 54@3x.png" alt="" width={200} height={40} className="opacity-40" aria-hidden="true" />
      </div>

      {/* THE SOLUTION */}
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
              See How the App Works
            </Link>
            <Link
              href="/curriculum"
              className="bg-cream/10 hover:bg-cream/20 text-cream font-semibold px-7 py-3.5 rounded-full transition-colors duration-200 text-sm min-h-[44px] inline-flex items-center"
            >
              Explore Internships
            </Link>
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
                className={`bg-[#1a1a1a] border border-white/10 rounded-card-lg p-7 hover:border-white/20 hover:-translate-y-0.5 transition-all duration-200 fade-up stagger-${i + 1} flex flex-col`}
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

      {/* APP SHOWCASE */}
      <section
        className="section-pad bg-[#F5F4F0] relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.07) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

            {/* Text */}
            <div>
              <p className="text-xs font-medium text-orange uppercase tracking-widest mb-3">The App</p>
              <h2 className="font-display font-black text-5xl lg:text-6xl text-[#0E0E0E] mb-6 leading-none tracking-tight uppercase">
                Built for the<br /><span className="text-orange">phone they<br />already have.</span>
              </h2>
              <p className="text-charcoal text-lg leading-relaxed mb-8 max-w-lg">
                30-day simulated internships. 15 minutes a day. Videos, quizzes, and activities designed for the phone screen. Teens pick a career, show up to work, and earn real rewards for finishing.
              </p>
              <div className="flex flex-wrap gap-4">
                <a
                  href="https://apps.apple.com/us/app/ambition-shape-your-future/id1557562279"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-orange hover:bg-orange-dark text-white font-semibold px-7 py-3.5 rounded-full transition-colors text-sm min-h-[44px] inline-flex items-center"
                >
                  Download for iOS
                </a>
                <a
                  href="https://play.google.com/store/apps/details?id=com.theambitionapp.ambitionappRN"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#0E0E0E]/8 hover:bg-[#0E0E0E]/15 text-[#0E0E0E] font-semibold px-7 py-3.5 rounded-full transition-colors text-sm border border-[#0E0E0E]/15 min-h-[44px] inline-flex items-center"
                >
                  Download for Android
                </a>
              </div>
            </div>

            {/* iPhone mockup */}
            <div className="flex justify-center lg:justify-end">
              <IPhoneMockup />
            </div>

          </div>
        </div>
      </section>

      {/* FOR THE ADULTS IN THEIR CORNER */}
      <section
        className="section-pad bg-[#0E0E0E] relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site relative z-10">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4 fade-up">
              For the Adults in Their Corner
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-cream mb-5 tracking-tight fade-up stagger-1">
              You care about this kid. Now you can show up for their future.
            </h2>
            <p className="text-gray-mid text-lg leading-relaxed fade-up stagger-2">
              Ambition Angels isn&apos;t just for teens. Parents, coaches, teachers, and mentors get their own portal — follow along with what your teen is learning, and get career conversation prompts designed to deepen their motivation and vision.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
            {/* Left card — FOR THE TEEN */}
            <div
              className="bg-[#1a1a1a] border border-white/10 rounded-card-lg p-8 flex flex-col fade-up stagger-1"
              style={{ borderTop: "3px solid #E8500A" }}
            >
              <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">For the Teen</p>
              <div className="text-4xl mb-4">📱</div>
              <p className="text-white/75 text-sm leading-relaxed flex-1 mb-6">
                Download the app. Pick a career internship. Show up 15 minutes a day. Earn real rewards for finishing.
              </p>
              <a
                href="https://apps.apple.com/us/app/ambition-shape-your-future/id1557562279"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange font-semibold text-sm hover:text-orange-dark transition-colors"
              >
                Get the App &rarr;
              </a>
            </div>

            {/* Right card — FOR YOU COMING SOON */}
            <div
              className="bg-[#1a1a1a] border border-white/10 rounded-card-lg p-8 flex flex-col fade-up stagger-2"
              style={{ borderTop: "3px solid #E8500A" }}
            >
              <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">For You — Coming Soon</p>
              <div className="text-4xl mb-4">🧭</div>
              <p className="text-white/75 text-sm leading-relaxed flex-1 mb-6">
                We&apos;re building a Guide portal for parents, coaches, teachers, and mentors. Follow along with what your teen is learning and get career conversation prompts designed to deepen their motivation.
              </p>
              <Link
                href="/for-adults"
                className="text-orange font-semibold text-sm hover:text-orange-dark transition-colors"
              >
                Join the Waitlist &rarr;
              </Link>
            </div>
          </div>

          <p className="text-center text-orange text-sm font-semibold fade-up">
            The teen experience is live now. The Guide portal is coming — get early access.
          </p>
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

    </>
  );
}
