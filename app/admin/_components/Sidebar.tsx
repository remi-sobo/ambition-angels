"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { AdminUser } from "@/lib/admin/auth";

// ── BloomOS IA (docs/bloomos/06-design-system.md §1) ────────────────────────
// Seven sections mapped over the pages that exist today. Items without a
// page yet render as muted "Soon" rows — the sidebar is the product's table
// of contents, so the full IA is visible even before every module ships.

type IconName =
  | "overview" | "briefing"
  | "students" | "cohorts" | "intake" | "demoday" | "camp" | "schools" | "app" | "internships" | "career"
  | "majorgifts" | "donors" | "grants" | "campaigns" | "events"
  | "finance" | "revenue" | "expenses" | "budget" | "cashflow"
  | "webanalytics" | "appanalytics" | "studentanalytics" | "surveys"
  | "tasks" | "monday" | "friday" | "projects" | "meetings" | "team" | "documents"
  | "board" | "compliance" | "kpis" | "strategy";

type NavItem = { label: string; icon: IconName; href?: string; soon?: boolean };
type NavSection = { label: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Command Center",
    items: [
      { label: "Overview", icon: "overview", href: "/admin" },
      { label: "Executive Briefing", icon: "briefing", href: "/admin/briefing" },
      { label: "How-To Guide", icon: "documents", href: "/admin/howto" },
    ],
  },
  {
    label: "Program",
    items: [
      { label: "Students", icon: "students", href: "/admin/students" },
      { label: "Cohorts", icon: "cohorts", href: "/admin/cohorts" },
      { label: "Intake", icon: "intake", href: "/admin/intake" },
      { label: "Demo Day", icon: "demoday", href: "/admin/demoday" },
      { label: "YGB Camp", icon: "camp", href: "/admin/ygb" },
      { label: "Schools & Partners", icon: "schools", href: "/admin/partners" },
      { label: "Ambition App", icon: "app", soon: true },
      { label: "Internships", icon: "internships", soon: true },
      { label: "Career Readiness", icon: "career", soon: true },
    ],
  },
  {
    label: "Fundraising",
    items: [
      { label: "Today's Moves", icon: "tasks", href: "/admin/fundraising/today" },
      { label: "Donors", icon: "donors", href: "/admin/fundraising/donors" },
      { label: "Major Gifts", icon: "majorgifts", href: "/admin/fundraising" },
      { label: "Strategy", icon: "strategy", href: "/admin/fundraising/strategy" },
      { label: "Prospects", icon: "events", href: "/admin/fundraising/prospects" },
      { label: "Grants", icon: "grants", href: "/admin/fundraising/grants" },
      { label: "Campaigns", icon: "campaigns", href: "/admin/fundraising/campaigns" },
      { label: "Events", icon: "events", soon: true },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Overview", icon: "finance", href: "/admin/finance" },
      { label: "Revenue", icon: "revenue", href: "/admin/finance/revenue" },
      { label: "Expenses", icon: "expenses", href: "/admin/finance/transactions" },
      { label: "Budget vs Actual", icon: "budget", href: "/admin/finance/budget" },
      { label: "Cash Flow", icon: "cashflow", soon: true },
    ],
  },
  {
    label: "Data",
    items: [
      { label: "Website Analytics", icon: "webanalytics", href: "/admin/analytics" },
      { label: "App Analytics", icon: "appanalytics", soon: true },
      { label: "Student Analytics", icon: "studentanalytics", soon: true },
      { label: "Surveys", icon: "surveys", soon: true },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Tasks", icon: "tasks", href: "/admin/ops" },
      { label: "Monday Plan", icon: "monday", href: "/admin/ops/monday" },
      { label: "Friday Review", icon: "friday", href: "/admin/ops/friday" },
      { label: "Projects", icon: "projects", href: "/admin/ops/projects" },
      { label: "Meetings", icon: "meetings", href: "/admin/meet" },
      { label: "Team", icon: "team", soon: true },
      { label: "Documents", icon: "documents", soon: true },
    ],
  },
  {
    label: "Governance",
    items: [
      { label: "Board", icon: "board", href: "/admin/board" },
      { label: "Compliance", icon: "compliance", href: "/admin/compliance" },
      { label: "KPIs", icon: "kpis", href: "/admin/kpis" },
      { label: "Strategic Plan", icon: "strategy", href: "/admin/strategic-plan" },
    ],
  },
];

// ── Icons ────────────────────────────────────────────────────────────────────

