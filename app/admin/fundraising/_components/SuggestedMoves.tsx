"use client";

// Next-best-action (Phase 2): an AI layer over Today's Moves. The agent ranks
// the open asks and proposes one concrete action each, grounded in real giving
// + engagement facts. Suggestions are PERSISTED: they reload on mount and their
// disposition (applied / dismissed) is tracked for follow-through. Draft-then-
// approve — the operator can edit the action/date, then Apply (writes
// next_step / next_step_due on the opportunity and stamps the suggestion) or
// Dismiss. Nothing is applied automatically.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { money } from "../../finance/_components/charts";
import type { NbaCardRecommendation, NbaStats } from "@/lib/agents/next-best-action/types";

type CardState = {
  rec: NbaCardRecommendation;
  action: string;
  due: string;
  applied: boolean;
  busy: boolean;
};

const CHANNEL_STYLE: Record<string, string> = {
  email: "bg-blue-500/15 text-blue-400",
  call: "bg-orange/15 text-orange",
  meeting: "bg-revenue/15 text-revenue",
  note: "bg-tile text-ink-2 border border-outline",
  other: "bg-tile text-ink-3 border border-outline",
};

const toCards = (recs: NbaCardRecommendation[]): CardState[] =>
  recs.map((rec) => ({ rec, action: rec.action, due: rec.next_step_due, applied: false, busy: false }));

export default function SuggestedMoves() {
  const router = useRouter();
  const [cards, setCards] = useState<CardState[] | null>(null);
  const [stats, setStats] = useState<NbaStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reload persisted (still-open) suggestions on mount.
  useEffect(() => {
    fetch("/api/admin/fundraising/next-best-action")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { recommendations: NbaCardRecommendation[]; stats: NbaStats } | null) => {
        if (!d) return;
        setStats(d.stats);
        if (d.recommendations.length > 0) setCards(toCards(d.recommendations));
      })
      .catch(() => {});
  }, []);

  const suggest = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/fundraising/next-best-action", { method: "POST" });
      if (r.status === 503) {
        setError("AI suggestions aren't configured (ANTHROPIC_API_KEY).");
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { recommendations: NbaCardRecommendation[]; stats: NbaStats };
      setCards(toCards(data.recommendations));
      setStats(data.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate suggestions.");
    } finally {
      setLoading(false);
    }
  };

  const patch = (i: number, p: Partial<CardState>) =>
    setCards((prev) => (prev ? prev.map((c, j) => (j === i ? { ...c, ...p } : c)) : prev));

  const decide = (id: string, status: "applied" | "dismissed") =>
    fetch(`/api/admin/fundraising/next-best-action/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

  const apply = async (i: number) => {
    if (!cards) return;
    const c = cards[i];
    patch(i, { busy: true });
    try {
      const r = await fetch(`/api/admin/opportunities/${c.rec.opportunity_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next_step: c.action, next_step_due: c.due }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (c.rec.id) await decide(c.rec.id, "applied");
      patch(i, { applied: true, busy: false });
      setStats((s) => (s ? { ...s, applied: s.applied + 1 } : s));
      router.refresh();
    } catch {
      patch(i, { busy: false });
      alert("Could not apply — try again.");
    }
  };

  const dismiss = async (i: number) => {
    if (!cards) return;
    const c = cards[i];
    if (c.rec.id) void decide(c.rec.id, "dismissed");
    setStats((s) => (s ? { ...s, dismissed: s.dismissed + 1 } : s));
    setCards((prev) => (prev ? prev.filter((_, j) => j !== i) : prev));
  };

  const decided = stats ? stats.applied + stats.dismissed : 0;

  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-outline flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-heading font-bold text-ink-1 text-sm">
            Suggested moves <span className="text-ink-3 font-normal">· AI</span>
          </h2>
          <p className="text-[11px] text-ink-3">
            The agent ranks your open asks and proposes one action each. You approve.
            {decided > 0 && (
              <>
                {" "}· Follow-through:{" "}
                <span className="font-semibold text-ink-2">
                  {stats!.applied} of {decided} applied
                </span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={suggest}
          disabled={loading}
          className="text-xs font-semibold px-4 py-2 rounded-full border-[1.5px] border-orange/40 bg-orange/10 text-orange hover:bg-orange/20 transition-colors disabled:opacity-60"
        >
          {loading ? "Thinking…" : cards ? "Refresh suggestions" : "Suggest next moves"}
        </button>
      </div>

      {error && <p className="px-5 py-4 text-sm text-expense">{error}</p>}

      {!error && cards && cards.length === 0 && (
        <p className="px-5 py-4 text-ink-3 text-sm">No moves needed right now — your pipeline is current.</p>
      )}

      {!error && !cards && !loading && (
        <p className="px-5 py-4 text-ink-3 text-sm">
          Run the agent to get a prioritized, grounded action list across your open asks.
        </p>
      )}

      {cards && cards.length > 0 && (
        <ul className="divide-y divide-hairline">
          {cards.map((c, i) => (
            <li key={c.rec.id || c.rec.opportunity_id} className="px-5 py-3">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="text-[10px] font-bold text-ink-3 [font-variant-numeric:tabular-nums]">
                  #{c.rec.priority}
                </span>
                {c.rec.constituent_id ? (
                  <Link
                    href={`/admin/fundraising/donors/${c.rec.constituent_id}`}
                    className="font-medium text-ink-1 hover:text-orange transition-colors"
                  >
                    {c.rec.constituent_name}
                  </Link>
                ) : (
                  <span className="font-medium text-ink-1">{c.rec.constituent_name}</span>
                )}
                <span className="text-[11px] text-ink-3 capitalize">{c.rec.stage}</span>
                {c.rec.ask_amount ? (
                  <span className="text-[11px] text-ink-3">· {money(Number(c.rec.ask_amount))}</span>
                ) : null}
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${CHANNEL_STYLE[c.rec.channel] ?? CHANNEL_STYLE.other}`}>
                  {c.rec.channel}
                </span>
              </div>

              <p className="text-xs text-ink-3 mb-2 leading-snug">{c.rec.rationale}</p>

              {c.applied ? (
                <p className="text-xs text-revenue font-semibold">Applied ✓ · {c.action}</p>
              ) : (
                <div className="flex items-end gap-2 flex-wrap">
                  <label className="flex-1 min-w-[220px]">
                    <span className="sr-only">Action</span>
                    <input
                      value={c.action}
                      onChange={(e) => patch(i, { action: e.target.value })}
                      className="w-full text-sm bg-cream border-[1.5px] border-outline rounded-lg px-3 py-1.5 text-ink-1 focus:outline-none focus:border-orange/50"
                    />
                  </label>
                  <label>
                    <span className="sr-only">Due</span>
                    <input
                      type="date"
                      value={c.due}
                      onChange={(e) => patch(i, { due: e.target.value })}
                      className="text-sm bg-cream border-[1.5px] border-outline rounded-lg px-3 py-1.5 text-ink-1 focus:outline-none focus:border-orange/50"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => apply(i)}
                    disabled={c.busy || !c.action.trim()}
                    className="text-xs font-semibold px-4 py-2 rounded-full bg-orange text-white hover:bg-orange-dark transition-colors disabled:opacity-60"
                  >
                    {c.busy ? "…" : "Apply"}
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss(i)}
                    className="text-xs font-semibold px-3 py-2 rounded-full text-ink-3 hover:text-ink-1 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
