"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import QuickAddModal from "./QuickAddModal";
import ReportModal from "./ReportModal";
import { useReedLauncher } from "./reed/ReedLauncherProvider";
import { ReedMark } from "./reed/ReedPanel";
import type { AdminUser } from "@/lib/admin/auth";

/**
 * Phone-only floating home bar (`lg:hidden`) — an Oura-style dock pinned to the
 * bottom: a rounded pill of the most-used destinations (Home · Tasks · Money ·
 * Fundraising) plus one combined action FAB to the side.
 *
 * The FAB folds the two old mobile FABs (Quick Add "+" and "Ask Reed") into a
 * single tap that opens a bottom sheet of options — capture a task, report an
 * issue, or summon Reed — so phones carry one action affordance, not two
 * colliding circles. On lg–xl tablets the standalone FABs still apply (the rail
 * only mounts at xl); this bar replaces them on phones.
 */

type Tab = { label: string; href: string; icon: ReactNode };

const TABS: Tab[] = [
  {
    label: "Home",
    href: "/admin",
    icon: (
      <>
        <path d="M3.5 11 12 4l8.5 7" />
        <path d="M6 9.5V20h12V9.5" />
      </>
    ),
  },
  {
    label: "Tasks",
    href: "/admin/ops",
    icon: (
      <>
        <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
        <path d="M8.5 12.5l2.5 2.5 4.5-5" />
      </>
    ),
  },
  {
    label: "Messages",
    href: "/admin/messages",
    icon: (
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    ),
  },
  {
    label: "Money",
    href: "/admin/finance",
    icon: (
      <>
        <path d="M12 4a8 8 0 1 0 8 8h-8V4z" />
        <path d="M15 3.5A8 8 0 0 1 20.5 9H15V3.5z" />
      </>
    ),
  },
  {
    label: "Funds",
    href: "/admin/fundraising",
    icon: (
      <path d="M12 19.5C7 15.5 4 12.8 4 9.6 4 7.4 5.7 6 7.6 6c1.6 0 2.9.8 4.4 2.6C13.5 6.8 14.8 6 16.4 6 18.3 6 20 7.4 20 9.6c0 3.2-3 5.9-8 9.9z" />
    ),
  },
];

// Longest-prefix match so Home (/admin) only lights up on the overview itself,
// and the deeper sections win on their own pages.
function activeHref(pathname: string): string | null {
  let best: string | null = null;
  for (const tab of TABS) {
    const match = pathname === tab.href || pathname.startsWith(tab.href + "/");
    if (match && (best === null || tab.href.length > best.length)) best = tab.href;
  }
  return best;
}

