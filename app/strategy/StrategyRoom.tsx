"use client";

import { useMemo, useState } from "react";

/**
 * Internal Strategy Room. Several ways we frame the same mission, each a
 * collapsible card, plus a grounding "what we're doing this year" block.
 * Accordion state lives in component state (no storage APIs). Gating happens
 * at the edge in middleware.ts, so there is no password logic here.
 *
 * The angles are now data: the server (app/strategy/page.tsx) reads them from
 * the strategy_angles table and passes them in, so an admin can edit the deck
 * (or have Reed draft a new angle) without a code change. FALLBACK_ANGLES below
 * is the seed copy, rendered only if the table read comes back empty — the
 * funder-facing page never shows a blank deck.
 */

export type Tone = "primary" | "soft" | "neutral";

export type Angle = {
  num: string;
  id: string;
  title: string;
  navTitle: string;
  tag: string;
  tone: Tone;
  hook: string;
  frame: string;
  lead: string;
  fundsLabel: string;
  funds: string;
  want: string;
  catch?: { label: string; body: string };
  ask: string;
  flag?: string;
};

const FALLBACK_ANGLES: Angle[] = [
  {
    num: "01",
    id: "economic-mobility",
    title: "Economic Mobility",
    navTitle: "Economic Mobility",
    tag: "North Star",
    tone: "primary",
    hook: "We turn career exposure into economic mobility for the teens the system overlooks.",
    frame:
      "We exist to break patterns of generational poverty. We give low-income teens the exposure, the skills, and the relationships to picture and reach an economically empowered future. The missing ingredient was never motivation. It was exposure. You can't be what you can't see.",
    lead: "The goal is not one great program or one changed student. The goal is a city that gets better.",
    fundsLabel: "Who funds this",
    funds:
      "Ballmer Group (mobility-only, very large), Blue Meridian and StriveTogether, GreenLight Fund, Robin Hood, large community foundations.",
    want:
      "Trajectory change, not activity counts. An evidence base with rigorous evaluation. Future Orientation Score growth. The 74% second-internship rate.",
    catch: {
      label: "The catch",
      body:
        "The largest funders source their own deals and reject cold proposals. This frame is the language that makes a warm intro convert, not an application. StriveTogether is the more reachable place-based door.",
    },
    ask: "$250K to $1M+ per year, multi-year, unrestricted, performance-tied.",
  },
  {
    num: "02",
    id: "place-based-rollout",
    title: "Place-Based Rollout",
    navTitle: "Place-Based Rollout",
    tag: "Proven",
    tone: "primary",
    hook: "We saturate one community at a time, prove it, then move.",
    frame:
      "Oakland was the proof. Koshland funded a three-year incubation and it worked. The model is repeatable. Go deep in one defined geography, build the trusted-adult network, reach density, document outcomes, then replicate. Silicon Valley is next, then LA, Atlanta, Houston, Detroit.",
    lead: "We don't sprinkle. We saturate, and then we can prove what a place looks like when ambition is everywhere.",
    fundsLabel: "Who funds this",
    funds:
      "Koshland (Oakland, renewing), Digging Deep (Silicon Valley rollout), StriveTogether and Ballmer place-based, city-anchored corporates and community foundations.",
    want:
      "Percent of teens reached in a geography. Partner density inside a city. Local year-over-year outcome growth. A credible cost per city.",
    ask: "A city sponsorship model. Sell a city, not a line item. This is our cleanest validated angle.",
  },
  {
    num: "03",
    id: "workforce-pathways",
    title: "Workforce Development and Career Pathways",
    navTitle: "Workforce and Pathways",
    tag: "Building",
    tone: "soft",
    hook: "We don't just expose teens to careers. We walk them to the front door.",
    frame:
      "This is the deepest layer, Ambition Coach. We pair a teen with a professional who helps them research the path, define the next step, and find the next real opportunity. The kind of thing a parent with a network does without thinking. Most of our teens have never had that. It is virtual, high-touch, built for a smaller verified-ambition cohort.",
    lead: "Exposure tells a teen the door exists. A coach helps them turn the handle.",
    fundsLabel: "Who funds this",
    funds:
      "JPMorgan Chase (New Skills for Youth), Schultz Family Foundation (opportunity youth), Annie E. Casey, Strada, Ascendium. Atlanta cluster: Schultz, Blank, Rockefeller.",
    want:
      "Pathways to real quality jobs. Next-step and credential attainment. Social capital and network growth. Earning-potential trajectory.",
    ask: "Program funding for coach cohorts, priced per teen served. Verify ambition before matching so volunteers never churn.",
  },
  {
    num: "04",
    id: "k12-buildout",
    title: "K-12 Career Readiness Buildout",
    navTitle: "K-12 Buildout",
    tag: "Reframed",
    tone: "soft",
    hook: "Fund the infrastructure that lets one caring adult guide a hundred teens.",
    frame:
      "The honest version. Do not pitch this as fund our app. Edtech as product is in a funding winter. Pitch instead the buildout of the trusted-adult dashboard, web-based access for students, and the school go-to-market motion as the infrastructure that makes outcomes durable and scalable. The tech enables the human layer. AI augments the adult, it never replaces them.",
    lead: "We're not funding software. We're funding the thing that turns one adult into a hundred futures.",
    fundsLabel: "Who funds this",
    funds:
      "Gates Foundation, CZI, Overdeck (evidence-first), Ballmer (largest K-12 funder), career-pathways K-12 funds.",
    want:
      "Proof of student outcomes first. Adult adoption and usage data. Evidence the tool moves the needle. A clear path off pilot into scale.",
    ask: "$450K to $600K for a discrete 12 to 18 month buildout, or fold into a multi-year $1M+ bundled with the program, which lands better.",
    flag: "The number is to be pressure-tested once we scope the real build.",
  },
  {
    num: "05",
    id: "employee-engagement",
    title: "Corporate Employee Engagement",
    navTitle: "Employee Engagement",
    tag: "Productizing",
    tone: "soft",
    hook: "Turn your employees into the mentors these teens have never had.",
    frame:
      "Ambition Coach and the corporate pitch are the same asset, two buyers. To a CSR team, Ambition Coach is a turnkey, virtual, skills-based volunteering program. Their employees mentor diverse teens, the company gets engagement, a talent pipeline, and impact it can report. This is already a mature funded category. Twilio.org runs Impact Corps, Salesforce gives seven paid volunteer days plus matching, Microsoft funds youth mentoring directly. We build it once and sell it as the repeatable Twilio template, then replicate to Netflix, eBay, a16z.",
    lead: "Your people want to give back and don't have the time. We make it 30 minutes and unforgettable.",
    fundsLabel: "Who buys this",
    funds:
      "Twilio (Tanise, Danielle Morris, Jaiye), Pledge 1% companies (Okta, Zoom, Atlassian), Salesforce, Microsoft, Best Buy, Deloitte, CSR and Impact Fund managers.",
    want:
      "Employee volunteer hours and participation. Engagement and retention lift. Teens mentored and pipeline diversity. Low lift to launch and easy to report.",
    ask: "A partnership package, sponsorship plus employee program bundled. Routing teens to the partner's own institutions often beats asking them to co-build content.",
  },
  {
    num: "06",
    id: "youth-development",
    title: "Youth Development",
    navTitle: "Youth Development",
    tag: "Core thesis",
    tone: "primary",
    hook: "The teens who change are the ones with an adult tracking their progress.",
    frame:
      "The research-backed heart of everything. Career exposure plus a trusted adult. Teens who shift how they see their future are almost always connected to an adult tracking their progress. That is why the app alone is not the program. Three layers: exposure (the app), conversations (the adult dashboard), connections (Ambition Coach). The 74% second-internship completion rate is the proof that the human layer drives durable behavior change.",
    lead: "A phone can show a teen a career. Only a person can convince them it's for them.",
    fundsLabel: "Who funds this",
    funds:
      "Annie E. Casey Foundation, Wallace Foundation, positive youth development funders, Search Institute aligned funders.",
    want:
      "Developmental relationships. Future Orientation Score. Sense of agency and persistence. The 74% second-internship rate as the hero stat.",
    ask: "Program or general operating support. The safest general-operating story. Lead here when the funder cares about the whole child, not just jobs.",
  },
  {
    num: "07",
    id: "responsible-ai",
    title: "Responsible AI in Education",
    navTitle: "Responsible AI",
    tag: "New and timely",
    tone: "neutral",
    hook: "We teach teens to use AI to sharpen their thinking, not outsource it.",
    frame:
      "A fundable story right now, with AI-economy money flooding the Bay Area. Our philosophy is AI as critic, not answer. Teens use AI to critique their own work, which builds critical thinking and prompting fluency. On the adult side, AI generates customized conversation prompts so any adult can become a youth educator. This matches what serious ed funders now demand of AI, that it augment the human work at the heart of learning rather than replace it.",
    lead: "Everyone's worried AI will think for kids. We use it to teach kids to think harder.",
    fundsLabel: "Who funds this",
    funds:
      "Google.org, corporate AI-for-good funds, Tipping Point (Bay Area AI economy), learning-innovation funders.",
    want:
      "AI augmenting, not replacing, adults. Critical-thinking and prompting skill growth. Responsible and equitable use with teens. A real product, not a press release.",
    ask: "An innovation grant. Frame as equitable AI access for under-resourced teens.",
  },
  {
    num: "08",
    id: "two-generation",
    title: "Two-Generation and Parent Track",
    navTitle: "Two-Generation",
    tag: "Emerging stub",
    tone: "neutral",
    hook: "We equip the adults around the teen, not just the teen.",
    frame:
      "A lighter, emerging angle worth keeping warm. The trusted-adult layer naturally extends to parents and mentors, equipping the whole circle around a teen rather than the teen in isolation. This maps to family-strengthening and two-generation funders. Align vocabulary carefully: trusted adult layer for grants, parent or mentor track for pitches, since the audiences overlap.",
    lead: "Change one teen and you change a moment. Equip the adults around them and you change a household.",
    fundsLabel: "Who funds this",
    funds:
      "Aspen Ascend and two-gen funders, family-strengthening foundations, faith-rooted family philanthropies.",
    want: "Whole-family outcomes. Parent engagement and capacity. Durable household-level change.",
    ask: "Pilot or explore. Keep this as a stub for now and do not lead with it.",
  },
];

