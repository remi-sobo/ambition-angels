"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ────────────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────────────── */

type OverlayText = {
  kind: "text";
  top: string;
  /** Provide either `left` or `right`. */
  left?: string;
  right?: string;
  text: string;
  /** Optional alignment for the overlay text. Defaults to "left". */
  align?: "left" | "center" | "right";
  /** Tailwind classes for color / weight / size. Defaults to bold dark text. */
  className?: string;
  /** Inline style passthrough for fine-grained font sizing in % of phone width. */
  style?: React.CSSProperties;
  /**
   * Optional solid backing color that paints over the original text on the
   * source PNG. Without this, text glyphs leave gaps that let the original
   * numbers show through. Sampled colors live in BG_* constants below.
   */
  bg?: string;
  /** Optional horizontal/vertical padding (px) around the text to widen the
   * bg block enough to mask the original text. Defaults to 6/2. */
  pad?: { x: number; y: number };
};

type OverlayCheck = {
  kind: "check";
  top: string;
  left: string;
  /** Diameter as a % of phone screen width (e.g., "8%"). */
  size: string;
};

type OverlayProgress = {
  kind: "progress";
  top: string;
  left: string;
  width: string;
  height: string;
  /** 0..1, fraction of width filled. */
  fill: number;
};

type Overlay = OverlayText | OverlayCheck | OverlayProgress;

type Hotspot = {
  top: string;
  left: string;
  width: string;
  height: string;
  /** What this hotspot does. */
  action:
    | { kind: "advance" }
    | { kind: "toast"; message: string };
  /** Accessible label for screen readers. */
  label: string;
};

type Scene = {
  id: number;
  image: string;
  alt: string;
  headline: string;
  subhead: string;
  /** Which scene to advance to from Continue. `null` ends the tour. */
  next: number | null;
  /** Optional primary hotspot — visible orange pulse until first interaction. */
  primary?: Hotspot;
  /** Optional secondary hotspots — invisible, fire toasts on tap. */
  secondary?: Hotspot[];
  overlays?: Overlay[];
  /** Hide the interactive bottom tab nav (e.g. for lesson-modal scenes). */
  hideTabNav?: boolean;
};

type TabKey = "work" | "life" | "fundraise" | "wallet" | "bio";

/* ────────────────────────────────────────────────────────────────────
   Scene data
   ──────────────────────────────────────────────────────────────────── */

// Text overlay sizes. Phone screen is ~300px wide (320 outer, 10px chrome each
// side). Tuned to visually match the original $0 / 0 days values measured
// from each source PNG (1206x2622 native, scale 0.249 to 300-wide screen).
// Plain px because CSS `font-size: X%` is relative to the inherited font-size
// (16px), NOT the container width — `5%` collapsed everything to sub-pixel
// sizes in v2.
const FS_HEADER_DOLLAR = "24px"; // top blue-header balance ($85 / $15) — original is ~25px tall
const FS_STREAK = "14px"; // 5 days / 5 days streak cards — original is ~12px tall
const FS_GRID = "12px"; // wallet six-cell grid + fundraise $80 — original is ~11px tall

// Background colors sampled from the source PNGs at the spots where the
// original $0 / 0 days / etc. live. These bg blocks paint over the original
// numbers so the new overlay reads cleanly without ghosted text behind.
const BG_HEADER_BLUE = "#205fa6"; // blue header bg on Work / Wallet / Life
const BG_CARD_WHITE = "#FFFFFF"; // white card bg for streaks / wallet grid
const BG_FUNDRAISE_CARD = "#EAF2FB"; // light-blue fundraise card bg

