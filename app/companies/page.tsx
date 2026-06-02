import type { Metadata } from "next";
import IPhoneMockup from "@/components/IPhoneMockup";
import CompaniesContactForm from "./ContactForm";
import PageVisitedEvent from "@/components/PageVisitedEvent";
import {
  PartnerHero,
  PartnerSection,
  SectionHeader,
  StatRow,
  NumberedSteps,
  SponsorshipCards,
  ClosingCTA,
  type Step,
  type SponsorshipCardData,
} from "@/components/partner/sections";

export const metadata: Metadata = {
  title: "Partner With Us | Ambition Angels",
  description:
    "Your employees share what they actually do all day. We turn it into a 30-day simulated internship on the Ambition app, sponsored by your brand.",
  robots: "noindex, nofollow",
};

const tickerItems = [
  "Career Learning Sessions",
  "Vignettes",
  "Ambition Coaches",
  "Sponsored Internships",
  "Employee Engagement",
  "Real Career Exposure",
  "Measurable Impact",
];

const steps: Step[] = [
  {
    title: "Career learning sessions",
    body: "A group of your employees, about 20, get on a guided session and talk through one career. The technical skills, the day to day, the honest parts. We record it and build it into a 30-day internship on the app, sponsored by your company. About one hour. Run it as one room or split into breakouts so everyone contributes.",
    meta: [
      { label: "Time", value: "About 1 hour." },
      {
        label: "What teens get",
        value: "A full internship in a real career, carrying your name.",
      },
    ],
  },
  {
    title: "Vignettes",
    body: "Individual employees record a short clip. One question, one honest answer about their work. We weave these through the internships so teens see real faces in the field. Ten minutes per person. Micro-volunteering that fits any schedule.",
    meta: [
      { label: "Time", value: "About 10 minutes per person." },
      { label: "What teens get", value: "Real people, not stock footage." },
    ],
  },
  {
    title: "Ambition Coaches",
    body: "For the employees who want to go deeper. Four sessions over four weeks with one teen, helping them turn exposure into a plan. This is the next step after someone has done a session or a vignette, not the way in.",
    meta: [
      { label: "Time", value: "Four sessions over four weeks." },
      {
        label: "What teens get",
        value: "A plan and a person in their corner.",
      },
    ],
  },
];

const sponsorshipCards: [SponsorshipCardData, SponsorshipCardData] = [
  {
    badge: "Option A",
    title: "Grant Partnership",
    body: "Fund the work and bundle in a set number of employee engagements. Your support keeps the app free for teens. Your team gets built-in ways to show up across the year.",
    lines: [
      /* [TIER AMOUNT] driven by: staff hours to facilitate and produce + hard costs,
         benchmarked against the value of volunteer time. Tier 1 also includes
         N engagements + one company-sponsored internship. */
      { label: "Tier 1: [SET TIER NAME]", price: "[TIER AMOUNT]" },
      { label: "Tier 2: [SET TIER NAME]", price: "[TIER AMOUNT]" },
      { label: "Tier 3: [SET TIER NAME]", price: "[TIER AMOUNT]" },
    ],
  },
  {
    badge: "Option B",
    title: "Per Engagement",
    body: "Not ready for a grant relationship? Start with a single engagement. Your first one is on us. It is the easiest way to see what this feels like before you commit.",
    lines: [
      /* [SET PRICE] driven by: staff hours to facilitate and produce + production
         costs, benchmarked against the value of volunteer time. */
      { label: "Career learning session", price: "[SET PRICE], first one complimentary" },
      { label: "Vignette day", price: "[SET PRICE]" },
      { label: "Ambition Coaches cohort", price: "[SET PRICE]" },
    ],
  },
];

export default function CompaniesPage() {
  return (
    <>
      <PageVisitedEvent name="companies_page_visited" />

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <PartnerHero
        eyebrow="Partner With Us"
        title="Your team. A teen's first look at a real career."
        subhead="Your employees share what they actually do all day. We turn it into a 30-day simulated internship on the Ambition app. Thousands of teens explore it, sponsored by your brand. Real exposure for them. Real engagement for your people."
        buttons={[
          { label: "Book a call", href: "#contact" },
          { label: "See how the app works", href: "/the-app" },
        ]}
        aside={<IPhoneMockup />}
      />

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

      {/* ── THE IDEA ─────────────────────────────────────────────────── */}
      <PartnerSection tone="light">
        <SectionHeader
          tone="light"
          eyebrow="Why This Works"
          title="Who better to show a teen a career than the people doing the job?"
          body="Most teens from under-resourced communities never meet someone in the career they might want. Not because they lack drive, but because no one ever showed them the door. Your employees are that door. They know the technical skills, the day to day, and the parts no one writes down. We capture that and build it into something a teen can actually learn from."
        />
      </PartnerSection>

      {/* ── PROOF ────────────────────────────────────────────────────── */}
      <StatRow />

      {/* ── HOW COMPANIES PLUG IN ────────────────────────────────────── */}
      <PartnerSection tone="dark">
        <SectionHeader
          tone="dark"
          eyebrow="Three Ways In"
          title="Pick how your people show up."
          className="mb-12"
        />
        <NumberedSteps steps={steps} />
      </PartnerSection>

      {/* ── TWO WAYS TO PARTNER ──────────────────────────────────────── */}
      <PartnerSection tone="dark" id="sponsorship" className="border-t border-cream/5">
        <SectionHeader
          tone="dark"
          eyebrow="Sponsorship"
          title="Two ways to partner. Pick the one that fits where you are."
          className="mb-12"
        />
        <SponsorshipCards
          cards={sponsorshipCards}
          note="Our pricing reflects what it takes to turn your team's time into a finished internship. Our staff hours to facilitate and produce, plus production costs. We are happy to walk through the math."
        />
      </PartnerSection>

      {/* ── A GOOD FIT + REACH VS IMPACT ─────────────────────────────── */}
      <PartnerSection tone="light">
        <SectionHeader
          tone="light"
          eyebrow="A Good Fit"
          title="We build relationships, not one-off events."
          body="The best partners have people who want to share what they know, care about reaching the teens the world overlooks, and want to grow this with us over time. If that sounds like you, we should talk."
        />

        {/* Reach vs impact — core to how Ambition talks */}
        <div className="mt-10 max-w-3xl border-l-4 border-orange pl-6">
          <p className="text-charcoal text-lg leading-relaxed">
            Reach is a teen touching the platform. Impact is a teen finishing an
            internship and walking away with a clearer future. We measure both,
            and we report back to you.
          </p>
        </div>
      </PartnerSection>

      {/* ── CLOSING CTA ──────────────────────────────────────────────── */}
      <ClosingCTA title="Let's design yours.">
        <p className="text-gray-mid text-lg leading-relaxed mb-10">
          Tell us a little about your team and Remi will reach out directly to
          set up a call. No sales deck by default. We start with what you are
          trying to do.
        </p>
        <CompaniesContactForm />
      </ClosingCTA>
    </>
  );
}
