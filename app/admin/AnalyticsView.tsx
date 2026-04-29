"use client";

import { useEffect, useMemo, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────

type PageView = {
  id: number | string;
  created_at: string;
  page: string | null;
  referrer: string | null;
  device: string | null;
  browser: string | null;
  session_id: string | null;
  duration_seconds: number | null;
};

type ClickEvent = {
  id: number | string;
  created_at: string;
  event_name: string | null;
  page: string | null;
  session_id: string | null;
  metadata: Record<string, unknown> | null;
};

type Period = "7d" | "30d" | "90d" | "all";

const PERIODS: { id: Period; label: string }[] = [
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "90d", label: "Last 90 Days" },
  { id: "all", label: "All Time" },
];

// ── Helpers ──────────────────────────────────────────────────────────────

function periodCutoff(p: Period): number {
  if (p === "all") return 0;
  const days = p === "7d" ? 7 : p === "30d" ? 30 : 90;
  return Date.now() - days * 86400000;
}

function fmtSeconds(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return "0s";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  if (m === 0) return `${sec}s`;
  return `${m}m ${sec}s`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const sec = Math.max(0, Math.floor(diff / 1000));
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function refSource(referrer: string | null): string {
  if (!referrer) return "Direct";
  try {
    const url = new URL(referrer);
    return url.hostname.replace(/^www\./, "") || "Direct";
  } catch {
    return "Direct";
  }
}

// Most pageview rows come in pairs: an "entry" (no duration) on mount
// and an "exit" (with duration_seconds) on unmount. We treat entries as
// the canonical view event and look up the matching exit's duration when
// we need it.
function entryFilter(v: PageView): boolean {
  return v.duration_seconds == null;
}

// ── Component ────────────────────────────────────────────────────────────

interface AnalyticsResponse {
  pageViews: PageView[];
  events: ClickEvent[];
  eventsAllTime: Record<string, number>;
}

export default function AnalyticsView() {
  const [period, setPeriod] = useState<Period>("7d");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch once on mount — admin auth cookie is automatic
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/admin/analytics")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as AnalyticsResponse;
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Period-filtered slices ────────────────────────────────────────────
  const cutoff = periodCutoff(period);

  const pageViewsAll = data?.pageViews ?? [];
  const eventsAll = data?.events ?? [];

  const pageViews = useMemo(
    () =>
      cutoff === 0
        ? pageViewsAll
        : pageViewsAll.filter((v) => new Date(v.created_at).getTime() >= cutoff),
    [pageViewsAll, cutoff]
  );

  const events = useMemo(
    () =>
      cutoff === 0
        ? eventsAll
        : eventsAll.filter((e) => new Date(e.created_at).getTime() >= cutoff),
    [eventsAll, cutoff]
  );

  // ── Aggregations for the selected period ──────────────────────────────
  const entries = useMemo(() => pageViews.filter(entryFilter), [pageViews]);
  const exits = useMemo(() => pageViews.filter((v) => v.duration_seconds != null), [pageViews]);

  const totalPageViews = entries.length;

  const uniqueSessions = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      if (e.session_id) set.add(e.session_id);
    }
    return set.size;
  }, [entries]);

  const avgTimeOnPage = useMemo(() => {
    if (exits.length === 0) return 0;
    const sum = exits.reduce((acc, v) => acc + (v.duration_seconds ?? 0), 0);
    return sum / exits.length;
  }, [exits]);

  // Top pages (sorted by entry count)
  const topPages = useMemo(() => {
    const counts = new Map<string, { views: number; totalDuration: number; durationSamples: number }>();
    for (const e of entries) {
      const p = e.page || "(unknown)";
      const cur = counts.get(p) ?? { views: 0, totalDuration: 0, durationSamples: 0 };
      cur.views += 1;
      counts.set(p, cur);
    }
    for (const x of exits) {
      const p = x.page || "(unknown)";
      const cur = counts.get(p);
      if (!cur) continue;
      cur.totalDuration += x.duration_seconds ?? 0;
      cur.durationSamples += 1;
    }
    return Array.from(counts.entries())
      .map(([page, c]) => ({
        page,
        views: c.views,
        avgTime: c.durationSamples > 0 ? c.totalDuration / c.durationSamples : 0,
        pct: totalPageViews > 0 ? (c.views / totalPageViews) * 100 : 0,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 15);
  }, [entries, exits, totalPageViews]);

  const mostVisitedPage = topPages[0]?.page ?? "—";

  // Device breakdown (entries only)
  const deviceBreakdown = useMemo(() => {
    const counts: Record<string, number> = { Mobile: 0, Desktop: 0, Tablet: 0 };
    for (const e of entries) {
      const d = e.device || "Unknown";
      counts[d] = (counts[d] ?? 0) + 1;
    }
    const total = entries.length || 1;
    return (["Mobile", "Desktop", "Tablet"] as const).map((d) => ({
      device: d,
      count: counts[d] ?? 0,
      pct: ((counts[d] ?? 0) / total) * 100,
    }));
  }, [entries]);

  // Traffic sources — top 5 + Direct
  const traffic = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const src = refSource(e.referrer);
      counts.set(src, (counts.get(src) ?? 0) + 1);
    }
    const total = entries.length || 1;
    const arr = Array.from(counts.entries()).map(([src, count]) => ({
      src,
      count,
      pct: (count / total) * 100,
    }));
    arr.sort((a, b) => b.count - a.count);
    // Always keep "Direct" in view if it exists (even if outside top 5)
    const top = arr.slice(0, 5);
    if (!top.some((r) => r.src === "Direct")) {
      const direct = arr.find((r) => r.src === "Direct");
      if (direct) top.push(direct);
    }
    return top;
  }, [entries]);

  // Key events table
  const eventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) {
      if (!e.event_name) continue;
      counts.set(e.event_name, (counts.get(e.event_name) ?? 0) + 1);
    }
    const allTime = data?.eventsAllTime ?? {};
    return Array.from(counts.entries())
      .map(([event_name, count]) => ({
        event_name,
        count,
        allTime: allTime[event_name] ?? count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [events, data]);

  const totalKeyEvents = useMemo(
    () => eventCounts.reduce((acc, e) => acc + e.count, 0),
    [eventCounts]
  );

  const topEvent = eventCounts[0]?.event_name ?? "—";

  // High-value pages: /companies and /program-partners
  const hvp = useMemo(() => {
    const buildCard = (path: string) => {
      const allTimeEntries = pageViewsAll.filter((v) => v.page === path && entryFilter(v));
      const weekCutoff = Date.now() - 7 * 86400000;
      const thisWeek = allTimeEntries.filter(
        (v) => new Date(v.created_at).getTime() >= weekCutoff
      ).length;
      const allTimeExits = pageViewsAll.filter(
        (v) => v.page === path && v.duration_seconds != null
      );
      const avg =
        allTimeExits.length > 0
          ? allTimeExits.reduce((a, v) => a + (v.duration_seconds ?? 0), 0) /
            allTimeExits.length
          : 0;
      const last = allTimeEntries[0]?.created_at ?? null;
      return {
        path,
        totalAllTime: allTimeEntries.length,
        thisWeek,
        avgTime: avg,
        lastVisited: last,
      };
    };
    return [buildCard("/companies"), buildCard("/program-partners")];
  }, [pageViewsAll]);

  // Recent activity — last 50 entries with duration looked up by session+page
  const recentActivity = useMemo(() => {
    const exitMap = new Map<string, number>();
    for (const v of pageViewsAll) {
      if (v.duration_seconds != null && v.session_id && v.page) {
        const key = `${v.session_id}::${v.page}`;
        // Keep the most recent exit per (session, page)
        if (!exitMap.has(key)) exitMap.set(key, v.duration_seconds);
      }
    }
    const allEntries = pageViewsAll.filter(entryFilter);
    return allEntries.slice(0, 50).map((e) => ({
      ...e,
      duration:
        e.session_id && e.page ? exitMap.get(`${e.session_id}::${e.page}`) ?? null : null,
    }));
  }, [pageViewsAll]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* Period filter */}
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`text-xs font-semibold px-4 py-2 rounded-full border transition-colors ${
              period === p.id
                ? "bg-orange text-white border-orange"
                : "text-gray-mid border-white/10 hover:border-orange/40 hover:text-cream"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Top stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Total page views"
          value={loading ? "—" : totalPageViews.toLocaleString()}
          sub="entries in period"
        />
        <StatCard
          label="Unique sessions"
          value={loading ? "—" : uniqueSessions.toLocaleString()}
          sub="distinct visitors"
        />
        <StatCard
          label="Avg time on page"
          value={loading ? "—" : fmtSeconds(avgTimeOnPage)}
          sub={`${exits.length.toLocaleString()} sample${exits.length === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Most visited page"
          value={loading ? "—" : mostVisitedPage}
          sub={`${topPages[0]?.views.toLocaleString() ?? 0} views`}
        />
        <StatCard
          label="Top event"
          value={loading ? "—" : topEvent}
          sub={`${eventCounts[0]?.count.toLocaleString() ?? 0} fired`}
        />
        <StatCard
          label="Total key events"
          value={loading ? "—" : totalKeyEvents.toLocaleString()}
          sub="all events in period"
        />
      </div>

      {/* Top Pages */}
      <Section title="Top Pages" subtitle={`Top 15 by views · ${PERIODS.find((p) => p.id === period)?.label}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-white/10">
                {["Page", "Views", "Avg Time on Page", "% of Total"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-white/30 uppercase tracking-widest px-4 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-6 text-gray-mid text-sm">Loading…</td></tr>
              ) : topPages.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-gray-mid text-sm">No page views in this period yet.</td></tr>
              ) : (
                topPages.map((p) => (
                  <tr key={p.page} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-cream font-mono text-xs whitespace-nowrap">{p.page}</td>
                    <td className="px-4 py-3 text-cream">{p.views.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-mid text-xs">{fmtSeconds(p.avgTime)}</td>
                    <td className="px-4 py-3 text-gray-mid text-xs">{p.pct.toFixed(1)}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Device + Traffic — side-by-side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Device" subtitle="Visit breakdown by screen size">
          <div className="px-6 pb-6 flex flex-col gap-3">
            {deviceBreakdown.map((d) => (
              <div key={d.device} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-cream text-sm font-semibold w-20">{d.device}</span>
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange/60"
                      style={{ width: `${d.pct.toFixed(1)}%` }}
                    />
                  </div>
                </div>
                <span className="text-cream text-sm font-mono whitespace-nowrap">
                  {d.count.toLocaleString()} <span className="text-gray-mid">· {d.pct.toFixed(0)}%</span>
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Traffic Sources" subtitle="Top 5 + Direct">
          <div className="px-6 pb-6 flex flex-col gap-3">
            {loading ? (
              <p className="text-gray-mid text-sm">Loading…</p>
            ) : traffic.length === 0 ? (
              <p className="text-gray-mid text-sm">No traffic in this period yet.</p>
            ) : (
              traffic.map((t) => (
                <div key={t.src} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-cream text-sm font-medium truncate flex-1">{t.src}</span>
                  </div>
                  <span className="text-cream text-sm font-mono whitespace-nowrap">
                    {t.count.toLocaleString()} <span className="text-gray-mid">· {t.pct.toFixed(0)}%</span>
                  </span>
                </div>
              ))
            )}
          </div>
        </Section>
      </div>

      {/* Key Events */}
      <Section title="Key Events" subtitle="Click & interaction events — what people are actually doing">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="border-b border-white/10">
                {["Event Name", "Count (period)", "Count all time"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-white/30 uppercase tracking-widest px-4 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="px-4 py-6 text-gray-mid text-sm">Loading…</td></tr>
              ) : eventCounts.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-6 text-gray-mid text-sm">No events in this period yet.</td></tr>
              ) : (
                eventCounts.map((e) => (
                  <tr key={e.event_name} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-cream font-mono text-xs whitespace-nowrap">{e.event_name}</td>
                    <td className="px-4 py-3 text-cream font-semibold">{e.count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-mid">{e.allTime.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* High-value pages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {hvp.map((card) => (
          <Section
            key={card.path}
            title={`Warm lead page: ${card.path}`}
            subtitle="Visits to this corporate-pitch page (all-time)"
          >
            <div className="px-6 pb-6 grid grid-cols-2 gap-4">
              <Stat label="Total visits" value={card.totalAllTime.toLocaleString()} />
              <Stat label="This week" value={card.thisWeek.toLocaleString()} />
              <Stat label="Avg time on page" value={fmtSeconds(card.avgTime)} />
              <Stat
                label="Last visited"
                value={card.lastVisited ? timeAgo(card.lastVisited) : "—"}
              />
            </div>
          </Section>
        ))}
      </div>

      {/* Recent Activity */}
      <Section title="Recent Activity" subtitle="Last 50 page views (newest first)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-white/10">
                {["Page", "Device", "Source", "Time on Page", "When"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-white/30 uppercase tracking-widest px-4 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-6 text-gray-mid text-sm">Loading…</td></tr>
              ) : recentActivity.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-gray-mid text-sm">No page views yet.</td></tr>
              ) : (
                recentActivity.map((v) => (
                  <tr key={String(v.id)} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-cream font-mono text-xs whitespace-nowrap">{v.page ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-mid text-xs">{v.device ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-mid text-xs">{refSource(v.referrer)}</td>
                    <td className="px-4 py-3 text-gray-mid text-xs">
                      {v.duration != null ? fmtSeconds(v.duration) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-mid text-xs whitespace-nowrap">{timeAgo(v.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

    </div>
  );
}

// ── Tiny presentational helpers ──────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#1a1d27] border border-white/10 rounded-card-lg p-6">
      <div className="font-display font-black text-3xl lg:text-4xl text-orange tracking-tight leading-none mb-2 truncate">
        {value}
      </div>
      <div className="text-cream text-sm font-medium">{label}</div>
      {sub && <div className="text-white/30 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-[#1a1d27] border border-white/10 rounded-card-lg overflow-hidden">
      <div className="px-6 py-5 border-b border-white/10">
        <h2 className="font-heading font-bold text-cream text-lg">{title}</h2>
        {subtitle && <p className="text-gray-mid text-xs mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-display font-black text-2xl text-orange tracking-tight leading-none mb-1">
        {value}
      </div>
      <div className="text-gray-mid text-xs">{label}</div>
    </div>
  );
}