// Percentages reference the phone *screen* container (locked to the
// screenshot aspect ratio 1206:2622), so overlays land in the same spot
// at every breakpoint.
const SCENES: Scene[] = [
  {
    id: 1,
    image: "/images/app-demo/bio_profile.png",
    alt: "Ashley's bio profile screen",
    headline: "Meet Ashley.",
    subhead:
      "Ninth grader. Class of 2028. Found Ambition through her local Boys & Girls Club.",
    next: 2,
    primary: {
      top: "78%",
      left: "30%",
      width: "40%",
      height: "8%",
      action: { kind: "advance" },
      label: "Continue to Ashley's ambitions",
    },
  },
  {
    id: 2,
    image: "/images/app-demo/bio_portfolio.png",
    alt: "Ashley's portfolio and ambitions",
    headline: "She filled in her bio. Wrote down what she wants.",
    subhead:
      "Graduate. Find work she loves. Buy a house. Build a family. Show the kids in her family it can be done.",
    next: 3,
    primary: {
      top: "78%",
      left: "30%",
      width: "40%",
      height: "8%",
      action: { kind: "advance" },
      label: "Continue to her active internship",
    },
    secondary: [
      {
        top: "44%",
        left: "8%",
        width: "84%",
        height: "12%",
        action: {
          kind: "toast",
          message: "Badges unlock as she finishes lessons and streaks.",
        },
        label: "About badges",
      },
    ],
  },
  {
    id: 3,
    image: "/images/app-demo/work_home.png",
    alt: "Work tab with active Mental Health internship",
    headline: "Day five. On a streak.",
    subhead:
      "$15 earned. $85 to go. Internship: Mental Health Therapy. One of thirty.",
    next: 4,
    primary: {
      top: "47%",
      left: "10%",
      width: "80%",
      height: "8%",
      action: { kind: "advance" },
      label: "Open Day 1 lesson",
    },
    secondary: [
      {
        top: "16%",
        left: "10%",
        width: "80%",
        height: "12%",
        action: {
          kind: "toast",
          message: "Streaks build over the 30-day internship.",
        },
        label: "About streaks",
      },
    ],
    overlays: [
      // $85 over the $0 in the blue Earnable Balance header.
      // Source bbox: y 233..333, x 1024..1167 (right edge at 96.8%).
      {
        kind: "text",
        top: "10.8%",
        right: "3.2%",
        text: "$85",
        align: "right",
        className: "text-white font-bold",
        bg: BG_HEADER_BLUE,
        style: { fontSize: FS_HEADER_DOLLAR },
      },
      // 5 days — current streak (left card). Source "0 days" center (23.5%, 21.6%).
      {
        kind: "text",
        top: "21.6%",
        left: "16.8%",
        text: "5 days",
        className: "text-ink font-bold",
        bg: BG_CARD_WHITE,
        style: { fontSize: FS_STREAK },
      },
      // 5 days — longest streak (right card). Source "1 day" center (71.2%, 21.6%).
      {
        kind: "text",
        top: "21.6%",
        left: "65.5%",
        text: "5 days",
        className: "text-ink font-bold",
        bg: BG_CARD_WHITE,
        style: { fontSize: FS_STREAK },
      },
      // Calendar checks: 4 green badges on day 1–4 tiles, top-right of each tile.
      // Day-1 tile right edge ≈ (21% left, 65% top). Step +17% to next tile.
      { kind: "check", top: "65%", left: "21%", size: "8%" },
      { kind: "check", top: "65%", left: "38%", size: "8%" },
      { kind: "check", top: "65%", left: "55%", size: "8%" },
      { kind: "check", top: "65%", left: "72%", size: "8%" },
    ],
  },
  {
    id: 4,
    image: "/images/app-demo/lesson_video.png",
    alt: "Daily lesson video player",
    headline: "Every day starts with a real lesson.",
    subhead: "Video first. Built for how teens already learn.",
    next: 5,
    hideTabNav: true,
    primary: {
      top: "38%",
      left: "38%",
      width: "24%",
      height: "20%",
      action: { kind: "advance" },
      label: "Play the lesson",
    },
    secondary: [
      {
        top: "78%",
        left: "10%",
        width: "80%",
        height: "10%",
        action: {
          kind: "toast",
          message: "Video plays. She's learning about customer segments.",
        },
        label: "About the lesson",
      },
    ],
  },
  {
    id: 5,
    image: "/images/app-demo/quiz.png",
    alt: "Customer segments quiz",
    headline: "Then a check for understanding.",
    subhead: "Short. Low-stakes. Built for retention.",
    next: 6,
    hideTabNav: true,
    primary: {
      top: "30%",
      left: "5%",
      width: "90%",
      height: "10%",
      action: { kind: "advance" },
      label: "Answer the quiz",
    },
    secondary: [
      {
        top: "20%",
        left: "5%",
        width: "90%",
        height: "8%",
        action: {
          kind: "toast",
          message: "Wrong answers get a quick explainer, not a red X.",
        },
        label: "About the quiz",
      },
    ],
  },
  {
    id: 6,
    image: "/images/app-demo/intern_task.png",
    alt: "Intern task with handwritten answers",
    headline: "Then real intern work.",
    subhead: "The same thinking a junior PM does. In her own words.",
    next: 7,
    hideTabNav: true,
    primary: {
      top: "87%",
      left: "30%",
      width: "55%",
      height: "8%",
      action: { kind: "advance" },
      label: "Submit task",
    },
  },
  {
    id: 7,
    image: "/images/app-demo/standup.png",
    alt: "Daily stand-up recording",
    headline: "And a daily stand-up.",
    subhead: "Like every team does. Sixty seconds. Saved to her bio.",
    next: 8,
    hideTabNav: true,
    primary: {
      top: "87%",
      left: "30%",
      width: "55%",
      height: "8%",
      action: { kind: "advance" },
      label: "Record stand-up",
    },
  },
  {
    id: 8,
    image: "/images/app-demo/life_home.png",
    alt: "Life lessons home",
    headline: "Plus durable skills.",
    subhead:
      "Critical thinking. Communication. Money. Mental health. The skills AI can't replace.",
    next: 9,
    primary: {
      top: "32%",
      left: "8%",
      width: "84%",
      height: "16%",
      action: { kind: "advance" },
      label: "Open a life lesson",
    },
    overlays: [
      // $85 over the $0 in the Earnable Balance header — must match Work tab.
      {
        kind: "text",
        top: "10.8%",
        right: "3.2%",
        text: "$85",
        align: "right",
        className: "text-white font-bold",
        bg: BG_HEADER_BLUE,
        style: { fontSize: FS_HEADER_DOLLAR },
      },
    ],
  },
  {
    id: 9,
    image: "/images/app-demo/wallet.png",
    alt: "Spendable balance and gift cards",
    headline: "Real rewards. Earned, not given.",
    subhead: "$15 earned in five days. Real gift cards she'll actually use.",
    next: 10,
    primary: {
      top: "55%",
      left: "10%",
      width: "80%",
      height: "12%",
      action: { kind: "advance" },
      label: "View gift cards",
    },
    secondary: [
      {
        top: "78%",
        left: "10%",
        width: "80%",
        height: "10%",
        action: {
          kind: "toast",
          message: "Brands include the ones teens actually use.",
        },
        label: "About brands",
      },
    ],
    overlays: [
      // $15 over the $0 in the blue Spendable Balance header.
      // Source bbox: y 233..333, x 1024..1167 (same as work_home header).
      {
        kind: "text",
        top: "10.8%",
        right: "3.2%",
        text: "$15",
        align: "right",
        className: "text-white font-bold",
        bg: BG_HEADER_BLUE,
        style: { fontSize: FS_HEADER_DOLLAR },
      },
      // Row 1 (top 21.6%): Processing $0 / Earnable $85 / Spendable $15.
      // Source col centers: 18.3%, 49.9%, 81.6%. Grid cells sit on white card.
      {
        kind: "text",
        top: "21.6%",
        left: "8.3%",
        text: "$0",
        align: "center",
        className: "text-ink font-bold",
        bg: BG_CARD_WHITE,
        style: { fontSize: FS_GRID, width: "20%", textAlign: "center" },
      },
      {
        kind: "text",
        top: "21.6%",
        left: "39.9%",
        text: "$85",
        align: "center",
        className: "text-ink font-bold",
        bg: BG_CARD_WHITE,
        style: { fontSize: FS_GRID, width: "20%", textAlign: "center" },
      },
      {
        kind: "text",
        top: "21.6%",
        left: "71.6%",
        text: "$15",
        align: "center",
        className: "text-ink font-bold",
        bg: BG_CARD_WHITE,
        style: { fontSize: FS_GRID, width: "20%", textAlign: "center" },
      },
      // Row 2 (top 28.8%): Fundraised $80 / Earned $15 / Spent $0
      {
        kind: "text",
        top: "28.8%",
        left: "8.3%",
        text: "$80",
        align: "center",
        className: "text-ink font-bold",
        bg: BG_CARD_WHITE,
        style: { fontSize: FS_GRID, width: "20%", textAlign: "center" },
      },
      {
        kind: "text",
        top: "28.8%",
        left: "39.9%",
        text: "$15",
        align: "center",
        className: "text-ink font-bold",
        bg: BG_CARD_WHITE,
        style: { fontSize: FS_GRID, width: "20%", textAlign: "center" },
      },
      {
        kind: "text",
        top: "28.8%",
        left: "71.6%",
        text: "$0",
        align: "center",
        className: "text-ink font-bold",
        bg: BG_CARD_WHITE,
        style: { fontSize: FS_GRID, width: "20%", textAlign: "center" },
      },
    ],
  },
  {
    id: 10,
    image: "/images/app-demo/fundraise.png",
    alt: "$200 laptop fundraise goal",
    headline: "When she wants something real, she fundraises.",
    subhead: "Her goal: a laptop. $80 of $200 in. The app teaches her how to ask.",
    next: null,
    primary: {
      top: "82%",
      left: "15%",
      width: "70%",
      height: "10%",
      action: { kind: "advance" },
      label: "Share the fundraiser",
    },
    secondary: [
      {
        top: "55%",
        left: "10%",
        width: "80%",
        height: "12%",
        action: {
          kind: "toast",
          message: "She learns how to draft the ask, not just push a button.",
        },
        label: "About the ask",
      },
    ],
    overlays: [
      // $80 over the $0 in "$0 raised of your $200 goal".
      // Source line bbox: y 421..495, x 121..418. "$0" sits at the leftmost
      // ~50px of the line. Center at top ~17.5%, left edge near 10%.
      {
        kind: "text",
        top: "17.5%",
        left: "10%",
        text: "$80",
        className: "text-ink font-bold",
        bg: BG_FUNDRAISE_CARD,
        style: { fontSize: "16px" },
      },
      // Progress bar fill: ~90% bar width, top ~21%, height ~1.4%
      {
        kind: "progress",
        top: "21%",
        left: "5%",
        width: "90%",
        height: "1.4%",
        fill: 0.4, // $80 of $200
      },
    ],
  },
];

