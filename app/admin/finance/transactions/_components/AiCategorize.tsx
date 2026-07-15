"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TYPE } from "@/lib/admin/typeScale";

// "Suggest categories (AI)" — asks the server for Claude's category suggestions
// for the uncategorized transactions, then lets the user review, toggle which
// to accept, and choose whether to also save a rule so future imports
// auto-categorize. Applying writes through /categorize/apply and refreshes.

type Suggestion = {
  id: string;
  txn_date: string;
  description: string;
  amount: number;
  category_id: string;
  category_name: string;
  confidence: number;
  rule_pattern: string;
};

type Row = Suggestion & { include: boolean; createRule: boolean };

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function confColor(c: number): string {
  if (c >= 0.8) return "bg-revenue-bg text-revenue border-revenue/30";
  if (c >= 0.5) return "bg-[#F4E8D0] text-[#A56A1B] border-[#D9BE86]";
  return "bg-expense-bg text-expense border-expense/30";
}

export default function AiCategorize({ uncategorizedCount }: { uncategorizedCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"idle" | "suggesting" | "applying">("idle");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [done, setDone] = useState<{ updated: number; rulesCreated: number } | null>(null);

  async function suggest() {
    setOpen(true);
    setBusy("suggesting");
    setError(null);
    setRows([]);
    setDone(null);
    try {
      const r = await fetch("/api/admin/finance/categorize/suggest", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j.error ?? "Couldn't get suggestions.");
        return;
      }
      const suggestions = (j.suggestions ?? []) as Suggestion[];
      setRows(
        suggestions.map((s) => ({
          ...s,
          include: s.confidence >= 0.5,
          createRule: s.confidence >= 0.8 && s.rule_pattern.length >= 3,
        }))
      );
      setRemaining(j.remaining ?? 0);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy("idle");
    }
  }

  async function apply() {
    const items = rows
      .filter((r) => r.include)
      .map((r) => ({ id: r.id, category_id: r.category_id, create_rule: r.createRule, pattern: r.rule_pattern }));
    if (items.length === 0) return;
    setBusy("applying");
    setError(null);
    try {
      const r = await fetch("/api/admin/finance/categorize/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j.error ?? "Apply failed.");
        return;
      }
      setDone({ updated: j.updated ?? 0, rulesCreated: j.rulesCreated ?? 0 });
      setRows([]);
      router.refresh();
    } finally {
      setBusy("idle");
    }
  }

  const includedCount = rows.filter((r) => r.include).length;
  const setAll = (include: boolean) => setRows((rs) => rs.map((r) => ({ ...r, include })));

  return (
    <>
      <button
        type="button"
        onClick={suggest}
        disabled={uncategorizedCount === 0 || busy !== "idle"}
        className="rounded-full bg-orange hover:bg-orange-dark text-white px-3 py-1 disabled:opacity-40"
      >
        ✦ Suggest categories (AI)
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={() => busy === "idle" && setOpen(false)}>
          <div
            className="mt-10 w-full max-w-3xl rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-outline flex items-center justify-between gap-3">
              <h2 className={TYPE.cardTitle}>Suggested categories</h2>
              <button onClick={() => setOpen(false)} disabled={busy !== "idle"} className={`text-ink-2 hover:${TYPE.body} disabled:opacity-40`}>
                ✕
              </button>
            </div>

            <div className="p-5">
              {busy === "suggesting" && <p className="text-sm text-ink-2 py-8 text-center">Reading your transactions…</p>}

              {error && <p className="text-sm text-expense mb-3">{error}</p>}

              {done && (
                <div className="text-sm text-revenue py-6 text-center">
                  Categorized <b>{done.updated}</b> transaction{done.updated === 1 ? "" : "s"}
                  {done.rulesCreated > 0 && <> · saved <b>{done.rulesCreated}</b> rule{done.rulesCreated === 1 ? "" : "s"} for next time</>}.
                  {remaining > 0 && (
                    <div className="mt-3">
                      <button onClick={suggest} className="rounded-full bg-orange hover:bg-orange-dark text-white px-4 py-1.5 text-xs font-medium">
                        Suggest the next {Math.min(remaining, 60)} →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {busy !== "suggesting" && !done && rows.length === 0 && !error && (
                <p className="text-sm text-ink-2 py-8 text-center">Nothing to categorize — every transaction has a category.</p>
              )}

              {rows.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-3 text-xs">
                    <span className="text-ink-2">
                      {includedCount} of {rows.length} selected
                      {remaining > 0 && <span className="text-ink-3"> · {remaining} more after this batch</span>}
                    </span>
                    <div className="flex gap-3">
                      <button onClick={() => setAll(true)} className="text-orange hover:text-orange-dark font-semibold">Select all</button>
                      <button onClick={() => setAll(false)} className="text-ink-2 hover:text-ink-1">Clear</button>
                    </div>
                  </div>

                  <ul className="divide-y divide-hairline max-h-[55vh] overflow-y-auto -mx-1 px-1">
                    {rows.map((r, i) => (
                      <li key={r.id} className="py-2.5 flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={r.include}
                          onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                          className="mt-1 accent-orange"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-ink-1 truncate" title={r.description}>{r.description}</span>
                            <span className={`text-[10px] font-mono ${r.amount >= 0 ? "text-revenue" : "text-ink-2"}`}>{fmtMoney(r.amount)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-orange font-medium">→ {r.category_name}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${confColor(r.confidence)}`}>
                              {Math.round(r.confidence * 100)}%
                            </span>
                            {r.rule_pattern && (
                              <label className="text-[11px] text-ink-2 flex items-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={r.createRule}
                                  onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, createRule: e.target.checked } : x)))}
                                  className="accent-orange"
                                />
                                rule: “{r.rule_pattern}”
                              </label>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center gap-3 pt-4 mt-2 border-t border-hairline">
                    <button
                      onClick={apply}
                      disabled={includedCount === 0 || busy !== "idle"}
                      className="px-4 py-2 rounded-lg bg-orange hover:bg-orange-dark text-white text-sm font-medium disabled:opacity-40"
                    >
                      {busy === "applying" ? "Applying…" : `Apply ${includedCount}`}
                    </button>
                    <button onClick={() => setOpen(false)} disabled={busy !== "idle"} className={`px-4 py-2 rounded-lg text-ink-2 hover:${TYPE.body}`}>
                      Cancel
                    </button>
                    <span className="text-[11px] text-ink-3 ml-auto">Review before applying — AI can be wrong.</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
