import type { FeatureKey } from "./entitlements";
import type { OrgContext } from "./auth";

/**
 * V4 Stage A2 — the Settings home (specs/bloomos-v4-product-readiness.md §4
 * and §5 "Settings: left list of sections, one section per page").
 *
 * PURE: the settings layout feeds it the signed-in role and the org's
 * entitlements; tests feed it fixtures. One declaration drives the left
 * section list, each section page's links, global search and How-To, so a
 * section an org or role cannot use is absent everywhere at once.
 *
 * Sections link the setup screens that already exist (the audit's "about 12
 * scattered setup screens", now seated under /admin/settings by the route
 * map). Where a section has no screen yet, `comingNext` says so honestly and
 * names who to ask, rather than showing a form that does nothing.
 */

export type SettingsRole = OrgContext["role"];

/** Owner and admin run the org's setup. */
export const SETUP_ROLES: readonly SettingsRole[] = ["owner", "admin"];

export type SettingsLink = {
  label: string;
  href: string;
  blurb: string;
  /** Any one of these keys shows the link; none = every org. */
  features?: FeatureKey[];
};

export type SettingsSection = {
  key: string;
  label: string;
  href: string;
  /** One line under the section title. */
  blurb: string;
  /** Roles that see the section; omitted = every signed-in role. */
  roles?: readonly SettingsRole[];
  /** Any one of these keys shows the section; omitted = every org. */
  features?: FeatureKey[];
  links: SettingsLink[];
  /** The honest "not built yet" line, when the section has no screen. */
  comingNext?: string;
};

