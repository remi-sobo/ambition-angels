import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import AppDemo from "@/components/AppDemo";
import DashboardMockup from "@/components/DashboardMockup";
import AnimatedCounter from "@/components/AnimatedCounter";
import AppStoreButtons from "@/components/AppStoreButtons";
import { HEADLINE_STATS } from "@/lib/stats";

export const metadata: Metadata = {
  title: "The Platform",
  description:
    "Ambition delivers real careers through thirty-day simulated internships. In the classroom on the web, in their pocket on the phone. Free for every student.",
};

// Slim recap of the three-step framework. Tighter than the original cards
// because the AppDemo above has already done the storytelling.
const recapSteps = [
  {
    number: "01",
    title: "Pick",
    body: "Entrepreneurship. Nursing. Game design. Wealth management. Careers they might never have considered.",
  },
  {
    number: "02",
    title: "Show up",
    body: "30 days. 15 minutes a day. In class on the web, everywhere else on the phone.",
  },
  {
    number: "03",
    title: "Leave with a direction",
    body: "What the work feels like, what it pays, and what the path in looks like. Then they try another one.",
  },
];

// The four regions of the Guide dashboard, walked through under the mockup.
const dashboardRegions = [
  {
    title: "The roster",
    body: "Every student, their current internship, progress, and last activity — on track, making progress, or needs a check-in.",
  },
  {
    title: "The student spotlight",
    body: "One student at a time, in depth: where they are in the internship, how far they've come, and the skills they're building.",
  },
  {
    title: "The prompts",
    body: "Career conversation questions tied to the exact internship each student is in right now. Not generic. Ready before you sit down.",
  },
  {
    title: "The follow-ups",
    body: "The students who went quiet surface at the top of your week, with a note you can send in one click.",
  },
];

