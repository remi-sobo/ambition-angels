import type { Metadata } from "next";
import GiveButterWidget from "@/components/GiveButterWidget";
import DonateFaq from "@/components/DonateFaq";

export const metadata: Metadata = {
  title: "Donate",
};

const stats = [
  { number: "3,500+", label: "Teens reached" },
  { number: "87%", label: "From Title I schools" },
  { number: "3 out of 4", label: "Complete the full internship" },
  { number: "36", label: "States represented" },
];

const impactColumns = [
  {
    label: "Invest",
    body: "Your gift gives teens access to career internships and the career exposure they need to find a future worth chasing.",
  },
  {
    label: "Innovate",
    body: "Donations power new curriculum and the student rewards that keep teens engaged, motivated, and coming back.",
  },
  {
    label: "Impact",
    body: "See the real difference your support makes through updates, data, and student stories.",
  },
];

export default function DonatePage() {
  return (
    <>
      {/* HERO */}
      <section className="relative pt-32 pb-24 lg:pt-44 lg:pb-36 bg-orange overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="container-site relative z-10">
          <div className="max-w-3xl">
            <h1 className="font-heading font-bold text-4xl lg:text-6xl text-white mb-6 leading-tight">
              Help teens reach their full potential.
            </h1>
            <p className="text-white/80 text-lg lg:text-xl max-w-2xl leading-relaxed">
              Your gift ensures every young person has the skills and opportunities they need to launch a thriving career. 3 out of 4 students who start an Ambition internship finish it. That does not happen without you.
            </p>
          </div>
        </div>
      </section>

      {/* IMPACT */}
      <section className="section-pad">
        <div className="container-site">
          <div className="max-w-xl mb-12">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
              Every Dollar You Give Does Work
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {impactColumns.map((col) => (
              <div key={col.label} className="flex flex-col">
                <div className="inline-block text-xs font-semibold text-orange bg-orange-light border border-orange/20 px-3 py-1 rounded-full uppercase tracking-widest mb-4 self-start">
                  {col.label}
                </div>
                <p className="text-gray-warm leading-relaxed">{col.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GIVEBUTTER WIDGET */}
      <section className="section-pad bg-gray-light">
        <div className="container-site">
          <GiveButterWidget />
        </div>
      </section>

      {/* STATS */}
      <section className="bg-ink py-12 lg:py-16">
        <div className="container-site">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="font-heading font-bold text-4xl lg:text-5xl text-orange mb-1">
                  {stat.number}
                </div>
                <div className="text-gray-mid text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-pad">
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
