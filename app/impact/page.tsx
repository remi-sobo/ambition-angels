import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Our Impact",
  description:
    "Career exposure is what breaks the cycle of poverty. Here is the data behind the Ambition Angels model.",
};

const stats = [
  { num: "3,500", sup: "+", label: "Teens reached" },
  { num: "36", sup: "", label: "School and nonprofit partners" },
  { num: "14", sup: "%", label: "Increase in action orientation" },
  { num: "4,500", sup: "+", label: "Modules completed" },
];

const gapFacts = [
  {
    num: "40/47",
    title: "Early exposure predicts adult outcomes.",
    body: "Longitudinal studies found teens with career exposure earned 5–10% more in adulthood — after controlling for grades and background.",
  },
  {
    num: "11%",
    title: "Career programs raise lifetime earnings.",
    body: "Higher yearly earnings for teens in career-integrated programs, measured 8 years after graduation.",
  },
];

const howWeRespond = [
  {
    num: "01",
    title: "Career Exposure",
    body: "30-day simulated internships in real careers. 15 minutes a day. On the phone they already have.",
  },
  {
    num: "02",
    title: "Future Orientation",
    body: "Teens connect with possible futures and begin to see themselves as people with choices.",
  },
  {
    num: "03",
    title: "Action Orientation",
    body: "The shift from imagining a future to taking steps toward it. Our highest-gain metric.",
  },
];

const quotes = [
  {
    initials: "DM",
    quote:
      "I never knew what I wanted to do. After the entrepreneurship internship, I started selling custom bracelets at school. I make $200 a month now.",
    name: "Destiny M.",
    grade: "10th Grade · Oakland, CA",
  },
  {
    initials: "MT",
    quote:
      "The wealth management track changed how I think about money. I taught my mom what I learned and I am starting to think I might have a future here.",
    name: "Marcus T.",
    grade: "11th Grade · East Palo Alto, CA",
  },
  {
    initials: "AR",
    quote:
      "I did the nursing internship and it clicked. I know exactly what I'm doing after high school. No one in my family has ever worked in healthcare.",
    name: "Aaliyah R.",
    grade: "12th Grade · Richmond, CA",
  },
];

const research = [
  {
    stat: "40/47",
    finding:
      "Longitudinal studies found teens with early career exposure had better adult employment outcomes, with wage gains of 5 to 10% not uncommon, even after controlling for academic achievement and social background.",
    source: "OECD Career Readiness Review · 2021",
  },
  {
    stat: "By 16",
    finding:
      "Teens who cannot picture a career by age 16 are statistically more likely to be unemployed or disconnected from education and work by their mid-20s.",
    source: "OECD Career Readiness Research · 2021",
  },
  {
    stat: "11%",
    finding:
      "Only 11% of teens attend after-school programming. 95% own a smartphone and spend 8 hours a day on it. We stopped fighting where teens are and started meeting them there.",
    source: "After School Matters · Smartphone ownership data",
  },
];

const measures = [
  {
    tag: "Future Orientation Score",
    title: "Future Orientation",
    body: "Can a teen envision a future for themselves? Do they believe they have choices? Do they feel agency over where their life goes?",
  },
  {
    tag: "Future Orientation Score",
    title: "Action Orientation",
    body: "One element within the FOS and our strongest result. Is a teen taking concrete steps toward a future they can see? Measured across 1,000+ teens, this is where we saw our biggest gain.",
  },
  {
    tag: "Career Exposure",
    title: "Exploration Breadth",
    body: "How many fields and roles has a teen meaningfully engaged with? Broader exploration earlier leads to better decisions later.",
  },
  {
    tag: "Career Exposure",
    title: "Career Conversation Quality",
    body: "Are teens talking to adults about their futures? Mentorship and career conversations are independently proven to improve labor market outcomes.",
  },
];

const pilotConditions = [
  {
    label: "Condition A",
    title: "Incentive Only",
    body: "Gift card rewards for completing program tracks. Baseline comparison group.",
  },
  {
    label: "Condition B",
    title: "Incentive + Adult Engagement",
    body: "Incentives plus a parent, counselor, or mentor using our adult engagement tools.",
  },
  {
    label: "Condition C",
    title: "Adult Engagement Only",
    body: "No incentive. Tests whether intrinsic motivation guided by a caring adult creates more durable change.",
  },
];

const pilotMeta = [
  {
    label: "Sample Size",
    value: "200–300 teens",
    sub: "Across existing school and nonprofit partners",
  },
  {
    label: "Timeline",
    value: "2026",
    sub: "Pre-pilot Q2 · Full results by year end",
  },
  {
    label: "Evaluation Partner",
    value: "Empathy Labs",
    sub: "Future Orientation Score (FOS) measurement and analysis",
  },
];

