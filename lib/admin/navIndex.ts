import type { ShellNav } from "./v2shellNav";
import type { SettingsSection } from "./settingsSections";

/**
 * V4 Stage A2 (spec §4: "How-To and global search are rewritten from the
 * nav model so they match what each org can see").
 *
 * PURE. Both the Cmd-K page index and the How-To page are generated from
 * the resolved shell nav (resolveShellNav: entitlements, terminology and
 * live seats already applied) plus the visible Settings sections. So they
 * list exactly the destinations and tabs the sidebar shows this org, under
 * the same labels, and nothing the org lacks: no V1 paths, no "Command
 * Center", no "Executive Briefing", no YGB Camp for a tenant without it.
 *
 * The copy below is keyed by destination and tab key. A tab with no entry
 * still appears (label and link); it just has no description.
 */

export type PageEntry = { label: string; href: string; keywords?: string[] };

export const DESTINATION_HELP: Record<string, string> = {
  home: "Where the day starts: what needs you, and how the organization is doing.",
  work: "Your week, your tasks and projects, meetings and shared documents.",
  programs: "The people you serve, how they come in, the groups they join and who shows up.",
  fundraising: "Donors and funders, asks in progress, grants, campaigns and thank-yous.",
  comms: "Email your supporters from your own Gmail and see what happened.",
  finance: "Cash, transactions, budget, forecast and finance reports.",
  impact: "Outcomes, the measures you track, and reports you can share.",
  organization: "Strategy, your team, your board and compliance dates.",
  inbox: "Notifications for you, and chat with your team.",
};

export const TAB_HELP: Record<string, { what: string; keywords?: string[] }> = {
  "home/today": { what: "What is yours and overdue, money at a glance, and your day.", keywords: ["dashboard", "home", "needs you", "briefing"] },
  "home/organization-health": { what: "A short read on how each part of the organization is doing.", keywords: ["health", "status"] },
  "work/plan-close": { what: "Plan the week on Monday and close it on Friday.", keywords: ["monday", "friday", "weekly", "plan", "review"] },
  "work/my-week": { what: "Your calendar and tasks on one week grid.", keywords: ["calendar", "week", "schedule"] },
  "work/tasks": { what: "Every task, who owns it and when it is due.", keywords: ["todo", "to-do", "ops"] },
  "work/projects": { what: "Bigger pieces of work and the tasks inside them.", keywords: ["initiatives"] },
  "work/meetings": { what: "Upcoming and past meetings, notes and follow-ups.", keywords: ["calendar", "notes", "follow-ups", "connections"] },
  "work/documents": { what: "Shared files and the records they belong to.", keywords: ["files", "docs"] },
  "programs/overview": { what: "Your programs at a glance.", keywords: ["program", "dashboard"] },
  "programs/people": { what: "Everyone in your programs and their history.", keywords: ["roster", "participants", "students"] },
  "programs/intake": { what: "Applications coming in, and moving people onto the roster.", keywords: ["applications", "forms"] },
  "programs/cohorts": { what: "Groups, their sessions and attendance.", keywords: ["groups", "sessions"] },
  "programs/attendance": { what: "Take and review attendance across sessions.", keywords: ["present", "absent", "sessions"] },
  "programs/partners": { what: "Schools and partner organizations.", keywords: ["schools", "mou"] },
  "programs/content": { what: "The career library behind the programs.", keywords: ["careers", "library"] },
  "programs/coach": { what: "Volunteer coach sign-ups, matches and plans.", keywords: ["volunteers", "mentors"] },
  "fundraising/today": { what: "The donors and asks that need you today.", keywords: ["moves", "daily"] },
  "fundraising/donors-funders": { what: "Every donor, funder and household, with saved views.", keywords: ["donors", "constituents", "people", "households", "volunteers"] },
  "fundraising/pipeline": { what: "Asks in progress, stage by stage.", keywords: ["asks", "opportunities", "major gifts"] },
  "fundraising/grants": { what: "Grants and their deadlines.", keywords: ["foundations", "deadlines", "loi"] },
  "fundraising/campaigns": { what: "Fundraising campaigns, goals and gift tables.", keywords: ["appeals", "goals", "gift tables"] },
  "fundraising/thank-yous": { what: "Gifts waiting for a thank-you, and the letters to send.", keywords: ["acknowledgments", "thank you", "receipts", "letters"] },
  "comms/emails": { what: "Write an email to a saved group of supporters, test it and send it.", keywords: ["email", "newsletter", "campaign", "gmail"] },
  "finance/snapshot": { what: "Cash on hand, runway and the month so far.", keywords: ["cash", "runway", "money"] },
  "finance/transactions": { what: "Bank transactions: categorize, reconcile and close the month.", keywords: ["expenses", "spend", "reconcile", "close"] },
  "finance/budget": { what: "Budget against actual spending.", keywords: ["budget vs actual"] },
  "finance/forecast": { what: "What is coming in and going out, including pledges.", keywords: ["revenue", "pledges", "commitments"] },
  "finance/reports": { what: "Finance reports for the board and funders.", keywords: ["board report", "statements"] },
  "impact/outcomes": { what: "The outcomes you report, with where each number comes from.", keywords: ["results"] },
  "impact/kpis": { what: "The measures you track against targets.", keywords: ["scorecard", "metrics"] },
  "impact/analytics": { what: "Website traffic.", keywords: ["website", "traffic", "ga4"] },
  "impact/reports": { what: "Impact reports you can share.", keywords: ["report"] },
  "organization/strategy": { what: "Your strategic plan: objectives, goals and measures.", keywords: ["plan", "objectives", "okrs"] },
  "organization/team": { what: "Your staff and how they are organized.", keywords: ["staff", "org chart"] },
  "organization/board": { what: "Board members and their terms.", keywords: ["directors", "governance"] },
  "organization/compliance": { what: "Filings and renewals, and when they are due.", keywords: ["filings", "renewals", "legal"] },
  "inbox/inbox": { what: "Notifications meant for you.", keywords: ["notifications"] },
  "inbox/messages": { what: "Direct messages and group chat with your team.", keywords: ["chat", "messages", "dm"] },
};

