import type { Metadata } from "next";
import IPhoneMockup from "@/components/IPhoneMockup";
import CompaniesContactForm from "./ContactForm";
import PageVisitedEvent from "@/components/PageVisitedEvent";

export const metadata: Metadata = {
  title: "Corporate Partnership | Ambition Angels",
  description:
    "Give the next generation a clear view of where work is going. Branded career paths, employee engagement, and measurable CSR impact.",
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
  "Workforce Pipeline",
  "Category Exclusivity",
];

const opportunityCards = [
  {
    title: "Employee Engagement That Lasts",
    body: "Your team doesn't show up to volunteer. They show up to author. We run a 90-minute session with the employees you choose, capture what they know about careers in your world, and build a 30-day simulated internship from it. Your people leave with real ownership of something thousands of teens will see. They'll talk about it for months.",
  },
  {
    title: "CSR You Can Actually Report",
    body: "Pre and post data. Future orientation scores. Completion rates. Demographic reach. Biannual impact reports. Numbers your ESG team can put on a slide and a board can act on.",
  },
  {
    title: "Brand Before They Choose",
    body: "A teen who completes a 30-day career internship in your industry, with your brand throughout, doesn't forget that. Not because of your logo. Because you gave them a real look at what a career in your world actually feels like.",
  },
  {
    title: "Talent Before the Bidding Starts",
    body: "The teens exploring your industry today are your candidates in five years. The work your industry hires for is changing fast, and the teens with the earliest exposure are the ones who can adapt. Your next great hire is probably already in the app.",
  },
];

const careerTracks = [
  "Wealth Management",
  "Tech Entrepreneurship",
  "Game Design",
  "Mental Health Therapy",
  "Marketing",
  "Sales",
  "Dental Hygiene",
  "Nursing",
  "Project Management",
  "Real Estate",
  "Culinary Arts",
  "Engineering",
];

