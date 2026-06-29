"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FinCategory } from "@/lib/finance/types";

type Rule = {
  id: string;
  pattern: string;
  pattern_type: "contains" | "starts_with" | "regex";
  category_id: string;
  restricted: boolean;
  priority: number;
  enabled: boolean;
  hit_count: number;
};

type Props = {
  initialRules: Rule[];
  categories: FinCategory[];
};

const PATTERN_TYPES: Array<Rule["pattern_type"]> = ["contains", "starts_with", "regex"];

export default function RulesEditor({ initialRules, categories }: Props) {
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [newPattern, setNewPattern] = useState("");
  const [newType, setNewType] = useState<Rule["pattern_type"]>("contains");
  const [newCategory, setNewCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<string | null>(null);

  // Inline edit of an existing rule. `draft` holds the in-progress values for
  // the row being edited so typing never touches the live list until Save.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    pattern: string;
    pattern_type: Rule["pattern_type"];
    category_id: string;
    priority: number;
  }>({ pattern: "", pattern_type: "contains", category_id: "", priority: 0 });
  const [editError, setEditError] = useState<string | null>(null);

  const catById = new Map(categories.map((c) => [c.id, c]));

  // Category <option>s grouped by group_name — shared by the add form and the
  // inline editor. A function so each <select> gets its own element instances.
  const renderCategoryOptions = () =>
    Array.from(new Set(categories.map((c) => c.group_name))).map((g) => (
      <optgroup key={g} label={g}>
        {categories
          .filter((c) => c.group_name === g)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.display_name}
            </option>
          ))}
      </optgroup>
    ));

  async function createRule() {
    if (!newPattern.trim() || !newCategory) return;
    setBusy(true);
    setError(null);
    const r = await fetch("/api/admin/finance/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pattern: newPattern,
        pattern_type: newType,
        category_id: newCategory,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j.error ?? "Failed to create rule");
    } else {
      setRules((rs) => [j.rule, ...rs]);
      setNewPattern("");
      setNewCategory("");
    }
    setBusy(false);
  }

  async function toggle(id: string, enabled: boolean) {
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, enabled } : r)));
    const res = await fetch(`/api/admin/finance/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      // Roll back.
      setRules((rs) => rs.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r)));
    }
  }

  function startEdit(r: Rule) {
    setEditingId(r.id);
    setDraft({
      pattern: r.pattern,
      pattern_type: r.pattern_type,
      category_id: r.category_id,
      priority: r.priority,
    });
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    if (!draft.pattern.trim() || !draft.category_id) {
      setEditError("Pattern and category are required.");
      return;
    }
    setBusy(true);
    setEditError(null);
    const res = await fetch(`/api/admin/finance/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pattern: draft.pattern.trim(),
        pattern_type: draft.pattern_type,
        category_id: draft.category_id,
        priority: draft.priority,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEditError(j.error ?? "Failed to save rule");
    } else {
      setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...j.rule } : r)));
      setEditingId(null);
    }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm("Delete this rule? Transactions it already matched will keep their category.")) {
      return;
    }
    const prev = rules;
    setRules((rs) => rs.filter((r) => r.id !== id));
    const res = await fetch(`/api/admin/finance/rules/${id}`, { method: "DELETE" });
    if (!res.ok) setRules(prev);
  }

  async function applyAll() {
    setBusy(true);
    setError(null);
    setApplyResult(null);
    const r = await fetch("/api/admin/finance/rules/apply-all", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j.error ?? "Apply failed");
    } else {
      setApplyResult(
        `Categorized ${j.matched} of ${j.considered} uncategorized transactions. ${j.remaining ?? 0} still need a category.`
      );
      router.refresh();
    }
    setBusy(false);
  }

  // Seed defaults — inserts ~60 starter rules derived from real Wells
  // Fargo descriptions on Ambition Angels' Checking.csv. Idempotent:
  // skips patterns already present.
  async function seedDefaults() {
    setBusy(true);
    setError(null);
    setApplyResult(null);
    const r = await fetch("/api/admin/finance/rules/seed", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j.error ?? "Seed failed");
    } else {
      setApplyResult(
        j.inserted === 0
          ? `Default rule set already seeded (${j.skipped} rules present).`
          : `Seeded ${j.inserted} default rules (${j.skipped} already present). Click "Apply to uncategorized" to backfill.`
      );
      router.refresh();
    }
    setBusy(false);
  }

  // Sort by priority desc for display; ties broken by created_at via the
  // initialRules ordering from the server.
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);

  return (
    <div className="space-y-6">
      {/* Create form */}
      <div className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
        <h2 className="text-sm uppercase tracking-wider text-ink-2 mb-3">
          Add rule
        </h2>
        <div className="grid sm:grid-cols-[1fr_auto_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-ink-2 mb-1">
              When description …
            </label>
            <input
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              placeholder={
                newType === "regex" ? "/regex/" : newType === "starts_with" ? "WF DIRECT PAY" : "GUSTO"
              }
              className="w-full bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1"
            />
          </div>
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as Rule["pattern_type"])}
            className="bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1"
          >
            {PATTERN_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1"
          >
            <option value="">— Set category to —</option>
            {renderCategoryOptions()}
          </select>
          <button
            type="button"
            disabled={busy || !newPattern.trim() || !newCategory}
            onClick={createRule}
            className="px-3 py-1.5 rounded-lg bg-orange hover:bg-orange-dark text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-expense">{error}</p>}
      </div>

      {/* Seed + Apply CTAs */}
      <div className="rounded-card border-[1.5px] border-outline bg-surface shadow-panel p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-sm text-ink-1 font-medium">
              Seed default rules
            </div>
            <div className="text-xs text-ink-2 mt-0.5">
              ~60 starter rules derived from real Ambition Angels CSV
              descriptions (Gusto, Paychex, Anthropic, OpenAI, Givebutter,
              etc.). Skips patterns you already have.
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={seedDefaults}
            className="px-3 py-1.5 rounded-lg bg-orange/20 hover:bg-orange/30 border border-orange/40 text-orange text-sm font-medium disabled:opacity-40"
          >
            {busy ? "Working…" : "Seed defaults"}
          </button>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-hairline">
          <div>
            <div className="text-sm text-ink-1 font-medium">Re-apply rules</div>
            <div className="text-xs text-ink-2 mt-0.5">
              Runs the active rule list against every uncategorized transaction.
              Already-categorized rows are untouched.
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={applyAll}
            className="px-3 py-1.5 rounded-lg border-[1.5px] border-outline bg-tile hover:bg-[#EFE6D4] text-ink-1 text-sm disabled:opacity-40"
          >
            {busy ? "Working…" : "Apply to uncategorized"}
          </button>
        </div>
      </div>
      {applyResult && (
        <div className="rounded-card border border-revenue/30 bg-revenue-bg p-3 text-sm text-revenue">
          {applyResult}
        </div>
      )}

      {/* Rule list */}
      <div className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-surface shadow-panel text-ink-2 uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2.5 w-8"></th>
              <th className="text-left px-3 py-2.5">Pattern</th>
              <th className="text-left px-3 py-2.5 w-28">Type</th>
              <th className="text-left px-3 py-2.5">Category</th>
              <th className="text-right px-3 py-2.5 w-20">Hits</th>
              <th className="text-right px-3 py-2.5 w-20">Priority</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-ink-2">
                  No rules yet. Add one above — for example,{" "}
                  <code className="text-ink-1">contains GUSTO → Salaries &amp; wages</code>.
                </td>
              </tr>
            )}
            {sorted.map((r) =>
              editingId === r.id ? (
                <tr key={r.id} className="border-t border-hairline">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={r.enabled} disabled className="accent-orange opacity-50" />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={draft.pattern}
                      onChange={(e) => setDraft((d) => ({ ...d, pattern: e.target.value }))}
                      placeholder={
                        draft.pattern_type === "regex" ? "/regex/" : draft.pattern_type === "starts_with" ? "WF DIRECT PAY" : "GUSTO"
                      }
                      className="w-full bg-ink border-[1.5px] border-outline rounded px-2 py-1 text-xs text-ink-1 font-mono"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={draft.pattern_type}
                      onChange={(e) => setDraft((d) => ({ ...d, pattern_type: e.target.value as Rule["pattern_type"] }))}
                      className="w-full bg-ink border-[1.5px] border-outline rounded px-1 py-1 text-xs text-ink-1"
                    >
                      {PATTERN_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={draft.category_id}
                      onChange={(e) => setDraft((d) => ({ ...d, category_id: e.target.value }))}
                      className="w-full bg-ink border-[1.5px] border-outline rounded px-1 py-1 text-xs text-ink-1"
                    >
                      {renderCategoryOptions()}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right text-ink-2 font-mono">{r.hit_count}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="1"
                      value={draft.priority}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        setDraft((d) => ({ ...d, priority: Number.isNaN(n) ? 0 : n }));
                      }}
                      className="w-16 bg-ink border-[1.5px] border-outline rounded px-1 py-1 text-xs text-ink-1 text-right font-mono"
                    />
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => saveEdit(r.id)}
                      disabled={busy}
                      className="text-revenue hover:opacity-80 text-xs font-medium disabled:opacity-40"
                    >
                      Save
                    </button>
                    <button onClick={cancelEdit} className="text-ink-2 hover:text-ink-1 text-xs ml-2">
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={r.id} className={`border-t border-hairline ${r.enabled ? "" : "opacity-50"}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={(e) => toggle(r.id, e.target.checked)}
                      className="accent-orange"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-ink-1">{r.pattern}</td>
                  <td className="px-3 py-2 text-ink-2">{r.pattern_type.replace("_", " ")}</td>
                  <td className="px-3 py-2 text-ink-1">
                    {catById.get(r.category_id)?.display_name ?? r.category_id}
                    <span className="text-[10px] text-ink-2 ml-1.5">
                      {catById.get(r.category_id)?.group_name}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-ink-1 font-mono">{r.hit_count}</td>
                  <td className="px-3 py-2 text-right text-ink-1 font-mono">{r.priority}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => startEdit(r)} className="text-ink-2 hover:text-orange text-xs">
                      Edit
                    </button>
                    <button
                      onClick={() => remove(r.id)}
                      className="text-ink-2 hover:text-expense text-xs ml-2"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
        {editError && <p className="px-3 py-2 text-xs text-expense border-t border-hairline">{editError}</p>}
      </div>
    </div>
  );
}
