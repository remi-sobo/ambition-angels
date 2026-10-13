"use client";

import { useEffect, useState } from "react";
import { TYPE } from "@/lib/admin/typeScale";
import type { CandidateView, CardView } from "../_lib/cardView";
import { searchCandidates } from "../_lib/captureApi";

/**
 * The "Which Maria?" picker on a held card. Shows the parse's candidates (never
 * a prospect: a prospect can't receive a filing) and a search over the caller's
 * people and partners. A pick is re-verified on the server (C3 edit route).
 */
export default function PickMatch({
  card,
  disabled,
  onPick,
}: {
  card: CardView;
  disabled: boolean;
  onPick: (patch: Record<string, unknown>) => Promise<boolean>;
}) {
  const offered = card.match_candidates.filter((m) => m.kind === "constituent" || m.kind === "partner");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CandidateView[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      setSearchError(null);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await searchCandidates(term);
      if (!alive) return;
      setSearching(false);
      if (r.ok) {
        setResults(r.data.candidates);
        setSearchError(null);
      } else {
        setResults([]);
        setSearchError(r.error);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const list = results ?? offered;
  const needsRecord = card.dest === "interaction";

  return (
    <div className="mt-3 space-y-2">
      {list.length > 0 && (
        <ul className="space-y-1.5" aria-label="Possible matches">
          {list.map((m) => (
            <li key={`${m.kind}:${m.id}`}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => void onPick({ entity: { type: m.kind, id: m.id } })}
                className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-control border border-hairline bg-surface px-3 py-2 text-left transition-colors hover:border-orange/60 disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className={`${TYPE.cardTitle} block truncate`}>{m.name}</span>
                  <span className={`${TYPE.metadata} block truncate`}>
                    {[m.kind === "partner" ? "Partner" : null, m.org_name, m.meta].filter(Boolean).join(" · ") || "Person or organization"}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-orange">Pick</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="block">
        <span className={TYPE.fieldLabel}>{list.length > 0 ? "Not here? Search" : "Search your people and partners"}</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type a name"
          disabled={disabled}
          className="mt-1 w-full min-h-[52px] rounded-control border-hairline bg-tile px-3 text-base text-ink-1 placeholder-ink-3 focus:border-orange/50 focus:outline-none sm:text-sm"
        />
      </label>
      {searching && <p className={TYPE.metadata}>Searching…</p>}
      {searchError && <p className="text-sm text-expense">{searchError}</p>}
      {results && results.length === 0 && !searching && !searchError && (
        <p className={TYPE.metadata}>No one by that name on record.</p>
      )}

      {!needsRecord && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => void onPick({ entity: null })}
          className="min-h-[52px] text-sm font-semibold text-ink-2 hover:text-ink-1 disabled:opacity-50"
        >
          File it without linking anyone
        </button>
      )}
    </div>
  );
}
