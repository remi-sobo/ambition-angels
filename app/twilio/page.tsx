import type { Metadata } from "next";
import Image from "next/image";
import CompaniesContactForm from "../companies/ContactForm";
import PageVisitedEvent from "@/components/PageVisitedEvent";
import {
  PartnerHero,
  PartnerSection,
  SectionHeader,
  StatRow,
  NumberedSteps,
  SponsorshipCards,
  ClosingCTA,
  FramingBlock,
  type Step,
  type SponsorshipCardData,
} from "@/components/partner/sections";

export const metadata: Metadata = {
  title: "Twilio + Ambition Angels",
  description:
    "A skills-based partnership that turns Twilions' expertise into career exposure for thousands of teens. Built around Global Impact Week.",
  robots: "noindex, nofollow",
};

const steps: Step[] = [
  {
    title: "Career learning session at Global Impact Week",
    body: "About 20 Twilions get on a one-hour session and talk through one career. Main room, then breakouts so everyone contributes. We record it and build it into a 30-day internship on the app, sponsored by Twilio. We can also run this as a Black Twilions led session, with everyone welcome.",
  },
  {
    title: "Vignettes",
    body: "Twilions pick a career and a question, then book a ten-minute slot to record a short answer on camera. We weave these through the internships so teens see real Twilions in the work. This sits inside your micro-volunteering window, under thirty minutes.",
  },
  {
    title: "Ambition Coaches",
    body: "For Twilions who want to go further. Four sessions over four weeks with one teen, helping them turn exposure into a plan. The next step after someone has done a session or a vignette.",
  },
];

const sponsorshipCards: [SponsorshipCardData, SponsorshipCardData] = [
  {
    badge: "Option A",
    title: "Grant Partnership",
    body: "Fund the work and bundle in a set number of Twilion engagements across the year. Your support keeps the app free for teens, and every career session becomes an internship that carries Twilio's name to thousands of teens.",
    lines: [
      /* [SET TIER NAMES AND AMOUNTS] driven by: staff hours to facilitate and
         produce + production costs, benchmarked against the value of volunteer
         time. Mirror the tier structure on /companies once set. */
      { label: "Tier options", price: "[SET TIER NAMES AND AMOUNTS]" },
    ],
  },
  {
    badge: "Option B",
    title: "Per Engagement",
    body: "Start with a single engagement. Your first one during Global Impact Week is on us. It is the easiest way to see what this feels like before a bigger commitment.",
    lines: [
      /* [SET PRICE] driven by: staff hours to facilitate and produce + production
         costs, benchmarked against the value of volunteer time. */
      { label: "Career learning session", price: "[SET PRICE], first one complimentary" },
      { label: "Vignette day", price: "[SET PRICE]" },
    ],
  },
];

/* Co-brand lockup: Ambition Angels logo + a labeled slot for the Twilio
   wordmark. The Twilio asset is intentionally NOT pulled from the web — Remi
   will drop the approved file into the placeholder box. */
function CoBrandLockup() {
  return (
    <div className="flex items-center gap-5">
      <Image
        src="/images/logo-white.png"
        alt="Ambition Angels"
        width={180}
        height={54}
        className="h-9 lg:h-10 w-auto"
      />
      <span className="text-cream/40 text-2xl font-light leading-none" aria-hidden="true">
        +
      </span>
      <div className="h-9 lg:h-10 w-[140px] rounded-lg border border-dashed border-cream/30 bg-cream/5 flex items-center justify-center text-center px-2">
        <span className="text-cream/40 text-[10px] uppercase tracking-widest leading-tight">
          Twilio logo goes here
        </span>
      </div>
    </div>
  );
}

export default function TwilioPage() {
  return (
    <>
      <PageVisitedEvent name="twilio_page_visited" />

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <PartnerHero
        logoSlot={<CoBrandLockup />}
        eyebrow="A Partnership Proposal"
        title="Twilio + Ambition Angels"
        subhead="A skills-based partnership that turns Twilions' expertise into career exposure for thousands of teens. Built around Global Impact Week, ready to grow from there."
        buttons={[{ label: "Book a call", href: "#contact" }]}
      />

      {/* ── FRAMING NOTE ─────────────────────────────────────────────── */}
      <FramingBlock tone="light">
        This page lays out how Twilio and Ambition Angels can work together, from
        a first engagement during Global Impact Week to a longer partnership. It
        came out of a conversation with Tanise on the employee engagement team,
        and it is built to be easy to share.
      </FramingBlock>

      {/* ── WHY TWILIO ───────────────────────────────────────────────── */}
      <PartnerSection tone="dark">
        <SectionHeader
          tone="dark"
          eyebrow="Why Twilio"
          title="Your people already move on this."
          body="Builders Court filled 160 applications in a day. Your teams do not want to just show up, they want to use what they know. Twilio runs one of the highest employee engagement rates in the industry. That is exactly the energy this is built for. We bring the teens and the structure. Your people bring the careers."
        />
      </PartnerSection>

      {/* ── PROOF ────────────────────────────────────────────────────── */}
      <StatRow />

      {/* ── HOW TWILIONS PLUG IN ─────────────────────────────────────── */}
      <PartnerSection tone="dark">
        <SectionHeader
          tone="dark"
          eyebrow="Three Ways In"
          title="Three ways for Twilions to show up."
          className="mb-12"
        />
        <NumberedSteps steps={steps} />
      </PartnerSection>

      {/* ── A SECOND WAY IN ──────────────────────────────────────────── */}
      <PartnerSection tone="light">
        <SectionHeader
          tone="light"
          eyebrow="Or Start Here"
          title="If launching the full program this fall feels fast, there is another way in."
          body="A group of Twilions could help us build the program itself, the way your June pro bono project is helping another organization stand up their idea. Twilions design and shape it, then it becomes the thing future cohorts run. Either way, we start this fall."
        />
      </PartnerSection>

      {/* ── TIMELINE ─────────────────────────────────────────────────── */}
      <PartnerSection tone="dark">
        <SectionHeader
          tone="dark"
          eyebrow="The Plan"
          title="Launch at Global Impact Week."
          body="Global Impact Week runs September 14 to 18, with the two-week flexibility window on either side. That gives us three months of lead time, which is comfortable for doing this well."
        />
      </PartnerSection>

      {/* ── TWO WAYS TO PARTNER ──────────────────────────────────────── */}
      <PartnerSection tone="dark" id="sponsorship" className="border-t border-cream/5">
        <SectionHeader
          tone="dark"
          eyebrow="Sponsorship"
          title="Two ways to start."
          className="mb-12"
        />
        <SponsorshipCards
          cards={sponsorshipCards}
          note="Pricing reflects our staff time to facilitate and produce, plus production costs. Happy to walk through it together."
        />
      </PartnerSection>

      {/* ── CLOSING ──────────────────────────────────────────────────── */}
      <ClosingCTA title="We want Twilio to be our first.">
        <p className="text-gray-mid text-lg leading-relaxed mb-10">
          We are not chasing a quick win. We want a long-term partner, and after
          talking with Tanise and Danielle, we believe that is Twilio. Let&apos;s
          build the first one together.
        </p>
        <CompaniesContactForm />
      </ClosingCTA>
    </>
  );
}