export type HelpTab = { key: string; label: string; href: string; what?: string };
export type HelpDestination = { key: string; label: string; blurb?: string; tabs: HelpTab[] };

/** How-To's sections: one per visible destination (Inbox last), one entry
 *  per visible tab, current labels, live hrefs. */
export function navHelp(nav: ShellNav): HelpDestination[] {
  const all = nav.inbox ? [...nav.destinations, nav.inbox] : nav.destinations;
  return all.map((d) => ({
    key: d.key,
    label: d.label,
    blurb: DESTINATION_HELP[d.key],
    tabs: d.tabs.map((t) => ({
      key: t.key,
      label: t.label,
      href: t.href,
      what: TAB_HELP[`${d.key}/${t.key}`]?.what,
    })),
  }));
}

/** The Cmd-K page index: every visible tab, then Settings (its visible
 *  sections and the setup screens they link). Labels that repeat across
 *  destinations ("Today", "Reports") carry their destination's name. */
export function navPageIndex(nav: ShellNav, settings: SettingsSection[] = []): PageEntry[] {
  const all = nav.inbox ? [...nav.destinations, nav.inbox] : nav.destinations;
  const counts = new Map<string, number>();
  for (const d of all) for (const t of d.tabs) counts.set(t.label, (counts.get(t.label) ?? 0) + 1);

  const pages: PageEntry[] = [];
  const seen = new Set<string>();
  const push = (p: PageEntry) => {
    if (seen.has(p.href)) return;
    seen.add(p.href);
    pages.push(p);
  };
  for (const d of all) {
    for (const t of d.tabs) {
      const dup = (counts.get(t.label) ?? 0) > 1 && d.key !== "home";
      push({
        label: dup ? `${d.label} ${t.label}` : t.label,
        href: t.href,
        keywords: [d.label.toLowerCase(), ...(TAB_HELP[`${d.key}/${t.key}`]?.keywords ?? [])],
      });
    }
  }
  for (const s of settings) {
    push({
      label: s.key === "account" ? "Settings" : s.key === "help" ? "Help" : `${s.label} settings`,
      href: s.href,
      keywords: ["settings", s.label.toLowerCase(), ...(s.key === "help" ? ["how-to", "guide", "docs"] : [])],
    });
    for (const l of s.links) {
      push({ label: l.label, href: l.href, keywords: ["settings", s.label.toLowerCase()] });
    }
  }
  return pages;
}
