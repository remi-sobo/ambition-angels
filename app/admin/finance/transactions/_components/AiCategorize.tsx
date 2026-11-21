"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Drawer from "@/app/admin/_components/ui/Drawer";
import Button from "@/app/admin/_components/ui/Button";
import { Checkbox } from "@/app/admin/_components/ui/Input";
import Notice from "@/app/admin/_components/ui/Notice";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
import { TYPE } from "@/lib/admin/typeScale";

// "Suggest categories" — asks the server for AI category suggestions for the
// uncategorized transactions, then lets the person review, choose which to
// accept, and choose whether to also save a rule so future imports
// categorize themselves. Opens in the kit Drawer (V4 Stage G2). Applying
// writes through /categorize/apply via saveAction, with no optimistic change.

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

function confidence(c: number): { label: string; cls: string } {
  if (c >= 0.8) return { label: `Likely, ${Math.round(c * 100)}%`, cls: "bg-status-healthy-bg text-status-healthy-text" };
  if (c >= 0.5) return { label: `Maybe, ${Math.round(c * 100)}%`, cls: "bg-status-watch-bg text-status-watch-text" };
  return { label: `Unsure, ${Math.round(c * 100)}%`, cls: "bg-status-critical-bg text-status-critical-text" };
}

export default function AiCategorize({ uncategorizedCount }: { uncategorizedCount: number }) {
  const router = useRouter();
  const save = useSaveAction();
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
    const r = await save<{ suggestions?: Suggestion[]; remaining?: number }>({
      request: { url: "/api/admin/finance/categorize/suggest", method: "POST" },
      failure: false,
    });
    setBusy("idle");
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setRows(
      (r.data.suggestions ?? []).map((s) => ({
        ...s,
        include: s.confidence >= 0.5,
        createRule: s.confidence >= 0.8 && s.rule_pattern.length >= 3,
      })),
    );
    setRemaining(r.data.remaining ?? 0);
  }

  async function apply() {
    const items = rows
      .filter((r) => r.include)
      .map((r) => ({ id: r.id, category_id: r.category_id, create_rule: r.createRule, pattern: r.rule_pattern }));
    if (items.length === 0) return;
    setBusy("applying");
    setError(null);
    const r = await save<{ updated?: number; rulesCreated?: number }>({
      request: { url: "/api/admin/finance/categorize/apply", method: "POST", body: { items } },
      failure: false,
    });
    setBusy("idle");
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setDone({ updated: r.data.updated ?? 0, rulesCreated: r.data.rulesCreated ?? 0 });
    setRows([]);
    router.refresh();
  }

  const includedCount = rows.filter((r) => r.include).length;
  const setAll = (include: boolean) => setRows((rs) => rs.map((r) => ({ ...r, include })));
  const close = () => busy === "idle" && setOpen(false);

  return (
    <>
      <Button variant="secondary" onClick={suggest} disabled={uncategorizedCount === 0 || busy !== "idle"}>
        Suggest categories
      </Button>

      <Drawer
        open={open}
        onClose={close}
        width={560}
        title="Suggested categories"
        description="AI suggestions for uncategorized transactions. Review before applying: AI can be wrong."
        footer={
          rows.length > 0 ? (
            <>
              <Button variant="secondary" onClick={close} disabled={busy !== "idle"}>
                Cancel
              </Button>
              <Button onClick={apply} disabled={includedCount === 0} loading={busy === "applying"}>
                {busy === "applying" ? "Applying" : `Apply ${includedCount}`}
              </Button>
            </>
          ) : done && remaining > 0 ? (
            <Button onClick={suggest} loading={busy === "suggesting"}>
              Suggest the next {Math.min(remaining, 60)}
            </Button>
          ) : (
            <Button variant="secondary" onClick={close} disabled={busy !== "idle"}>
              Close
            </Button>
          )
        }
      >
        {busy === "suggesting" ? <p className={`${TYPE.bodyMuted} py-8 text-center`}>Reading your transactions</p> : null}
        {error ? (
          <Notice tone="danger" title="That did not work.">
            {error}
          </Notice>
        ) : null}
        {done ? (
          <Notice tone="success" title={`Categorized ${done.updated} transaction${done.updated === 1 ? "" : "s"}.`}>
            {done.rulesCreated > 0
              ? `Saved ${done.rulesCreated} rule${done.rulesCreated === 1 ? "" : "s"} for next time.`
              : "No new rules were saved."}
            {remaining > 0 ? ` ${remaining} more are waiting.` : ""}
          </Notice>
        ) : null}
        {busy !== "suggesting" && !done && rows.length === 0 && !error ? (
          <p className={`${TYPE.bodyMuted} py-8 text-center`}>Nothing to categorize. Every transaction has a category.</p>
        ) : null}

        {rows.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-3 text-[13px]">
              <span className="text-ink-2">
                {includedCount} of {rows.length} selected
                {remaining > 0 ? `, ${remaining} more after this batch` : ""}
              </span>
              <div className="flex gap-1">
                <Button variant="quiet" size="sm" onClick={() => setAll(true)}>
                  Select all
                </Button>
                <Button variant="quiet" size="sm" onClick={() => setAll(false)}>
                  Clear
                </Button>
              </div>
            </div>
            <ul className="divide-y divide-hairline">
              {rows.map((r, i) => {
                const conf = confidence(r.confidence);
                return (
                  <li key={r.id} className="py-3 flex items-start gap-3">
                    <Checkbox
                      aria-label={`Apply ${r.category_name} to ${r.description}`}
                      checked={r.include}
                      onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className={`${TYPE.body} truncate`} title={r.description}>
                          {r.description}
                        </span>
                        <span className="text-xs tabular-nums text-ink-2">{fmtMoney(r.amount)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[13px] font-semibold text-ink-1">{r.category_name}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${conf.cls}`}>{conf.label}</span>
                        {r.rule_pattern ? (
                          <label className="text-xs text-ink-2 flex items-center gap-1.5 cursor-pointer min-h-[28px]">
                            <Checkbox
                              checked={r.createRule}
                              onChange={(e) =>
                                setRows((rs) => rs.map((x, j) => (j === i ? { ...x, createRule: e.target.checked } : x)))
                              }
                            />
                            Save a rule for &ldquo;{r.rule_pattern}&rdquo;
                          </label>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </Drawer>
    </>
  );
}
