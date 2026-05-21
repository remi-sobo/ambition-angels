"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type MatchedRow = {
  account: string;
  amount: number;
  category_id: string;
  current_base: number;
};

type Suggestion = {
  category_id: string;
  display_name: string;
  group_name: string;
};

type UnmatchedRow = {
  account: string;
  amount: number;
  suggestions: Suggestion[];
};

type PreviewResponse = {
  year: number;
  filename: string;
  detected_format: "simple" | "headered";
  row_count: number;
  matched_count: number;
  unmatched_count: number;
  matched: MatchedRow[];
  unmatched: UnmatchedRow[];
};

type CategoryOption = {
  id: string;
  group_name: string;
  display_name: string;
};

function fmt(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function QbBudgetImportPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const initialYear = parseInt(sp.get("year") ?? "", 10);

  const [year, setYear] = useState<number>(
    Number.isFinite(initialYear) && initialYear >= 2000 ? initialYear : new Date().getFullYear()
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState<"idle" | "previewing" | "committing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Per-unmatched override map: account → category_id (empty string = skip).
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  // Categories for the override dropdowns. Fetched lazily — only needed
  // once a preview comes back with unmatched rows.
  const [categories, setCategories] = useState<CategoryOption[] | null>(null);
  useEffect(() => {
    if (categories !== null) return;
    if (!preview || preview.unmatched.length === 0) return;
    fetch("/api/admin/finance/budget/import/categories")
      .then(() => null) // Endpoint optional; we read from suggestions instead.
      .catch(() => null);
    // Build a category list from the suggestions across all unmatched rows
    // — that's the minimum set we need for the dropdowns. If the user
    // truly needs to pick a category that wasn't suggested, they'd use the
    // budget editor directly. Keeping this client-side keeps the route
    // count smaller.
    const all = new Map<string, CategoryOption>();
    for (const u of preview.unmatched) {
      for (const s of u.suggestions) {
        all.set(s.category_id, {
          id: s.category_id,
          group_name: s.group_name,
          display_name: s.display_name,
        });
      }
    }
    setCategories(Array.from(all.values()));
  }, [preview, categories]);

  // Seed overrides with the top suggestion when the preview lands.
  useEffect(() => {
    if (!preview) return;
    const seed: Record<string, string> = {};
    for (const u of preview.unmatched) {
      seed[u.account] = u.suggestions[0]?.category_id ?? "";
    }
    setOverrides(seed);
  }, [preview]);

  async function doPreview() {
    if (!file) return;
    setBusy("previewing");
    setError(null);
    setSuccess(null);
    setPreview(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("year", String(year));
    fd.set("mode", "preview");
    const r = await fetch("/api/admin/finance/budget/import", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setBusy("idle");
    if (!r.ok) {
      setError(j.error ?? `Preview failed (${r.status})`);
      return;
    }
    setPreview(j.preview as PreviewResponse);
  }

  async function doCommit() {
    if (!file || !preview) return;
    setBusy("committing");
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("year", String(year));
    fd.set("mode", "commit");
    for (const [account, category_id] of Object.entries(overrides)) {
      if (category_id) fd.set(`override:${account}`, category_id);
    }
    const r = await fetch("/api/admin/finance/budget/import", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setBusy("idle");
    if (!r.ok) {
      setError(j.error ?? `Commit failed (${r.status})`);
      return;
    }
    setSuccess(
      `Wrote ${j.upserted} budget lines for ${j.year}. ${j.matched} auto-matched · ${j.overrides} manually mapped · ${j.skipped} skipped.`
    );
    setPreview(null);
    setFile(null);
    setOverrides({});
    setTimeout(() => router.push(`/admin/finance/budget?year=${year}`), 1500);
  }

  return (
    <div className="max-w-6xl mx-auto p-8">
      <header className="mb-6">
        <div className="flex items-center gap-3 text-xs text-gray-mid mb-1">
          <Link href={`/admin/finance/budget?year=${year}`} className="hover:text-cream">
            ← Budget
          </Link>
        </div>
        <h1 className="font-display font-black uppercase tracking-tight text-cream text-3xl sm:text-4xl leading-none">
          Import budget from QuickBooks
        </h1>
        <p className="mt-2 text-sm text-gray-mid max-w-2xl">
          Drop a CSV exported from QuickBooks Budget Overview (or any CSV
          with an Account column and a Total column). We match account names
          to your categories, show what we&apos;ll write, and let you fix any
          unmatched rows before commit. Only <span className="text-cream">base_amount</span> changes —
          contingency tiers stay where they were.
        </p>
      </header>

      <section className="rounded-card-lg border border-white/10 bg-white/[0.02] p-5 mb-6">
        <div className="grid sm:grid-cols-[auto_1fr_auto] gap-4 items-end">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-gray-mid mb-1">Year</span>
            <input
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || year)}
              inputMode="numeric"
              className="bg-ink border border-white/10 rounded px-2 py-1.5 text-sm text-cream w-24"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-gray-mid mb-1">QuickBooks CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setError(null);
                setSuccess(null);
              }}
              className="block text-sm text-cream file:mr-3 file:rounded-lg file:border-0 file:bg-orange file:text-cream file:px-3 file:py-2 file:text-xs file:font-medium file:cursor-pointer hover:file:bg-orange-dark"
            />
          </label>
          <button
            type="button"
            disabled={!file || busy !== "idle"}
            onClick={doPreview}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-cream text-sm font-medium disabled:opacity-40"
          >
            {busy === "previewing" ? "Parsing…" : "Preview"}
          </button>
        </div>
      </section>

      {error && (
        <div className="mb-6 rounded-card border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 rounded-card border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {success}
        </div>
      )}

      {preview && (
        <section className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Rows in file" value={String(preview.row_count)} />
            <Stat label="Matched" value={String(preview.matched_count)} accent />
            <Stat label="Unmatched" value={String(preview.unmatched_count)} tone="warn" />
            <Stat label="Format" value={preview.detected_format} />
          </div>

          {/* Matched */}
          <div className="rounded-card-lg border border-white/10 bg-white/[0.02] overflow-hidden">
            <header className="px-4 py-2.5 border-b border-white/5">
              <div className="text-[10px] uppercase tracking-widest text-orange font-medium">
                Will overwrite
              </div>
            </header>
            <table className="w-full text-xs">
              <thead className="bg-white/[0.03] text-gray-mid uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2">QB account</th>
                  <th className="text-left px-3 py-2">→ Category</th>
                  <th className="text-right px-3 py-2 w-32">Current base</th>
                  <th className="text-right px-3 py-2 w-32">New base</th>
                  <th className="text-right px-3 py-2 w-24">Δ</th>
                </tr>
              </thead>
              <tbody>
                {preview.matched.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-mid">No automatic matches yet — map them below.</td></tr>
                ) : (
                  preview.matched.map((m) => {
                    const delta = m.amount - m.current_base;
                    return (
                      <tr key={m.account + m.category_id} className="border-t border-white/5">
                        <td className="px-3 py-1.5 text-cream/85">{m.account}</td>
                        <td className="px-3 py-1.5 text-gray-mid">{m.category_id}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-gray-mid">{fmt(m.current_base)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-cream">{fmt(m.amount)}</td>
                        <td
                          className={`px-3 py-1.5 text-right font-mono ${
                            delta > 0 ? "text-emerald-300" : delta < 0 ? "text-red-300" : "text-gray-mid"
                          }`}
                        >
                          {delta === 0 ? "—" : `${delta > 0 ? "+" : ""}${fmt(delta)}`}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Unmatched with manual mapping */}
          {preview.unmatched.length > 0 && (
            <div className="rounded-card-lg border border-amber-400/30 bg-amber-500/5 overflow-hidden">
              <header className="px-4 py-2.5 border-b border-white/5">
                <div className="text-[10px] uppercase tracking-widest text-amber-300 font-medium">
                  Needs mapping
                </div>
                <p className="text-[11px] text-gray-mid mt-1">
                  We couldn&apos;t auto-match these QB accounts. Pick a category
                  for each — or leave as &ldquo;skip&rdquo; to leave that QB line out of
                  the import.
                </p>
              </header>
              <table className="w-full text-xs">
                <thead className="bg-white/[0.03] text-gray-mid uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-3 py-2">QB account</th>
                    <th className="text-right px-3 py-2 w-32">Amount</th>
                    <th className="text-left px-3 py-2">Map to</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.unmatched.map((u) => (
                    <tr key={u.account} className="border-t border-white/5">
                      <td className="px-3 py-1.5 text-cream/85">{u.account}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-cream">{fmt(u.amount)}</td>
                      <td className="px-3 py-1.5">
                        <select
                          value={overrides[u.account] ?? ""}
                          onChange={(e) =>
                            setOverrides((o) => ({ ...o, [u.account]: e.target.value }))
                          }
                          className="bg-ink border border-white/10 rounded px-2 py-1 text-xs text-cream max-w-xs"
                        >
                          <option value="">— skip this row —</option>
                          {/* Suggested first */}
                          {u.suggestions.length > 0 && (
                            <optgroup label="Suggested">
                              {u.suggestions.map((s) => (
                                <option key={s.category_id} value={s.category_id}>
                                  {s.display_name} ({s.group_name})
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {/* Everything else gathered from preview suggestions across
                              all unmatched rows. Categories without any suggestion in
                              this file aren't picked up — for those, use the budget
                              editor directly. */}
                          {categories && categories.length > 0 && (
                            <optgroup label="All from suggestions">
                              {categories
                                .filter((c) => !u.suggestions.some((s) => s.category_id === c.id))
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.display_name} ({c.group_name})
                                  </option>
                                ))}
                            </optgroup>
                          )}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Commit */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy !== "idle"}
              onClick={doCommit}
              className="px-4 py-2 rounded-lg bg-orange hover:bg-orange-dark text-cream text-sm font-medium disabled:opacity-40"
            >
              {busy === "committing" ? "Writing…" : `Commit ${preview.matched_count + Object.values(overrides).filter(Boolean).length} budget lines`}
            </button>
            <button
              type="button"
              onClick={() => { setPreview(null); setOverrides({}); }}
              className="px-4 py-2 rounded-lg text-cream/80 hover:text-cream text-sm"
            >
              Cancel
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "warn";
}) {
  const valueClass = tone === "warn" ? "text-amber-300" : accent ? "text-orange" : "text-cream";
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-mid mb-1">{label}</div>
      <div className={`text-lg font-medium ${valueClass}`}>{value}</div>
    </div>
  );
}
