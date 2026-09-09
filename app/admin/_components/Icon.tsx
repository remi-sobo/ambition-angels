import type { ReactNode } from "react";
import type { IconName } from "@/lib/admin/nav";

// ── Icons ────────────────────────────────────────────────────────────────────
// One icon set for the whole shell. Extracted from the V1 Sidebar when it
// retired with NAV_SECTIONS (Spec B's named cleanup) — the V2 chrome
// (V2Sidebar, V2MobileBar) kept consuming these, so they moved rather than
// died. Rendered markup unchanged.

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
