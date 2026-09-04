"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { OrgContext } from "@/lib/admin/auth";
import { activeShellKey, type ShellNav } from "@/lib/admin/v2shellNav";
import { Icon } from "../Sidebar";
import OrgSwitcher from "../OrgSwitcher";
import SearchTrigger from "../search/SearchTrigger";
import { useAdminBadges } from "../AdminBadges";

/**
 * Spec B, stage B3 — the V2 sidebar: seven destinations, one row each, plus
 * Inbox below the divider. Renders from resolveShellNav() (the B1 model
 * resolved against entitlements + the B2 map's live seats), so a destination
 * with no entitled tab is simply absent and every link opens a screen that
 * exists today. Desktop-first: below lg it collapses to the same top-bar +
 * drawer pattern as V1 (B5 replaces this with the real mobile shell).
 */

const ROLE_LABEL: Record<OrgContext["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
  finance: "Finance",
  board_viewer: "Board",
};

export default function V2Sidebar({
  nav,
  displayName,
  role,
  orgName,
  orgs,
  activeOrgId,
}: {
  nav: ShellNav;
  displayName: string | null;
  role: OrgContext["role"] | null;
  orgName: string | null;
  orgs: { orgId: string; orgName: string }[];
  activeOrgId: string | null;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { messages: msgUnread, notifications: unread } = useAdminBadges();
  const active = activeShellKey(pathname, nav);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

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

  const row = (dest: ShellNav["destinations"][number], badge?: number) => (
    <Link
      key={dest.key}
      href={dest.href}
      className={[
        "relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors",
        active === dest.key
          ? "text-[#FBE6D2] bg-[linear-gradient(135deg,rgba(232,80,10,0.20),rgba(232,80,10,0.05))] shadow-[inset_0_0_0_1px_rgba(232,80,10,0.30),0_4px_14px_rgba(232,80,10,0.12)] before:content-[''] before:absolute before:left-0 before:top-[6px] before:bottom-[6px] before:w-[3px] before:rounded-full before:bg-orange"
          : "text-[#C9BBA5] hover:text-cream hover:bg-white/[0.05]",
      ].join(" ")}
    >
      <Icon
        name={dest.icon}
        className={`w-4 h-4 shrink-0 ${active === dest.key ? "text-[#F47840]" : "opacity-70"}`}
      />
      <span className="truncate">{dest.label}</span>
      {badge != null && badge > 0 && (
        <span
          className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-orange text-white text-[10px] font-bold leading-none"
          aria-label={`${badge} unread`}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );

  const navPanel = (
    <>
      <div className="px-5 py-5 border-b border-white/10">
        <Link
          href="/admin"
          aria-label="BloomOS — go to Home"
          className="flex items-center gap-2.5 group rounded-lg -m-1 p-1 hover:bg-white/[0.05] transition-colors"
        >
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

      <div className="px-3 pt-3 -mb-1">
        <SearchTrigger />
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="space-y-px">{nav.destinations.map((d) => row(d))}</div>
        {nav.inbox && (
          <>
            <div className="my-3 border-t border-white/[0.07]" aria-hidden />
            <div className="space-y-px">{row(nav.inbox, unread + msgUnread)}</div>
          </>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-white/[0.07] space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {orgs.length >= 2 && activeOrgId && <OrgSwitcher orgs={orgs} activeOrgId={activeOrgId} />}

        <div className="flex items-center gap-2.5">
          <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-light text-orange-dark text-[12px] font-bold uppercase">
            {(displayName ?? "?").charAt(0)}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[13px] font-semibold text-cream truncate">{displayName ?? "Member"}</div>
            <div className="text-[10px] uppercase tracking-[0.08em] text-[#8d7c63]">
              {role ? ROLE_LABEL[role] : "Member"}
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

        <div className="flex items-center gap-2 px-1 text-[11px]">
          <Link href="/admin/settings" className="text-[#8d7c63] hover:text-cream transition-colors">
            Settings
          </Link>
          <span className="text-[#5f5240]">·</span>
          <Link href="/admin/howto" className="text-[#8d7c63] hover:text-cream transition-colors">
            How-To
          </Link>
          <span className="text-[#5f5240]">·</span>
          <Link
            href="/admin/v2"
            className="text-[#8d7c63] hover:text-cream transition-colors"
            title="V2 shell settings"
          >
            V2
          </Link>
        </div>

        <div className="text-[10px] text-[#5f5240] leading-relaxed">
          BloomOS™ · built by SOBO Consulting
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar (< lg) — the real mobile shell arrives in B5. */}
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
          {nav.destinations.find((d) => d.key === active)?.label ??
            (active === "inbox" ? "Inbox" : "BloomOS")}
        </div>
      </div>

      {/* Mobile drawer + overlay */}
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

      {/* Desktop sidebar (>= lg) */}
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
