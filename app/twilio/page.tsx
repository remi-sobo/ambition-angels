import type { Metadata } from "next";
import Image from "next/image";
import PageVisitedEvent from "@/components/PageVisitedEvent";
import {
  PartnerHero,
  PartnerSection,
  SectionHeader,
  StatRow,
  NumberedSteps,
  ClosingCTA,
  type Step,
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
        backgroundImage="/images/hero-image.jpg"
        logoSlot={<CoBrandLockup />}
        eyebrow="A Partnership Proposal"
        title="Twilio + Ambition Angels"
        subhead="A skills-based partnership that turns Twilions' expertise into career exposure for thousands of teens. Built around Global Impact Week, ready to grow from there."
      />

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

      {/* ── TIMELINE ─────────────────────────────────────────────────── */}
      <PartnerSection tone="light">
        <SectionHeader
          tone="light"
          eyebrow="The Plan"
          title="Launch at Global Impact Week."
          body="Global Impact Week runs September 14 to 18, with the two-week flexibility window on either side. That gives us three months of lead time, which is comfortable for doing this well."
        />
      </PartnerSection>

      {/* ── THE ASK (grant partnership) ──────────────────────────────── */}
      <PartnerSection tone="dark">
        <SectionHeader
          tone="dark"
          eyebrow="The Ask"
          title="Let's do this as a grant partnership."
          body="Twilio.org is already in motion with us, so the foundation piece is not a cold start. A grant partnership builds on that. You fund the work, we keep the app free for every teen, and the career sessions and vignettes your people run get produced into internships that carry Twilio's name to thousands of teens."
        />

        <div className="mt-10 max-w-3xl bg-cream/5 border border-cream/10 border-t-[3px] border-t-orange rounded-card-lg p-8">
          <p className="text-cream text-lg leading-relaxed mb-4">
            We would rather talk it through than hand you a menu.
          </p>
          <p className="text-gray-mid text-base leading-relaxed">
            No tiers, no per-item pricing on this page. We size it together
            around what Twilions want to do and what the foundation is already
            funding. One relationship across the year, built to last, with your
            team showing up through career sessions and vignettes.
          </p>
        </div>
      </PartnerSection>

      {/* ── CLOSING ──────────────────────────────────────────────────── */}
      <ClosingCTA
        title="We want Twilio to be our first."
        body="We are not chasing a quick win. We want a long-term partner, and after talking with Tanise and Danielle, we believe that is Twilio. Let's build the first one together."
      />
    </>
  );
}
