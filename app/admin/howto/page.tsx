import Link from "next/link";
import PageHeader from "../_components/PageHeader";
import SectionHeading from "../_components/SectionHeading";
import { TYPE } from "@/lib/admin/typeScale";

// A plain-language guide to BloomOS — every section, module, and what it
// does. Mirrors the sidebar IA (Sidebar.tsx) so the table of contents and
// the product stay in lockstep. Static content; safe to read top to bottom.
export const dynamic = "force-dynamic";

type Item = {
  name: string;
  href?: string;
  soon?: boolean;
  what: string;
  does?: string[];
};
type Section = { id: string; label: string; blurb: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    id: "command-center",
    label: "Command Center",
    blurb: "Where you start the day — what needs a decision, right now.",
    items: [
      {
        name: "Overview",
        href: "/admin",
        what: "The home dashboard. A live snapshot of the whole org — money, pipeline, tasks, and what's slipping — with quick links into everything else.",
        does: [
          "See cash, fundraising, and open work at a glance",
          "Jump straight to whatever needs attention",
        ],
      },
      {
        name: "Strategy",
        href: "/admin/strategic-plan",
        what: "The strategic plan — your OGSM objectives and goals, and the measures (KPIs) that track progress against them.",
        does: [
          "Reference objectives and goals; their health rolls up from the underlying measures",
          "Track KPIs against targets — Monday snapshots build ~4-week trend lines",
          "Reed can review the plan's coherence and propose edits (draft-then-approve)",
          "Off-track objectives and the monthly-review nudge surface on the Executive Briefing",
        ],
      },
      {
        name: "Executive Briefing",
        href: "/admin/briefing",
        what: "“Needs you today.” A ranked, capped decision feed computed from real records — no AI cost, nothing invented. Every card is a real thing to act on.",
        does: [
          "Read the day's priorities, highest-impact first",
          "Open the Weekly Briefing for the Monday edition",
          "Weekly view adds an AI-narrated summary plus an “Overdue across CRM” card you can filter by owner and reschedule or complete inline",
        ],
      },
    ],
  },
  {
    id: "program",
    label: "Program",
    blurb: "The young people and the programs they move through.",
    items: [
      {
        name: "Students",
        href: "/admin/students",
        what: "One roster across every program — each student's journey from discover to launch. Intake rides along as a tab (the pipeline into the roster).",
        does: [
          "Track each student's stage and program history",
          "Search and filter the full roster",
          "Intake tab: applications from the public form — review, screen → waitlist → offer, and promote accepted students onto the roster",
        ],
      },
      {
        name: "Cohorts",
        href: "/admin/cohorts",
        what: "Program cohorts, their sessions, and attendance.",
        does: ["Manage cohort sessions", "Record and review attendance"],
      },
      {
        name: "Demo Day",
        href: "/admin/demoday",
        what: "Demo Day signups and event management.",
        does: ["Track Demo Day registrations", "Manage the event roster"],
      },
      {
        name: "YGB Camp",
        href: "/admin/ygb",
        what: "Young, Gifted & Black camp — registrations and logistics.",
        does: ["Manage camp signups and details"],
      },
      {
        name: "Schools & Partners",
        href: "/admin/partners",
        what: "The partner CRM. A Prospect → Emerging → Pilot → Active → Anchor pipeline for schools and nonprofits, modeled like the donor system.",
        does: [
          "Two tabs (Pipeline / Prospects) plus filters for type, area, and tasks",
          "Per-org profile: a full contacts directory, an activity timeline of logged touches, and MOU / data-agreement tracking",
          "Score each org on a 7-factor fit rubric; the list sorts highest-fit first",
          "One-tap stage advancement, “Move to…”, and merge duplicate orgs",
          "Add tasks right on a profile — they flow into Ops and show a tasks-due chip on the list",
        ],
      },
      { name: "Ambition App", soon: true, what: "The student-facing app surface. Coming soon." },
      { name: "Internships", soon: true, what: "Internship placements and tracking. Coming soon." },
      { name: "Career Readiness", soon: true, what: "Career-readiness curriculum and outcomes. Coming soon." },
    ],
  },
  {
    id: "fundraising",
    label: "Fundraising",
    blurb: "Donors, the gift spine, and the moves that grow them.",
    items: [
      {
        name: "Today's Moves",
        href: "/admin/fundraising/today",
        what: "Your operator queue — who needs you today across open asks, unthanked gifts, and recent giving.",
        does: [
          "Work a single prioritized list each day",
          "“Suggest next moves” — an AI agent ranks open asks and proposes one concrete action each, grounded only in real giving facts (draft-then-approve; nothing auto-applies)",
          "“Sync email” pulls Gmail threads into each donor's timeline",
        ],
      },
      {
        name: "Donors",
        href: "/admin/fundraising/donors",
        what: "The constituent list with lifetime giving rollups, retention intelligence, and engagement scoring.",
        does: [
          "Filter by year and segment (individuals, organizations, major $10k+, lapsed, archived)",
          "Retention flags (LYBUNT / SYBUNT / cadence-lapsed) surface who's slipping",
          "Tasks column shows open + overdue work per donor",
          "Bulk archive / unarchive / guarded delete; export segments",
          "Donor profile = a 360: gift timeline, logged calls/emails/meetings, households, soft credits, open asks, linked research brief, and a Tasks panel",
        ],
      },
      {
        name: "Pipeline",
        href: "/admin/fundraising",
        what: "The moves-management pipeline, Identification → Cultivation → Solicitation → Stewardship. Prospects, the Ask Log, and funding Strategy ride along as tabs on the Fundraising bar.",
        does: [
          "Track opportunities, ask amounts, and next steps",
          "See the AI next-best-action suggestions in context",
          "Prospects tab: HubSpot-mirrored prospect research with AI research briefs (snapshot, how-we-fit, meeting playbook, mutual connections); score and disqualify without touching the mirror",
          "Ask Log tab: the record of every ask and its outcome",
          "Strategy tab: funding angles — the strategic framing for how you approach funders",
        ],
      },
      {
        name: "Grants",
        href: "/admin/fundraising/grants",
        what: "The grant pipeline plus every requirement and deadline.",
        does: ["Track grants through their lifecycle", "Never miss a report or renewal — requirements feed the weekly digest"],
      },
      {
        name: "Campaigns",
        href: "/admin/fundraising/campaigns",
        what: "Campaign → appeal attribution so every gift can carry where it came from.",
        does: ["Define campaigns and appeals", "Attribute gifts for clean reporting"],
      },
      { name: "Events", soon: true, what: "Event fundraising and guest management. Coming soon." },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    blurb: "A live picture of cash, burn, and budget.",
    items: [
      {
        name: "Finance",
        href: "/admin/finance",
        what: "One sidebar item; the whole finance product lives on its own tab bar — Dashboard, Friday close, Reconcile, Forecast, Report, Model, Upload, Transactions, Budget, Pledges, Rules, Config.",
        does: [
          "Dashboard: live cash, burn, fundraising, and budget — watch runway and cash on hand at a glance",
          "Transactions: the ledger — import, categorize, and rule-tag expenses; set rules so categorization sticks",
          "Budget: planned vs. actual by category",
          "Pledges: revenue by source and time",
        ],
      },
    ],
  },
  {
    id: "data",
    label: "Data",
    blurb: "How the work is landing in the world.",
    items: [
      {
        name: "Analytics",
        href: "/admin/analytics",
        what: "Traffic and events for the public site.",
        does: ["See visits, sources, and key page events"],
      },
      { name: "App Analytics", soon: true, what: "Usage analytics for the student app. Coming soon." },
      { name: "Student Analytics", soon: true, what: "Outcomes and progress analytics. Coming soon." },
      { name: "Surveys", soon: true, what: "Survey collection and results. Coming soon." },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    blurb: "The shared to-do system that everything else feeds into.",
    items: [
      {
        name: "Work",
        href: "/admin/ops/my-week",
        what: "The whole task system behind one sidebar item, with tabs: My Week (your personal home, including the Monday Plan and Friday Review wizards), Tasks (the org-wide hub), and Projects.",
        does: [
          "My Week: plan the week day by day against your real calendar — place tasks onto days, reorder, push to next week, or drop one into an open time block to put it on Google Calendar",
          "Monday Plan walks the week with your agenda alongside each day; Friday Review walks what was planned vs. what shipped, and rolls the rest forward",
          "Tasks: every task as a list or board — group by priority, status, department, or project; quick-add, subtasks, labels, pins; a “Linked” filter narrows to CRM work",
          "Each task can carry a chip linking back to the partner or donor it's about",
          "Projects: longer-running initiatives, each with its own task list and activity log",
        ],
      },
      {
        name: "Meetings",
        href: "/admin/meetings",
        what: "Everything meetings in one place: your real meetings (synced from calendar and matched to the donor or partner each one concerns), the connection backlog, and your public booking page's setup — as tabs.",
        does: [
          "Overview: past and upcoming meetings, each matched to a donor/partner; the meeting lands on their timeline. Meetings booked through your public page show badged in Upcoming, with cancel right on the row",
          "Paste a transcript and Reed drafts a summary plus one to three suggested follow-ups — accept one and it becomes a real task linked to the donor",
          "A deterministic “N meetings with no follow-up” coverage line keeps anything from slipping; clear it by adding a follow-up or marking it not needed",
          "Connections: intro candidates from email plus your scheduling backlog, tracked until each meeting is booked",
          "Booking page: the bookable meeting types, availability, and blackouts behind the public Calendly-style scheduler, plus booking history",
        ],
      },
      { name: "Team", soon: true, what: "Team roster and roles. Coming soon." },
      { name: "Documents", soon: true, what: "Shared document hub. Coming soon." },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    blurb: "Board, compliance, and the numbers you're accountable to.",
    items: [
      {
        name: "Board",
        href: "/admin/board",
        what: "Board terms, conflict-of-interest, board giving, and meetings & minutes.",
        does: ["Track terms and COI disclosures", "Record board giving and meeting minutes"],
      },
      {
        name: "Compliance",
        href: "/admin/compliance",
        what: "Filings, renewals, and policy deadlines — so none of them live in someone's head.",
        does: ["Track every filing and renewal with its due date", "Upcoming items feed the weekly digest"],
      },
    ],
  },
];

// Render in the sidebar's order so the guide mirrors the nav exactly
// (Sidebar.tsx: Command Center → Operations → Fundraising → Program → Finance →
// Data → Governance). The ToC and the sections both read from this.
const ORDERED_SECTIONS = ["command-center", "operations", "fundraising", "program", "finance", "data", "governance"]
  .map((id) => SECTIONS.find((s) => s.id === id))
  .filter((s): s is Section => Boolean(s));

// Cross-cutting things that apply everywhere.
const GLOBALS: { title: string; body: string }[] = [
  {
    title: "Signing in",
    body: "Each operator signs in from the login panel. The left sidebar shows one row per product; bigger products fan out through a tab bar at the top of their pages. Items marked “Soon” on this page are planned but not built yet.",
  },
  {
    title: "Your rail — the daily cockpit",
    body: "The right rail rides along on every page. It shows today's agenda with day-by-day arrows (and rolls forward to your next meeting when today is done), what Needs you — overdue, due today, and your next donor touch — a “This week” load ribbon, and a Capture box for instant tasks, with “Ask Reed” for anything bigger.",
  },
  {
    title: "The data spine & HubSpot sync",
    body: "Fundraising views read a synced mirror of HubSpot (the “spine”). Use “Sync HubSpot” in the sidebar to pull the latest — it advances in chunks. The colored dot below it shows data freshness: green (fresh), amber (watch), red (stale), so you always know how current the numbers are.",
  },
  {
    title: "Email logging",
    body: "“Sync email” on Today's Moves pulls your Gmail threads with donors into each donor's timeline (verified-address matching only; staff-to-staff mail is skipped).",
  },
  {
    title: "Your calendar, two ways",
    body: "BloomOS mirrors your Google Calendar so your agenda is always current. Schedule a task into a time block and it writes a tagged event back to Google; move or delete that event in Google and it flows back — the task follows the new time, or unschedules itself, but never disappears.",
  },
  {
    title: "Tasks connect everything",
    body: "Add a task on a partner or donor profile and it becomes a real Ops task — visible in Ops, Today, and This Week, with a chip linking back to the record. Overdue ones surface on the list views and in the weekly digest.",
  },
  {
    title: "The weekly digest",
    body: "Every Monday morning BloomOS emails each operator a personalized digest: last week's giving, what's due, and your own overdue CRM tasks (plus anything unassigned). The same overdue list is on the Weekly Briefing page, where you can reschedule or complete items inline.",
  },
  {
    title: "Meet Reed — AI, used carefully",
    body: "Reed is the BloomOS AI. Where it helps — drafting meeting follow-ups, ranking fundraising next-moves, writing prospect briefs and the weekly narrative, reviewing the strategic plan — it's grounded strictly in your real data, drafts for your approval, and never auto-applies. Deterministic logic runs first; Reed only proposes on top. (Reed is our product AI, not a third-party meeting notetaker.)",
  },
  {
    title: "Audit trail",
    body: "Meaningful changes are recorded in an audit log, so there's always a history of who changed what.",
  },
  {
    title: "Install as an app",
    body: "BloomOS is an installable PWA — add it to your home screen or dock for a full-screen, app-like experience.",
  },
];

export default function HowToPage() {
  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1000px]">
      <PageHeader
        title="How BloomOS works"
        subtitle="A plain-language guide to every section, module, and what it does."
      />

      {/* Table of contents */}
      <nav className="flex flex-wrap gap-2 mb-8">
        <a href="#start-here" className="text-xs font-semibold text-ink-2 hover:text-orange bg-tile border-[1.5px] border-outline rounded-full px-3 py-1.5 transition-colors">
          Start here
        </a>
        {ORDERED_SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="text-xs font-semibold text-ink-2 hover:text-orange bg-tile border-[1.5px] border-outline rounded-full px-3 py-1.5 transition-colors"
          >
            {s.label}
          </a>
        ))}
      </nav>

      {/* Start here / global concepts */}
      <section id="start-here" className="scroll-mt-20 mb-10">
        <SectionHeading className="mb-1">Start here — the basics</SectionHeading>
        <p className="text-sm text-ink-2 mb-4 max-w-[70ch]">
          BloomOS is one operating system for the whole organization — fundraising, program, finance,
          operations, and governance in a single place. A few ideas run through all of it:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {GLOBALS.map((g) => (
            <div key={g.title} className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-4">
              <h3 className={`${TYPE.cardTitle} mb-1`}>{g.title}</h3>
              <p className="text-[13px] text-ink-2 leading-relaxed">{g.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sections */}
      <div className="space-y-10">
        {ORDERED_SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-20">
            <SectionHeading className="mb-1">{section.label}</SectionHeading>
            <p className="text-sm text-ink-2 mb-4">{section.blurb}</p>
            <div className="space-y-3">
              {section.items.map((item) => (
                <article
                  key={item.name}
                  className={`bg-tile shadow-tile border-[1.5px] rounded-card-lg p-5 ${
                    item.soon ? "border-outline opacity-75" : "border-outline"
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <h3 className="font-heading font-bold text-ink-1 text-base">{item.name}</h3>
                    {item.soon ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3 border border-outline rounded-full px-2 py-0.5">
                        Soon
                      </span>
                    ) : item.href ? (
                      <Link
                        href={item.href}
                        className="text-xs font-semibold text-orange hover:text-orange-dark transition-colors"
                      >
                        Open →
                      </Link>
                    ) : null}
                  </div>
                  <p className="text-sm text-ink-2 leading-relaxed max-w-[80ch]">{item.what}</p>
                  {item.does && item.does.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {item.does.map((d, i) => (
                        <li key={i} className="flex gap-2.5 text-[13px] text-ink-1">
                          <span className="text-orange mt-1.5 w-1 h-1 rounded-full bg-orange shrink-0" aria-hidden />
                          <span className="leading-relaxed">{d}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="text-xs text-ink-3 mt-12 border-t border-outline pt-5">
        BloomOS™ · the operating system for your nonprofit. This guide mirrors the sidebar — if a
        module is here, it&apos;s in the menu on the left.
      </p>
    </div>
  );
}
