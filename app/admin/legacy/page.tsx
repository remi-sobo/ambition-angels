"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import AnalyticsView from "../AnalyticsView";
import { TYPE } from "@/lib/admin/typeScale";

// ── Types ──────────────────────────────────────────────────────────────────

type Career = { title: string; description?: string; salary: string; why?: string };

type Submission = {
  id: string;
  created_at: string;
  email: string | null;
  teen_name: string | null;
  audience: string | null;
  age: string | null;
  status: string | null;
  location: string | null;
  subjects: string | null;
  work_style: string | null;
  problem_types: string | null;
  good_at: string | null;
  people_come: string | null;
  free_time: string | null;
  flow_state: string | null;
  dream_day: string | null;
  future_self: string | null;
  money_vs_meaning: number | null;
  career_matches: Career[] | null;
};

type Stats = {
  thisMonth: number;
  allTime: number;
  withEmail: number;
  emailRate: number;
  teens: number;
  adults: number;
  topCareer: string;
  careerBreakdown: { title: string; count: number }[];
  avgMoneyVsMeaning: number;
  mostCommonAge: string;
  mostCommonLocation: string;
  mostCommonWorkStyle: string;
};

type Donation = {
  id: string;
  created_at: string;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  email: string | null;
  amount: number;
  recurring: boolean;
  stripe_payment_id: string;
  subscription_id?: string | null;
  status?: string | null;
};

type DonorProfile = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  totalGiven: number;
  donationCount: number;
  firstDonation: string;
  lastDonation: string;
  recurring: boolean;
  lastAmount: number;
};

type DonationStats = {
  totalRaised: number;
  thisMonthRaised: number;
  donorCount: number;
  donorsThisMonth: number;
  recurringDonors: number;
  avgGift: number;
  donations: Donation[];
  donorProfiles: DonorProfile[];
};

type PartnerSignup = {
  id: string;
  created_at: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  teen_count: string | null;
};

type PartnerData = {
  signups: PartnerSignup[];
  roleBreakdown: { role: string; count: number }[];
};

type ProgramPartner = {
  id: string;
  created_at: string;
  first_name: string;
  last_name: string;
  org_name: string;
  email: string;
  program_type: string;
  teen_count: string | null;
};

