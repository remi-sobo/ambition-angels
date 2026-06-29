"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// AI prospect discovery for a strategy angle. Enter a target type → the agent
// web-searches for net-new prospects that fit the angle → review and accept
// candidates onto the Prospects bench (source = research, tagged with the
// angle). Accepted candidates land at /admin/fundraising/prospects (shown with
// an "AI" source badge); the panel links there so it's clear where they go.

const PROSPECTS_HREF = "/admin/fundraising/prospects";

type DiscoveryType = "individual" | "foundation" | "corporate";
type Candidate = {
  name: string;
  org: string | null;
  type: DiscoveryType;
  fit_rationale: string;
  signal: string | null;
  sources: string[];
};

const TYPES: { value: DiscoveryType; label: string }[] = [
  { value: "individual", label: "Individuals" },
  { value: "foundation", label: "Foundations" },
  { value: "corporate", label: "Corporations" },
];

export default function DiscoverPanel({ angleId, angleName }: { angleId: string; angleName: string }) {
  const router = useRouter();
  const [type, setType] = useState<DiscoveryType>("foundation");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [accepted, setAccepted] = useState<Record<number, "saving" | "done">>({});
  const acceptedCount = Object.values(accepted).filter((s) => s === "done").length;

  async function discover() {
    setLoading(true);
    setError(null);
    setWarning(null);
    setAccepted({});
    try {
      const r = await fetch("/api/admin/fundraising/strategy/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angle_id: angleId, type }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof body?.error === "string" ? body.error : `HTTP ${r.status}`);
      setCandidates((body.candidates ?? []) as Candidate[]);
      setWarning(typeof body.budgetWarning === "string" ? body.budgetWarning : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setLoading(false);
    }
  }

  async function accept(i: number, c: Candidate) {
    setAccepted((p) => ({ ...p, [i]: "saving" }));
    try {
      const r = await fetch("/api/admin/fundraising/prospects/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: c.name,
          type: c.type,
          org_name: c.org ?? undefined,
          strategy_note: `${angleName} — ${c.fit_rationale}`,
          source: "research",
          angle_id: angleId,
        }),
      });
      if (!r.ok) throw new Error();
      setAccepted((p) => ({ ...p, [i]: "done" }));
      router.refresh();
    } catch {
      setAccepted((p) => {
        const next = { ...p };
        delete next[i];
        return next;
      });
      alert("Could not add to bench — try again.");
    }
  }

  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-outline flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-heading font-bold text-ink-1 text-sm">
            Find prospects <span className="text-ink-3 font-normal">· AI</span>
          </h2>
          <p className="text-[11px] text-ink-3">
            Web-search net-new prospects that fit this angle, then accept them onto the{" "}
            <Link href={PROSPECTS_HREF} className="text-orange hover:text-orange-dark underline">
              Prospects bench
            </Link>
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as DiscoveryType)}
            className="bg-cream border-[1.5px] border-outline rounded-lg px-2.5 py-1.5 text-xs text-ink-1 focus:outline-none focus:border-orange/50"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <button
            onClick={discover}
            disabled={loading}
            className="text-xs font-semibold px-4 py-1.5 rounded-full border-[1.5px] border-orange/40 bg-orange/10 text-orange hover:bg-orange/20 transition-colors disabled:opacity-60"
          >
            {loading ? "Searching…" : candidates ? "Search again" : "Find prospects"}
          </button>
        </div>
      </div>

      {error && <p className="px-5 py-4 text-sm text-expense">{error}</p>}
      {warning && <p className="px-5 pt-3 text-[11px] text-status-watch-text">{warning}</p>}
      {loading && <p className="px-5 py-4 text-ink-3 text-sm">Researching the web for fits — this can take ~30–60s.</p>}

      {candidates && candidates.length === 0 && !loading && (
        <p className="px-5 py-4 text-ink-3 text-sm">No high-confidence net-new prospects surfaced. Try a different type or refine the angle.</p>
      )}

      {candidates && candidates.length > 0 && (
        <ul className="divide-y divide-hairline">
          {candidates.map((c, i) => (
            <li key={`${c.name}-${i}`} className="px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-heading font-semibold text-[14px] text-ink-1">{c.name}</span>
                    {c.org && <span className="text-[11px] text-ink-3">· {c.org}</span>}
                    <span className="text-[9px] uppercase tracking-wide text-ink-3 border border-outline rounded px-1 py-px capitalize">{c.type}</span>
                  </div>
                  <p className="text-xs text-ink-2 mt-1 leading-snug">{c.fit_rationale}</p>
                  {c.signal && <p className="text-[11px] text-revenue mt-0.5">{c.signal}</p>}
                  {c.sources.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {c.sources.slice(0, 4).map((s, j) => (
                        <a key={j} href={s} target="_blank" rel="noopener noreferrer" className="text-[10px] text-ink-3 hover:text-orange underline truncate max-w-[180px]">
                          {s.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <button
                    onClick={() => accept(i, c)}
                    disabled={!!accepted[i]}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                      accepted[i] === "done"
                        ? "bg-revenue-bg text-revenue border border-revenue/30"
                        : "bg-orange text-white hover:bg-orange-dark disabled:opacity-60"
                    }`}
                  >
                    {accepted[i] === "done" ? "On bench ✓" : accepted[i] === "saving" ? "…" : "+ Add to bench"}
                  </button>
                  {accepted[i] === "done" && (
                    <Link href={PROSPECTS_HREF} className="text-[10px] text-ink-3 hover:text-orange underline">
                      View on Prospects →
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {acceptedCount > 0 && (
        <div className="px-5 py-3 border-t border-outline flex items-center justify-between gap-3 flex-wrap bg-revenue-bg/40">
          <p className="text-[11px] text-ink-2">
            Added {acceptedCount} to the Prospects bench (tagged <span className="text-revenue font-semibold">AI</span>).
          </p>
          <Link
            href={PROSPECTS_HREF}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border-[1.5px] border-orange/40 bg-orange/10 text-orange hover:bg-orange/20 transition-colors"
          >
            View prospects →
          </Link>
        </div>
      )}
    </section>
  );
}