export default function TheAppPage() {
  return (
    <>
      {/* HERO — split screen */}
      <section className="relative min-h-[90vh] flex overflow-hidden">

        {/* LEFT — photo */}
        <div className="relative hidden lg:block lg:w-[52%] min-h-full">
          <Image
            src="/images/teens-group-phone.jpg"
            alt="Four teens laughing together while looking at a phone"
            fill
            priority
            className="object-cover object-center"
          />
          {/* Dark overlay at bottom for depth */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-ink/40" />
          {/* Badge pinned over the photo */}
          <div className="absolute bottom-10 left-8 bg-orange text-white text-xs font-semibold px-4 py-2 rounded-full uppercase tracking-widest shadow-lg">
            Free for every student
          </div>
        </div>

        {/* RIGHT — ink panel */}
        <div
          className="relative flex-1 bg-ink flex items-center"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        >
          {/* Doodle accent */}
          <Image
            src="/images/doodles/Doodle 62@3x.png"
            alt=""
            width={100}
            height={100}
            className="absolute bottom-10 right-8 opacity-20 rotate-12"
            aria-hidden="true"
          />

          <div className="px-8 lg:px-14 py-24 pt-36 lg:pt-24 max-w-xl w-full">
            <div className="inline-block text-xs font-medium text-orange bg-orange/10 border border-orange/30 px-4 py-1.5 rounded-full uppercase tracking-widest mb-6">
              The Ambition Platform
            </div>

            <h1 className="font-display font-black text-6xl lg:text-7xl text-cream mb-5 leading-none tracking-tight uppercase">
              Where<br />
              careers<br />
              <span className="text-orange">get<br />started.</span>
            </h1>

            <p className="text-gray-mid text-lg leading-relaxed mb-10 max-w-sm">
              30-day simulated internships. 15 minutes a day. On the web during class or program time, on the phone everywhere else.
            </p>

            <AppStoreButtons variant="pill" theme="dark" source="the_app_hero" />
          </div>
        </div>
      </section>

      {/* INSIDE THE APP — interactive demo */}
      <section id="demo" className="section-pad scroll-mt-24">
        <div className="container-site">
          <div className="max-w-2xl mb-12 fade-up">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
              Inside the App
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink leading-tight tracking-tight">
              A day in Ashley&apos;s ambition.
            </h2>
            <p className="text-gray-warm text-lg leading-relaxed mt-5 max-w-xl">
              Five days in. $15 earned. $85 to go. Tap through it.
            </p>
          </div>

          <AppDemo />

          {/* Slim three-card recap of the framework */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mt-16 pt-12 border-t border-gray-mid/40 fade-up">
            {recapSteps.map((step) => (
              <div key={step.number} className="relative">
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="font-display font-black text-3xl text-orange/70 leading-none tracking-tight">
                    {step.number}
                  </span>
                  <h3 className="font-heading font-semibold text-lg text-ink">
                    {step.title}
                  </h3>
                </div>
                <p className="text-gray-warm leading-relaxed text-sm">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TWO FORMATS — same student, same internship */}
      <section className="section-pad bg-[#F5F4F0]">
        <div className="container-site">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
              Two Formats, One Internship
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink leading-tight tracking-tight">
              Fourth period on a Chromebook. After practice on their phone.
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-gray-light rounded-card-lg p-8 shadow-sm">
              <div className="inline-block text-xs font-bold text-orange uppercase tracking-widest bg-orange-light border border-orange/20 rounded-full px-3 py-1 mb-5">
                On the web
              </div>
              <h3 className="font-heading font-bold text-ink text-xl mb-3 tracking-tight">
                In class or program time.
              </h3>
              <p className="text-gray-warm text-sm leading-relaxed">
                A school or program puts Ambition in front of every student in the room, on the computers they already use. Advisory, homeroom, a career block — fifteen minutes, and the teacher watches progress while it happens.
              </p>
            </div>
            <div className="bg-white border border-gray-light rounded-card-lg p-8 shadow-sm">
              <div className="inline-block text-xs font-bold text-orange uppercase tracking-widest bg-orange-light border border-orange/20 rounded-full px-3 py-1 mb-5">
                On the phone
              </div>
              <h3 className="font-heading font-bold text-ink text-xl mb-3 tracking-tight">
                Everywhere else.
              </h3>
              <p className="text-gray-warm text-sm leading-relaxed">
                The same student picks the same internship back up on the bus, at home, after practice. Same account, same progress, same thirty days — the internship doesn&apos;t care which screen it&apos;s on.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* THE DASHBOARD — for the adults */}
      <section id="dashboard" className="section-pad scroll-mt-24">
        <div className="container-site">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
              The Dashboard
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink leading-tight tracking-tight mb-5">
              They do the internship. The adults see all of it.
            </h2>
            <p className="text-gray-warm text-lg leading-relaxed">
              Every teacher, counselor, mentor, and parent gets a dashboard built around four things.
            </p>
          </div>

          <DashboardMockup className="max-w-4xl mx-auto mb-12 fade-up" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {dashboardRegions.map((r, i) => (
              <div key={r.title} className="border-t-[3px] border-orange bg-white border border-gray-light rounded-card p-6 shadow-sm">
                <div className="font-display font-black text-3xl text-orange/60 leading-none mb-3 tracking-tight">
                  0{i + 1}
                </div>
                <h3 className="font-heading font-semibold text-ink text-base mb-2">{r.title}</h3>
                <p className="text-gray-warm text-sm leading-relaxed">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THE RESULT — full bleed quote */}
      <section
        className="section-pad bg-ink relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <Image
          src="/images/doodles/Doodle 70@3x.png"
          alt=""
          width={180}
          height={130}
          className="absolute right-16 top-1/2 -translate-y-1/2 opacity-15 pointer-events-none"
          aria-hidden="true"
        />
        <div className="container-site relative z-10">
          <div className="max-w-3xl mx-auto text-center fade-up">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-6">
              The outcome
            </p>
            <h2 className="font-heading font-bold text-3xl lg:text-4xl text-cream mb-6 leading-tight">
              By day 30, a student knows what that career actually feels like.
            </h2>
            <p className="text-gray-mid text-lg leading-relaxed">
              What it pays. Whether it fits. Then they try something else. Marketing. Game design. Wealth management. They start seeing careers they did not know existed. And they start believing those careers are for them.
            </p>
            <p className="text-gray-mid text-lg leading-relaxed mt-4">
              We call that future orientation. A teen&apos;s ability to picture and take real steps toward a future they are excited about. Research shows it is one of the strongest predictors of high school graduation and career entry. We are moving that number.
            </p>
          </div>
        </div>
      </section>

      {/* SKILLS */}
      <section className="section-pad">
        <div className="container-site">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 fade-up">
            <div
              className="bg-orange-light rounded-card-lg p-8 lg:p-10 relative overflow-hidden"
              style={{
                backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.12) 1px, transparent 1px)",
                backgroundSize: "18px 18px",
              }}
            >
              <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
                Technical Skills
              </p>
              <h3 className="font-heading font-bold text-2xl lg:text-3xl text-ink mb-4">
                Job-ready skills from day one.
              </h3>
              <p className="text-gray-warm leading-relaxed">
                Marketing. Sales. Digital design. Product thinking. Students build hands-on experience in the skills employers are actually hiring for.
              </p>
            </div>

            <div
              className="bg-ink rounded-card-lg p-8 lg:p-10 relative overflow-hidden"
              style={{
                backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
                backgroundSize: "18px 18px",
              }}
            >
              <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
                21st-Century Skills
              </p>
              <h3 className="font-heading font-bold text-2xl lg:text-3xl text-cream mb-4">
                Skills that carry through every career and every stage of life.
              </h3>
              <p className="text-gray-mid leading-relaxed">
                Communication. Problem-solving. Empathy. Time management. These are not soft skills. They are the foundation of every career that lasts, especially in this fast-changing world.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <section
        className="bg-orange py-12 lg:py-16 relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        <div className="container-site relative z-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {HEADLINE_STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="font-display font-black text-5xl lg:text-6xl text-white mb-1 tracking-tight">
                  <AnimatedCounter value={stat.value} />
                </div>
                <div className="text-white/80 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NOT IN A SCHOOL OR A PROGRAM? — the app-only path */}
      <section className="section-pad">
        <div className="container-site">
          <div className="max-w-2xl mx-auto text-center fade-up">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">
              Not in a school or a program?
            </p>
            <h2 className="font-heading font-bold text-3xl lg:text-4xl text-ink mb-5 tracking-tight">
              A teen can download Ambition and start today.
            </h2>
            <p className="text-gray-warm text-lg leading-relaxed mb-4">
              Free, same internships, same thirty days. Any adult in their corner can sign up as a Guide.
            </p>
            <p className="text-gray-warm text-base leading-relaxed mb-8">
              Teens going through internships on their own can also earn gift cards for the ones they complete — their time has real value, and we honor it.
            </p>
            <div className="flex flex-wrap gap-4 justify-center items-center">
              <AppStoreButtons variant="pill" theme="light" source="the_app_solo_path" />
              <Link
                href="/for-adults"
                className="bg-transparent hover:bg-ink/5 text-ink font-semibold px-7 py-3.5 rounded-full transition-colors text-sm min-h-[44px] inline-flex items-center border border-ink/20"
              >
                Sign up as a Guide
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* BEYOND THE APP */}
      <section
        className="section-pad bg-ink relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <Image
          src="/images/doodles/Doodle 60@3x.png"
          alt=""
          width={160}
          height={140}
          className="absolute top-8 right-10 opacity-15 -rotate-12 pointer-events-none"
          aria-hidden="true"
        />
        <div className="container-site relative z-10">
          <div className="max-w-2xl mx-auto text-center fade-up">
            <h2 className="font-heading font-bold text-3xl lg:text-4xl text-cream mb-6">
              The app starts it. Real opportunity picks up from there.
            </h2>
            <p className="text-gray-mid text-lg leading-relaxed mb-10">
              Students discover real-world opportunities tailored to their age, experience, interests, and location: internships, post-grad jobs, and trade school programs. The app opens the door. We help them walk through it.
            </p>
            <Link
              href="/curriculum"
              className="inline-flex items-center bg-orange hover:bg-orange-dark text-white font-semibold px-8 py-4 rounded-full transition-colors text-base shadow-lg shadow-orange/20 min-h-[52px]"
            >
              Explore Internships
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