export default function MobileTabBar({
  currentUser,
  reedEnabled,
}: {
  currentUser: AdminUser | null;
  reedEnabled: boolean;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const active = activeHref(pathname);
  const { open: openReed } = useReedLauncher();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [modal, setModal] = useState<"task" | "report" | null>(null);
  const [msgUnread, setMsgUnread] = useState(0);

  // Unread Messages badge on the dock. Same slow poll (50s) + same-tab events
  // the sidebar uses, and a re-fetch on route change so opening a thread
  // clears it.
  useEffect(() => {
    if (!currentUser) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/admin/messages/unread-count", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (alive) setMsgUnread(typeof j.count === "number" ? j.count : 0);
      } catch {
        // Network blip — keep the last count, next poll recovers.
      }
    };
    load();
    const id = setInterval(load, 50000);
    window.addEventListener("bloomos:messages-changed", load);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("bloomos:messages-changed", load);
    };
  }, [currentUser, pathname]);

  // Close the action sheet on Escape (hardware keyboard / external).
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  return (
    <>
      {/* ── Floating dock ─────────────────────────────────────────────── */}
      <div
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-3 px-4 pointer-events-none"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <nav
          aria-label="Quick navigation"
          className="pointer-events-auto flex flex-1 max-w-sm items-stretch justify-around rounded-full border border-white/10 bg-navy/95 backdrop-blur-md shadow-2xl shadow-black/40 px-1.5 py-1.5"
        >
          {TABS.map((tab) => {
            const isActive = active === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1.5 transition-colors ${
                  isActive ? "text-orange-mid" : "text-cream/55 hover:text-cream"
                }`}
              >
                <span className="relative">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-[22px] h-[22px]"
                    aria-hidden
                  >
                    {tab.icon}
                  </svg>
                  {tab.href === "/admin/messages" && msgUnread > 0 && (
                    <span
                      className="absolute -top-1 -right-1.5 min-w-[15px] h-[15px] px-1 inline-flex items-center justify-center rounded-full bg-orange text-white text-[9px] font-bold leading-none ring-2 ring-navy"
                      aria-label={`${msgUnread} unread`}
                    >
                      {msgUnread > 9 ? "9+" : msgUnread}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-heading font-semibold leading-none">{tab.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Combined action FAB — Quick Add + Ask Reed in one. */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Quick actions"
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          className="pointer-events-auto relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-orange text-white shadow-2xl shadow-orange/40 transition-transform active:scale-95"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" className="w-6 h-6" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          {reedEnabled && (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-navy ring-2 ring-orange">
              <ReedMark className="w-3 h-3 text-orange-mid" />
            </span>
          )}
        </button>
      </div>

      {/* ── Action sheet ──────────────────────────────────────────────── */}
      {sheetOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Quick actions">
          <button
            aria-label="Close"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-ink/50 cursor-default"
          />
          <div
            className="relative z-10 rounded-t-card-lg border-t border-white/10 bg-navy px-4 pt-3 text-cream shadow-2xl animate-[sheet-up_180ms_ease-out]"
            style={{ paddingBottom: "max(1.25rem, calc(env(safe-area-inset-bottom) + 0.5rem))" }}
          >
            {/* grab handle */}
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />

            <div className="space-y-1.5">
              {reedEnabled && (
                <SheetRow
                  onClick={() => {
                    setSheetOpen(false);
                    openReed({ surface: "fab" });
                  }}
                  title="Ask Reed"
                  blurb="Your BloomOS assistant"
                  accent
                  icon={<ReedMark className="w-5 h-5 text-orange-mid" />}
                />
              )}
              <SheetRow
                onClick={() => {
                  setSheetOpen(false);
                  router.push("/admin/messages");
                }}
                title="Message someone"
                blurb="DM a teammate or group"
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-cream" aria-hidden>
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                }
              />
              <SheetRow
                onClick={() => {
                  setSheetOpen(false);
                  setModal("task");
                }}
                title="Add task"
                blurb="Capture a to-do"
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-cream" aria-hidden>
                    <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
                    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
                  </svg>
                }
              />
              <SheetRow
                onClick={() => {
                  setSheetOpen(false);
                  setModal("report");
                }}
                title="Report an issue"
                blurb="Flag something to fix"
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-cream" aria-hidden>
                    <path d="M12 4.5a4 4 0 0 1 4 4v1H8v-1a4 4 0 0 1 4-4z" />
                    <path d="M5 13h14M6 9.5 4 8M18 9.5 20 8M6.5 16.5 4.5 18M17.5 16.5 19.5 18M12 13v6.5" />
                  </svg>
                }
              />
            </div>
          </div>
        </div>
      )}

      {modal === "task" && <QuickAddModal currentUser={currentUser} onClose={() => setModal(null)} />}
      {modal === "report" && <ReportModal onClose={() => setModal(null)} />}
    </>
  );
}

function SheetRow({
  title,
  blurb,
  icon,
  onClick,
  accent = false,
}: {
  title: string;
  blurb: string;
  icon: ReactNode;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-card px-3 py-3 text-left transition-colors active:scale-[0.99] ${
        accent ? "bg-white/[0.07] hover:bg-white/10" : "hover:bg-white/[0.06]"
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">{icon}</span>
      <span className="min-w-0 leading-tight">
        <span className="block font-heading font-semibold text-cream">{title}</span>
        <span className="block text-[12px] text-cream/55">{blurb}</span>
      </span>
    </button>
  );
}
