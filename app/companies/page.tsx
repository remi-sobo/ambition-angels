import type { Metadata } from "next";
import IPhoneMockup from "@/components/IPhoneMockup";
import CompaniesContactForm from "./ContactForm";
import PageVisitedEvent from "@/components/PageVisitedEvent";

export const metadata: Metadata = {
  title: "Corporate Partnership — Ambition Angels",
  description:
    "Put your company inside a teen's future. Branded career paths, employee engagement, and measurable CSR impact.",
  robots: "noindex, nofollow",
};

const dotTexture = {
  backgroundImage:
    "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

const heroStats = [
  { label: "3,500+", sub: "Teens reached" },
  { label: "87%", sub: "From Title I schools" },
  { label: "14%", sub: "Increase in future orientation" },
  { label: "1,100+", sub: "Hours of career exploration delivered" },
];

const tickerItems = [
  "Employee Engagement",
  "CSR Impact",
  "Brand with the Next Generation",
  "Tax Deductible",
  "Measurable Outcomes",
  "Talent Pipeline",
  "Category Exclusivity",
];

const opportunityCards = [
  {
    title: "Employee Engagement",
    body: "Your team sits with real student profiles, real career questions, and the actual confusion teens carry about life after high school. They don't pack boxes — they contribute something. The feedback we get from company employees every single time: \"I didn't expect it to hit like that.\"",
  },
  {
    title: "CSR You Can Report",
    body: "Pre and post data. Future orientation scores across 1,000+ teens. Completion rates, demographic breakdown, program reach. Quarterly impact reports. We give you numbers, not narratives. Your ESG team will know what to do with them.",
  },
  {
    title: "Brand with the Next Generation",
    body: "A teen who completes a career internship in your industry — built with your brand throughout — doesn't forget that. Not because of your logo. Because you gave them a real look at what a career in your world actually feels like. That's the kind of thing teens remember.",
  },
];

const tiers = [
  {
    amount: "$25K",
    period: "/year",
    name: "Community Partner",
    highlight: false,
    perks: [
      "Logo on ambitionangels.org and printed materials",
      "Listed as a Community Partner publicly",
      "Annual impact report with program data",
      "1–2 company fun facts featured inside the app",
      "Invitation to sponsor an existing internship track",
    ],
  },
  {
    amount: "$50K",
    period: "/year",
    name: "Career Builder",
    highlight: false,
    perks: [
      "Everything in Community Partner",
      "1 sponsored simulated internship — sponsor an existing track or co-create a new one",
      "Company profile featured inside the app",
      "1 live engagement event with your team",
      "Biannual impact reports with completion data",
      "Co-branded social content package",
    ],
  },
  {
    amount: "$100K",
    period: "/year",
    name: "Premier Partner",
    highlight: true,
    perks: [
      "Everything in Career Builder",
      "3 sponsored simulated internships — existing tracks or co-created with your team",
      "Premier Partner badge across the platform",
      "2 live engagement events per year",
      "Co-branded marketing and press release",
      "Named in Ambition Angels annual report",
    ],
  },
  {
    amount: "$150K+",
    period: "/year",
    name: "Founding Partner",
    highlight: false,
    perks: [
      "Everything in Premier Partner",
      "In-app popup feature for your brand",
      "Naming opportunity on a program or cohort",
      "Category exclusivity — one company per industry",
      "Executive briefings with Remi quarterly",
      "Board-level relationship and access",
    ],
  },
];

const whyCards = [
  {
    title: "Fully Tax-Deductible",
    body: "Ambition Angels is a registered 501(c)(3). EIN 87-2513010. Every dollar is a deductible charitable contribution.",
  },
  {
    title: "Employee Engagement That Lands",
    body: "Your people want to do something that matters. This is specific, real, and they'll talk about it. Not a box-packing day.",
  },
  {
    title: "Reportable CSR Impact",
    body: "Pre and post data. Future orientation scores. Completion rates. Demographic reach. We give you what your ESG team needs to report.",
  },
  {
    title: "Talent Pipeline",
    body: "The teens exploring your industry today are your candidates in 5 years. Early exposure creates early affinity. Your next great hire is probably already in the app.",
  },
  {
    title: "Brand Before They Choose",
    body: "Reach teens before they've formed brand loyalty. A career track builds real, earned connection. They'll remember you for the right reason.",
  },
  {
    title: "Category Exclusivity",
    body: "Premier and Founding Partners get exclusive category rights. One company per industry. Own the space before someone else does.",
  },
];

function CheckIcon({ light = false }: { light?: boolean }) {
  return (
    <svg
      className={`w-3 h-3 flex-shrink-0 mt-0.5 ${light ? "text-white" : "text-orange"}`}
      fill="none"
      viewBox="0 0 12 12"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
    </svg>
  );
}

export default function CompaniesPage() {
  return (
    <>
      <PageVisitedEvent name="companies_page_visited" />
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="bg-ink section-pad relative overflow-hidden" style={dotTexture}>
        <div className="container-site relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">

            {/* Left — copy */}
            <div className="pt-4 lg:pt-8">
              <div className="inline-block text-xs font-bold text-orange bg-orange/10 border border-orange/30 px-4 py-1.5 rounded-full uppercase tracking-widest mb-6">
                Corporate Partnership
              </div>
              <h1 className="font-display font-black text-5xl lg:text-6xl xl:text-7xl text-cream mb-6 leading-none tracking-tight uppercase">
                Put your company inside a teen&apos;s future.
              </h1>
              <p className="text-gray-mid text-lg leading-relaxed mb-10 max-w-lg">
                Teens who do a 30-day career internship on our app — in your industry, with your brand throughout — remember that. We&apos;re building the workforce pipeline one simulated internship at a time. Come in early.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href="#contact"
                  className="bg-orange hover:bg-orange-dark text-white font-semibold px-8 py-4 rounded-full transition-colors text-base min-h-[52px] inline-flex items-center justify-center"
                >
                  Become a Partner
                </a>
                <a
                  href="#tiers"
                  className="bg-cream/5 hover:bg-cream/10 text-cream border border-cream/20 font-semibold px-8 py-4 rounded-full transition-colors text-base min-h-[52px] inline-flex items-center justify-center"
                >
                  See the tiers
                </a>
              </div>
            </div>

            {/* Right — phone + stats + quote */}
            <div className="flex flex-col gap-5">
              <div className="flex justify-center">
                <IPhoneMockup />
              </div>

              {/* 2×2 stat grid */}
              <div className="grid grid-cols-2 gap-3">
                {heroStats.map((s) => (
                  <div
                    key={s.sub}
                    className="bg-cream/5 border border-cream/10 rounded-card px-4 py-3"
                  >
                    <div className="font-display font-black text-2xl text-orange tracking-tight leading-none mb-1">
                      {s.label}
                    </div>
                    <div className="text-gray-mid text-xs leading-snug">{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Marcus T. quote */}
              <div className="bg-cream/5 border border-orange/25 rounded-card-lg p-5">
                <div className="font-display font-black text-3xl text-orange leading-none mb-3">
                  &ldquo;
                </div>
                <p className="text-cream text-sm leading-relaxed italic mb-4">
                  The wealth management track changed how I think about money. I taught my mom what I learned. I&apos;m starting to think I might have a future here.
                </p>
                <div className="flex items-center gap-3 pt-3 border-t border-cream/10">
                  <div className="w-8 h-8 rounded-full bg-orange/20 border border-orange/30 flex items-center justify-center flex-shrink-0">
                    <span className="font-heading font-bold text-orange text-xs">MT</span>
                  </div>
                  <div>
                    <div className="font-heading font-semibold text-cream text-xs">Marcus T.</div>
                    <div className="text-gray-mid text-xs">11th Grade · East Palo Alto, CA</div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── TICKER ───────────────────────────────────────────────────── */}
      <div className="bg-orange py-4 overflow-hidden" aria-hidden="true">
        <div className="ticker-track">
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <span
              key={i}
              className="flex items-center gap-5 px-7 text-white font-heading font-semibold text-sm uppercase tracking-widest whitespace-nowrap"
            >
              {item}
              <span className="w-1.5 h-1.5 rounded-full bg-white/40 flex-shrink-0" />
            </span>
          ))}
        </div>
      </div>

      {/* ── OPPORTUNITY ──────────────────────────────────────────────── */}
      <section className="section-pad bg-ink relative overflow-hidden" style={dotTexture}>
        <div className="container-site relative z-10">
          <div className="max-w-3xl mb-12">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">
              The Opportunity
            </p>
            <h2 className="font-display font-black text-5xl lg:text-6xl text-cream uppercase tracking-tight leading-none mb-6">
              Most CSR spend disappears.<br className="hidden lg:block" /> This doesn&apos;t.
            </h2>
            <p className="text-gray-mid text-lg leading-relaxed">
              You&apos;ve seen the standard CSR menu. Logo on a banner, a volunteer day, a line in the annual report. Fine. Forgettable. Ambition Angels is different — direct contact with the teens who will define the next workforce, and a story you&apos;ll actually want to tell.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {opportunityCards.map((card) => (
              <div
                key={card.title}
                className="bg-cream/5 border border-cream/10 border-t-[3px] border-t-orange rounded-card-lg p-7 hover:bg-cream/10 transition-colors"
              >
                <h3 className="font-heading font-bold text-cream text-lg mb-3">
                  {card.title}
                </h3>
                <p className="text-gray-mid text-sm leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── THE PROCESS ──────────────────────────────────────────────── */}
      <section className="section-pad bg-[#F5F4F0] relative overflow-hidden">
        <div className="container-site">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">
              The Process
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight mb-4">
              How it actually works.
            </h2>
            <p className="text-gray-warm text-lg leading-relaxed">
              Most of our best career tracks started with a conversation. Here&apos;s how we go from that conversation to content that reaches thousands of teens.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Step 1 — featured dark card */}
            <div
              className="bg-ink rounded-card-lg p-8 relative overflow-hidden"
              style={dotTexture}
            >
              <div className="relative z-10">
                <div className="inline-block text-xs font-bold text-orange bg-orange/15 border border-orange/30 px-3 py-1 rounded-full uppercase tracking-widest mb-5">
                  Step 1
                </div>
                <h3 className="font-heading font-bold text-2xl text-cream mb-4">
                  We bring your people into the room.
                </h3>
                <p className="text-gray-mid text-sm leading-relaxed mb-6">
                  We run a 90-minute session with your team — on Zoom so we can record and capture everything. Your employees don&apos;t present. They respond, react, and share what they know about careers in your world. We take that conversation and build curriculum from it. You choose the focus: a specific career path, or the durable skills your industry needs most right now.
                </p>
                <ul className="space-y-3">
                  {[
                    "Works for groups of any size — we use breakouts for larger teams",
                    "Zoom format lets us record and distill your team's knowledge into curriculum",
                    "You choose the focus: career path-based or durable skills (creativity, critical thinking, communication)",
                    "Pick the employee group you most want to engage — we build around them",
                    "Feeds directly into Step 2 — this conversation becomes the internship",
                    "Impact report and session recording delivered within 2 weeks",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-gray-mid text-sm leading-relaxed">
                      <span className="w-4 h-4 rounded-full bg-orange/20 border border-orange/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <CheckIcon light />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Step 2 — light card */}
            <div className="bg-white border border-gray-light rounded-card-lg p-8">
              <div className="inline-block text-xs font-bold text-orange bg-orange-light border border-orange/20 px-3 py-1 rounded-full uppercase tracking-widest mb-5">
                Step 2
              </div>
              <h3 className="font-heading font-bold text-2xl text-ink mb-4">
                We build the career track together.
              </h3>
              <p className="text-gray-warm text-sm leading-relaxed mb-6">
                What your team shared in the room becomes the foundation. We handle all production — videos, quizzes, activities built for a 15-minute daily session on a phone screen. Your team reviews drafts, keeps it accurate, and updates it as your industry changes. The result is a 30-day simulated internship that reflects how careers in your field actually work.
              </p>
              <ul className="space-y-3">
                {[
                  "3 career paths in your industry — we handle all production",
                  "Your team validates accuracy and keeps content current as the industry evolves",
                  "4 videos and 1 quiz per path — designed for 15 minutes a day on a phone",
                  "Your brand lives throughout as the source of truth, not as a sponsor",
                  "Quarterly data on completions, engagement, and career interest generated",
                  "Co-branded launch with press opportunity",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-gray-warm text-sm leading-relaxed">
                    <span className="w-4 h-4 rounded-full bg-orange-light border border-orange/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckIcon />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── PARTNERSHIP TIERS ────────────────────────────────────────── */}
      <section
        id="tiers"
        className="section-pad bg-ink relative overflow-hidden"
        style={dotTexture}
      >
        <div className="container-site relative z-10">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">
              Partnership Tiers
            </p>
            <h2 className="font-display font-black text-5xl lg:text-6xl text-cream uppercase tracking-tight leading-none mb-4">
              Find your level.
            </h2>
            <p className="text-gray-mid text-lg leading-relaxed">
              Every tier is fully tax-deductible. Every tier comes with outcomes you can measure. Pick what fits and we&apos;ll make it count.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`rounded-card-lg p-7 flex flex-col ${
                  tier.highlight
                    ? "bg-orange shadow-xl shadow-orange/20"
                    : "bg-cream/5 border border-cream/10 hover:bg-cream/10 transition-colors"
                }`}
              >
                {tier.highlight && (
                  <div className="inline-block text-xs font-bold text-white bg-white/25 px-3 py-1 rounded-full uppercase tracking-widest mb-4 self-start">
                    Most Popular
                  </div>
                )}
                <div className={`font-display font-black tracking-tight leading-none mb-0.5 ${tier.highlight ? "text-white" : "text-orange"}`}>
                  <span className="text-3xl">{tier.amount}</span>
                  <span className={`text-base font-heading font-semibold ${tier.highlight ? "text-white/70" : "text-gray-mid"}`}>
                    {tier.period}
                  </span>
                </div>
                <div className={`font-heading font-bold text-base mb-5 ${tier.highlight ? "text-white/90" : "text-cream"}`}>
                  {tier.name}
                </div>
                <ul className="space-y-2.5 flex-1 mb-7">
                  {tier.perks.map((perk) => (
                    <li
                      key={perk}
                      className={`flex items-start gap-2.5 text-sm leading-snug ${
                        tier.highlight ? "text-white/80" : "text-gray-mid"
                      }`}
                    >
                      <CheckIcon light={tier.highlight} />
                      {perk}
                    </li>
                  ))}
                </ul>
                <a
                  href="#contact"
                  className={`inline-flex items-center justify-center font-semibold text-sm px-6 py-3 rounded-full transition-colors min-h-[44px] ${
                    tier.highlight
                      ? "bg-white text-orange hover:bg-orange-light"
                      : "bg-orange hover:bg-orange-dark text-white"
                  }`}
                >
                  Get Started
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY COMPANIES SAY YES ────────────────────────────────────── */}
      <section className="section-pad bg-[#F5F4F0]">
        <div className="container-site">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">
              Why Companies Say Yes
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight mb-4">
              Six reasons this makes sense right now.
            </h2>
            <p className="text-gray-warm text-lg leading-relaxed">
              We&apos;re not going to tell you this is the most important thing you&apos;ll do this year. We&apos;ll just tell you what it actually is.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {whyCards.map((card) => (
              <div
                key={card.title}
                className="bg-white border border-gray-light border-t-[3px] border-t-orange rounded-card-lg p-7 shadow-sm"
              >
                <h3 className="font-heading font-bold text-ink text-base mb-3">
                  {card.title}
                </h3>
                <p className="text-gray-warm text-sm leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTACT / CTA ────────────────────────────────────────────── */}
      <section
        id="contact"
        className="section-pad bg-orange relative overflow-hidden"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site relative z-10 max-w-2xl text-center">
          <h2 className="font-display font-black text-5xl lg:text-6xl text-white uppercase tracking-tight leading-none mb-5">
            Let&apos;s talk.
          </h2>
          <p className="text-white/80 text-lg leading-relaxed mb-10">
            Drop your name and email and Remi will reach out directly for a real conversation — no sales team, no pitch deck by default.
          </p>
          <CompaniesContactForm />
          <p className="mt-6 text-white/60 text-sm">
            Or email directly:{" "}
            <a
              href="mailto:hello@ambitionangels.org"
              className="text-white underline underline-offset-2 hover:text-white/80 transition-colors"
            >
              hello@ambitionangels.org
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
