"use client";

// Website numbers: the website's daily stats feed, pulled each morning into
// this org's metrics (site.* in the metric catalog). Shown only to orgs with
// aa.site_signals; the route enforces it and org.manage. The key is typed
// here once, checked against the website, and stored encrypted. BloomOS
// never shows it again.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { userMessage, networkMessage } from "@/lib/admin/errors";
import type { SiteSignalsStatus } from "@/lib/siteSignals/server";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function SiteSignalsCard({ status, defaultUrl }: { status: SiteSignalsStatus; defaultUrl: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(status.state === "none");
  const [statsUrl, setStatsUrl] = useState(status.state === "none" ? defaultUrl : status.statsUrl);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const call = async (method: "PUT" | "POST", body?: object) => {
    setBusy(true);
    setError("");
    setDone("");
    try {
      const res = await fetch("/api/admin/settings/site-signals", {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(userMessage(res, j));
      const days = j.sync?.ok ? j.sync.days : 0;
      setDone(j.sync?.ok ? (days ? `Pulled ${days} day${days === 1 ? "" : "s"} of website numbers.` : "Already up to date.") : `Saved, but the first pull failed: ${j.sync?.error ?? "unknown"}`);
      setKey("");
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : networkMessage());
    } finally {
      setBusy(false);
    }
  };

  const tone =
    status.state === "active" ? "bg-revenue-bg text-revenue" : status.state === "error" ? "bg-status-watch-bg text-status-watch-text" : "bg-tile text-ink-2";
  const toneLabel = status.state === "active" ? "Connected" : status.state === "error" ? "Needs you" : "Off";

  return (
    <section className="rounded-panel border border-hairline bg-surface px-5 py-4 space-y-3" aria-label="Website numbers">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-ink-1">Website numbers</h2>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tone}`}>{toneLabel}</span>
          </div>
          <p className="text-sm text-ink-2 mt-0.5">
            Games played, Built For completions, decks, rooms, visitors and page views from your website, added to your metrics every morning.
          </p>
          {status.state !== "none" ? (
            <p className="text-sm text-ink-1 mt-1">
              {status.lastDay ? `Numbers through ${status.lastDay}.` : "No numbers pulled yet."}
              {status.lastSyncedAt ? ` Last checked ${fmt(status.lastSyncedAt)}.` : ""}
              {status.state === "error" && status.lastError ? ` Last try failed: ${status.lastError}.` : ""}
            </p>
          ) : null}
        </div>
        {status.state !== "none" && !editing ? (
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              disabled={busy}
              onClick={() => call("POST")}
              className="inline-flex min-h-[44px] items-center justify-center rounded-control border border-outline bg-surface px-4 text-sm font-semibold text-ink-1 hover:bg-tile disabled:opacity-60"
            >
              {busy ? "Pulling…" : "Pull now"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(true)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-control border border-outline bg-surface px-4 text-sm font-semibold text-ink-1 hover:bg-tile disabled:opacity-60"
            >
              Change key
            </button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void call("PUT", { stats_url: statsUrl, key });
          }}
        >
          <label className="block text-sm">
            <span className="font-semibold text-ink-1">Stats address</span>
            <input
              type="url"
              required
              value={statsUrl}
              onChange={(e) => setStatsUrl(e.target.value)}
              className="mt-1 block w-full rounded-control border border-outline bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-ink-1">Stats key</span>
            <input
              type="password"
              required
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="mt-1 block w-full rounded-control border border-outline bg-surface px-3 py-2 text-sm font-mono"
            />
            <span className="block text-ink-2 mt-1">The website&apos;s SITE_STATS_KEY. BloomOS checks it with the website, then stores it encrypted.</span>
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-[44px] items-center justify-center rounded-control bg-ink-1 px-4 text-sm font-semibold text-surface disabled:opacity-60"
            >
              {busy ? "Checking…" : "Save and pull"}
            </button>
            {status.state !== "none" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(false)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-control border border-outline bg-surface px-4 text-sm font-semibold text-ink-1 hover:bg-tile"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {error ? <p role="alert" className="text-sm text-status-critical-text">{error}</p> : null}
      {done ? <p role="status" className="text-sm text-ink-1">{done}</p> : null}
    </section>
  );
}