type ProgramData = {
  signups: ProgramPartner[];
  typeBreakdown: { type: string; count: number }[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtLastUpdated(date: Date): string {
  const m = Math.floor((Date.now() - date.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m === 1) return "1 min ago";
  return `${m} mins ago`;
}

function fmtMoney(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function donorDisplayName(d: Donation | DonorProfile): string {
  if ("firstName" in d) {
    return [d.firstName, d.lastName].filter(Boolean).join(" ") || d.email || "Anonymous";
  }
  return (d as Donation).first_name
    ? [(d as Donation).first_name, (d as Donation).last_name].filter(Boolean).join(" ")!
    : (d as Donation).name || "Anonymous";
}

function donorInitial(d: Donation | DonorProfile): string {
  const n = donorDisplayName(d);
  return n[0]?.toUpperCase() ?? "$";
}

function exportSubmissionsCSV(rows: Submission[]) {
  const headers = [
    "Date", "Name", "Email", "Audience", "Age", "Location",
    "Subjects", "Work Style", "Good At", "People Come To Them For",
    "Free Time", "Flow State", "Dream Day", "Future Self",
    "Money vs Meaning",
    "Career 1", "Salary 1", "Career 2", "Salary 2", "Career 3", "Salary 3",
  ];
  const data = rows.map((s) => [
    fmtDate(s.created_at),
    s.teen_name || "",
    s.email || "",
    s.audience || "",
    s.age || "",
    s.location || "",
    s.subjects || "",
    s.work_style || "",
    s.good_at || "",
    s.people_come || "",
    s.free_time || "",
    s.flow_state || "",
    s.dream_day || "",
    s.future_self || "",
    s.money_vs_meaning ?? "",
    s.career_matches?.[0]?.title || "",
    s.career_matches?.[0]?.salary || "",
    s.career_matches?.[1]?.title || "",
    s.career_matches?.[1]?.salary || "",
    s.career_matches?.[2]?.title || "",
    s.career_matches?.[2]?.salary || "",
  ]);
  const csv = [headers, ...data]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `quiz-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportDonationsCSV(rows: Donation[]) {
  const headers = ["Date", "Name", "Email", "Amount", "Type", "Status", "Stripe ID"];
  const data = rows.map((d) => [
    fmtDate(d.created_at),
    donorDisplayName(d),
    d.email || "",
    d.amount,
    d.recurring ? "Monthly" : "One-time",
    d.status || "succeeded",
    d.stripe_payment_id,
  ]);
  const csv = [headers, ...data]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `donations-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 25;

// ── Skeleton ───────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-tile rounded-lg ${className}`} />;
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();

  // Auth. Middleware gates /admin/legacy on a session, so anyone who
  // reaches this page is signed in — start optimistic to avoid flashing
  // the login form while the first fetch is in flight; a 401 flips it.
  const [authed, setAuthed] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  // Data
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [donationStats, setDonationStats] = useState<DonationStats | null>(null);
  const [partnerData, setPartnerData] = useState<PartnerData | null>(null);
  const [programData, setProgramData] = useState<ProgramData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Quiz table state
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<"week" | "month" | "all">("all");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Donations table state
  const [donationSearch, setDonationSearch] = useState("");
  const [donationPage, setDonationPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"feed" | "table" | "profiles">("feed");

  // Top-level admin view selector
  const [mainView, setMainView] = useState<"overview" | "analytics">("overview");

  // Force re-render for "X mins ago"
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, donationsRes, partnersRes, programsRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/admin/donations"),
        fetch("/api/admin/partners"),
        fetch("/api/admin/programs"),
      ]);
      if (statsRes.status === 401) { setAuthed(false); return; }
      if (!statsRes.ok) {
        const body = await statsRes.json().catch(() => ({}));
        throw new Error(body?.error ?? `Stats API returned ${statsRes.status}`);
      }
      const data = await statsRes.json();
      setSubmissions(data.submissions ?? []);
      setStats(data.stats);
      if (donationsRes.ok) {
        const dData = await donationsRes.json();
        setDonationStats(dData);
      } else {
        const dBody = await donationsRes.json().catch(() => ({}));
        console.error("Donations API error:", dBody?.error ?? donationsRes.status);
      }
      if (partnersRes.ok) {
        setPartnerData(await partnersRes.json());
      }
      if (programsRes.ok) {
        setProgramData(await programsRes.json());
      }
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount: check if already authed via cookie
  useEffect(() => {
    fetch("/api/admin/stats").then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions ?? []);
        setStats(data.stats);
        setLastUpdated(new Date());
        setAuthed(true);
        fetch("/api/admin/donations").then(async (dRes) => {
          if (dRes.ok) setDonationStats(await dRes.json());
        });
        fetch("/api/admin/partners").then(async (pRes) => {
          if (pRes.ok) setPartnerData(await pRes.json());
        });
        fetch("/api/admin/programs").then(async (pgRes) => {
          if (pgRes.ok) setProgramData(await pgRes.json());
        });
      }
    });
  }, []);

  useEffect(() => {
    if (authed) fetchData();
  }, [authed]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        setAuthed(true);
        router.refresh(); // re-render the server layout so the sidebar picks up the session
      } else {
        setLoginError("Invalid email or password.");
      }
    } finally {
      setLoggingIn(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      setLoginError("Enter your email first.");
      return;
    }
    setLoggingIn(true);
    setLoginError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, magic: true }),
      });
      if (res.ok) setMagicSent(true);
      else setLoginError("Could not send the sign-in link.");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
    setSubmissions([]);
    setStats(null);
    router.refresh();
  };

  // ── Filtered submissions ─────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const now = new Date();
    let rows = submissions;
    if (dateFilter === "week") {
      const cutoff = new Date(now.getTime() - 7 * 86400000).toISOString();
      rows = rows.filter((s) => s.created_at >= cutoff);
    } else if (dateFilter === "month") {
      const cutoff = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      rows = rows.filter((s) => s.created_at >= cutoff);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (s) =>
          s.teen_name?.toLowerCase().includes(q) ||
          s.email?.toLowerCase().includes(q) ||
          s.location?.toLowerCase().includes(q) ||
          s.career_matches?.[0]?.title?.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [submissions, search, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => setPage(1), [search, dateFilter]);

  // ── Filtered donations ───────────────────────────────────────────────────

  const filteredDonations = useMemo(() => {
    const all = donationStats?.donations ?? [];
    if (!donationSearch.trim()) return all;
    const q = donationSearch.toLowerCase();
    return all.filter(
      (d) =>
        donorDisplayName(d).toLowerCase().includes(q) ||
        d.email?.toLowerCase().includes(q)
    );
  }, [donationStats, donationSearch]);

  const donationTotalPages = Math.max(1, Math.ceil(filteredDonations.length / PAGE_SIZE));
  const paginatedDonations = filteredDonations.slice(
    (donationPage - 1) * PAGE_SIZE,
    donationPage * PAGE_SIZE
  );
  useEffect(() => setDonationPage(1), [donationSearch]);

  // ── LOGIN SCREEN ─────────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div
        className="min-h-screen bg-ink flex items-center justify-center px-4"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-10 w-full max-w-sm shadow-2xl">
          <div className="font-display font-black text-3xl text-ink-1 mb-1 tracking-tight uppercase">BloomOS</div>
          <div className={`${TYPE.bodyMuted} mb-8`}>The operating system for nonprofits</div>
          {magicSent ? (
            <div className={`${TYPE.body} leading-relaxed`}>
              Check your email — we sent a one-time sign-in link to{" "}
              <span className="text-ink-1 font-semibold">{email}</span>.
            </div>
          ) : (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoComplete="email"
                className={`bg-tile border-[1.5px] border-outline rounded-xl px-4 py-3 ${TYPE.body} placeholder-ink-3 focus:outline-none focus:border-orange/50`}
                autoFocus
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                className={`bg-tile border-[1.5px] border-outline rounded-xl px-4 py-3 ${TYPE.body} placeholder-ink-3 focus:outline-none focus:border-orange/50`}
              />
              {loginError && <p className="text-expense text-xs">{loginError}</p>}
              <button
                type="submit"
                disabled={loggingIn}
                className="bg-orange hover:bg-orange-dark text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60"
              >
                {loggingIn ? "Signing in…" : "Sign In"}
              </button>
              <button
                type="button"
                onClick={handleMagicLink}
                disabled={loggingIn}
                className="text-ink-2 hover:text-ink-1 text-xs transition-colors disabled:opacity-60"
              >
                Email me a one-time sign-in link instead
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ── DASHBOARD ────────────────────────────────────────────────────────────

  const teenPct = stats && stats.allTime > 0 ? Math.round((stats.teens / stats.allTime) * 100) : 0;
  const adultPct = stats && stats.allTime > 0 ? Math.round((stats.adults / stats.allTime) * 100) : 0;
  const maxCareerCount = stats?.careerBreakdown[0]?.count ?? 1;
  const recentTen = submissions.slice(0, 10);

  return (
    <div className="min-h-screen bg-ink">

      {/* ── HEADER ── */}
      <div className="bg-tile border-b border-outline px-4 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3 sticky admin-sticky-top z-30 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`${TYPE.cardTitle} sm:text-base`}>Admin Dashboard</span>
          {lastUpdated && (
            <span className="text-xs text-ink-2 hidden md:block">
              · Updated {fmtLastUpdated(lastUpdated)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            aria-label="Refresh"
            className="text-xs font-semibold text-orange bg-orange/10 border border-orange/30 px-3 sm:px-4 py-2 rounded-full hover:bg-orange/20 transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0115-4.5M20 15a9 9 0 01-15 4.5" />
            </svg>
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={() => exportSubmissionsCSV(filtered)}
            className="text-xs font-semibold text-ink-2 bg-tile border-[1.5px] border-outline px-3 sm:px-4 py-2 rounded-full hover:bg-[#EFE6D4] transition-colors"
          >
            <span className="sm:hidden">CSV</span>
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={handleLogout}
            className="text-xs font-semibold text-ink-3 hover:text-ink-2 transition-colors hidden sm:inline-block"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8 space-y-8">

        {error && (
          <div className="bg-expense-bg border border-expense/30 rounded-xl px-5 py-3 text-expense text-sm">
            {error}
          </div>
        )}

        {/* ── MAIN VIEW TABS ── */}
        <div className="flex gap-1 border-b border-outline">
          {([
            { id: "overview", label: "Overview" },
            { id: "analytics", label: "Analytics" },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setMainView(t.id)}
              className={`px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                mainView === t.id
                  ? "text-orange border-orange"
                  : "text-ink-2 border-transparent hover:text-ink-1"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {mainView === "analytics" && <AnalyticsView />}

        <div className={`space-y-10 ${mainView !== "overview" ? "hidden" : ""}`}>

        {/* ── ROW 1A: QUIZ PULSE CARDS ── */}
        <div>
          <p className="text-xs font-bold text-ink-3 uppercase tracking-widest mb-3">Career Quiz</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

            <div className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-6">
              {loading || !stats ? (
                <><Skeleton className="h-10 w-20 mb-2" /><Skeleton className="h-3 w-32" /></>
              ) : (
                <>
                  <div className="font-display font-black text-5xl text-orange tracking-tight leading-none mb-2">{stats.thisMonth}</div>
                  <div className={`${TYPE.bodyMuted} font-medium`}>Submissions this month</div>
                  <div className="text-ink-3 text-xs mt-1">{stats.allTime} all time</div>
                </>
              )}
            </div>

            <div className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-6">
              {loading || !stats ? (
                <><Skeleton className="h-10 w-20 mb-2" /><Skeleton className="h-3 w-32" /></>
              ) : (
                <>
                  <div className="font-display font-black text-5xl text-orange tracking-tight leading-none mb-2">{stats.emailRate}%</div>
                  <div className={`${TYPE.bodyMuted} font-medium`}>Email capture rate</div>
                  <div className="text-ink-3 text-xs mt-1">{stats.withEmail} of {stats.allTime} left email</div>
                </>
              )}
            </div>

            <div className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-6">
              {loading || !stats ? (
                <><Skeleton className="h-10 w-28 mb-2" /><Skeleton className="h-3 w-32" /></>
              ) : (
                <>
                  <div className="font-display font-black text-3xl text-orange tracking-tight leading-none mb-2">
                    {teenPct}%<span className="text-ink-3 text-2xl mx-1">·</span>{adultPct}%
                  </div>
                  <div className={`${TYPE.bodyMuted} font-medium`}>Quiz audience split</div>
                  <div className="text-ink-3 text-xs mt-1">teens · adults</div>
                </>
              )}
            </div>

            <div className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-6">
              {loading || !stats ? (
                <><Skeleton className="h-7 w-full mb-2" /><Skeleton className="h-3 w-32" /></>
              ) : (
                <>
                  <div className="font-heading font-bold text-xl text-ink-1 leading-tight mb-2 min-h-[3rem] flex items-center">{stats.topCareer}</div>
                  <div className={`${TYPE.bodyMuted} font-medium`}>Most matched career</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── ROW 1B: DONATION PULSE CARDS ── */}
        <div>
          <p className="text-xs font-bold text-ink-3 uppercase tracking-widest mb-3">Donations</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

            <div className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-6">
              {loading || !donationStats ? (
                <><Skeleton className="h-10 w-20 mb-2" /><Skeleton className="h-3 w-32" /></>
              ) : (
                <>
                  <div className="font-display font-black text-4xl text-orange tracking-tight leading-none mb-2">
                    {fmtMoney(donationStats.totalRaised)}
                  </div>
                  <div className={`${TYPE.bodyMuted} font-medium`}>Total raised</div>
                  <div className="text-ink-3 text-xs mt-1">{fmtMoney(donationStats.thisMonthRaised)} this month</div>
                </>
              )}
            </div>

            <div className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-6">
              {loading || !donationStats ? (
                <><Skeleton className="h-10 w-20 mb-2" /><Skeleton className="h-3 w-32" /></>
              ) : (
                <>
                  <div className="font-display font-black text-5xl text-orange tracking-tight leading-none mb-2">
                    {donationStats.donorsThisMonth}
                  </div>
                  <div className={`${TYPE.bodyMuted} font-medium`}>Donors this month</div>
                  <div className="text-ink-3 text-xs mt-1">{donationStats.donorCount} total unique</div>
                </>
              )}
            </div>

            <div className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-6">
              {loading || !donationStats ? (
                <><Skeleton className="h-10 w-20 mb-2" /><Skeleton className="h-3 w-32" /></>
              ) : (
                <>
                  <div className="font-display font-black text-5xl text-orange tracking-tight leading-none mb-2">
                    {donationStats.recurringDonors}
                  </div>
                  <div className={`${TYPE.bodyMuted} font-medium`}>Recurring donors</div>
                  <div className="text-ink-3 text-xs mt-1">Monthly givers</div>
                </>
              )}
            </div>

            <div className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-6">
              {loading || !donationStats ? (
                <><Skeleton className="h-10 w-20 mb-2" /><Skeleton className="h-3 w-32" /></>
              ) : (
                <>
                  <div className="font-display font-black text-4xl text-orange tracking-tight leading-none mb-2">
                    {fmtMoney(donationStats.avgGift)}
                  </div>
                  <div className={`${TYPE.bodyMuted} font-medium`}>Average gift size</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── ROW 2: SUBMISSIONS TABLE ── */}
        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          <div className="px-6 py-5 border-b border-outline flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <h2 className={TYPE.sectionTitle}>Career Quiz Submissions</h2>
              <p className="text-ink-2 text-xs mt-0.5">{filtered.length} result{filtered.length !== 1 ? "s" : ""} · {totalPages} page{totalPages !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg overflow-hidden border-[1.5px] border-outline">
                {(["week", "month", "all"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setDateFilter(f)}
                    className={`text-xs font-semibold px-3 py-2 transition-colors ${dateFilter === f ? "bg-orange text-white" : "text-ink-2 hover:text-ink-1"}`}
                  >
                    {f === "week" ? "This Week" : f === "month" ? "This Month" : "All Time"}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, location…"
                className="bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-xs placeholder-ink-3 focus:outline-none focus:border-orange/40 w-52"
              />
            </div>
          </div>

          {/* Mobile: stacked cards (≤ md). The full table stays for tablet+. */}
          <div className="md:hidden divide-y divide-hairline">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-4 py-4"><Skeleton className="h-16 w-full" /></div>
              ))
            ) : paginated.length === 0 ? (
              <p className={`px-4 py-10 text-center ${TYPE.bodyMuted}`}>No submissions found.</p>
            ) : (
              paginated.map((s) => {
                const open = expandedId === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => setExpandedId(open ? null : s.id)}
                    className={`px-4 py-4 transition-colors ${open ? "bg-orange/10" : "active:bg-tile"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-semibold ${TYPE.body} truncate`}>{s.teen_name || "Anonymous"}</span>
                          {s.audience && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.audience === "teen" ? "bg-orange/20 text-orange" : "bg-tile text-ink-2"}`}>{s.audience}</span>
                          )}
                        </div>
                        <div className="text-xs text-ink-2 mt-0.5">
                          {fmtDate(s.created_at)}{s.location ? ` · ${s.location}` : ""}
                        </div>
                      </div>
                      {s.money_vs_meaning !== null && (
                        <span className="text-xs font-semibold text-ink-1 flex-shrink-0">
                          {s.money_vs_meaning}<span className="text-ink-3">/10</span>
                        </span>
                      )}
                    </div>
                    {s.career_matches && s.career_matches.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {s.career_matches.slice(0, 3).map((c, i) => (
                          <span key={i} className="text-[11px] bg-tile border-[1.5px] border-outline text-ink-2 px-2 py-0.5 rounded-full">{c.title}</span>
                        ))}
                      </div>
                    )}
                    {open && (
                      <div className="mt-4 pt-4 border-t border-outline space-y-3">
                        <div className="text-[10px] font-bold text-orange uppercase tracking-widest">Quiz Answers</div>
                        <div className="space-y-1.5 text-xs">
                          {[
                            ["Email", s.email],
                            ["Subjects", s.subjects],
                            ["Work Style", s.work_style],
                            ["Good At", s.good_at],
                            ["People come for", s.people_come],
                            ["Free Time", s.free_time],
                            ["Flow State", s.flow_state],
                            ["Dream Day", s.dream_day],
                            ["Future Self", s.future_self],
                          ].map(([label, val]) => val ? (
                            <div key={String(label)} className="flex gap-2">
                              <span className="text-ink-3 w-28 flex-shrink-0">{label}</span>
                              <span className="text-ink-2 break-words min-w-0">{String(val)}</span>
                            </div>
                          ) : null)}
                        </div>
                        {s.career_matches && s.career_matches.length > 0 && (
                          <>
                            <div className="text-[10px] font-bold text-orange uppercase tracking-widest pt-2">All Matches</div>
                            <div className="space-y-1.5">
                              {s.career_matches.map((c, i) => (
                                <div key={i} className="bg-tile rounded-lg px-2.5 py-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-semibold text-ink-1 truncate">{i + 1}. {c.title}</span>
                                    <span className="text-[11px] text-orange font-semibold whitespace-nowrap flex-shrink-0">{c.salary}</span>
                                  </div>
                                  {c.why && <div className="text-[11px] text-ink-2 mt-0.5 italic">{c.why}</div>}
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-outline">
                  {["Date", "Name", "Email", "Audience", "Age", "Location", "Top 3 Careers", "💰 Score"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-ink-3 uppercase tracking-widest px-5 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-hairline">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-5 py-4"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-16 text-ink-2">No submissions found.</td>
                  </tr>
                ) : (
                  paginated.map((s) => (
                    <>
                      <tr
                        key={s.id}
                        onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                        className={`border-b border-hairline cursor-pointer transition-colors ${expandedId === s.id ? "bg-orange/10" : "hover:bg-[#EFE6D4]"}`}
                      >
                        <td className="px-5 py-4 text-ink-2 whitespace-nowrap text-xs">{fmtDate(s.created_at)}</td>
                        <td className="px-5 py-4 font-medium text-ink-1 whitespace-nowrap">{s.teen_name || <span className="text-ink-3">—</span>}</td>
                        <td className="px-5 py-4 text-ink-2 text-xs">{s.email || <span className="text-ink-3">—</span>}</td>
                        <td className="px-5 py-4">
                          {s.audience ? (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.audience === "teen" ? "bg-orange/20 text-orange" : "bg-tile text-ink-2"}`}>{s.audience}</span>
                          ) : <span className="text-ink-3">—</span>}
                        </td>
                        <td className="px-5 py-4 text-ink-2 text-xs">{s.age || "—"}</td>
                        <td className="px-5 py-4 text-ink-2 text-xs whitespace-nowrap">{s.location || "—"}</td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-1">
                            {s.career_matches?.slice(0, 3).map((c, i) => (
                              <span key={i} className="text-xs bg-tile border-[1.5px] border-outline text-ink-2 px-2 py-0.5 rounded-full whitespace-nowrap">{c.title}</span>
                            )) ?? <span className="text-ink-3">—</span>}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-ink-2 text-xs">
                          {s.money_vs_meaning !== null ? (
                            <span className="font-semibold text-ink-1">{s.money_vs_meaning}<span className="text-ink-3">/10</span></span>
                          ) : "—"}
                        </td>
                      </tr>

                      {expandedId === s.id && (
                        <tr key={`${s.id}-expanded`} className="bg-tile">
                          <td colSpan={8} className="px-6 py-6">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              <div>
                                <div className="text-xs font-bold text-orange uppercase tracking-widest mb-3">Quiz Answers</div>
                                <div className="space-y-2">
                                  {[
                                    ["Subjects / Interests", s.subjects],
                                    ["Work Style", s.work_style],
                                    ["Problem Types", s.problem_types],
                                    ["Good At", s.good_at],
                                    ["People Come To Them For", s.people_come],
                                    ["Free Time", s.free_time],
                                    ["Flow State", s.flow_state],
                                    ["Dream Work Day", s.dream_day],
                                    ["Future Self Goal", s.future_self],
                                    ["Life Status", s.status],
                                    ["Money vs Meaning", s.money_vs_meaning !== null ? `${s.money_vs_meaning}/10` : null],
                                  ].map(([label, val]) => val ? (
                                    <div key={String(label)} className="flex gap-2 text-xs">
                                      <span className="text-ink-3 w-44 flex-shrink-0">{label}</span>
                                      <span className="text-ink-2">{String(val)}</span>
                                    </div>
                                  ) : null)}
                                </div>
                                {s.email && (
                                  <div className="mt-4 pt-4 border-t border-outline">
                                    <div className="text-xs font-bold text-orange uppercase tracking-widest mb-1">Email Sent To</div>
                                    <div className="text-ink-2 text-xs">{s.email}</div>
                                  </div>
                                )}
                              </div>
                              <div>
                                <div className="text-xs font-bold text-orange uppercase tracking-widest mb-3">All Career Matches</div>
                                <div className="space-y-2">
                                  {s.career_matches?.map((c, i) => (
                                    <div key={i} className="bg-tile rounded-lg px-3 py-2">
                                      <div className="flex items-start justify-between gap-2">
                                        <div>
                                          <span className="text-xs font-bold text-ink-3 mr-2">{i + 1}.</span>
                                          <span className="text-xs font-semibold text-ink-1">{c.title}</span>
                                        </div>
                                        <span className="text-xs text-orange font-semibold whitespace-nowrap flex-shrink-0">{c.salary}</span>
                                      </div>
                                      {c.why && <div className="text-xs text-ink-2 mt-0.5 ml-4 italic">{c.why}</div>}
                                    </div>
                                  )) ?? <span className="text-ink-3 text-xs">No matches recorded</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-outline flex items-center justify-between">
              <span className="text-xs text-ink-2">Page {page} of {totalPages} · {filtered.length} rows</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="text-xs font-semibold text-ink-2 bg-tile border-[1.5px] border-outline px-3 py-1.5 rounded-lg hover:bg-[#EFE6D4] disabled:opacity-30 transition-colors">← Prev</button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="text-xs font-semibold text-ink-2 bg-tile border-[1.5px] border-outline px-3 py-1.5 rounded-lg hover:bg-[#EFE6D4] disabled:opacity-30 transition-colors">Next →</button>
              </div>
            </div>
          )}
        </section>

        {/* ── ROW 3: CAREER ANALYTICS ── */}
        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-6">
          <h2 className={`${TYPE.sectionTitle} mb-6`}>Career Match Breakdown</h2>
          {loading || !stats ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-3 w-36 flex-shrink-0" />
                  <Skeleton className="h-6 flex-1" />
                  <Skeleton className="h-3 w-6 flex-shrink-0" />
                </div>
              ))}
            </div>
          ) : stats.careerBreakdown.length === 0 ? (
            <p className={`${TYPE.bodyMuted}`}>No career match data yet.</p>
          ) : (
            <div className="space-y-3 mb-8">
              {stats.careerBreakdown.map(({ title, count }) => {
                const pct = Math.round((count / maxCareerCount) * 100);
                return (
                  <div key={title} className="flex items-center gap-3">
                    <div className="w-44 text-xs text-ink-2 text-right flex-shrink-0 truncate">{title}</div>
                    <div className="flex-1 h-5 bg-tile rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: "#C0703C" }} />
                    </div>
                    <div className="w-7 text-xs text-ink-2 flex-shrink-0 text-right">{count}</div>
                  </div>
                );
              })}
            </div>
          )}
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-6 border-t border-outline">
              {[
                { label: "Avg money vs meaning", value: `${stats.avgMoneyVsMeaning}/10` },
                { label: "Most common age", value: stats.mostCommonAge },
                { label: "Most common location", value: stats.mostCommonLocation },
                { label: "Most common work style", value: stats.mostCommonWorkStyle },
              ].map((item) => (
                <div key={item.label}>
                  <div className="text-xs text-ink-3 uppercase tracking-widest font-semibold mb-1">{item.label}</div>
                  <div className={`font-heading font-semibold ${TYPE.body} truncate`}>{item.value || "N/A"}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── ROW 4: DONATIONS FULL SECTION ── */}
        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          {/* Header + tab bar */}
          <div className="px-6 py-5 border-b border-outline flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <h2 className={TYPE.sectionTitle}>Donations</h2>
              <p className="text-ink-2 text-xs mt-0.5">Powered by Stripe</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex rounded-lg overflow-hidden border-[1.5px] border-outline">
                {(["feed", "table", "profiles"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={`text-xs font-semibold px-3 py-2 transition-colors capitalize ${activeTab === t ? "bg-orange text-white" : "text-ink-2 hover:text-ink-1"}`}
                  >
                    {t === "feed" ? "Recent" : t === "table" ? "All Donations" : "Donor Profiles"}
                  </button>
                ))}
              </div>
              {activeTab === "table" && (
                <button
                  onClick={() => exportDonationsCSV(filteredDonations)}
                  className="text-xs font-semibold text-ink-2 bg-tile border-[1.5px] border-outline px-3 py-1.5 rounded-lg hover:bg-[#EFE6D4] transition-colors"
                >
                  Export CSV
                </button>
              )}
            </div>
          </div>

          {/* ── RECENT FEED ── */}
          {activeTab === "feed" && (
            <div className="p-6">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : !donationStats || donationStats.donations.length === 0 ? (
                <p className={`${TYPE.bodyMuted}`}>No donations recorded yet.</p>
              ) : (
                <div className="space-y-1">
                  {donationStats.donations.slice(0, 20).map((d) => (
                    <div key={d.id} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-[#EFE6D4] transition-colors">
                      <div className="w-9 h-9 rounded-full bg-orange/10 border border-orange/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-orange font-bold text-xs">{donorInitial(d)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-semibold ${TYPE.body}`}>{donorDisplayName(d)}</span>
                          {d.recurring && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange/20 text-orange">Monthly</span>
                          )}
                          {d.status && d.status !== "succeeded" && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-expense-bg text-expense capitalize">{d.status}</span>
                          )}
                        </div>
                        {d.email && <div className="text-xs text-ink-2">{d.email}</div>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-bold text-ink-1">{fmtMoney(d.amount)}</div>
                        <div className="text-xs text-ink-3">{timeAgo(d.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ALL DONATIONS TABLE ── */}
          {activeTab === "table" && (
            <>
              <div className="px-6 pt-4 pb-3 border-b border-outline flex items-center gap-3">
                <input
                  type="text"
                  value={donationSearch}
                  onChange={(e) => setDonationSearch(e.target.value)}
                  placeholder="Search name or email…"
                  className="bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-xs placeholder-ink-3 focus:outline-none focus:border-orange/40 w-56"
                />
                <span className="text-xs text-ink-2">{filteredDonations.length} donation{filteredDonations.length !== 1 ? "s" : ""}</span>
              </div>
              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-hairline">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="px-4 py-3"><Skeleton className="h-12 w-full" /></div>
                  ))
                ) : paginatedDonations.length === 0 ? (
                  <p className={`px-4 py-10 text-center ${TYPE.bodyMuted}`}>No donations found.</p>
                ) : (
                  paginatedDonations.map((d) => (
                    <div key={d.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-orange/10 border border-orange/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-orange font-bold text-xs">{donorInitial(d)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-medium ${TYPE.body} truncate`}>{donorDisplayName(d)}</span>
                          {d.recurring && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange/20 text-orange">Monthly</span>
                          )}
                        </div>
                        <div className="text-[11px] text-ink-2">
                          {fmtDate(d.created_at)}{d.email ? ` · ${d.email}` : ""}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`font-bold ${TYPE.body}`}>{fmtMoney(d.amount)}</div>
                        {d.status && d.status !== "succeeded" && (
                          <div className="text-[10px] text-expense capitalize">{d.status}</div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-outline">
                      {["Date", "Donor", "Email", "Amount", "Type", "Status"].map((h) => (
                        <th key={h} className="text-left text-xs font-semibold text-ink-3 uppercase tracking-widest px-5 py-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b border-hairline">
                          {Array.from({ length: 6 }).map((_, j) => (
                            <td key={j} className="px-5 py-4"><Skeleton className="h-4 w-full" /></td>
                          ))}
                        </tr>
                      ))
                    ) : paginatedDonations.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-16 text-ink-2">No donations found.</td></tr>
                    ) : (
                      paginatedDonations.map((d) => (
                        <tr key={d.id} className="border-b border-hairline hover:bg-[#EFE6D4] transition-colors">
                          <td className="px-5 py-4 text-ink-2 text-xs whitespace-nowrap">{fmtDate(d.created_at)}</td>
                          <td className="px-5 py-4 font-medium text-ink-1">{donorDisplayName(d)}</td>
                          <td className="px-5 py-4 text-ink-2 text-xs">{d.email || "—"}</td>
                          <td className="px-5 py-4 font-bold text-ink-1">{fmtMoney(d.amount)}</td>
                          <td className="px-5 py-4">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${d.recurring ? "bg-orange/20 text-orange" : "bg-tile text-ink-2"}`}>
                              {d.recurring ? "Monthly" : "One-time"}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                              !d.status || d.status === "succeeded" ? "bg-revenue-bg text-revenue" :
                              d.status === "failed" ? "bg-expense-bg text-expense" :
                              d.status === "cancelled" ? "bg-tile text-ink-2" :
                              "bg-tile text-ink-2"
                            }`}>
                              {d.status || "succeeded"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {donationTotalPages > 1 && (
                <div className="px-6 py-4 border-t border-outline flex items-center justify-between">
                  <span className="text-xs text-ink-2">Page {donationPage} of {donationTotalPages}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setDonationPage((p) => Math.max(1, p - 1))} disabled={donationPage === 1} className="text-xs font-semibold text-ink-2 bg-tile border-[1.5px] border-outline px-3 py-1.5 rounded-lg hover:bg-[#EFE6D4] disabled:opacity-30 transition-colors">← Prev</button>
                    <button onClick={() => setDonationPage((p) => Math.min(donationTotalPages, p + 1))} disabled={donationPage === donationTotalPages} className="text-xs font-semibold text-ink-2 bg-tile border-[1.5px] border-outline px-3 py-1.5 rounded-lg hover:bg-[#EFE6D4] disabled:opacity-30 transition-colors">Next →</button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── DONOR PROFILES ── */}
          {activeTab === "profiles" && (
            <div className="p-6">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : !donationStats || donationStats.donorProfiles.length === 0 ? (
                <p className={`${TYPE.bodyMuted}`}>No donor data yet.</p>
              ) : (
                <>
                <div className="md:hidden divide-y divide-hairline -mx-6">
                  {donationStats.donorProfiles.map((p, i) => (
                    <div key={p.email + i} className="px-6 py-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-orange/10 border border-orange/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-orange font-bold text-xs">
                          {(p.firstName?.[0] ?? p.email?.[0] ?? "$").toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-medium ${TYPE.body} truncate`}>
                            {[p.firstName, p.lastName].filter(Boolean).join(" ") || "Anonymous"}
                          </span>
                          {p.recurring && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange/20 text-orange">Monthly</span>
                          )}
                        </div>
                        <div className="text-[11px] text-ink-2">
                          {p.donationCount} gift{p.donationCount !== 1 ? "s" : ""} · last {fmtDate(p.lastDonation)}
                        </div>
                      </div>
                      <div className="font-bold text-orange text-sm flex-shrink-0">{fmtMoney(p.totalGiven)}</div>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm min-w-[750px]">
                    <thead>
                      <tr className="border-b border-outline">
                        {["Donor", "Email", "Total Given", "Donations", "First Gift", "Last Gift", "Type"].map((h) => (
                          <th key={h} className="text-left text-xs font-semibold text-ink-3 uppercase tracking-widest px-4 py-3 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {donationStats.donorProfiles.map((p, i) => (
                        <tr key={p.email + i} className="border-b border-hairline hover:bg-[#EFE6D4] transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-orange/10 border border-orange/20 flex items-center justify-center flex-shrink-0">
                                <span className="text-orange font-bold text-xs">
                                  {(p.firstName?.[0] ?? p.email?.[0] ?? "$").toUpperCase()}
                                </span>
                              </div>
                              <span className={`font-medium ${TYPE.body} whitespace-nowrap`}>
                                {[p.firstName, p.lastName].filter(Boolean).join(" ") || "Anonymous"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-ink-2 text-xs">{p.email !== "Anonymous" ? p.email : "—"}</td>
                          <td className="px-4 py-3 font-bold text-orange text-sm">{fmtMoney(p.totalGiven)}</td>
                          <td className={`px-4 py-3 ${TYPE.bodyMuted}`}>{p.donationCount}</td>
                          <td className="px-4 py-3 text-ink-2 text-xs whitespace-nowrap">{fmtDate(p.firstDonation)}</td>
                          <td className="px-4 py-3 text-ink-2 text-xs whitespace-nowrap">{fmtDate(p.lastDonation)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.recurring ? "bg-orange/20 text-orange" : "bg-tile text-ink-2"}`}>
                              {p.recurring ? "Monthly" : "One-time"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* ── ROW 5: RECENT ACTIVITY FEED ── */}
        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-6">
          <h2 className={`${TYPE.sectionTitle} mb-6`}>Recent Quiz Activity</h2>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentTen.length === 0 ? (
            <p className={`${TYPE.bodyMuted}`}>No submissions yet.</p>
          ) : (
            <div className="space-y-1">
              {recentTen.map((s) => (
                <div key={s.id} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-[#EFE6D4] transition-colors">
                  <div className="w-9 h-9 rounded-full bg-orange/10 border border-orange/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-orange font-bold text-xs">{s.teen_name ? s.teen_name[0].toUpperCase() : "?"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-semibold ${TYPE.body}`}>{s.teen_name || "Anonymous"}</span>
                      {s.location && <span className="text-ink-2 text-xs">· {s.location}</span>}
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.audience === "teen" ? "bg-orange/20 text-orange" : "bg-tile text-ink-2"}`}>
                        {s.audience || "unknown"}
                      </span>
                      {s.email && (
                        <span title={s.email}>
                          <svg className="w-3.5 h-3.5 text-orange/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </span>
                      )}
                    </div>
                    {s.career_matches?.[0] && (
                      <div className="text-xs text-ink-2 mt-0.5">
                        Top match: <span className="text-ink-1">{s.career_matches[0].title}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-ink-3 flex-shrink-0">{timeAgo(s.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── ROW 5: PARTNER WAITLIST ── */}
        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          <div className="px-6 py-5 border-b border-outline flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <h2 className={TYPE.sectionTitle}>Partner Waitlist</h2>
              <p className="text-ink-2 text-xs mt-0.5">
                {partnerData ? `${partnerData.signups.length} total signup${partnerData.signups.length !== 1 ? "s" : ""}` : "Guides waiting for access"}
              </p>
            </div>
          </div>

          <div className="p-6">
            {loading || !partnerData ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : partnerData.signups.length === 0 ? (
              <p className={`${TYPE.bodyMuted}`}>No signups yet.</p>
            ) : (
              <>
                {/* Count + role breakdown */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-8">
                  <div>
                    <div className="font-display font-black text-6xl text-orange tracking-tight leading-none">
                      {partnerData.signups.length}
                    </div>
                    <div className={`${TYPE.bodyMuted} mt-1`}>total waitlist signups</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {partnerData.roleBreakdown.map(({ role, count }) => (
                      <div key={role} className="bg-tile border-[1.5px] border-outline rounded-full px-4 py-1.5 flex items-center gap-2">
                        <span className={`${TYPE.body} font-semibold`}>{count}</span>
                        <span className="text-ink-2 text-xs">{role}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-hairline -mx-6">
                  {partnerData.signups.map((s) => (
                    <div key={s.id} className="px-6 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className={`font-medium ${TYPE.body} truncate`}>{s.first_name} {s.last_name}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange/15 text-orange flex-shrink-0">{s.role}</span>
                      </div>
                      <div className="text-[11px] text-ink-2 mt-0.5 truncate">{s.email}</div>
                      <div className="text-[11px] text-ink-3 mt-0.5">
                        {fmtDate(s.created_at)}{s.teen_count ? ` · ${s.teen_count} teens` : ""}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Table (md+) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="border-b border-outline">
                        {["Name", "Email", "Role", "Teen Count", "Date"].map((h) => (
                          <th key={h} className="text-left text-xs font-semibold text-ink-3 uppercase tracking-widest px-4 py-3 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {partnerData.signups.map((s) => (
                        <tr key={s.id} className="border-b border-hairline hover:bg-[#EFE6D4] transition-colors">
                          <td className="px-4 py-3 font-medium text-ink-1 whitespace-nowrap">
                            {s.first_name} {s.last_name}
                          </td>
                          <td className="px-4 py-3 text-ink-2 text-xs">{s.email}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange/15 text-orange">
                              {s.role}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-ink-2 text-xs">{s.teen_count ?? "—"}</td>
                          <td className="px-4 py-3 text-ink-2 text-xs whitespace-nowrap">{fmtDate(s.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── ROW 6: PROGRAM PARTNERS ── */}
        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          <div className="px-6 py-5 border-b border-outline flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <h2 className={TYPE.sectionTitle}>Program Partners</h2>
              <p className="text-ink-2 text-xs mt-0.5">
                {programData ? `${programData.signups.length} total signup${programData.signups.length !== 1 ? "s" : ""}` : "Organizations signed up for access"}
              </p>
            </div>
          </div>

          <div className="p-6">
            {loading || !programData ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : programData.signups.length === 0 ? (
              <p className={`${TYPE.bodyMuted}`}>No program partner signups yet.</p>
            ) : (
              <>
                {/* Count + type breakdown */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-8">
                  <div>
                    <div className="font-display font-black text-6xl text-orange tracking-tight leading-none">
                      {programData.signups.length}
                    </div>
                    <div className={`${TYPE.bodyMuted} mt-1`}>program partner signups</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {programData.typeBreakdown.map(({ type, count }) => (
                      <div key={type} className="bg-tile border-[1.5px] border-outline rounded-full px-4 py-1.5 flex items-center gap-2">
                        <span className={`${TYPE.body} font-semibold`}>{count}</span>
                        <span className="text-ink-2 text-xs">{type}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-hairline -mx-6">
                  {programData.signups.map((s) => (
                    <div key={s.id} className="px-6 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className={`font-medium ${TYPE.body} truncate`}>{s.org_name}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange/15 text-orange flex-shrink-0">{s.program_type}</span>
                      </div>
                      <div className="text-[11px] text-ink-2 mt-0.5 truncate">
                        {s.first_name} {s.last_name} · {s.email}
                      </div>
                      <div className="text-[11px] text-ink-3 mt-0.5">
                        {fmtDate(s.created_at)}{s.teen_count ? ` · ${s.teen_count} teens` : ""}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Table (md+) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm min-w-[800px]">
                    <thead>
                      <tr className="border-b border-outline">
                        {["Org Name", "Contact", "Email", "Program Type", "Teen Count", "Date"].map((h) => (
                          <th key={h} className="text-left text-xs font-semibold text-ink-3 uppercase tracking-widest px-4 py-3 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {programData.signups.map((s) => (
                        <tr key={s.id} className="border-b border-hairline hover:bg-[#EFE6D4] transition-colors">
                          <td className="px-4 py-3 font-medium text-ink-1 whitespace-nowrap">{s.org_name}</td>
                          <td className={`px-4 py-3 ${TYPE.bodyMuted} whitespace-nowrap`}>
                            {s.first_name} {s.last_name}
                          </td>
                          <td className="px-4 py-3 text-ink-2 text-xs">{s.email}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange/15 text-orange">
                              {s.program_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-ink-2 text-xs">{s.teen_count ?? "—"}</td>
                          <td className="px-4 py-3 text-ink-2 text-xs whitespace-nowrap">{fmtDate(s.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>

        </div>{/* /overview wrapper */}

      </div>
    </div>
  );
}
