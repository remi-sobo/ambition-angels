"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { AdminUser, OrgContext } from "@/lib/admin/auth";
import {
  NAV_SECTIONS,
  activeHref,
  itemLabel,
  visibleSections,
  type IconName,
} from "@/lib/admin/nav";
import OrgSwitcher from "./OrgSwitcher";
import SearchTrigger from "./search/SearchTrigger";
import { useAdminBadges } from "./AdminBadges";
import { TYPE } from "@/lib/admin/typeScale";

// The IA itself (sections, items, entitlement keys, tab sets) lives in
// lib/admin/nav.ts so this sidebar and the horizontal sub-topic bar
// (SectionSubNav) render from one list. Roadmap items no longer render as
// muted "Soon" rows — the full IA lives in the How-To page and docs; the
// `soon` mechanism stays for future use.

// ── Icons ────────────────────────────────────────────────────────────────────

// Exported for the V2 shell (B3): one icon set for both chromes, deleted
// together with NAV_SECTIONS when V1 retires. No rendered change here.
export const ICON_NODES: Record<IconName, ReactNode> = {
  overview: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M6 9.5V20h12V9.5" />
    </>
  ),
  briefing: (
    <>
      <path d="M12 4l1.6 4.9 4.9 1.6-4.9 1.6L12 17l-1.6-4.9L5.5 10.5l4.9-1.6L12 4z" />
      <path d="M18.5 15.5l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3z" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 13h4l1.5 2.5h5L16 13h4" />
      <path d="M4 13V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6M4 13v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </>
  ),
  messages: (
    <>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </>
  ),
  students: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5v-1a4.5 4.5 0 0 1 4.5-4.5h2a4.5 4.5 0 0 1 4.5 4.5v1" />
      <path d="M15.5 5a3.2 3.2 0 0 1 0 6.1M17.5 14.2a4.5 4.5 0 0 1 3 4.3v1" />
    </>
  ),
  cohorts: (
    <>
      <rect x="4" y="5.5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3.5v4M16 3.5v4M9 14.5l2 2 4-4" />
    </>
  ),
  intake: (
    <>
      <path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20" />
      <path d="M4 13.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4.5M12 4v7M9 8.5l3 3 3-3" />
    </>
  ),
  demoday: (
    <path d="M12 4l2.3 4.7 5.2.8-3.8 3.7.9 5.2-4.6-2.4-4.6 2.4.9-5.2L4.5 9.5l5.2-.8L12 4z" />
  ),
  camp: (
    <>
      <path d="M12 4l8.5 16h-17L12 4z" />
      <path d="M12 13l3.2 7H8.8L12 13z" />
    </>
  ),
  schools: (
    <>
      <path d="M5 20V6.5L12 4l7 2.5V20M3.5 20h17" />
      <path d="M9.5 9.5h.01M14.5 9.5h.01M9.5 13h.01M14.5 13h.01" />
    </>
  ),
  app: (
    <>
      <rect x="7" y="3.5" width="10" height="17" rx="2" />
      <path d="M11 17.5h2" />
    </>
  ),
  internships: (
    <>
      <rect x="4" y="8" width="16" height="11" rx="2" />
      <path d="M9 8V6.5A2.5 2.5 0 0 1 11.5 4h1A2.5 2.5 0 0 1 15 6.5V8M4 13h16" />
    </>
  ),
  career: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15 9l-2 4.5L9 15l2-4.5L15 9z" />
    </>
  ),
  majorgifts: (
    <>
      <path d="M7 4h10l3.5 5L12 20.5 3.5 9 7 4z" />
      <path d="M3.5 9h17M12 4l-2.5 5 2.5 11.5L14.5 9 12 4z" />
    </>
  ),
  donors: (
    <path d="M12 19.5C7 15.5 4 12.8 4 9.6 4 7.4 5.7 6 7.6 6c1.6 0 2.9.8 4.4 2.6C13.5 6.8 14.8 6 16.4 6 18.3 6 20 7.4 20 9.6c0 3.2-3 5.9-8 9.9z" />
  ),
  grants: (
    <>
      <path d="M7 3.5h7L18.5 8v12.5h-11V3.5z" />
      <path d="M14 3.5V8h4.5M10 12h5M10 15.5h5" />
    </>
  ),
  campaigns: (
    <>
      <path d="M6 21V4" />
      <path d="M6 5h11l-2.5 3.5L17 12H6" />
    </>
  ),
  events: (
    <>
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M4 10.5h16M9 3.5V7M15 3.5V7" />
    </>
  ),
  finance: (
    <>
      <path d="M12 4a8 8 0 1 0 8 8h-8V4z" />
      <path d="M15 3.5A8 8 0 0 1 20.5 9H15V3.5z" />
    </>
  ),
  revenue: (
    <>
      <path d="M4 17l5.5-5.5 3.5 3.5L20 8" />
      <path d="M15.5 8H20v4.5" />
    </>
  ),
  expenses: (
    <>
      <path d="M6 3.5h12V20l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2L6 20V3.5z" />
      <path d="M9.5 8h5M9.5 11.5h5" />
    </>
  ),
  budget: <path d="M5 20V10M12 20V4M19 20v-7" />,
  cashflow: (
    <path d="M3.5 9.5c2-1.6 4-1.6 6 0s4 1.6 6 0c1.3-1 2.7-1.2 5-.4M3.5 15.5c2-1.6 4-1.6 6 0s4 1.6 6 0c1.3-1 2.7-1.2 5-.4" />
  ),
  webanalytics: (
    <>
      <path d="M4 4v16h16" />
      <path d="M7.5 14.5l3.5-4 3 3 4.5-6" />
    </>
  ),
  appanalytics: <path d="M3.5 12h4l2.5-7 4 14 2.5-7h4" />,
  studentanalytics: (
    <>
      <path d="M3 9.5L12 5l9 4.5-9 4.5-9-4.5z" />
      <path d="M7 11.8V16c1.7 1.3 8.3 1.3 10 0v-4.2" />
    </>
  ),
  surveys: (
    <>
      <rect x="6" y="5" width="12" height="16" rx="2" />
      <path d="M9.5 5a2.5 2.5 0 0 1 5 0M9.5 11h5M9.5 15h5" />
    </>
  ),
  week: (
    <>
      <rect x="4" y="5.5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3.5v4M16 3.5v4" />
      <path d="M8 14h2M14 14h2" />
    </>
  ),
  tasks: (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  ),
  monday: (
    <>
      <path d="M12 3.5V7M5 9l1.8 1.8M19 9l-1.8 1.8M7.5 15a4.5 4.5 0 0 1 9 0" />
      <path d="M3.5 19h17" />
    </>
  ),
  friday: <path d="M20 7.5l-9 9-4.5-4.5" />,
  projects: <path d="M4 5.5h5l2 2.5h9V19H4V5.5z" />,
  meetings: (
    <>
      <rect x="3.5" y="7" width="12" height="10" rx="2" />
      <path d="M15.5 11l5-3v8l-5-3" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5v-1a4.5 4.5 0 0 1 4.5-4.5h2a4.5 4.5 0 0 1 4.5 4.5v1" />
      <path d="M15.5 5a3.2 3.2 0 0 1 0 6.1M17.5 14.2a4.5 4.5 0 0 1 3 4.3v1" />
    </>
  ),
  documents: (
    <>
      <path d="M7 3.5h7L18.5 8v12.5h-11V3.5z" />
      <path d="M14 3.5V8h4.5" />
    </>
  ),
  board: (
    <path d="M4 21h16M5 18v-7M9.5 18v-7M14.5 18v-7M19 18v-7M3.5 8.5L12 4l8.5 4.5h-17z" />
  ),
  compliance: (
    <>
      <path d="M12 3.5l7 2.5v5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5v-5l7-2.5z" />
      <path d="M9 11.5l2.2 2.2 4.3-4.2" />
    </>
  ),
  kpis: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.5" />
    </>
  ),
  strategy: (
    <>
      <path d="M9 4L4 6v14l5-2 6 2 5-2V4l-5 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {ICON_NODES[name]}
    </svg>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Human label for the org membership role shown in the account block.
const ROLE_LABEL: Record<OrgContext["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
  finance: "Finance",
  board_viewer: "Board",
};

// Short label shown next to the hamburger on the mobile top bar.
function activeSectionLabel(pathname: string, terms?: Record<string, string> | null): string {
  const href = activeHref(pathname);
  if (href) {
    for (const section of NAV_SECTIONS) {
      const item = section.items.find((i) => i.href === href);
      if (item) return itemLabel(item, terms);
    }
  }
  return "BloomOS";
}

export default function Sidebar({
  currentUser,
  displayName,
  role,
  terms,
  orgName,
  features,
  orgs,
  activeOrgId,
}: {
  currentUser: AdminUser | null;
  /** The signed-in person's real display name for the account block. The
   *  legacy remi/shannon `currentUser` handle is only a fallback, so a
   *  second-tenant user isn't mislabeled "Remi". Null pre-auth. */
  displayName?: string | null;
  /** The signed-in person's org membership role, for the account block label. */
  role?: OrgContext["role"] | null;
  /** Resolved terminology labels for term-driven nav items (term key →
   *  display label, plural pre-applied), from getNavTermLabels(). Null
   *  pre-auth — terminology is tenant data. */
  terms?: Record<string, string> | null;
  /** The user's orgs (from getUserOrgs) — the footer switcher renders only
   *  when there are 2+. */
  orgs?: { orgId: string; orgName: string }[] | null;
  activeOrgId?: string | null;
  /** From ctx.orgName (the orgs row). Null pre-auth — the tagline must stay
   *  generic then; a shared host can't name a tenant before sign-in. */
  orgName?: string | null;
  /**
   * Enabled entitlement keys for the session org (from getEntitlements).
   * null = no session yet (login screen) — show the full IA rather than a
   * stripped nav; B2 de-AAs the pre-auth shell.
   */
  features?: string[] | null;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Inbox + Messages unread counts, shared app-wide and Realtime-driven (see
  // AdminBadges). The badge lights the instant a message/notification lands,
  // on any page.
  const { messages: msgUnread, notifications: unread } = useAdminBadges();

  // Close the mobile drawer whenever the route changes — without this,
  // tapping a link slides the next page in but leaves the drawer covering
  // it.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile drawer is open so iOS doesn't show
  // the marketing site bouncing behind the panel.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try { await fetch("/api/admin/logout", { method: "POST" }); } catch {}
    router.push("/admin");
    router.refresh();
  };

  const active = activeHref(pathname);

  // Entitlement filter: drop items whose org lacks the key, then sections
  // left empty. Unknown keys are off by design (core fence spec §6b).
  const sections = visibleSections(features);

  const navPanel = (
    <>
      <div className="px-5 py-5 border-b border-white/10">
        <Link
          href="/admin"
          aria-label="BloomOS — go to Overview"
          className="flex items-center gap-2.5 group rounded-lg -m-1 p-1 hover:bg-white/[0.05] transition-colors"
        >
          {/* Plain <img> (not next/image): the admin PWA service worker is
              cache-first under /admin/, and the raw static asset is far more
              reliable there than the /_next/image optimizer round-trip. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/admin/bloomos-mark.png"
            alt=""
            width={32}
            height={32}
            className="rounded-lg shrink-0"
          />
          <div className="font-display font-black text-2xl normal-case tracking-tight text-cream leading-none group-hover:text-white transition-colors">
            Bloom<span className="text-orange">OS</span>
          </div>
        </Link>
        <div className="text-[11px] tracking-wide text-cream/50 mt-1.5">
          {orgName ? `Operating System for ${orgName}` : "The operating system for nonprofits"}
        </div>
      </div>

      {currentUser && (
        <div className="px-3 pt-3 -mb-1">
          <SearchTrigger />
        </div>
      )}

      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.label}>
            <div className={`px-3 mb-1.5 flex items-center gap-2 ${TYPE.sectionHeader} !text-[#bfae93]`}>
              <span className="w-[3px] h-3 rounded-full bg-orange" aria-hidden />
              {section.label}
            </div>
            <div className="space-y-px">
              {section.items.map((item) =>
                item.href ? (
                  <Link
                    key={item.label + item.href}
                    href={item.href}
                    className={[
                      "relative flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] font-medium transition-colors",
                      active === item.href
                        ? "text-[#FBE6D2] bg-[linear-gradient(135deg,rgba(232,80,10,0.20),rgba(232,80,10,0.05))] shadow-[inset_0_0_0_1px_rgba(232,80,10,0.30),0_4px_14px_rgba(232,80,10,0.12)] before:content-[''] before:absolute before:left-0 before:top-[6px] before:bottom-[6px] before:w-[3px] before:rounded-full before:bg-orange"
                        : "text-[#C9BBA5] hover:text-cream hover:bg-white/[0.05]",
                    ].join(" ")}
                  >
                    <Icon
                      name={item.icon}
                      className={`w-4 h-4 shrink-0 ${active === item.href ? "text-[#F47840]" : "opacity-70"}`}
                    />
                    <span className="truncate">{itemLabel(item, terms)}</span>
                    {item.href === "/admin/inbox" && unread > 0 && (
                      <span
                        className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-orange text-white text-[10px] font-bold leading-none"
                        aria-label={`${unread} unread`}
                      >
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                    {item.href === "/admin/messages" && msgUnread > 0 && (
                      <span
                        className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-orange text-white text-[10px] font-bold leading-none"
                        aria-label={`${msgUnread} unread`}
                      >
                        {msgUnread > 9 ? "9+" : msgUnread}
                      </span>
                    )}
                  </Link>
                ) : (
                  <div
                    key={item.label}
                    className="flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] font-medium text-cream/25 cursor-default select-none"
                    title="Coming soon"
                  >
                    <Icon name={item.icon} className="w-4 h-4 shrink-0 opacity-60" />
                    <span className="truncate">{item.label}</span>
                    <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-cream/25 border border-white/10 rounded-full px-1.5 py-px">
                      Soon
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
        ))}
      </nav>

      {currentUser && (
        <div className="px-4 py-4 border-t border-white/[0.07] space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {orgs && orgs.length >= 2 && activeOrgId && (
            <OrgSwitcher orgs={orgs} activeOrgId={activeOrgId} />
          )}

          {/* Account block: avatar + name + role, with log out tucked to the side.
              Name/role are the real signed-in person (displayName + org role),
              falling back to the legacy handle only if a name isn't resolved. */}
          {(() => {
            const name = displayName?.trim() || cap(currentUser);
            const roleLabel = role ? ROLE_LABEL[role] : "Member";
            return (
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-light text-orange-dark text-[12px] font-bold uppercase">
              {name.charAt(0)}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[13px] font-semibold text-cream truncate">{name}</div>
              <div className="text-[10px] uppercase tracking-[0.08em] text-[#8d7c63]">
                {roleLabel}
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="shrink-0 text-[11px] font-medium text-[#9c8b70] hover:text-cream border border-white/[0.10] hover:bg-white/[0.06] px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {loggingOut ? "…" : "Log out"}
            </button>
          </div>
            );
          })()}

          {/* Quiet utility row: Settings · How-To. */}
          <div className="flex items-center gap-2 px-1 text-[11px]">
            <Link
              href="/admin/settings"
              className={`inline-flex items-center gap-1.5 transition-colors ${
                active === "/admin/settings" ? "text-orange-mid font-medium" : "text-[#8d7c63] hover:text-cream"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </Link>
            <span className="text-[#5f5240]">·</span>
            <Link
              href="/admin/howto"
              className={`transition-colors ${
                active === "/admin/howto" ? "text-orange-mid font-medium" : "text-[#8d7c63] hover:text-cream"
              }`}
            >
              How-To
            </Link>
          </div>

          <div className="text-[10px] text-[#5f5240] leading-relaxed">
            BloomOS™ · built by SOBO Consulting
          </div>
        </div>
      )}

      {!currentUser && (
        <div className="px-5 py-4 border-t border-white/[0.07] text-[11px] text-[#8d7c63] leading-relaxed">
          Not signed in. Use the login form in the main panel to continue.
        </div>
      )}
    </>
  );

  return (
    <>
      {/* ── Mobile top bar (visible < lg) ─────────────────────────────── */}
      <div
        className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 bg-navy/95 backdrop-blur border-b border-white/10 flex items-center gap-3 px-4 pt-[env(safe-area-inset-top)]"
        style={{ height: "calc(3.5rem + env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          className="w-10 h-10 -ml-2 flex items-center justify-center rounded-lg text-cream/80 hover:text-cream hover:bg-white/5 transition-colors"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <div className="font-display font-black uppercase tracking-tight text-cream text-base leading-none">
          {activeSectionLabel(pathname, terms)}
        </div>
      </div>

      {/* ── Mobile drawer + overlay ───────────────────────────────────── */}
      <div
        className={[
          "lg:hidden fixed inset-0 z-50 transition-opacity duration-200",
          drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
        aria-hidden={!drawerOpen}
      >
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          tabIndex={drawerOpen ? 0 : -1}
        />
        <aside
          className={[
            "absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-navy border-r border-black/30 flex flex-col shadow-2xl",
            "pt-[env(safe-area-inset-top)] transition-transform duration-200 ease-out will-change-transform",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
          role="dialog"
          aria-label="BloomOS navigation"
        >
          {navPanel}
        </aside>
      </div>

      {/* ── Desktop sidebar (visible >= lg) ───────────────────────────── */}
      {/* Sticky + h-screen pins the chrome while the content column scrolls;
          the section nav scrolls internally when taller than the viewport. */}
      <aside
        className="hidden lg:flex w-[248px] shrink-0 border-r border-black/30 bg-navy flex-col lg:sticky lg:top-0 lg:h-screen lg:pt-[env(safe-area-inset-top)]"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        {navPanel}
      </aside>
    </>
  );
}
