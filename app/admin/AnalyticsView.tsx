"use client";

import { useEffect, useMemo, useState } from "react";
import { userMessage } from "@/lib/admin/errors";
import { TYPE } from "@/lib/admin/typeScale";
import Button from "./_components/ui/Button";
import Notice from "./_components/ui/Notice";
import Figure, { SummaryStrip } from "./_components/ui/Figure";
import DataTable, { type DataTableColumn } from "./_components/ui/DataTable";
import { SkeletonGroup, SkeletonStrip, SkeletonTable } from "./_components/ui/Skeleton";

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
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "all", label: "All time" },
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
        if (!res.ok) throw new Error(userMessage(res));
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

  const pageViewsAll = useMemo(() => data?.pageViews ?? [], [data]);
  const eventsAll = useMemo(() => data?.events ?? [], [data]);

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

  // ── Render (V4 Stage G2: Figures with sources, DataTable v2, kit
  // Buttons for the period, skeletons while loading) ─────────────────────
  const periodLabel = PERIODS.find((p) => p.id === period)?.label ?? "";
  const src = `From site page views, ${periodLabel.toLowerCase()}, as of this load`;
  const SPEC = { sortable: [], defaultSort: null, pageSize: 500 } as const;
  const table = <Row,>(label: string, noun: { one: string; many: string }, columns: DataTableColumn<Row>[], rows: Row[], id: (r: Row) => string, empty: string) => (
    <DataTable
      label={label}
      noun={noun}
      columns={columns}
      data={{ rows, total: rows.length, page: 0, pageSize: SPEC.pageSize, error: error ?? null }}
      getRowId={id}
      getRowLabel={id}
      spec={SPEC}
      state={{ page: 0, sort: null }}
      baseHref="/admin/impact/analytics"
      emptyMessage={empty}
    />
  );

  type TopPage = (typeof topPages)[number];
  type EventRow = (typeof eventCounts)[number];
  type Recent = (typeof recentActivity)[number];

  return (
    <div className="space-y-8">
      <div role="group" aria-label="Period" className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Button key={p.id} size="sm" variant={period === p.id ? "strong" : "secondary"} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
            {p.label}
          </Button>
        ))}
      </div>

      {error ? (
        <Notice tone="danger" title="Analytics failed to load.">
          {error}
        </Notice>
      ) : null}

      {loading ? (
        <SkeletonGroup label="Loading analytics">
          <SkeletonStrip count={3} />
          <SkeletonStrip count={3} />
          <SkeletonTable rows={6} columns={4} />
        </SkeletonGroup>
      ) : (
        <>
          <SummaryStrip label="Site traffic">
            <Figure label="Page views" value={error ? null : totalPageViews} source={src} />
            <Figure label="Unique sessions" value={error ? null : uniqueSessions} source="Distinct visitor sessions in the period" />
            <Figure
              label="Average time on page"
              value={error || exits.length === 0 ? null : fmtSeconds(avgTimeOnPage)}
              source={`From ${exits.length.toLocaleString()} timed exit${exits.length === 1 ? "" : "s"}`}
            />
          </SummaryStrip>
          <SummaryStrip label="What people do">
            <Figure
              label="Most visited page"
              value={topPages[0] ? mostVisitedPage : null}
              source={topPages[0] ? `${topPages[0].views.toLocaleString()} views in the period` : "No page views in the period"}
            />
            <Figure
              label="Top event"
              value={eventCounts[0] ? topEvent : null}
              source={eventCounts[0] ? `Fired ${eventCounts[0].count.toLocaleString()} times` : "No events in the period"}
            />
            <Figure label="Key events" value={error ? null : totalKeyEvents} source="Every click and interaction event in the period" />
          </SummaryStrip>

          <Section title="Top pages" subtitle={`Top 15 by views, ${periodLabel.toLowerCase()}`}>
            {table<TopPage>(
              "Top pages",
              { one: "page", many: "pages" },
              [
                { key: "page", header: "Page", card: "title", render: (r) => <span className="font-mono text-xs text-ink-1 break-all">{r.page}</span> },
                { key: "views", header: "Views", align: "right", className: "tabular-nums", render: (r) => r.views.toLocaleString() },
                { key: "time", header: "Average time", className: "text-ink-2", render: (r) => fmtSeconds(r.avgTime) },
                { key: "pct", header: "Share", align: "right", className: "tabular-nums text-ink-2", render: (r) => `${r.pct.toFixed(1)}%` },
              ],
              topPages,
              (r) => r.page,
              "No page views in this period yet.",
            )}
          </Section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Device" subtitle="Visits by screen size">
              <ul className="divide-y divide-hairline bg-surface border border-hairline rounded-panel px-5">
                {deviceBreakdown.map((d) => (
                  <li key={d.device} className="flex items-center gap-4 py-3">
                    <span className={`${TYPE.body} font-semibold w-20`}>{d.device}</span>
                    <span aria-hidden className="flex-1 h-2 bg-tile rounded-full overflow-hidden">
                      <span className="block h-full bg-ink-2" style={{ width: `${d.pct.toFixed(1)}%` }} />
                    </span>
                    <span className={`${TYPE.body} tabular-nums whitespace-nowrap`}>
                      {d.count.toLocaleString()} <span className="text-ink-2">· {d.pct.toFixed(0)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Traffic sources" subtitle="Top 5, plus Direct">
              {traffic.length === 0 ? (
                <p className={TYPE.bodyMuted}>No traffic in this period yet.</p>
              ) : (
                <ul className="divide-y divide-hairline bg-surface border border-hairline rounded-panel px-5">
                  {traffic.map((t) => (
                    <li key={t.src} className="flex items-center justify-between gap-4 py-3">
                      <span className={`${TYPE.body} font-medium truncate`}>{t.src}</span>
                      <span className={`${TYPE.body} tabular-nums whitespace-nowrap`}>
                        {t.count.toLocaleString()} <span className="text-ink-2">· {t.pct.toFixed(0)}%</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <Section title="Key events" subtitle="Clicks and interactions: what people are actually doing">
            {table<EventRow>(
              "Key events",
              { one: "event", many: "events" },
              [
                { key: "name", header: "Event", card: "title", render: (r) => <span className="font-mono text-xs text-ink-1 break-all">{r.event_name}</span> },
                { key: "count", header: "In the period", align: "right", className: "tabular-nums font-semibold", render: (r) => r.count.toLocaleString() },
                { key: "all", header: "All time", align: "right", className: "tabular-nums text-ink-2", render: (r) => r.allTime.toLocaleString() },
              ],
              eventCounts,
              (r) => r.event_name,
              "No events in this period yet.",
            )}
          </Section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {hvp.map((card) => (
              <Section key={card.path} title={`Warm lead page: ${card.path}`} subtitle="Visits to this partner pitch page, all time">
                <SummaryStrip label={`Visits to ${card.path}`}>
                  <Figure label="Total visits" value={card.totalAllTime} source="All time" />
                  <Figure label="This week" value={card.thisWeek} source="The last 7 days" />
                  <Figure label="Average time" value={card.totalAllTime > 0 ? fmtSeconds(card.avgTime) : null} source="From timed exits, all time" />
                  <Figure label="Last visited" value={card.lastVisited ? timeAgo(card.lastVisited) : null} source="Newest page view" />
                </SummaryStrip>
              </Section>
            ))}
          </div>

          <Section title="Recent activity" subtitle="The last 50 page views, newest first">
            {table<Recent>(
              "Recent activity",
              { one: "page view", many: "page views" },
              [
                { key: "page", header: "Page", card: "title", render: (v) => <span className="font-mono text-xs text-ink-1 break-all">{v.page ?? "Unknown page"}</span> },
                { key: "device", header: "Device", className: "text-ink-2", render: (v) => v.device ?? "Unknown" },
                { key: "source", header: "Source", className: "text-ink-2", render: (v) => refSource(v.referrer) },
                { key: "time", header: "Time on page", className: "text-ink-2", render: (v) => (v.duration != null ? fmtSeconds(v.duration) : "Not timed") },
                { key: "when", header: "When", className: "text-ink-2 whitespace-nowrap", render: (v) => timeAgo(v.created_at) },
              ],
              recentActivity,
              (v) => String(v.id),
              "No page views yet.",
            )}
          </Section>
        </>
      )}
    </div>
  );
}

// ── Tiny presentational helper ───────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className={TYPE.cardTitle}>{title}</h2>
      {subtitle ? <p className={`${TYPE.bodyMuted} mt-1 mb-3`}>{subtitle}</p> : null}
      {children}
    </section>
  );
}