export default function ImpactPage() {
  return (
    <>
      {/* PAGE HEADER */}
      <section
        className="relative pt-32 pb-24 lg:pt-44 lg:pb-32 bg-ink overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        {/* Curved bottom clip */}
        <div className="absolute bottom-0 left-0 right-0 h-14 bg-cream" style={{ clipPath: "ellipse(55% 100% at 50% 100%)" }} />
        <div className="container-site relative z-10">
          <p className="text-xs font-medium text-orange uppercase tracking-widest mb-5">
            Our Impact
          </p>
          <h1 className="font-heading font-bold text-5xl lg:text-6xl text-cream leading-none tracking-tight mb-5 max-w-2xl">
            Career exposure is one of the most powerful tools we have to help teens break the cycle of poverty.
          </h1>
          <p className="text-gray-mid text-lg max-w-lg leading-relaxed">
            We have the data. Here is what it shows.
          </p>
        </div>
      </section>

      {/* STAT BAR */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-gray-light border-b border-gray-light">
        {stats.map((s) => (
          <div key={s.label} className="bg-cream px-8 py-8 lg:py-10">
            <div className="font-display font-black text-4xl lg:text-5xl text-ink tracking-tight leading-none mb-2">
              {s.num}<span className="text-orange">{s.sup}</span>
            </div>
            <div className="text-gray-warm text-sm leading-snug max-w-[180px]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* THE GAP */}
      <section className="section-pad bg-gray-light">
        <div className="container-site">
          <p className="text-xs font-medium text-orange uppercase tracking-widest mb-3">
            The Problem
          </p>
          <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight mb-4">
            The gap is not ambition. It is access.
          </h2>
          <p className="text-gray-warm text-base leading-relaxed max-w-2xl mb-12">
            Teens from low-income communities graduate knowing academic subjects — not how to navigate a workforce that is changing faster than any curriculum can keep up with. Career exposure is a proven pathway toward economic mobility. And right now, it is not equally distributed.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-20">
            {/* Facts */}
            <div className="flex flex-col gap-4">
              {gapFacts.map((f) => (
                <div
                  key={f.title}
                  className="bg-cream border border-gray-light rounded-card p-5 flex items-start gap-5 shadow-sm"
                >
                  <div className="font-display font-black text-3xl text-orange tracking-tight leading-none flex-shrink-0 min-w-[72px]">
                    {f.num}
                  </div>
                  <div className="pt-0.5">
                    <p className="font-heading font-semibold text-ink text-sm mb-1">{f.title}</p>
                    <p className="text-gray-warm text-sm leading-relaxed">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* How We Respond */}
            <div>
              <p className="text-xs font-medium text-orange uppercase tracking-widest mb-5">
                How We Respond
              </p>
              <div className="flex flex-col gap-4">
                {howWeRespond.map((item) => (
                  <div
                    key={item.num}
                    className="bg-cream border border-gray-light rounded-card p-5 shadow-sm"
                  >
                    <p className="text-xs font-bold text-orange tracking-widest uppercase mb-2">{item.num}</p>
                    <h3 className="font-heading font-semibold text-ink text-base mb-1">{item.title}</h3>
                    <p className="text-gray-warm text-sm leading-relaxed">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HEADLINE OUTCOME — 14% big card */}
      <section className="section-pad">
        <div className="container-site">
          <p className="text-xs font-medium text-orange uppercase tracking-widest mb-3">
            Our Results
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

            {/* Orange big number card */}
            <div
              className="relative bg-orange rounded-card-lg p-14 text-center overflow-hidden"
              style={{
                backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
            >
              <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/[0.07]" />
              <span className="font-display font-black text-[7rem] lg:text-[9rem] text-white leading-none tracking-tight block">
                14%
              </span>
              <p className="text-white/80 text-base leading-relaxed mt-4">
                <strong className="text-white font-bold block mb-1">Increase in Action Orientation — the highest-gain dimension within our Future Orientation Score (FOS).</strong>
              </p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-white/40">
                Pre and post · 1,000+ teens
              </p>
            </div>

            {/* Copy */}
            <div>
              <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight mb-5">
                Teens do not just feel better about the future. They act on it.
              </h2>
              <div className="space-y-4 text-gray-warm leading-relaxed">
                <p>
                  The Future Orientation Score (FOS) tracks how teens think about and move toward their futures across multiple dimensions. We measure before and after every program cycle.
                </p>
                <p>
                  Action Orientation — one element within the FOS — measures whether a teen is actually taking steps toward a career, not just imagining one. Across 1,000+ teens, it showed the biggest improvement of any dimension we track.
                </p>
                <p className="font-semibold text-ink">
                  Career exposure alone does not break the cycle of poverty. But teens who can see a path — and start walking it — have a meaningfully better shot.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STUDENT VOICES */}
      <section className="section-pad bg-gray-light">
        <div className="container-site">
          <p className="text-xs font-medium text-orange uppercase tracking-widest mb-3">
            From the Students
          </p>
          <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight mb-10">
            What action looks like.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {quotes.map((q) => (
              <div key={q.name} className="bg-cream rounded-card-lg p-7 flex flex-col shadow-sm">
                <div className="font-display font-black text-4xl text-orange leading-none mb-4">&ldquo;</div>
                <blockquote className="text-charcoal text-sm leading-relaxed flex-1 mb-6">
                  {q.quote}
                </blockquote>
                <div className="flex items-center gap-3 pt-4 border-t border-gray-light">
                  <div className="w-9 h-9 rounded-full bg-orange-light border border-orange/20 flex items-center justify-center flex-shrink-0">
                    <span className="font-heading font-bold text-orange text-xs">{q.initials}</span>
                  </div>
                  <div>
                    <div className="font-heading font-semibold text-ink text-sm">{q.name}</div>
                    <div className="text-gray-warm text-xs">{q.grade}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RESEARCH — dark */}
      <section
        className="section-pad bg-ink relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site relative z-10">
          <p className="text-xs font-medium text-orange uppercase tracking-widest mb-3">
            The Evidence Base
          </p>
          <h2 className="font-heading font-bold text-4xl lg:text-5xl text-cream tracking-tight leading-tight mb-10 max-w-3xl">
            We did not invent the link between career exposure and economic mobility. We built a program to help deliver it at scale.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/[0.08] rounded-card-lg overflow-hidden border border-white/[0.08]">
            {research.map((r) => (
              <div key={r.stat} className="bg-[#1a1d27] p-8">
                <div className="font-display font-black text-4xl text-orange tracking-tight leading-none mb-5">
                  {r.stat}
                </div>
                <p className="text-gray-mid text-sm leading-relaxed mb-5">{r.finding}</p>
                <p className="text-xs font-semibold uppercase tracking-widest text-white/25 border-t border-white/[0.07] pt-4">
                  {r.source}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT WE MEASURE */}
      <section className="section-pad bg-gray-light">
        <div className="container-site">
          <p className="text-xs font-medium text-orange uppercase tracking-widest mb-3">
            Our Evaluation Framework
          </p>
          <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight mb-3">
            What we track.
          </h2>
          <p className="text-gray-warm text-base leading-relaxed max-w-xl mb-10">
            Two areas. One question: does this program put teens on a different economic trajectory?
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {measures.map((m) => (
              <div
                key={m.title}
                className="bg-cream border-t-[3px] border-orange border border-gray-light rounded-card p-7 shadow-sm"
              >
                <span className="inline-block text-xs font-bold uppercase tracking-widest text-orange bg-orange-light rounded px-2 py-0.5 mb-3">
                  {m.tag}
                </span>
                <h3 className="font-heading font-semibold text-ink text-base mb-2">{m.title}</h3>
                <p className="text-gray-warm text-sm leading-relaxed">{m.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PILOT — dark */}
      <section
        className="section-pad bg-ink relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site relative z-10">
          <p className="text-xs font-medium text-orange uppercase tracking-widest mb-3">
            What&apos;s Next
          </p>
          <h2 className="font-heading font-bold text-4xl lg:text-5xl text-cream tracking-tight leading-tight mb-3">
            Proving what works at scale.
          </h2>
          <p className="text-gray-mid text-base leading-relaxed max-w-xl mb-10">
            We have shown we can move teens. The 2026 pilot answers the next question: what moves them most?
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">

            {/* Conditions */}
            <div className="flex flex-col gap-4">
              {pilotConditions.map((c) => (
                <div
                  key={c.label}
                  className="bg-white/[0.04] border border-white/[0.09] rounded-card p-5"
                >
                  <p className="text-xs font-bold uppercase tracking-widest text-orange mb-2">{c.label}</p>
                  <h4 className="font-heading font-bold text-cream text-base mb-1">{c.title}</h4>
                  <p className="text-gray-mid text-sm leading-relaxed">{c.body}</p>
                </div>
              ))}
            </div>

            {/* Meta */}
            <div className="flex flex-col gap-5">
              {pilotMeta.map((m, i) => (
                <div
                  key={m.label}
                  className={`pb-5 ${i < pilotMeta.length - 1 ? "border-b border-white/[0.06]" : ""}`}
                >
                  <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-1">{m.label}</p>
                  <p className="font-heading font-semibold text-cream text-lg">{m.value}</p>
                  <p className="text-gray-mid text-sm leading-relaxed mt-0.5">{m.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        className="section-pad bg-orange relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        <div className="container-site text-center relative z-10">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-4">
            Join the Mission
          </p>
          <h2 className="font-heading font-bold text-4xl lg:text-5xl text-white tracking-tight leading-tight mb-4 max-w-xl mx-auto">
            Your support unlocks their future.
          </h2>
          <p className="text-white/80 text-lg leading-relaxed max-w-md mx-auto mb-8">
            3 out of 4 teens who start an Ambition internship finish it. Become an Ambition Angel today.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href="/donate"
              data-givebutter-widget="LWq3rp"
              className="bg-white text-orange hover:bg-orange-light font-semibold px-8 py-4 rounded-full transition-colors text-base min-h-[52px] inline-flex items-center"
            >
              Donate Now
            </a>
            <a
              href="mailto:remi@ambitionangels.org"
              className="bg-white/15 hover:bg-white/25 text-white font-semibold px-8 py-4 rounded-full transition-colors text-base border border-white/30 min-h-[52px] inline-flex items-center"
            >
              Get in Touch
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
