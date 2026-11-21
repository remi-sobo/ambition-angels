"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { AdminUser } from "@/lib/admin/auth";
import {
  activeShellKey,
  shellMobileSplit,
  type ShellDestination,
  type ShellNav,
} from "@/lib/admin/v2shellNav";
import { Icon } from "../Icon";
import QuickAddModal from "../QuickAddModal";
import Drawer from "../ui/Drawer";
import CaptureModal from "../../capture/_components/CaptureModal";
import ReportModal from "../ReportModal";
import { useReedLauncher } from "../reed/ReedLauncherProvider";
import { ReedMark } from "../reed/ReedPanel";
import { useAdminBadges } from "../AdminBadges";

/**
 * Spec B, stage B5 — the V2 mobile shell's bottom bar (`lg:hidden`):
 * Today · Work · [Capture or ＋] · Fundraising · More, every target ≥52px
 * (spec §Mobile). V4 A2: the centre is Capture when the org has ai.capture.
 *
 * The bar slots and the More sheet both derive from resolveShellNav, so
 * entitlement filtering is by construction: a destination the org lacks is
 * absent everywhere, and a tenant without Work simply gets a narrower bar.
 * More holds the remaining destinations plus Inbox, then Settings and Reed
 * (`ai.reed`-gated — Young Life EPA and SafeSpace never see it).
 *
 * The ＋ opens the shared action sheet (add task / report an issue / Reed) —
 * the same capture affordances as V1's dock; B6 rehomes Quick Add and the
 * report trigger properly, this keeps phones capable in the meantime.
 * Mobile scope stays field action (attendance, capture, task completion,
 * lookup, the day) — the destination specs own what renders behind these
 * links, not this bar.
 */

const PLUS_ICON = <path d="M12 5v14M5 12h14" />;
const MIC_ICON = (
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </>
);
const MORE_ICON = (
  <>
    <circle cx="5" cy="12" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="19" cy="12" r="1.4" />
  </>
);

function Svg({ children, className }: { children: ReactNode; className?: string }) {
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
      {children}
    </svg>
  );
}