const ICON_NODES: Record<IconName, ReactNode> = {
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

function Icon({ name, className }: { name: IconName; className?: string }) {
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

// ── Active matching ──────────────────────────────────────────────────────────
// Longest-prefix wins so "/admin" (Overview) doesn't light up on every page,
// and "/admin/ops" (Tasks) yields to "/admin/ops/projects" (Projects). Pages
// without a nav item of their own (e.g. /admin/finance/rules) light up their
// nearest ancestor.

function activeHref(pathname: string): string | null {
  let best: string | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (!item.href) continue;
      const match = pathname === item.href || pathname.startsWith(item.href + "/");
      if (match && (best === null || item.href.length > best.length)) best = item.href;
    }
  }
  return best;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const fmtAgo = (iso: string): string => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

type SyncStatus = "running" | "completed" | "failed" | "partial";
type SyncResponse = {
  jobId: string;
  status: SyncStatus;
  finished_at: string | null;
  counts: { contacts: number; companies: number; deals: number; engagements: number };
  errors: Array<{ step: string; message: string }>;
};

const ZERO = { contacts: 0, companies: 0, deals: 0, engagements: 0 };

// ── Data-age indicator ──────────────────────────────────────────────────────
// Mirrors lib/admin/dataAge.ts (the source of truth). The spine is refreshed
// by a manual sync with no scheduler, so staleness must be loud, dated, and
// color-coded — not a grey "500h ago". Colors are the status scale tuned for
// the dark espresso sidebar (light-on-dark, AA+ verified in the Phase 0 note).
type DataAge = {
  lastFullSyncAt: string | null;
  ageLabel: string;
  ageDays: number | null;
  severity: "fresh" | "watch" | "stale";
  lastRunStatus: "completed" | "partial" | "failed" | "running" | null;
};

const AGE_COLOR: Record<DataAge["severity"], string> = {
  fresh: "#7FC9A3", // green
  watch: "#E8B45A", // amber
  stale: "#E88A6F", // red
};

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// Short label shown next to the hamburger on the mobile top bar.
function activeSectionLabel(pathname: string): string {
  const href = activeHref(pathname);
  if (href) {
    for (const section of NAV_SECTIONS) {
      const item = section.items.find((i) => i.href === href);
      if (item) return item.label;
    }
  }
  return "BloomOS";
}

export default function Sidebar({ currentUser }: { currentUser: AdminUser | null }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [job, setJob] = useState<SyncResponse | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [dataAge, setDataAge] = useState<DataAge | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Polling design: POST every 2s while running. Each call advances the job
  // by one chunk AND returns the updated state. GET on mount only, to
  // hydrate "Last synced" so it survives full reloads.
  useEffect(() => {
    fetch("/api/admin/hubspot/sync")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.jobId && setJob(j as SyncResponse))
      .catch(() => {});
  }, []);

  // Data age — the honest "how old is the spine" indicator. Re-fetched after a
  // sync finishes (job dependency) so the freshness clock updates in place.
  useEffect(() => {
    if (!currentUser) return;
    fetch("/api/admin/data-age")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDataAge(d as DataAge))
      .catch(() => {});
  }, [currentUser, job?.finished_at]);

  useEffect(() => {
    if (!job || job.status !== "running") return;
    pollRef.current = setTimeout(async () => {
      try {
        const r = await fetch("/api/admin/hubspot/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: job.jobId }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setJob(await r.json());
      } catch (e) {
        setSyncError(e instanceof Error ? e.message : "Sync failed");
        setJob((p) => (p ? { ...p, status: "failed" } : p));
      }
    }, 2000);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [job]);

  const startSync = useCallback(async () => {
    setSyncError(null);
    try {
      const r = await fetch("/api/admin/hubspot/sync", { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setJob(await r.json());
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    }
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try { await fetch("/api/admin/logout", { method: "POST" }); } catch {}
    router.push("/admin");
    router.refresh();
  };

  const counts = job?.counts ?? ZERO;
  const running = job?.status === "running";
  const partial = job?.status === "partial";
  const finished = job?.status === "completed" || partial;
  const syncLabel = syncError
    ? "Sync failed — retry"
    : running
    ? "Syncing…"
    : finished && job?.finished_at
    ? `${partial ? "Synced (partial)" : "Synced"} ${fmtAgo(job.finished_at)}`
    : "Sync HubSpot";

  const active = activeHref(pathname);

  const navPanel = (
    <>
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
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
          <div className="font-display font-black text-2xl normal-case tracking-tight text-cream leading-none">
            Bloom<span className="text-[#A8B58C]">OS</span>
          </div>
        </div>
        <div className="text-[11px] tracking-wide text-cream/50 mt-1.5">
          Operating System for Ambition Angels
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="px-3 mb-1.5 text-[11px] font-heading font-semibold uppercase tracking-[0.14em] text-cream/35">
              {section.label}
            </div>
            <div className="space-y-px">
              {section.items.map((item) =>
                item.href ? (
                  <Link
                    key={item.label + item.href}
                    href={item.href}
                    className={[
                      "flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] font-medium transition-colors",
                      active === item.href
                        ? "bg-orange text-[#FFF6EC] shadow-sm"
                        : "text-cream/70 hover:text-cream hover:bg-white/10",
                    ].join(" ")}
                  >
                    <Icon
                      name={item.icon}
                      className={`w-4 h-4 shrink-0 ${active === item.href ? "" : "opacity-70"}`}
                    />
                    <span className="truncate">{item.label}</span>
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
        <>
          <div className="px-4 py-3 border-t border-white/10 space-y-2">
            <button
              onClick={startSync}
              disabled={running}
              title={partial ? job?.errors.map((e) => `${e.step}: ${e.message}`).join("\n") : undefined}
              className="w-full text-left text-xs font-semibold text-cream/80 hover:text-cream bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-lg transition-colors disabled:cursor-default flex items-center gap-2"
            >
              <span aria-hidden className={running ? "animate-pulse" : ""}>{partial ? "⚠" : running ? "⟳" : "↻"}</span>
              <span className="truncate">{syncLabel}</span>
            </button>
            {(running || finished) && (
              <div className="text-[10px] text-cream/40 leading-relaxed font-mono">
                C {counts.contacts} · Co {counts.companies} · D {counts.deals} · E {counts.engagements}
              </div>
            )}
            {dataAge && !running && (
              <div className="flex items-start gap-2 pt-0.5">
                <span
                  aria-hidden
                  className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: AGE_COLOR[dataAge.severity] }}
                />
                <div className="min-w-0 leading-tight">
                  <div className="text-[11px] font-semibold" style={{ color: AGE_COLOR[dataAge.severity] }}>
                    {dataAge.lastFullSyncAt ? `Data ${dataAge.ageLabel} old` : "Never fully synced"}
                    {dataAge.lastRunStatus === "partial" && " · last run partial"}
                  </div>
                  <div className="text-[10px] text-cream/40">
                    {dataAge.lastFullSyncAt
                      ? `Last full sync ${fmtDate(dataAge.lastFullSyncAt)}`
                      : "Run a sync to populate the spine"}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-white/10 space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-cream/50 truncate">
                {`Logged in as ${cap(currentUser)}`}
              </div>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="text-xs font-semibold text-cream/60 hover:text-cream bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 shrink-0"
              >
                {loggingOut ? "Logging out…" : "Log out"}
              </button>
            </div>
            <div className="text-[10px] text-cream/25 leading-relaxed">
              BloomOS™ · built by SOBO Consulting
            </div>
          </div>
        </>
      )}

      {!currentUser && (
        <div className="px-5 py-4 border-t border-white/10 text-[11px] text-cream/40 leading-relaxed">
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
          {activeSectionLabel(pathname)}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {currentUser && (
            <button
              onClick={startSync}
              disabled={running}
              aria-label={syncLabel}
              title={syncLabel}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-cream/80 hover:text-cream bg-white/5 hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-60"
            >
              <span aria-hidden className={running ? "animate-pulse" : ""}>
                {partial ? "⚠" : running ? "⟳" : "↻"}
              </span>
            </button>
          )}
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
            "absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-navy border-r border-white/10 flex flex-col shadow-2xl",
            "pt-[env(safe-area-inset-top)] transition-transform duration-200 ease-out will-change-transform",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
          role="dialog"
          aria-label="BloomOS navigation"
        >
          {navPanel}
        </aside>
      </div>

      {/* ── Desktop sidebar (visible >= lg) ───────────────────────────── */}
      {/* Sticky + h-screen pins the chrome while the content column scrolls;
          the section nav scrolls internally when taller than the viewport. */}
      <aside className="hidden lg:flex w-[248px] shrink-0 border-r border-white/10 bg-navy flex-col lg:sticky lg:top-0 lg:h-screen lg:pt-[env(safe-area-inset-top)]">
        {navPanel}
      </aside>
    </>
  );
}
