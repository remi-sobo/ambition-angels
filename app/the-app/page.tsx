import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "The App",
  description:
    "The Ambition app delivers 30-day simulated internships on the phone teens already have. Free for every student.",
};

const steps = [
  {
    number: "01",
    title: "Pick a career path",
    body: "Students choose from internships in entrepreneurship, sales, game design, dental hygiene, wealth management, and more. Careers they may never have considered. And may end up chasing.",
  },
  {
    number: "02",
    title: "Show up to work for 30 days",
    body: "Each day: a short video, a quiz to lock in the lesson, and activities to practice the skills that career actually requires. Twelve to fifteen minutes. Built for the phone screen.",
  },
  {
    number: "03",
    title: "Earn for your effort",
    body: "Complete an internship and earn money toward a gift card from brands you actually use. Just like the real world we are preparing them for.",
  },
];

const stats = [
  { number: "3,500+", label: "Teens reached" },
  { number: "87%", label: "From Title I schools" },
  { number: "14%", label: "Increase in action orientation" },
  { number: "4,500+", label: "Modules completed" },
];

export default function TheAppPage() {
  return (
    <>
      {/* HERO — split screen */}
      <section className="relative min-h-[90vh] flex overflow-hidden">

        {/* LEFT — photo */}
        <div className="relative hidden lg:block lg:w-[52%] min-h-full">
          <Image
            src="/images/derick-anies-hDJT_ERrB-w-unsplash.jpg"
            alt="Teen looking at their phone, discovering a career path"
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
              The Ambition App
            </div>

            <h1 className="font-display font-black text-6xl lg:text-7xl text-cream mb-5 leading-none tracking-tight uppercase">
              Where<br />
              careers<br />
              <span className="text-orange">get<br />started.</span>
            </h1>

            <p className="text-gray-mid text-lg leading-relaxed mb-10 max-w-sm">
              30-day simulated internships. 15 minutes a day. On the phone they already have.
            </p>

            <div className="flex flex-wrap gap-4">
              <a
                href="https://apps.apple.com/us/app/ambition-shape-your-future/id1557562279"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-orange hover:bg-orange-dark text-white font-semibold text-sm px-7 py-3.5 rounded-full transition-colors shadow-lg shadow-orange/30 min-h-[44px] inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                Download for iOS
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.theambitionapp.ambitionappRN&pcampaignid=web_share"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-cream/10 hover:bg-cream/20 text-cream font-semibold text-sm px-7 py-3.5 rounded-full transition-colors border border-cream/20 min-h-[44px] inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3.18 23.76c.3.17.64.22.99.14l12.45-7.19-2.78-2.78-10.66 9.83zm-1.81-20.1c-.22.3-.35.7-.35 1.18v18.32c0 .48.13.88.36 1.18l.06.06 10.26-10.26v-.24L1.43 3.6l-.06.06zm20.43 8.83l-2.9-1.68-3.06 3.06 3.06 3.06 2.91-1.69c.83-.48.83-1.27-.01-1.75zM4.17.38L16.62 7.57l-2.78 2.78L3.18.52C3.5.35 3.86.28 4.17.38z" />
                </svg>
                Download for Android
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section-pad">
        <div className="container-site">
          <div className="max-w-2xl mb-14">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
              How It Works
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink leading-tight">
              Simulated internships. On their phone. That pay.
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {steps.map((step) => (
              <div key={step.number} className="relative">
                <div className="font-display font-black text-8xl text-orange/15 leading-none mb-4 select-none tracking-tight">
                  {step.number}
                </div>
                <h3 className="font-heading font-semibold text-xl text-ink mb-3">
                  {step.title}
                </h3>
                <p className="text-gray-warm leading-relaxed">{step.body}</p>
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
          <div className="max-w-3xl mx-auto text-center">
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="font-display font-black text-5xl lg:text-6xl text-white mb-1 tracking-tight">
                  {stat.number}
                </div>
                <div className="text-white/80 text-sm">{stat.label}</div>
              </div>
            ))}
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
          <div className="max-w-2xl mx-auto text-center">
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
