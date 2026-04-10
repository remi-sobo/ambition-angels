import type { Metadata } from "next";
import Image from "next/image";
import GiveButterEmbed from "@/components/GiveButterEmbed";
import DonateFaq from "@/components/DonateFaq";

export const metadata: Metadata = {
  title: "Donate",
  description:
    "Help teens reach their full potential. Your gift puts real career exposure in the pocket of every student who needs it.",
};

const heroStats = [
  { label: "3,500+", sub: "Teens reached" },
  { label: "87%", sub: "From Title I schools" },
  { label: "14%", sub: "Increase in action orientation" },
  { label: "4,500+", sub: "Modules completed" },
];

export default function DonatePage() {
  return (
    <>
      {/* HERO — two column: copy left, widget right */}
      <section className="relative pt-32 pb-16 lg:pt-44 lg:pb-24 bg-ink overflow-hidden">
        {/* Background photo */}
        <Image
          src="/images/yingchou-han-IJrIeCs3D4g-unsplash.jpg"
          alt=""
          fill
          priority
          className="object-cover object-center"
          aria-hidden="true"
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-ink/70" />
        {/* Dot texture on top */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        <div className="container-site relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">

            {/* LEFT — copy */}
            <div>
              <div className="inline-block text-xs font-medium text-orange bg-orange/10 border border-orange/30 px-4 py-1.5 rounded-full uppercase tracking-widest mb-6">
                Become an Ambition Angel
              </div>

              <h1 className="font-display font-black text-5xl lg:text-6xl text-cream mb-7 leading-none tracking-tight uppercase">
                A small bet.<br />
                A <span className="text-orange">massive</span><br />
                return.
              </h1>

              <blockquote className="border-l-4 border-orange pl-5 mb-8">
                <p className="text-gray-mid text-base lg:text-lg leading-relaxed italic mb-2">
                  &ldquo;Every individual has massive potential. When teens are set on a pathway to an economically empowered future, we all benefit.&rdquo;
                </p>
                <cite className="not-italic text-gray-mid/60 text-sm">
                  — Remi Sobomehin, Founder and CEO
                </cite>
              </blockquote>

              <div className="flex flex-wrap gap-3">
                {heroStats.map((s) => (
                  <div key={s.sub} className="bg-cream/5 border border-cream/10 rounded-card px-4 py-3">
                    <div className="font-display font-black text-xl text-orange tracking-tight">{s.label}</div>
                    <div className="text-gray-mid text-xs">{s.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT — GiveButter widget embedded */}
            <div className="bg-cream rounded-card-lg overflow-hidden shadow-2xl">
              <GiveButterEmbed />
            </div>

          </div>
        </div>
      </section>

      {/* THE STORY */}
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

      {/* YOUR GIFT DOES THREE THINGS */}
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