const compareRows: { label: string; volunteer: string; grant: string; ambition: string }[] = [
  {
    label: "Engagement",
    volunteer: "One-time event",
    grant: "None for employees",
    ambition: "Employees author the curriculum",
  },
  {
    label: "Visibility",
    volunteer: "Internal photos",
    grant: "Logo placement",
    ambition: "Brand inside a 30-day teen experience",
  },
  {
    label: "Outcomes",
    volunteer: "Hours logged",
    grant: "Dollars donated",
    ambition: "Pre/post data on thousands of teens",
  },
  {
    label: "Teen relationship",
    volunteer: "None",
    grant: "None",
    ambition: "Direct, sustained, at scale",
  },
  {
    label: "Talent pipeline",
    volunteer: "None",
    grant: "None",
    ambition: "Direct exposure to next-gen workforce",
  },
  {
    label: "Reporting depth",
    volunteer: "Activity counts",
    grant: "Donation receipt",
    ambition: "Future orientation, completion, demographic breakdown",
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
      "1 sponsored simulated internship: sponsor an existing track or co-create a new one",
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
      "Up to 3 sponsored simulated internships: existing tracks or co-created with your team, built one at a time",
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
      "Category exclusivity: one company per industry",
      "Executive briefings with Remi biannually",
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
    title: "Employee Engagement That Holds",
    body: "Your people want work that matters. This is specific, real, and they'll talk about it for months. Your team shows up, contributes real knowledge, and walks away with authorship of something thousands of teens will see.",
  },
  {
    title: "Reportable CSR Impact",
    body: "Pre and post data. Future orientation scores. Completion rates. Demographic reach. What your ESG team needs to report — and what your CEO needs to see.",
  },
  {
    title: "A Pipeline for a Workforce That Won't Sit Still",
    body: "The work your industry hires for is changing fast. The teens with the earliest career exposure are the ones who'll adapt. Your future workforce is forming right now.",
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
                Show the next generation where work is going.
              </h1>
              <p className="text-gray-mid text-lg leading-relaxed mb-10 max-w-lg">
                The workforce is changing fast, and the teens furthest from opportunity are usually the last to find out. We close that gap with 30-day simulated career internships on the phones every teen already has. The research is clear: a teen with real career exposure is more than twice as likely to be employed than one without it. Be part of making sure the next generation has what they need.
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

      {/* ── WHY NOW ──────────────────────────────────────────────────── */}
      <section className="section-pad bg-[#F5F4F0]">
        <div className="container-site">
          <div className="max-w-3xl">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">
              Why Now
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight mb-6">
              Most teens are figuring out their careers from the sidelines.
            </h2>
            <p className="text-gray-warm text-lg leading-relaxed mb-5">
              The work your industry does is changing fast. New roles, new tools, new ways of working — most of it lives inside companies and never reaches the teens deciding what to study or who to become. The teens furthest from opportunity feel that gap the most. They&apos;re the last to find out where the workforce is going, and by the time they do, the paths are already crowded.
            </p>
            <p className="text-gray-warm text-lg leading-relaxed">
              Career exposure closes the gap. The research is clear: a teen with structured exposure to careers is more than twice as likely to be employed than peers without it. We deliver that exposure at scale, through the phones teens already have, in the industries your company actually operates in. You can be part of making sure the next generation has what they need to succeed in a workforce that won&apos;t sit still.
            </p>
          </div>
        </div>
      </section>

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
              Most CSR investment is hard to measure and harder to talk about. Ambition Angels gives you something different: direct contact with the teens who will define the next workforce, employees who walk away with real ownership of something they helped build, and outcomes you can put in front of your board.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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

      {/* ── CAREER PATHS YOU COULD SPONSOR ──────────────────────────── */}
      <section className="section-pad bg-ink relative overflow-hidden border-t border-cream/5" style={dotTexture}>
        <div className="container-site relative z-10">
          <div className="max-w-3xl mb-10">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">
              What You&apos;d Sponsor
            </p>
            <h2 className="font-display font-black text-5xl lg:text-6xl text-cream uppercase tracking-tight leading-none mb-6">
              Career tracks built one at a time.
            </h2>
            <p className="text-gray-mid text-lg leading-relaxed">
              Each Ambition internship is a 30-day immersion in one career path — 20 videos, 10 quizzes, 10 hands-on activities, designed for 15 minutes a day on a phone. Sponsor an existing track or co-create a new one with your team.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {careerTracks.map((track) => (
              <div
                key={track}
                className="bg-cream/5 border border-cream/10 rounded-card px-5 py-4 flex items-center gap-3 hover:bg-cream/10 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-orange flex-shrink-0" />
                <span className="font-heading font-semibold text-cream text-sm">{track}</span>
              </div>
            ))}
          </div>

          <p className="text-gray-mid text-sm leading-relaxed mt-8 max-w-2xl">
            Don&apos;t see your industry? That&apos;s a co-creation opportunity. Premier and Founding Partners build new tracks with their teams.
          </p>
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
              We don&apos;t show up with a fixed program. We start by listening. The first conversation isn&apos;t a sales call — it&apos;s customer discovery. The career track we build together comes from what your team actually knows and what your business actually needs five years from now.
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
                  We run a 90-minute session with your team, on Zoom so we can record and capture everything. Your employees don&apos;t present. They respond, react, and share what they know about careers in your world. We take that conversation and build curriculum from it. You choose the focus: a specific career path, or the durable skills your industry needs most right now.
                </p>
                <ul className="space-y-3">
                  {[
                    "Works for groups of any size; we use breakouts for larger teams",
                    "Zoom format lets us record and distill your team's knowledge into curriculum",
                    "You choose the focus: career path-based or durable skills (creativity, critical thinking, communication)",
                    "Pick the employee group you most want to engage; we build around them",
                    "Feeds directly into Step 2; this conversation becomes the internship",
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
                What your team shared in that session becomes the foundation. We handle all production. Your team reviews drafts, keeps the content accurate, and updates it as your industry changes. The result is a 30-day simulated internship that reflects how careers in your field actually work right now.
              </p>
              <ul className="space-y-3">
                {[
                  "Each internship is one career path, built one at a time, as deep as it deserves",
                  "20 videos, 10 quizzes, and 10 activities per internship track",
                  "Students finish knowing the real tasks of the role, the skills it takes, and what that career actually feels like in today's workforce",
                  "Your team validates accuracy and keeps content current as the industry evolves",
                  "Designed for 15 minutes a day on a phone; no laptop, no classroom required",
                  "Your brand lives throughout as the source of truth, not as a sponsor",
                  "Biannual data on completions, engagement, and career interest",
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

      {/* ── HOW THIS COMPARES ────────────────────────────────────────── */}
      <section className="section-pad bg-[#F5F4F0] border-t border-gray-light">
        <div className="container-site">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">
              How This Compares
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight mb-4">
              Not your typical volunteer day.
            </h2>
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block bg-white border border-gray-light rounded-card-lg overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F5F4F0]">
                  <th className="text-left font-heading font-bold text-gray-warm text-xs uppercase tracking-widest px-6 py-4 w-1/4">&nbsp;</th>
                  <th className="text-left font-heading font-bold text-gray-warm text-xs uppercase tracking-widest px-6 py-4 w-1/4">Traditional Volunteer Day</th>
                  <th className="text-left font-heading font-bold text-gray-warm text-xs uppercase tracking-widest px-6 py-4 w-1/4">Traditional CSR Grant</th>
                  <th className="text-left font-heading font-bold text-orange text-xs uppercase tracking-widest px-6 py-4 w-1/4 bg-orange-light">Ambition Angels</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row, i) => (
                  <tr key={row.label} className={i % 2 === 0 ? "bg-white" : "bg-[#FAFAF8]"}>
                    <td className="px-6 py-4 font-heading font-semibold text-ink">{row.label}</td>
                    <td className="px-6 py-4 text-gray-warm">{row.volunteer}</td>
                    <td className="px-6 py-4 text-gray-warm">{row.grant}</td>
                    <td className="px-6 py-4 text-ink font-medium bg-orange-light/40">{row.ambition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="lg:hidden space-y-4">
            {compareRows.map((row) => (
              <div key={row.label} className="bg-white border border-gray-light rounded-card-lg p-5 shadow-sm">
                <div className="font-heading font-bold text-ink text-base mb-3">{row.label}</div>
                <dl className="space-y-2.5 text-sm">
                  <div className="flex flex-col">
                    <dt className="text-xs font-heading font-bold text-gray-warm uppercase tracking-widest mb-1">Volunteer Day</dt>
                    <dd className="text-gray-warm">{row.volunteer}</dd>
                  </div>
                  <div className="flex flex-col">
                    <dt className="text-xs font-heading font-bold text-gray-warm uppercase tracking-widest mb-1">CSR Grant</dt>
                    <dd className="text-gray-warm">{row.grant}</dd>
                  </div>
                  <div className="flex flex-col bg-orange-light/40 -mx-2 px-2 py-2 rounded">
                    <dt className="text-xs font-heading font-bold text-orange uppercase tracking-widest mb-1">Ambition Angels</dt>
                    <dd className="text-ink font-medium">{row.ambition}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          <p className="text-gray-warm text-base leading-relaxed mt-8 max-w-2xl">
            Most CSR programs offer one of these benefits. We offer all of them in one program.
          </p>
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
              We&apos;re not going to tell you this is the most important thing you&apos;ll do this year. We&apos;ll tell you what it actually is.
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
        className="section-pad bg-ink relative overflow-hidden"
        style={dotTexture}
      >
        <div className="container-site relative z-10 max-w-2xl text-center">
          <h2 className="font-display font-black text-5xl lg:text-6xl text-cream uppercase tracking-tight leading-none mb-5">
            Let&apos;s talk.
          </h2>
          <p className="text-gray-mid text-lg leading-relaxed mb-10">
            Drop your details and Remi will reach out directly for a real conversation. No sales team, no pitch deck by default. Tell us what you&apos;re trying to solve and we&apos;ll start there.
          </p>
          <CompaniesContactForm />
          <p className="mt-6 text-gray-mid text-sm">
            Or email directly:{" "}
            <a
              href="mailto:hello@ambitionangels.org"
              className="text-cream underline underline-offset-2 hover:text-gray-mid transition-colors"
            >
              hello@ambitionangels.org
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