const ASK = "Until then, ask your BloomOS contact and they will make the change for you.";

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    key: "account",
    label: "Your account",
    href: "/admin/settings",
    blurb: "Your name, password, calendar, working hours and sessions.",
    links: [],
  },
  {
    key: "organization",
    label: "Organization",
    href: "/admin/settings/organization",
    blurb: "Who you are as an organization, and the pages that speak for it.",
    roles: SETUP_ROLES,
    comingNext: `Editing your organization's legal name, address and EIN is coming in the next stage. ${ASK}`,
    links: [
      {
        label: "Public booking page",
        href: "/admin/settings/organization/booking-page",
        blurb: "Meeting types, availability and blackout dates for the page people book you from.",
        features: ["modules.meetings"],
      },
      {
        label: "Strategic plan setup",
        href: "/admin/settings/organization/strategy-setup",
        blurb: "Set up or restart the plan behind Organization → Strategy.",
        features: ["modules.strategy"],
      },
    ],
  },
  {
    key: "people",
    label: "People and roles",
    href: "/admin/settings/people",
    blurb: "Who can sign in, and what each person can do.",
    roles: SETUP_ROLES,
    links: [
      {
        label: "Team",
        href: "/admin/organization/team",
        blurb: "Your staff and how they are organized.",
        features: ["modules.staff"],
      },
    ],
  },
  {
    key: "terms",
    label: "Terms",
    href: "/admin/settings/terms",
    blurb: "The words BloomOS uses for your people and groups.",
    roles: SETUP_ROLES,
    comingNext: `Renaming terms (for example "Cohorts" to "Groups") yourself is coming in the next stage. ${ASK}`,
    links: [],
  },
  {
    key: "modules",
    label: "Modules",
    href: "/admin/settings/modules",
    blurb: "The parts of BloomOS your organization uses.",
    roles: SETUP_ROLES,
    comingNext: `Turning modules on and off yourself is coming in the next stage. ${ASK}`,
    links: [],
  },
  {
    key: "connections",
    label: "Connections",
    href: "/admin/settings/connections",
    blurb: "Gmail, Google Calendar and HubSpot.",
    roles: SETUP_ROLES,
    links: [
      {
        label: "Gmail for emails",
        href: "/admin/comms/emails",
        blurb: "Connect the Google account your emails are sent from. Lives on Comms → Emails.",
        features: ["modules.comms"],
      },
      {
        label: "Google Calendar",
        href: "/admin/settings#google-calendar",
        blurb: "Your own calendar, read-only, so Today and My Week show your day.",
      },
      {
        label: "HubSpot",
        href: "/admin/settings#data-sources",
        blurb: "Refresh the fundraising data from HubSpot and see how current it is.",
        features: ["aa.hubspot_mirror"],
      },
      {
        label: "HubSpot sync settings",
        href: "/admin/settings/fundraising/general",
        blurb: "What syncs between BloomOS and HubSpot.",
        features: ["aa.hubspot_mirror"],
      },
    ],
  },
  {
    key: "fundraising",
    label: "Fundraising",
    href: "/admin/settings/fundraising",
    blurb: "Pipeline stages, duplicates and thank-you letters.",
    roles: SETUP_ROLES,
    features: ["modules.fundraising"],
    links: [
      {
        label: "Fundraising settings",
        href: "/admin/settings/fundraising/general",
        blurb: "Integrations and links for the fundraising tools.",
      },
      {
        label: "Pipeline stages",
        href: "/admin/settings/fundraising/stages",
        blurb: "The stages an ask moves through on Fundraising → Pipeline.",
      },
      {
        label: "Duplicates",
        href: "/admin/settings/fundraising/duplicates",
        blurb: "Review and merge donor records that look like the same person.",
      },
      {
        label: "Thank-you templates",
        href: "/admin/fundraising/acknowledgments/templates",
        blurb: "The letters and emails used to thank donors.",
      },
      {
        label: "Import donors and gifts",
        href: "/admin/settings/imports/donors",
        blurb: "Bring donors and gift history in from a spreadsheet.",
      },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    href: "/admin/settings/finance",
    blurb: "Categorization rules, finance setup and bank files.",
    roles: [...SETUP_ROLES, "finance"],
    features: ["modules.finance"],
    links: [
      {
        label: "Categorization rules",
        href: "/admin/settings/finance/rules",
        blurb: "Rules that sort bank transactions into categories automatically.",
      },
      {
        label: "Finance setup",
        href: "/admin/settings/finance/config",
        blurb: "Cash on hand, the starting balance and close settings.",
      },
      {
        label: "Upload a bank file",
        href: "/admin/settings/finance/upload",
        blurb: "Add transactions from your bank's CSV export.",
      },
      {
        label: "Import a budget",
        href: "/admin/settings/finance/budget-import",
        blurb: "Load this year's budget from QuickBooks or a spreadsheet.",
      },
    ],
  },
  {
    key: "imports",
    label: "Imports",
    href: "/admin/settings/imports",
    blurb: "Bring data in from spreadsheets and other systems.",
    roles: SETUP_ROLES,
    features: ["modules.program", "modules.fundraising", "modules.finance"],
    links: [
      {
        label: "Import a CSV",
        href: "/admin/settings/imports/csv",
        blurb: "People, participants or contacts from any system that exports CSV.",
        features: ["modules.program", "modules.fundraising"],
      },
      {
        label: "Donors and gifts",
        href: "/admin/settings/imports/donors",
        blurb: "Donor records and gift history.",
        features: ["modules.fundraising"],
      },
      {
        label: "Bank transactions",
        href: "/admin/settings/finance/upload",
        blurb: "Your bank's CSV export.",
        features: ["modules.finance"],
      },
      {
        label: "Budget",
        href: "/admin/settings/finance/budget-import",
        blurb: "This year's budget.",
        features: ["modules.finance"],
      },
    ],
  },
  {
    key: "help",
    label: "Help",
    href: "/admin/settings/help",
    blurb: "How BloomOS works, page by page.",
    links: [],
  },
];

function hasAny(keys: FeatureKey[] | undefined, features: readonly string[] | null): boolean {
  if (!keys || keys.length === 0) return true;
  if (!features) return false;
  return keys.some((k) => features.includes(k));
}

/** The sections this person sees, each with only the links their org has. */
export function visibleSettingsSections(
  role: SettingsRole | null,
  features: readonly string[] | null,
): SettingsSection[] {
  return SETTINGS_SECTIONS.filter(
    (s) => (!s.roles || (role !== null && s.roles.includes(role))) && hasAny(s.features, features),
  ).map((s) => ({ ...s, links: s.links.filter((l) => hasAny(l.features, features)) }));
}

/** The visible section for a settings path ("/admin/settings/finance/rules"
 *  belongs to Finance), or null when the person cannot see it. */
export function sectionForPath(
  path: string,
  sections: SettingsSection[],
): SettingsSection | null {
  let best: SettingsSection | null = null;
  for (const s of sections) {
    const hit = path === s.href || (s.href !== "/admin/settings" && path.startsWith(s.href + "/"));
    if (hit && (!best || s.href.length > best.href.length)) best = s;
  }
  if (!best && path === "/admin/settings") return sections.find((s) => s.key === "account") ?? null;
  return best;
}
