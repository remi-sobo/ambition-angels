"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";

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
  name: string | null;
  email: string | null;
  amount: number;
  recurring: boolean;
  stripe_payment_id: string;
};

type DonationStats = {
  totalRaised: number;
  thisMonthRaised: number;
  donorCount: number;
  donations: Donation[];
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

function exportCSV(rows: Submission[]) {
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

const PAGE_SIZE = 25;

// ── Skeleton ───────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/10 rounded-lg ${className}`} />;
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();

  // Auth
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Data
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [donationStats, setDonationStats] = useState<DonationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Table state
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<"week" | "month" | "all">("all");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      const [statsRes, donationsRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/admin/donations"),
      ]);
      if (statsRes.status === 401) { setAuthed(false); return; }
      if (!statsRes.ok) throw new Error("Failed to load data");
      const data = await statsRes.json();
      setSubmissions(data.submissions ?? []);
      setStats(data.stats);
      if (donationsRes.ok) {
        const dData = await donationsRes.json();
        setDonationStats(dData);
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
        // Also fetch donations
        fetch("/api/admin/donations").then(async (dRes) => {
          if (dRes.ok) setDonationStats(await dRes.json());
        });
      }
    });
  }, []);

  useEffect(() => {
    if (authed) fetchData();
  }, [authed]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) { setAuthed(true); setLoginError(""); }
    else setLoginError("Wrong password.");
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

    // Date filter
    if (dateFilter === "week") {
      const cutoff = new Date(now.getTime() - 7 * 86400000).toISOString();
      rows = rows.filter((s) => s.created_at >= cutoff);
    } else if (dateFilter === "month") {
      const cutoff = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      rows = rows.filter((s) => s.created_at >= cutoff);
    }

    // Search
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

  // Reset page when filters change
  useEffect(() => setPage(1), [search, dateFilter]);

  // ── LOGIN SCREEN (preserved exactly) ────────────────────────────────────

  if (!authed) {
    return (
      <div
        className="min-h-screen bg-ink flex items-center justify-center px-4"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="bg-[#1a1d27] border border-white/10 rounded-card-lg p-10 w-full max-w-sm shadow-2xl">
          <div className="font-display font-black text-3xl text-cream mb-1 tracking-tight uppercase">Admin</div>
          <div className="text-gray-mid text-sm mb-8">Ambition Angels</div>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-cream text-sm placeholder-gray-mid focus:outline-none focus:border-orange/50"
              autoFocus
            />
            {loginError && <p className="text-red-400 text-xs">{loginError}</p>}
            <button
              type="submit"
              className="bg-orange hover:bg-orange-dark text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Sign In
            </button>
          </form>
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
      <div
        className="bg-[#13151f] border-b border-white/10 px-6 lg:px-10 py-4 flex items-center justify-between gap-4 sticky top-0 z-50"
      >
        <div className="flex items-center gap-3">
          <span className="font-heading font-bold text-cream text-base">Admin Dashboard</span>
          {lastUpdated && (
            <span className="text-xs text-gray-mid hidden sm:block">
              · Updated {fmtLastUpdated(lastUpdated)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="text-xs font-semibold text-orange bg-orange/10 border border-orange/30 px-4 py-2 rounded-full hover:bg-orange/20 transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0115-4.5M20 15a9 9 0 01-15 4.5" />
            </svg>
            Refresh
          </button>
          <button
            onClick={() => exportCSV(filtered)}
            className="text-xs font-semibold text-white/60 bg-white/5 border border-white/10 px-4 py-2 rounded-full hover:bg-white/10 transition-colors"
          >
            Export CSV
          </button>
          <button
            onClick={handleLogout}
            className="text-xs font-semibold text-white/40 hover:text-white/70 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 lg:px-10 py-8 space-y-10">

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* ── ROW 1: PULSE CARDS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Card 1 — Submissions this month */}
          <div className="bg-[#1a1d27] border border-white/10 rounded-card-lg p-6">
            {loading || !stats ? (
              <><Skeleton className="h-10 w-20 mb-2" /><Skeleton className="h-3 w-32" /></>
            ) : (
              <>
                <div className="font-display font-black text-5xl text-orange tracking-tight leading-none mb-2">
                  {stats.thisMonth}
                </div>
                <div className="text-gray-mid text-sm font-medium">Submissions this month</div>
                <div className="text-white/30 text-xs mt-1">{stats.allTime} all time</div>
              </>
            )}
          </div>

          {/* Card 2 — Email capture rate */}
          <div className="bg-[#1a1d27] border border-white/10 rounded-card-lg p-6">
            {loading || !stats ? (
              <><Skeleton className="h-10 w-20 mb-2" /><Skeleton className="h-3 w-32" /></>
            ) : (
              <>
                <div className="font-display font-black text-5xl text-orange tracking-tight leading-none mb-2">
                  {stats.emailRate}%
                </div>
                <div className="text-gray-mid text-sm font-medium">Email capture rate</div>
                <div className="text-white/30 text-xs mt-1">{stats.withEmail} of {stats.allTime} left email</div>
              </>
            )}
          </div>

          {/* Card 3 — Teen vs Adult */}
          <div className="bg-[#1a1d27] border border-white/10 rounded-card-lg p-6">
            {loading || !stats ? (
              <><Skeleton className="h-10 w-28 mb-2" /><Skeleton className="h-3 w-32" /></>
            ) : (
              <>
                <div className="font-display font-black text-3xl text-orange tracking-tight leading-none mb-2">
                  {teenPct}%
                  <span className="text-white/30 text-2xl mx-1">·</span>
                  {adultPct}%
                </div>
                <div className="text-gray-mid text-sm font-medium">Quiz audience split</div>
                <div className="text-white/30 text-xs mt-1">teens · adults</div>
              </>
            )}
          </div>

          {/* Card 4 — Top career match */}
          <div className="bg-[#1a1d27] border border-white/10 rounded-card-lg p-6">
            {loading || !stats ? (
              <><Skeleton className="h-7 w-full mb-2" /><Skeleton className="h-3 w-32" /></>
            ) : (
              <>
                <div className="font-heading font-bold text-xl text-cream leading-tight mb-2 min-h-[3rem] flex items-center">
                  {stats.topCareer}
                </div>
                <div className="text-gray-mid text-sm font-medium">Most matched career</div>
              </>
            )}
          </div>
        </div>

        {/* ── ROW 2: SUBMISSIONS TABLE ── */}
        <section className="bg-[#1a1d27] border border-white/10 rounded-card-lg overflow-hidden">
          {/* Section header */}
          <div className="px-6 py-5 border-b border-white/10 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <h2 className="font-heading font-bold text-cream text-lg">Career Quiz Submissions</h2>
              <p className="text-gray-mid text-xs mt-0.5">{filtered.length} result{filtered.length !== 1 ? "s" : ""} · {totalPages} page{totalPages !== 1 ? "s" : ""}</p>
            </div>
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Date filter */}
              <div className="flex rounded-lg overflow-hidden border border-white/10">
                {(["week", "month", "all"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setDateFilter(f)}
                    className={`text-xs font-semibold px-3 py-2 transition-colors capitalize ${dateFilter === f ? "bg-orange text-white" : "text-gray-mid hover:text-cream"}`}
                  >
                    {f === "week" ? "This Week" : f === "month" ? "This Month" : "All Time"}
                  </button>
                ))}
              </div>
              {/* Search */}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, location…"
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-cream text-xs placeholder-gray-mid focus:outline-none focus:border-orange/40 w-52"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-white/10">
                  {["Date", "Name", "Email", "Audience", "Age", "Location", "Top 3 Careers", "💰 Score"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-white/30 uppercase tracking-widest px-5 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-white/5">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-5 py-4">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-16 text-gray-mid">No submissions found.</td>
                  </tr>
                ) : (
                  paginated.map((s) => (
                    <>
                      <tr
                        key={s.id}
                        onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                        className={`border-b border-white/5 cursor-pointer transition-colors ${expandedId === s.id ? "bg-orange/10" : "hover:bg-white/5"}`}
                      >
                        <td className="px-5 py-4 text-gray-mid whitespace-nowrap text-xs">{fmtDate(s.created_at)}</td>
                        <td className="px-5 py-4 font-medium text-cream whitespace-nowrap">{s.teen_name || <span className="text-white/20">—</span>}</td>
                        <td className="px-5 py-4 text-gray-mid text-xs">{s.email || <span className="text-white/20">—</span>}</td>
                        <td className="px-5 py-4">
                          {s.audience ? (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.audience === "teen" ? "bg-orange/20 text-orange" : "bg-white/10 text-gray-mid"}`}>
                              {s.audience}
                            </span>
                          ) : <span className="text-white/20">—</span>}
                        </td>
                        <td className="px-5 py-4 text-gray-mid text-xs">{s.age || "—"}</td>
                        <td className="px-5 py-4 text-gray-mid text-xs whitespace-nowrap">{s.location || "—"}</td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-1">
                            {s.career_matches?.slice(0, 3).map((c, i) => (
                              <span key={i} className="text-xs bg-white/5 border border-white/10 text-gray-mid px-2 py-0.5 rounded-full whitespace-nowrap">
                                {c.title}
                              </span>
                            )) ?? <span className="text-white/20">—</span>}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-gray-mid text-xs">
                          {s.money_vs_meaning !== null ? (
                            <span className="font-semibold text-cream">{s.money_vs_meaning}<span className="text-white/30">/10</span></span>
                          ) : "—"}
                        </td>
                      </tr>

                      {/* Expanded row */}
                      {expandedId === s.id && (
                        <tr key={`${s.id}-expanded`} className="bg-[#13151f]">
                          <td colSpan={8} className="px-6 py-6">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {/* Quiz answers */}
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
                                      <span className="text-white/30 w-44 flex-shrink-0">{label}</span>
                                      <span className="text-gray-mid">{String(val)}</span>
                                    </div>
                                  ) : null)}
                                </div>
                                {s.email && (
                                  <div className="mt-4 pt-4 border-t border-white/10">
                                    <div className="text-xs font-bold text-orange uppercase tracking-widest mb-1">Email Sent To</div>
                                    <div className="text-gray-mid text-xs">{s.email}</div>
                                  </div>
                                )}
                              </div>
                              {/* All 10 career matches */}
                              <div>
                                <div className="text-xs font-bold text-orange uppercase tracking-widest mb-3">All 10 Career Matches</div>
                                <div className="space-y-2">
                                  {s.career_matches?.map((c, i) => (
                                    <div key={i} className="bg-white/5 rounded-lg px-3 py-2">
                                      <div className="flex items-start justify-between gap-2">
                                        <div>
                                          <span className="text-xs font-bold text-white/30 mr-2">{i + 1}.</span>
                                          <span className="text-xs font-semibold text-cream">{c.title}</span>
                                        </div>
                                        <span className="text-xs text-orange font-semibold whitespace-nowrap flex-shrink-0">{c.salary}</span>
                                      </div>
                                      {c.why && <div className="text-xs text-gray-mid mt-0.5 ml-4 italic">{c.why}</div>}
                                    </div>
                                  )) ?? <span className="text-white/20 text-xs">No matches recorded</span>}
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
              <span className="text-xs text-gray-mid">
                Page {page} of {totalPages} · {filtered.length} rows
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="text-xs font-semibold text-gray-mid bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="text-xs font-semibold text-gray-mid bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── ROW 3: CAREER ANALYTICS ── */}
        <section className="bg-[#1a1d27] border border-white/10 rounded-card-lg p-6">
          <h2 className="font-heading font-bold text-cream text-lg mb-6">Career Match Breakdown</h2>

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
            <p className="text-gray-mid text-sm">No career match data yet.</p>
          ) : (
            <div className="space-y-3 mb-8">
              {stats.careerBreakdown.map(({ title, count }) => {
                const pct = Math.round((count / maxCareerCount) * 100);
                return (
                  <div key={title} className="flex items-center gap-3">
                    <div className="w-44 text-xs text-gray-mid text-right flex-shrink-0 truncate">{title}</div>
                    <div className="flex-1 h-5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: "#E8500A" }}
                      />
                    </div>
                    <div className="w-7 text-xs text-gray-mid flex-shrink-0 text-right">{count}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sub-stats row */}
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-6 border-t border-white/10">
              {[
                { label: "Avg money vs meaning", value: `${stats.avgMoneyVsMeaning}/10` },
                { label: "Most common age", value: stats.mostCommonAge },
                { label: "Most common location", value: stats.mostCommonLocation },
                { label: "Most common work style", value: stats.mostCommonWorkStyle },
              ].map((item) => (
                <div key={item.label}>
                  <div className="text-xs text-white/30 uppercase tracking-widest font-semibold mb-1">{item.label}</div>
                  <div className="font-heading font-semibold text-cream text-sm truncate">{item.value || "N/A"}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── ROW 3B: DONATIONS ── */}
        <section className="bg-[#1a1d27] border border-white/10 rounded-card-lg overflow-hidden">
          <div className="px-6 py-5 border-b border-white/10">
            <h2 className="font-heading font-bold text-cream text-lg">Donations</h2>
            <p className="text-gray-mid text-xs mt-0.5">Powered by Stripe</p>
          </div>

          {/* Donation stat cards */}
          <div className="grid grid-cols-3 divide-x divide-white/10 border-b border-white/10">
            {loading || !donationStats ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-5">
                  <Skeleton className="h-8 w-24 mb-2" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ))
            ) : (
              <>
                <div className="p-5">
                  <div className="font-display font-black text-4xl text-orange tracking-tight leading-none mb-1">
                    ${donationStats.totalRaised.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                  </div>
                  <div className="text-gray-mid text-xs">Total raised all time</div>
                </div>
                <div className="p-5">
                  <div className="font-display font-black text-4xl text-orange tracking-tight leading-none mb-1">
                    ${donationStats.thisMonthRaised.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                  </div>
                  <div className="text-gray-mid text-xs">Raised this month</div>
                </div>
                <div className="p-5">
                  <div className="font-display font-black text-4xl text-orange tracking-tight leading-none mb-1">
                    {donationStats.donorCount}
                  </div>
                  <div className="text-gray-mid text-xs">Unique donors</div>
                </div>
              </>
            )}
          </div>

          {/* Recent donations */}
          <div className="p-6">
            <div className="text-xs font-bold text-white/30 uppercase tracking-widest mb-4">Recent Donations</div>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !donationStats || donationStats.donations.length === 0 ? (
              <p className="text-gray-mid text-sm">No donations recorded yet.</p>
            ) : (
              <div className="space-y-1">
                {donationStats.donations.map((d) => (
                  <div key={d.id} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-orange/10 border border-orange/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-orange font-bold text-xs">
                        {d.name ? d.name[0].toUpperCase() : "$"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-cream text-sm">{d.name || "Anonymous"}</span>
                        {d.recurring && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange/20 text-orange">Monthly</span>
                        )}
                      </div>
                      {d.email && <div className="text-xs text-gray-mid">{d.email}</div>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-cream">${d.amount.toLocaleString()}</div>
                      <div className="text-xs text-white/30">{timeAgo(d.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── ROW 4: RECENT ACTIVITY FEED ── */}
        <section className="bg-[#1a1d27] border border-white/10 rounded-card-lg p-6">
          <h2 className="font-heading font-bold text-cream text-lg mb-6">Recent Activity</h2>

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
            <p className="text-gray-mid text-sm">No submissions yet.</p>
          ) : (
            <div className="space-y-1">
              {recentTen.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 transition-colors"
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-orange/10 border border-orange/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-orange font-bold text-xs">
                      {s.teen_name ? s.teen_name[0].toUpperCase() : "?"}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-cream text-sm">
                        {s.teen_name || "Anonymous"}
                      </span>
                      {s.location && (
                        <span className="text-gray-mid text-xs">· {s.location}</span>
                      )}
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.audience === "teen" ? "bg-orange/20 text-orange" : "bg-white/10 text-gray-mid"}`}>
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
                      <div className="text-xs text-gray-mid mt-0.5">
                        Top match: <span className="text-cream">{s.career_matches[0].title}</span>
                      </div>
                    )}
                  </div>

                  {/* Time */}
                  <div className="text-xs text-white/30 flex-shrink-0">{timeAgo(s.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