function BarSlot({
  label,
  active,
  children,
}: {
  label: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 ${
        active ? "text-orange-mid" : "text-cream/55"
      }`}
    >
      {children}
      <span className="text-xs font-heading font-semibold leading-none">{label}</span>
    </span>
  );
}

export default function V2MobileBar({
  nav,
  currentUser,
  reedEnabled,
  captureEnabled = false,
  storyEnabled = false,
}: {
  nav: ShellNav;
  currentUser: AdminUser | null;
  reedEnabled: boolean;
  /** Record (Capture, C4) behind ai.capture. */
  captureEnabled?: boolean;
  /** V4 Stage D: Capture a story (StoryPhone), in the More sheet. */
  storyEnabled?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const activeKey = activeShellKey(pathname, nav);
  const { bar, more } = shellMobileSplit(nav);
  const moreActive = more.some((d) => d.key === activeKey);
  const { open: openReed } = useReedLauncher();
  const { messages: msgUnread, notifications: unread } = useAdminBadges();

  const [sheet, setSheet] = useState<"more" | "actions" | null>(null);
  const [modal, setModal] = useState<"task" | "report" | "record" | null>(null);
  // Org lacking modules.messages has no Messages tab — the sheet row follows.
  const hasMessages = nav.inbox?.tabs.some((t) => t.key === "messages") ?? false;

  // Close any sheet on navigation (Escape comes from the kit Drawer).
  useEffect(() => {
    setSheet(null);
  }, [pathname]);

  const barLabel = (d: ShellDestination) => (d.key === "home" ? "Today" : d.label);

  return (
    <>
      {/* ── Bottom bar ────────────────────────────────────────────────── */}
      <nav
        aria-label="BloomOS mobile navigation"
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-white/10 bg-navy/95 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {bar.map((d) => (
          <Link key={d.key} href={d.href} aria-current={activeKey === d.key ? "page" : undefined} className="flex flex-1">
            <BarSlot label={barLabel(d)} active={activeKey === d.key}>
              <Icon name={d.icon} className="w-[22px] h-[22px]" />
            </BarSlot>
          </Link>
        ))}

        {/* The centre of the bar. V4 §8 ("a front door, not a module"):
            with ai.capture it is Capture, one tap straight into voice
            capture (the existing Capture flow, app/admin/capture). Without
            ai.capture it stays today's ＋, the quick-add action sheet. */}
        {captureEnabled ? (
          <button
            type="button"
            onClick={() => setModal("record")}
            aria-label="Capture"
            aria-haspopup="dialog"
            className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5"
          >
            <span className="relative -mt-3 flex h-12 w-12 items-center justify-center rounded-full bg-orange text-white shadow-lg shadow-orange/40 ring-4 ring-navy transition-transform active:scale-95">
              <Svg className="w-5 h-5">{MIC_ICON}</Svg>
            </span>
            <span className="text-xs font-heading font-semibold leading-none text-cream/80">Capture</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSheet(sheet === "actions" ? null : "actions")}
            aria-label="Quick actions"
            aria-haspopup="dialog"
            aria-expanded={sheet === "actions"}
            className="flex min-h-[52px] flex-1 items-center justify-center"
          >
            <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-orange text-white shadow-lg shadow-orange/40 transition-transform active:scale-95">
              <Svg className="w-5 h-5">{PLUS_ICON}</Svg>
              {reedEnabled && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-navy ring-2 ring-orange">
                  <ReedMark className="w-2.5 h-2.5 text-orange-mid" />
                </span>
              )}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setSheet(sheet === "more" ? null : "more")}
          aria-label="More destinations"
          aria-haspopup="dialog"
          aria-expanded={sheet === "more"}
          className="flex flex-1"
        >
          <BarSlot label="More" active={moreActive}>
            <span className="relative">
              <Svg className="w-[22px] h-[22px]">{MORE_ICON}</Svg>
              {unread + msgUnread > 0 && (
                <span
                  className="absolute -top-1 -right-1.5 min-w-[15px] h-[15px] px-1 inline-flex items-center justify-center rounded-full bg-orange text-white text-xs font-bold leading-none ring-2 ring-navy"
                  aria-label={`${unread + msgUnread} unread`}
                >
                  {unread + msgUnread > 9 ? "9+" : unread + msgUnread}
                </span>
              )}
            </span>
          </BarSlot>
        </button>
      </nav>

      {/* ── More sheet — the rest of the IA, entitlement-filtered ─────── */}
      {/* The kit Drawer (V4 P1): a bottom sheet on phones, with the shared
          focus trap, Escape and scrim close. */}
      <Drawer open={sheet === "more"} onClose={() => setSheet(null)} title="More">
          <div style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div className="grid grid-cols-2 gap-1.5">
              {more.map((d) => (
                <Link
                  key={d.key}
                  href={d.href}
                  onClick={() => setSheet(null)}
                  className={`flex min-h-[52px] items-center gap-3 rounded-panel px-3 py-2 transition-colors active:scale-[0.99] ${
                    activeKey === d.key ? "bg-orange-light text-orange-dark" : "text-ink-1 hover:bg-tile"
                  }`}
                >
                  <Icon name={d.icon} className="w-5 h-5 shrink-0 opacity-80" />
                  <span className="font-heading font-semibold text-sm">{d.label}</span>
                  {d.key === "inbox" && unread + msgUnread > 0 && (
                    <span className="ml-auto min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-orange text-white text-xs font-bold leading-none">
                      {unread + msgUnread > 9 ? "9+" : unread + msgUnread}
                    </span>
                  )}
                </Link>
              ))}
            </div>
            <div className="my-3 border-t border-hairline" aria-hidden />
            <div className="grid grid-cols-2 gap-1.5">
              <Link
                href="/admin/settings"
                onClick={() => setSheet(null)}
                className="flex min-h-[52px] items-center gap-3 rounded-panel px-3 py-2 transition-colors text-ink-1 hover:bg-tile active:scale-[0.99]"
              >
                <Svg className="w-5 h-5 shrink-0 opacity-80">
                  <>
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </>
                </Svg>
                <span className="font-heading font-semibold text-sm">Settings</span>
              </Link>
              {/* With Capture in the centre the ＋ sheet is gone, so its
                  Add task moves here (nothing becomes unreachable). */}
              {captureEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    setSheet(null);
                    setModal("task");
                  }}
                  className="flex min-h-[52px] items-center gap-3 rounded-panel px-3 py-2 text-left transition-colors text-ink-1 hover:bg-tile active:scale-[0.99]"
                >
                  <Svg className="w-5 h-5 shrink-0 opacity-80">
                    <>
                      <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
                      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
                    </>
                  </Svg>
                  <span className="font-heading font-semibold text-sm">Add task</span>
                </button>
              )}
              {storyEnabled && (
                <Link
                  href="/admin/comms/stories/new"
                  onClick={() => setSheet(null)}
                  className="flex min-h-[52px] items-center gap-3 rounded-panel px-3 py-2 text-left transition-colors text-ink-1 hover:bg-tile active:scale-[0.99]"
                >
                  <Svg className="w-5 h-5 shrink-0 opacity-80">
                    <>
                      <path d="M5 4h11l3 3v13H5z" />
                      <path d="M8 10h8M8 14h6" />
                    </>
                  </Svg>
                  <span className="font-heading font-semibold text-sm">Capture a story</span>
                </Link>
              )}
              {/* Report an issue lives in the More sheet too (DoD 5: the
                  trigger works from Quick Add AND mobile More). */}
              <button
                type="button"
                onClick={() => {
                  setSheet(null);
                  setModal("report");
                }}
                className="flex min-h-[52px] items-center gap-3 rounded-panel px-3 py-2 text-left transition-colors text-ink-1 hover:bg-tile active:scale-[0.99]"
              >
                <span className="w-5 shrink-0 text-center" aria-hidden>🐞</span>
                <span className="font-heading font-semibold text-sm">Report an issue</span>
              </button>
              {reedEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    setSheet(null);
                    openReed({ surface: "v2-mobile-more" });
                  }}
                  className="flex min-h-[52px] items-center gap-3 rounded-panel px-3 py-2 text-left transition-colors text-ink-1 hover:bg-tile active:scale-[0.99]"
                >
                  <ReedMark className="w-5 h-5 shrink-0 text-orange" />
                  <span className="font-heading font-semibold text-sm">Reed</span>
                </button>
              )}
            </div>
          </div>
      </Drawer>

      {/* ── Action sheet (the ＋) ──────────────────────────────────────── */}
      <Drawer open={sheet === "actions"} onClose={() => setSheet(null)} title="Quick actions">
          <div style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div className="space-y-1.5">
              {reedEnabled && (
                <ActionRow
                  onClick={() => {
                    setSheet(null);
                    openReed({ surface: "v2-mobile-plus" });
                  }}
                  title="Ask Reed"
                  blurb="Your BloomOS assistant"
                  accent
                  icon={<ReedMark className="w-5 h-5 text-orange" />}
                />
              )}
              {/* No Record row: this sheet only opens for orgs WITHOUT
                  ai.capture (with it, Capture is the centre button). */}
              <ActionRow
                onClick={() => {
                  setSheet(null);
                  setModal("task");
                }}
                title="Add task"
                blurb="Capture a to-do"
                icon={
                  <Svg className="w-5 h-5 text-ink-1">
                    <>
                      <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
                      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
                    </>
                  </Svg>
                }
              />
              {hasMessages && (
                <ActionRow
                  onClick={() => {
                    setSheet(null);
                    router.push("/admin/inbox/messages");
                  }}
                  title="Message someone"
                  blurb="DM a teammate or group"
                  icon={
                    <Svg className="w-5 h-5 text-ink-1">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </Svg>
                  }
                />
              )}
              <ActionRow
                onClick={() => {
                  setSheet(null);
                  setModal("report");
                }}
                title="Report an issue"
                blurb="Flag something to fix"
                icon={
                  <Svg className="w-5 h-5 text-ink-1">
                    <>
                      <path d="M12 4.5a4 4 0 0 1 4 4v1H8v-1a4 4 0 0 1 4-4z" />
                      <path d="M5 13h14M6 9.5 4 8M18 9.5 20 8M6.5 16.5 4.5 18M17.5 16.5 19.5 18M12 13v6.5" />
                    </>
                  </Svg>
                }
              />
            </div>
          </div>
      </Drawer>

      {modal === "task" && <QuickAddModal currentUser={currentUser} onClose={() => setModal(null)} />}
      {modal === "report" && <ReportModal onClose={() => setModal(null)} />}
      {modal === "record" && <CaptureModal surface="mobile_plus" onClose={() => setModal(null)} />}
    </>
  );
}

function ActionRow({
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
      className={`flex w-full min-h-[52px] items-center gap-3 rounded-panel px-3 py-3 text-left transition-colors active:scale-[0.99] ${
        accent ? "bg-orange-light hover:bg-orange-light/80" : "hover:bg-tile"
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tile">{icon}</span>
      <span className="min-w-0 leading-tight">
        <span className="block font-heading font-semibold text-ink-1">{title}</span>
        <span className="block text-xs text-ink-3">{blurb}</span>
      </span>
    </button>
  );
}