const stats = [
  { value: "3,500+", label: "teens reached" },
  { value: "87%", label: "Title I" },
  { value: "74%", label: "second-internship completion" },
  { value: "36", label: "partners" },
];

const thisYear = [
  {
    label: "Exposure",
    body: "The app and 30-day simulated internships, live and proven across 36 partners and 3,500+ teens.",
  },
  {
    label: "Conversations",
    body: "The adult dashboard, using AI to turn any adult into a youth educator. In active buildout (Hub v8 with Demetric).",
  },
  {
    label: "Connections",
    body: "Ambition Coach, piloting now with Ricky and Charles. Formalizing volunteer agreements and session frameworks.",
  },
];

const subtitle =
  "One mission, framed for whoever is across the table. Open the angle that fits the room. Each card holds the hook you say out loud, the frame in our voice, who funds it, the metrics they want, and the ask.";

const yearIntro =
  "The grounding truth behind every angle above, so the story never gets ahead of the work.";

const tagToneClass: Record<Tone, string> = {
  primary: "bg-orange/10 text-orange",
  soft: "bg-orange-light text-orange-dark",
  neutral: "bg-gray-light text-gray-warm",
};

const dotTexture = {
  backgroundImage:
    "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

export default function StrategyRoom({ angles: propAngles }: { angles?: Angle[] }) {
  // Prefer the table-driven deck; fall back to the seed copy so the page never
  // renders empty if the read fails or the migration hasn't been applied.
  const angles = propAngles && propAngles.length > 0 ? propAngles : FALLBACK_ANGLES;
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  const allOpen = useMemo(
    () => angles.every((a) => openIds[a.id]),
    [openIds, angles],
  );

  function toggle(id: string) {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function setAll(open: boolean) {
    const next: Record<string, boolean> = {};
    for (const a of angles) next[a.id] = open;
    setOpenIds(next);
  }

  function jumpTo(id: string) {
    setOpenIds((prev) => ({ ...prev, [id]: true }));
    // Let the panel open before scrolling so the offset lands correctly.
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function printPrep() {
    setAll(true);
    // Wait a frame so every panel is expanded in the DOM before printing.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => window.print()),
    );
  }

  return (
    <div className="bg-cream min-h-screen text-ink">
      {/* ── Header (screen) ───────────────────────────────────────────── */}
      <header
        className="relative bg-ink text-cream overflow-hidden print:hidden"
        style={dotTexture}
      >
        <div className="container-site relative z-10 pt-12 pb-14 lg:pt-16 lg:pb-20">
          <div className="flex items-center gap-3 mb-10">
            <span className="font-display text-cream text-xl tracking-tight">
              Ambition Angels
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange border border-orange/40 rounded-full px-2.5 py-1">
              Internal
            </span>
          </div>

          <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
            Funding Angles · Internal Playbook
          </p>
          <h1 className="font-display font-black text-5xl lg:text-7xl leading-[0.95] tracking-tight max-w-4xl">
            Eight ways to tell the{" "}
            <span className="text-orange">same true story</span>
          </h1>
          <p className="font-body text-gray-mid text-base lg:text-lg leading-relaxed max-w-2xl mt-6">
            {subtitle}
          </p>

          <div className="flex flex-wrap items-center gap-2.5 mt-9">
            {stats.map((s) => (
              <span
                key={s.label}
                className="text-sm text-gray-mid border border-cream/15 rounded-full px-4 py-2"
              >
                <strong className="text-cream font-semibold">{s.value}</strong>{" "}
                {s.label}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 mt-8">
            <button
              type="button"
              onClick={() => setAll(!allOpen)}
              className="font-heading text-sm font-semibold text-cream bg-cream/10 hover:bg-cream/20 border border-cream/20 rounded-full px-5 py-2.5 min-h-[44px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
            >
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
            <button
              type="button"
              onClick={printPrep}
              className="font-heading text-sm font-semibold text-white bg-orange hover:bg-orange-dark rounded-full px-5 py-2.5 min-h-[44px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
            >
              Print prep sheet
            </button>
          </div>
        </div>
      </header>

      {/* ── Header (print only) ───────────────────────────────────────── */}
      <div className="hidden print:block mb-6">
        <h1 className="font-heading font-bold text-2xl text-ink">
          Ambition Angels · Strategy Room
        </h1>
        <p className="text-sm text-charcoal mt-1">
          {stats.map((s) => `${s.value} ${s.label}`).join("  ·  ")}
        </p>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="container-site py-12 lg:py-16 print:py-0">
        <div className="grid lg:grid-cols-[230px_1fr] gap-10 lg:gap-14 items-start">
          {/* Quick-jump nav: hidden on mobile and in print */}
          <nav
            aria-label="Jump to an angle"
            className="hidden lg:block sticky top-8 print:hidden"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-warm mb-4">
              Jump to
            </p>
            <ul className="space-y-0.5">
              {angles.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => jumpTo(a.id)}
                    className="group w-full flex items-baseline gap-3 text-left py-2 text-sm text-gray-warm hover:text-ink transition-colors focus-visible:outline-none focus-visible:text-ink"
                  >
                    <span className="font-display text-xs text-gray-mid group-hover:text-orange transition-colors w-5">
                      {a.num}
                    </span>
                    <span>{a.navTitle}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Accordion cards */}
          <main className="space-y-3.5">
            {angles.map((a) => {
              const isOpen = !!openIds[a.id];
              const panelId = `${a.id}-panel`;
              return (
                <section
                  key={a.id}
                  id={a.id}
                  className="scroll-mt-8 border border-gray-light rounded-card bg-white overflow-hidden print:break-inside-avoid print:border-gray-mid"
                >
                  <h2 className="m-0">
                    <button
                      type="button"
                      onClick={() => toggle(a.id)}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      className="w-full flex items-start gap-4 sm:gap-5 px-5 sm:px-7 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-inset"
                    >
                      <span className="font-display text-2xl sm:text-3xl text-orange leading-none mt-0.5">
                        {a.num}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <span className="font-heading font-semibold text-ink text-lg sm:text-xl leading-snug">
                            {a.title}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider rounded-full px-2.5 py-1 ${tagToneClass[a.tone]}`}
                          >
                            {a.tag}
                          </span>
                        </span>
                        <span className="block mt-2 text-gray-warm text-sm sm:text-[15px] leading-relaxed">
                          {`“${a.hook}”`}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-light flex items-center justify-center mt-0.5 transition-transform duration-300 print:hidden"
                        style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                      >
                        <svg
                          className="w-4 h-4 text-orange"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </span>
                    </button>
                  </h2>

                  <div
                    id={panelId}
                    role="region"
                    aria-label={a.title}
                    className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    } print:grid-rows-[1fr]`}
                  >
                    <div className="overflow-hidden">
                      <div className="px-5 sm:px-7 pb-7 pt-1 sm:pl-[4.25rem]">
                        <p className="border-l-2 border-orange/30 pl-5 text-charcoal text-[15px] sm:text-base leading-relaxed">
                          {a.frame}
                        </p>

                        <p className="font-heading font-semibold text-ink text-lg sm:text-xl leading-snug mt-6">
                          {`“${a.lead}”`}
                        </p>

                        <div className="grid sm:grid-cols-2 gap-6 sm:gap-8 mt-7">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-warm mb-2">
                              {a.fundsLabel}
                            </p>
                            <p className="text-sm text-charcoal leading-relaxed">
                              {a.funds}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-warm mb-2">
                              What they want to see
                            </p>
                            <p className="text-sm text-charcoal leading-relaxed">
                              {a.want}
                            </p>
                          </div>
                        </div>

                        {a.catch && (
                          <div className="mt-6 bg-orange-light border border-orange/15 rounded-card px-5 py-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-dark mb-2">
                              {a.catch.label}
                            </p>
                            <p className="text-sm text-charcoal leading-relaxed">
                              {a.catch.body}
                            </p>
                          </div>
                        )}

                        <div className="mt-6 bg-ink rounded-card px-5 py-5 print:bg-white print:border print:border-gray-mid">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange mb-1.5">
                            The ask
                          </p>
                          <p className="text-cream text-[15px] leading-relaxed print:text-ink">
                            {a.ask}
                          </p>
                          {a.flag && (
                            <p className="text-orange-mid text-sm mt-2.5 print:text-orange-dark">
                              {a.flag}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}

            {/* ── This year ──────────────────────────────────────────── */}
            <section className="mt-8 border border-dashed border-gray-mid rounded-card bg-white px-6 py-8 sm:px-8 print:break-inside-avoid">
              <h2 className="font-heading font-bold text-2xl text-ink">
                What we&rsquo;re doing this year
              </h2>
              <p className="text-gray-warm text-sm sm:text-base mt-1.5 max-w-2xl">
                {yearIntro}
              </p>
              <div className="grid sm:grid-cols-3 gap-6 sm:gap-7 mt-7">
                {thisYear.map((y) => (
                  <div key={y.label}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange mb-2">
                      {y.label}
                    </p>
                    <p className="text-sm text-charcoal leading-relaxed">
                      {y.body}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <p className="text-xs text-gray-warm pt-6 print:hidden">
              Internal strategy reference for Ambition Angels. Open the angle
              that fits the room.
            </p>
          </main>
        </div>
      </div>
    </div>
  );
}
