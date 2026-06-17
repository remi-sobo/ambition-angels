"use client";

// Strategy funnel board (Phase 2) for one angle. Add funders (constituent
// search or match-or-create), group by stage, move stage, record the go/no-go
// decision, jot triage notes, remove. All writes go through the strategy
// routes under the user session; nothing touches the HubSpot mirror.

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type FunderRow = {
  id: string;
  stage: string;
  decision: string | null;
  fitNotes: string | null;
  opportunityId: string | null;
  constituentId: string | null;
  name: string;
  email: string | null;
  hasHubspot: boolean;
};

const STAGES: { key: string; label: string; cls: string }[] = [
  { key: "shortlist", label: "Shortlist", cls: "text-ink-2" },
  { key: "qualified", label: "Qualified", cls: "text-blue-400" },
  { key: "researched", label: "Researched", cls: "text-orange" },
  { key: "pursuing", label: "Pursuing", cls: "text-revenue" },
  { key: "parked", label: "Parked", cls: "text-ink-3" },
  { key: "passed", label: "Passed", cls: "text-ink-3" },
];

type SearchResult = { id: string; name: string; type: string; email: string | null; hasHubspot: boolean };

export default function StrategyBoard({ angleId, funders }: { angleId: string; funders: FunderRow[] }) {
  const grouped = STAGES.map((s) => ({ ...s, items: funders.filter((f) => f.stage === s.key) }));

  return (
    <div className="space-y-5">
      <AddFunder angleId={angleId} />
      {funders.length === 0 ? (
        <p className="text-ink-3 text-sm px-1">
          No funders yet. Search or add one above to start the shortlist.
        </p>
      ) : (
        STAGES.map((s) => {
          const items = grouped.find((g) => g.key === s.key)?.items ?? [];
          if (items.length === 0) return null;
          return (
            <section key={s.key}>
              <h2 className="text-[11px] uppercase tracking-wider font-semibold mb-2 flex items-center gap-2">
                <span className={s.cls}>{s.label}</span>
                <span className="text-ink-3">{items.length}</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {items.map((f) => (
                  <FunderCard key={f.id} funder={f} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function AddFunder({ angleId }: { angleId: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((value: string) => {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/constituents/search?q=${encodeURIComponent(value.trim())}`);
        if (!r.ok) return;
        const d = (await r.json()) as { results: SearchResult[] };
        setResults(d.results);
      } catch {
        /* ignore */
      }
    }, 250);
  }, []);

  const add = async (body: { constituent_id?: string; constituent_name?: string }) => {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/strategy/funder-angles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angle_id: angleId, ...body }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 409) {
        alert("That funder is already on this angle.");
        return;
      }
      if (!r.ok) throw new Error(d?.error ?? "Failed");
      if (d?.warning) alert(d.warning);
      setQ("");
      setResults([]);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not add funder.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-4">
      <div className="relative">
        <input
          value={q}
          onChange={(e) => search(e.target.value)}
          disabled={busy}
          placeholder="Add a funder — search by name or organization…"
          className="w-full text-sm bg-cream border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 focus:outline-none focus:border-orange/50 disabled:opacity-60"
        />
        {(results.length > 0 || q.trim().length >= 2) && (
          <div className="absolute z-20 left-0 right-0 mt-1 bg-tile border-[1.5px] border-outline rounded-lg shadow-lg overflow-hidden">
            {results.map((res) => (
              <button
                key={res.id}
                type="button"
                onClick={() => add({ constituent_id: res.id })}
                className="w-full text-left px-3 py-2 text-sm hover:bg-[#EFE6D4] flex items-center justify-between gap-2"
              >
                <span className="text-ink-1 font-medium truncate">{res.name}</span>
                <span className="text-ink-3 text-xs truncate">{res.email ?? res.type}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => add({ constituent_name: q.trim() })}
              className="w-full text-left px-3 py-2 text-sm hover:bg-[#EFE6D4] text-orange font-semibold border-t border-outline"
            >
              + Add “{q.trim()}” as a new funder
            </button>
          </div>
        )}
      </div>
      <p className="text-[11px] text-ink-3 mt-1.5">
        Pick an existing constituent when you can — it avoids duplicates.
      </p>
    </div>
  );
}

function FunderCard({ funder }: { funder: FunderRow }) {
  const router = useRouter();
  const [decision, setDecision] = useState(funder.decision ?? "");
  const [notes, setNotes] = useState(funder.fitNotes ?? "");
  const [busy, setBusy] = useState(false);

  const patch = async (body: Record<string, unknown>, refresh = false) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/strategy/funder-angles/${funder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      if (refresh) router.refresh();
    } catch {
      alert("Could not save — try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Remove ${funder.name} from this angle? (The donor record is kept.)`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/strategy/funder-angles/${funder.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      router.refresh();
    } catch {
      alert("Could not remove — try again.");
    } finally {
      setBusy(false);
    }
  };

  const decisionCls =
    decision === "pursue"
      ? "bg-revenue/15 text-revenue"
      : decision === "park"
      ? "bg-[#F4E8D0] text-[#A56A1B]"
      : decision === "pass"
      ? "bg-expense-bg text-expense"
      : "";

  return (
    <div className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-4 flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {funder.constituentId ? (
            <Link
              href={`/admin/fundraising/donors/${funder.constituentId}`}
              className="font-medium text-ink-1 hover:text-orange transition-colors"
            >
              {funder.name}
            </Link>
          ) : (
            <span className="font-medium text-ink-1">{funder.name}</span>
          )}
          {funder.email && <div className="text-xs text-ink-3 truncate">{funder.email}</div>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {decision && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${decisionCls}`}>
              {decision}
            </span>
          )}
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            title="Remove from angle"
            className="text-ink-3 hover:text-expense text-sm leading-none disabled:opacity-50"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[11px] text-ink-3">
          Stage{" "}
          <select
            value={funder.stage}
            disabled={busy}
            onChange={(e) => patch({ stage: e.target.value }, true)}
            className="ml-1 text-xs bg-cream border-[1.5px] border-outline rounded-lg px-2 py-1 text-ink-1 focus:outline-none focus:border-orange/50"
          >
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-ink-3">
          Decision{" "}
          <select
            value={decision}
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value;
              setDecision(v);
              void patch({ decision: v === "" ? null : v });
            }}
            className="ml-1 text-xs bg-cream border-[1.5px] border-outline rounded-lg px-2 py-1 text-ink-1 focus:outline-none focus:border-orange/50"
          >
            <option value="">—</option>
            <option value="pursue">Pursue</option>
            <option value="park">Park</option>
            <option value="pass">Pass</option>
          </select>
        </label>
        {funder.hasHubspot ? (
          <span className="text-[10px] text-ink-3" title="Has a HubSpot mirror row — research available in Phase 3">
            HubSpot ✓
          </span>
        ) : (
          <span className="text-[10px] text-ink-3" title="Spine-only — research unavailable">
            no HubSpot
          </span>
        )}
      </div>

      <textarea
        value={notes}
        disabled={busy}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          if ((funder.fitNotes ?? "") !== notes) void patch({ fit_notes: notes });
        }}
        rows={2}
        placeholder="Triage notes — reachable? warm intro? does the ask fit?"
        className="w-full text-xs bg-cream border-[1.5px] border-outline rounded-lg px-2.5 py-1.5 text-ink-1 focus:outline-none focus:border-orange/50 resize-y"
      />
    </div>
  );
}
