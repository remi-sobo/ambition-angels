import type { Metadata } from "next";
import Image from "next/image";
import DonateFaq from "@/components/DonateFaq";

export const metadata: Metadata = {
  title: "Donate",
  description:
    "Help teens reach their full potential. Your gift puts real career exposure in the pocket of every student who needs it.",
};

export default function DonatePage() {
  return (
    <>
      {/* HERO — split screen, photo + copy */}
      <section className="relative min-h-[85vh] flex overflow-hidden">

        {/* LEFT — teen photo */}
        <div className="relative hidden lg:block lg:w-[48%]">
          <Image
            src="/images/yingchou-han-IJrIeCs3D4g-unsplash.jpg"
            alt="Teen discovering their future through career exposure"
            fill
            priority
            className="object-cover object-center"
          />
          {/* Gradient blend into right panel */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-ink/60" />
          {/* Quote pinned over photo */}
          <div className="absolute bottom-10 left-8 right-8 lg:right-16">
            <blockquote className="text-white text-sm leading-relaxed italic bg-ink/60 backdrop-blur-sm rounded-card p-4 border-l-4 border-orange">
              &ldquo;Every individual has massive potential. When teens are set on a pathway to an economically empowered future, we all benefit.&rdquo;
              <cite className="block mt-2 not-italic text-gray-mid text-xs">Remi Sobomehin, Founder &amp; CEO</cite>
            </blockquote>
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
            src="/images/doodles/Doodle 60@3x.png"
            alt=""
            width={140}
            height={120}
            className="absolute top-8 right-8 opacity-15 rotate-12 pointer-events-none"
            aria-hidden="true"
          />

          <div className="px-8 lg:px-14 py-24 pt-36 lg:pt-24 max-w-xl w-full">
            <div className="inline-block text-xs font-medium text-orange bg-orange/10 border border-orange/30 px-4 py-1.5 rounded-full uppercase tracking-widest mb-6">
              Become an Ambition Angel
            </div>

            <h1 className="font-display font-black text-5xl lg:text-6xl text-cream mb-5 leading-none tracking-tight uppercase">
              A small bet.<br />
              A <span className="text-orange">massive</span><br />
              return.
            </h1>

            <p className="text-gray-mid text-lg leading-relaxed mb-4 max-w-sm">
              3 out of 4 teens who start an Ambition internship finish it. Most come back for more. Your gift makes that possible for every student who needs it.
            </p>

            <div className="flex flex-wrap gap-3 mb-8">
              {[
                { label: "3,500+", sub: "teens reached" },
                { label: "87%", sub: "Title I schools" },
                { label: "Free", sub: "for every student" },
              ].map((s) => (
                <div key={s.sub} className="bg-cream/5 border border-cream/10 rounded-card px-4 py-3">
                  <div className="font-display font-black text-xl text-orange tracking-tight">{s.label}</div>
                  <div className="text-gray-mid text-xs">{s.sub}</div>
                </div>
              ))}
            </div>

            <a
              href="/donate"
              data-givebutter-widget="LWq3rp"
              className="bg-orange hover:bg-orange-dark text-white font-semibold text-base px-8 py-4 rounded-full transition-colors shadow-lg shadow-orange/30 min-h-[52px] inline-flex items-center"
            >
              Donate Now
            </a>
          </div>
        </div>
      </section>

      {/* GIVE TODAY — popup CTA */}
      <section
        className="section-pad bg-orange-light relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.12) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      >
        <div className="container-site relative z-10 text-center">
          <p className="text-xs font-medium text-orange uppercase tracking-widest mb-3">
            Give Today
          </p>
          <h2 className="font-heading font-bold text-3xl lg:text-4xl text-ink mb-3">
            Every dollar goes to work immediately.
          </h2>
          <p className="text-gray-warm text-lg max-w-xl mx-auto mb-8">
            Ambition Angels is a US 501(c)(3). Your gift is tax-deductible. EIN 87-2513010.
          </p>
          <a
            href="/donate"
            data-givebutter-widget="LWq3rp"
            className="bg-orange hover:bg-orange-dark text-white font-semibold text-base px-10 py-4 rounded-full transition-colors shadow-lg shadow-orange/30 min-h-[52px] inline-flex items-center"
          >
            Donate Now
          </a>
        </div>
      </section>

      {/* THE STORY — full bleed, emotional */}
      <section className="section-pad">
        <div className="container-site">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

            {/* Text */}
            <div>
              <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
                Why This Matters
              </p>
              <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink mb-6 leading-tight">
                Only 11% of teens attend after-school programs. 95% have a smartphone.
              </h2>
              <div className="space-y-4 text-gray-warm leading-relaxed">
                <p>
                  Remi Sobomehin grew up in Portland, attended his father&apos;s community nonprofit as a kid, and made it to Stanford. Not because of luck. Because the right support showed up at the right time.
                </p>
                <p>
                  After graduating, he went to East Palo Alto and got to work. He kept hitting the same wall: he could not get teens to show up. Meanwhile his co-founder Demetric was at Facebook watching teens spend 8 hours a day on their phones.
                </p>
                <div className="border-l-4 border-orange pl-6 py-2">
                  <p className="font-bold text-ink text-lg leading-snug">
                    That is not a crisis to solve. That is the most powerful channel in the history of youth development.
                  </p>
                </div>
                <p>
                  So they built for it. Ambition meets teens where they already are and gives them what no one else will: a real look at what a career feels like before they have to choose one.
                </p>
              </div>
            </div>

            {/* Founder photos stacked */}
            <div className="grid grid-cols-2 gap-4">
              <div className="relative rounded-card-lg overflow-hidden aspect-[3/4]">
                <Image
                  src="/images/Remi-Sobomehin_edited_edited.jpg"
                  alt="Remi Sobomehin, CEO"
                  fill
                  className="object-cover object-top"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-ink/80 to-transparent p-4">
                  <div className="font-heading font-semibold text-cream text-sm">Remi Sobomehin</div>
                  <div className="text-gray-mid text-xs">Founder &amp; CEO</div>
                </div>
              </div>
              <div className="relative rounded-card-lg overflow-hidden aspect-[3/4] mt-8">
                <Image
                  src="/images/deme_edited.jpg"
                  alt="Demetric Sanders, Tech Partner"
                  fill
                  className="object-cover object-center"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-ink/80 to-transparent p-4">
                  <div className="font-heading font-semibold text-cream text-sm">Demetric Sanders</div>
                  <div className="text-gray-mid text-xs">Tech Partner</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* IMPACT — 3 bold cards with texture */}
      <section
        className="section-pad bg-ink relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <Image
          src="/images/doodles/Doodle 54@3x.png"
          alt=""
          width={160}
          height={50}
          className="absolute bottom-10 right-10 opacity-15 pointer-events-none"
          aria-hidden="true"
        />
        <div className="container-site relative z-10">
          <div className="max-w-xl mb-12">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
              Every Dollar You Give Does Work
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-cream leading-tight">
              Your gift does three things.
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[
              {
                num: "01",
                label: "Invest",
                body: "Your gift gives teens access to career internships and the exposure they need to find a future worth chasing. Completely free to every student who downloads the app.",
              },
              {
                num: "02",
                label: "Innovate",
                body: "Donations power new curriculum and the student rewards that keep teens engaged, motivated, and coming back for more. They earn gift cards. You fund the future.",
              },
              {
                num: "03",
                label: "Impact",
                body: "See the real difference your support makes through updates, data, and student stories. We report honestly on outcomes because you deserve to know your gift is working.",
              },
            ].map((col) => (
              <div
                key={col.label}
                className="bg-cream/5 border border-cream/10 rounded-card-lg p-8 hover:bg-cream/10 hover:border-orange/30 transition-all duration-200 group"
              >
                <div className="font-display font-black text-7xl text-orange/20 leading-none mb-4 tracking-tight group-hover:text-orange/30 transition-colors">
                  {col.num}
                </div>
                <h3 className="font-heading font-bold text-xl text-cream mb-3">
                  {col.label}
                </h3>
                <p className="text-gray-mid text-sm leading-relaxed">{col.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section
        className="bg-orange py-14 lg:py-20 relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        <div className="container-site relative z-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { number: "3,500+", label: "Teens reached" },
              { number: "87%", label: "From Title I schools" },
              { number: "3 of 4", label: "Complete the full internship" },
              { number: "36", label: "States represented" },
            ].map((stat) => (
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

      {/* TEEN HERO IMAGE — full bleed emotional moment */}
      <section className="relative h-72 lg:h-96 overflow-hidden">
        <Image
          src="/images/hero-image.jpg"
          alt="Teen on phone, discovering their future through the Ambition app"
          fill
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/70 via-ink/30 to-transparent" />
        <div className="absolute inset-0 flex items-center">
          <div className="container-site">
            <p className="text-white/70 text-sm uppercase tracking-widest mb-2 font-medium">Their future is now</p>
            <h2 className="font-display font-black text-4xl lg:text-6xl text-white leading-none uppercase max-w-lg">
              This is who you are investing in.
            </h2>
          </div>
        </div>
      </section>

      {/* SECOND DONATE CTA */}
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
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-10 pointer-events-none"
          aria-hidden="true"
        />
        <div className="container-site text-center relative z-10">
          <p className="text-white/70 text-sm uppercase tracking-widest mb-4 font-medium">
            Ready to give?
          </p>
          <h2 className="font-heading font-bold text-3xl lg:text-4xl text-cream mb-4 max-w-2xl mx-auto leading-tight">
            Your support unlocks their future.
          </h2>
          <p className="text-gray-mid text-lg mb-10 max-w-prose mx-auto leading-relaxed">
            Ambition Angels is a 501(c)(3) nonprofit. Every gift is tax-deductible. And every dollar goes toward putting career exposure in the pocket of a teen who needs it.
          </p>
          <a
            href="/donate"
            data-givebutter-widget="LWq3rp"
            className="bg-orange hover:bg-orange-dark text-white font-semibold px-10 py-4 rounded-full transition-colors shadow-lg shadow-orange/30 text-base min-h-[52px] inline-flex items-center"
          >
            Donate Now
          </a>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-pad border-t border-gray-light">
        <div className="container-site">
          <div className="max-w-2xl mx-auto">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
              Questions About Giving
            </p>
            <h2 className="font-heading font-bold text-3xl lg:text-4xl text-ink mb-10">
              Everything you need to know.
            </h2>
            <DonateFaq />
          </div>
        </div>
      </section>
    </>
  );
}