const TAB_TO_SCENE: Record<TabKey, number> = {
  work: 3,
  life: 8,
  fundraise: 10,
  wallet: 9,
  bio: 1,
};

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  {
    key: "work",
    label: "Work",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 7h18v12H3z" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    ),
  },
  {
    key: "life",
    label: "Life",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l8.84 8.84 8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
  },
  {
    key: "fundraise",
    label: "Fundraise",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2v20" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    key: "wallet",
    label: "Wallet",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H5a2 2 0 0 1-2-2V7z" />
        <path d="M3 7l0-1a2 2 0 0 1 2-2h12" />
        <circle cx="17" cy="13.5" r="1.2" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: "bio",
    label: "Bio",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    ),
  },
];

/* ────────────────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────────────────── */

export default function AppDemo() {
  const [sceneId, setSceneId] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scene = useMemo(
    () => SCENES.find((s) => s.id === sceneId) ?? SCENES[0],
    [sceneId],
  );

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const advance = useCallback(() => {
    setHasInteracted(true);
    const current = SCENES.find((s) => s.id === sceneId);
    if (!current) return;
    if (current.next !== null) {
      setSceneId(current.next);
    }
  }, [sceneId]);

  const handleHotspot = useCallback(
    (hotspot: Hotspot) => {
      setHasInteracted(true);
      if (hotspot.action.kind === "advance") {
        advance();
      } else {
        showToast(hotspot.action.message);
      }
    },
    [advance, showToast],
  );

  const goToTab = useCallback((tab: TabKey) => {
    setHasInteracted(true);
    setSceneId(TAB_TO_SCENE[tab]);
  }, []);

  const restart = useCallback(() => {
    setHasInteracted(false);
    setSceneId(1);
  }, []);

  // Clean up pending toast on unmount.
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Which tab key (if any) the current scene maps back to — used to highlight
  // the corresponding nav button when the user is on that tab's home scene.
  const activeTab = useMemo<TabKey | null>(() => {
    const entry = (Object.entries(TAB_TO_SCENE) as Array<[TabKey, number]>).find(
      ([, id]) => id === sceneId,
    );
    return entry ? entry[0] : null;
  }, [sceneId]);

  const isFinalScene = scene.next === null;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_minmax(0,360px)] lg:gap-16 lg:items-center">
      {/* COPY COLUMN (mobile: below phone) */}
      <div className="order-2 lg:order-1">
        {/* Progress dots */}
        <ol
          className="flex flex-wrap gap-1.5 mb-4"
          aria-label="Demo progress"
        >
          {SCENES.map((s) => {
            const isCurrent = s.id === sceneId;
            const isPast = s.id < sceneId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setHasInteracted(true);
                    setSceneId(s.id);
                  }}
                  aria-label={`Go to scene ${s.id}: ${s.headline}`}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`block h-2 rounded-full transition-all ${
                    isCurrent
                      ? "w-8 bg-orange"
                      : isPast
                        ? "w-2 bg-orange/60"
                        : "w-2 bg-ink/15 hover:bg-ink/30"
                  }`}
                />
              </li>
            );
          })}
        </ol>

        {/* Scene copy — fade transition */}
        <div
          key={scene.id}
          className="animate-[fadeUp_280ms_ease-out_forwards]"
        >
          <p className="text-xs font-medium text-orange uppercase tracking-widest mb-2">
            Scene {scene.id} of {SCENES.length}
          </p>
          <h3 className="font-heading font-bold text-3xl lg:text-4xl text-ink leading-tight mb-3 tracking-tight">
            {scene.headline}
          </h3>
          <p className="text-gray-warm text-lg leading-relaxed">
            {scene.subhead}
          </p>
        </div>

        {/* Controls */}
        <div className="mt-7 flex flex-wrap items-center gap-3">
          {isFinalScene ? (
            <Link
              href="/donate"
              className="bg-orange hover:bg-orange-dark text-white font-semibold px-6 py-3 rounded-full transition-colors text-sm shadow-md shadow-orange/20 min-h-[44px] inline-flex items-center gap-2"
            >
              Sponsor a teen like Ashley
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="M13 5l7 7-7 7" />
              </svg>
            </Link>
          ) : (
            <button
              type="button"
              onClick={advance}
              className="bg-orange hover:bg-orange-dark text-white font-semibold px-6 py-3 rounded-full transition-colors text-sm shadow-md shadow-orange/20 min-h-[44px] inline-flex items-center gap-2"
            >
              Continue
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="M13 5l7 7-7 7" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={restart}
            className="text-gray-warm hover:text-ink font-medium text-sm px-3 py-2 underline underline-offset-4 decoration-gray-mid hover:decoration-ink transition-colors min-h-[44px] inline-flex items-center"
          >
            Restart tour
          </button>
        </div>
      </div>

      {/* PHONE COLUMN */}
      <div className="order-1 lg:order-2 flex justify-center">
        <Phone
          scene={scene}
          activeTab={activeTab}
          hasInteracted={hasInteracted}
          onHotspot={handleHotspot}
          onTab={goToTab}
          toast={toast}
        />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Phone
   ──────────────────────────────────────────────────────────────────── */

function Phone({
  scene,
  activeTab,
  hasInteracted,
  onHotspot,
  onTab,
  toast,
}: {
  scene: Scene;
  activeTab: TabKey | null;
  hasInteracted: boolean;
  onHotspot: (hotspot: Hotspot) => void;
  onTab: (tab: TabKey) => void;
  toast: string | null;
}) {
  return (
    <div className="w-full max-w-[320px]">
      {/* Phone body */}
      <div
        className="relative mx-auto w-full aspect-[320/692] rounded-[52px] p-[10px]"
        style={{
          background:
            "linear-gradient(145deg, #2a2a2a 0%, #111 50%, #1a1a1a 100%)",
          boxShadow:
            "0 0 0 1.5px #3a3a3a, 0 28px 60px rgba(232,80,10,0.18), 0 12px 24px rgba(0,0,0,0.35), inset 0 0 0 1px #444",
        }}
      >
        {/* Volume + power chrome */}
        <span
          aria-hidden="true"
          className="absolute"
          style={{
            left: -3,
            top: "11%",
            width: 3,
            height: 26,
            borderRadius: "2px 0 0 2px",
            background: "linear-gradient(to left, #2a2a2a, #3a3a3a)",
          }}
        />
        <span
          aria-hidden="true"
          className="absolute"
          style={{
            left: -3,
            top: "16%",
            width: 3,
            height: 44,
            borderRadius: "2px 0 0 2px",
            background: "linear-gradient(to left, #2a2a2a, #3a3a3a)",
          }}
        />
        <span
          aria-hidden="true"
          className="absolute"
          style={{
            left: -3,
            top: "23%",
            width: 3,
            height: 44,
            borderRadius: "2px 0 0 2px",
            background: "linear-gradient(to left, #2a2a2a, #3a3a3a)",
          }}
        />
        <span
          aria-hidden="true"
          className="absolute"
          style={{
            right: -3,
            top: "20%",
            width: 3,
            height: 70,
            borderRadius: "0 2px 2px 0",
            background: "linear-gradient(to right, #2a2a2a, #3a3a3a)",
          }}
        />

        {/* Screen */}
        <div
          className="relative h-full w-full overflow-hidden bg-black"
          style={{ borderRadius: 42 }}
        >
          {/* Screenshot (locked to image's native aspect ratio for
              deterministic overlay positioning) */}
          <div
            className="relative w-full"
            style={{ aspectRatio: "1206 / 2622" }}
          >
            <Image
              key={scene.image}
              src={scene.image}
              alt={scene.alt}
              fill
              priority={false}
              sizes="(min-width: 1024px) 320px, 280px"
              className="object-cover object-top animate-[fadeIn_220ms_ease-out_forwards]"
            />

            {/* Overlays */}
            {scene.overlays?.map((overlay, idx) => (
              <OverlayLayer key={`${scene.id}-overlay-${idx}`} overlay={overlay} />
            ))}

            {/* Primary hotspot (with pulse hint) */}
            {scene.primary && (
              <HotspotButton
                hotspot={scene.primary}
                onActivate={() => onHotspot(scene.primary!)}
                pulse={!hasInteracted}
              />
            )}

            {/* Secondary hotspots */}
            {scene.secondary?.map((hs, idx) => (
              <HotspotButton
                key={`${scene.id}-sec-${idx}`}
                hotspot={hs}
                onActivate={() => onHotspot(hs)}
              />
            ))}

            {/* Interactive tab nav — lives INSIDE the screen at the bottom,
                visually overlaying the screenshot's native nav so visitors
                see a single nav that responds to their taps. Hidden on
                lesson-modal scenes (4–7). */}
            {!scene.hideTabNav && (
              <nav
                aria-label="App tabs"
                // Min-height tuned so the overlay fully covers the native iOS
                // tab nav burned into the source PNGs (~12% of screen height,
                // roughly 75px at a 320x692 phone).
                className="absolute left-0 right-0 bottom-0 bg-white border-t border-gray-mid/40 grid grid-cols-5 pt-3 pb-3 min-h-[75px]"
              >
                {TABS.map((tab) => {
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => onTab(tab.key)}
                      aria-label={`Jump to ${tab.label}`}
                      aria-pressed={isActive}
                      className={`flex flex-col items-center justify-center gap-1 px-1 py-0.5 transition-colors ${
                        isActive
                          ? "text-orange"
                          : "text-gray-warm/70 hover:text-ink"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="block h-5 w-5"
                      >
                        {tab.icon}
                      </span>
                      <span className="font-medium leading-none text-[10px]">
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </nav>
            )}

            {/* Toast — sits above the tab nav when nav is visible */}
            {toast && (
              <div
                role="status"
                aria-live="polite"
                className={`absolute left-1/2 -translate-x-1/2 bg-ink/95 text-cream text-[11px] font-medium px-3 py-2 rounded-full shadow-lg max-w-[80%] text-center animate-[fadeUp_180ms_ease-out_forwards] ${
                  scene.hideTabNav ? "bottom-[15%]" : "bottom-[14%]"
                }`}
              >
                {toast}
              </div>
            )}
          </div>

          {/* Dynamic island (sits over screenshot, inside the screen) */}
          <div
            aria-hidden="true"
            className="absolute bg-black"
            style={{
              top: 8,
              left: "50%",
              transform: "translateX(-50%)",
              width: "32%",
              height: 26,
              borderRadius: 18,
              zIndex: 5,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────────────── */

function OverlayLayer({ overlay }: { overlay: Overlay }) {
  if (overlay.kind === "text") {
    const padX = overlay.pad?.x ?? (overlay.bg ? 6 : 0);
    const padY = overlay.pad?.y ?? (overlay.bg ? 2 : 0);
    const style: React.CSSProperties = {
      position: "absolute",
      top: overlay.top,
      ...(overlay.left !== undefined ? { left: overlay.left } : {}),
      ...(overlay.right !== undefined ? { right: overlay.right } : {}),
      transform: "translateY(-50%)",
      whiteSpace: "nowrap",
      lineHeight: 1,
      ...(overlay.bg
        ? {
            backgroundColor: overlay.bg,
            padding: `${padY}px ${padX}px`,
            borderRadius: 2,
          }
        : {}),
      ...overlay.style,
    };
    return (
      <span
        aria-hidden="true"
        className={`pointer-events-none ${overlay.className ?? ""}`}
        style={style}
      >
        {overlay.text}
      </span>
    );
  }

  if (overlay.kind === "check") {
    return (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full flex items-center justify-center shadow-sm"
        style={{
          top: overlay.top,
          left: overlay.left,
          width: overlay.size,
          aspectRatio: "1 / 1",
          background: "#34C759",
          border: "2px solid white",
          transform: "translate(-50%, -50%)",
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-1/2 h-1/2"
        >
          <path d="M5 12l5 5L20 7" />
        </svg>
      </span>
    );
  }

  // progress
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{
        top: overlay.top,
        left: overlay.left,
        width: overlay.width,
        height: overlay.height,
      }}
    >
      <span
        className="block h-full rounded-full"
        style={{
          width: `${overlay.fill * 100}%`,
          background: "#388E3C",
        }}
      />
    </span>
  );
}

function HotspotButton({
  hotspot,
  onActivate,
  pulse,
}: {
  hotspot: Hotspot;
  onActivate: () => void;
  pulse?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-label={hotspot.label}
      className="absolute group bg-transparent border-0 p-0 m-0"
      style={{
        top: hotspot.top,
        left: hotspot.left,
        width: hotspot.width,
        height: hotspot.height,
      }}
    >
      {pulse && (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-2xl border-2 border-orange/80 opacity-90 animate-[pingSoft_1.6s_ease-out_infinite]"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-2xl bg-orange/15"
          />
        </>
      )}
      <span className="sr-only">{hotspot.label}</span>
    </button>
  );
}
