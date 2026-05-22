"use client";

import { useState } from "react";
import Link from "next/link";
import type { BankFormat, ImportPreview } from "@/lib/finance/types";

type CommitResult = {
  ok: true;
  inserted: number;
  duplicates_skipped: number;
  categorized: number;
  period_start: string | null;
  period_end: string | null;
};

const FORMATS: { value: BankFormat; label: string }[] = [
  { value: "wells-fargo", label: "Wells Fargo" },
  { value: "chase", label: "Chase" },
  { value: "mercury", label: "Mercury" },
  { value: "quickbooks", label: "QuickBooks" },
  { value: "generic", label: "Generic (date / description / amount headers)" },
];

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export default function FinanceUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<BankFormat>("wells-fargo");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState<"idle" | "previewing" | "committing">("idle");
  const [error, setError] = useState<string | null>(null);
  // When the API returns a 400 with sample lines from the file, we surface
  // them here so the user can self-diagnose (wrong format, header row, etc).
  const [errorSample, setErrorSample] = useState<string[] | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  async function doPreview() {
    if (!file) return;
    setBusy("previewing");
    setError(null);
    setErrorSample(null);
    setErrorHint(null);
    setPreview(null);
    setResult(null);

    const fd = new FormData();
    fd.set("file", file);
    fd.set("format", format);
    fd.set("mode", "preview");

    const r = await fetch("/api/admin/finance/import", { method: "POST", body: fd });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(json.error ?? `Upload failed (${r.status})`);
      if (Array.isArray(json.sample)) setErrorSample(json.sample);
      if (typeof json.hint === "string") setErrorHint(json.hint);
    } else {
      setPreview(json.preview as ImportPreview);
    }
    setBusy("idle");
  }

  async function doCommit() {
    if (!file || !preview) return;
    setBusy("committing");
    setError(null);

    const fd = new FormData();
    fd.set("file", file);
    fd.set("format", format);
    fd.set("mode", "commit");

    const r = await fetch("/api/admin/finance/import", { method: "POST", body: fd });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(json.error ?? `Commit failed (${r.status})`);
    } else {
      setResult(json as CommitResult);
      setPreview(null);
      setFile(null);
    }
    setBusy("idle");
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="mb-8">
        <div className="flex items-baseline justify-between gap-4 mb-2 flex-wrap">
          <h1 className="font-display font-black uppercase tracking-tight text-cream text-3xl sm:text-4xl leading-none">
            Import bank CSV
          </h1>
          <Link
            href="/admin/finance"
            className="text-xs text-gray-mid hover:text-cream"
          >
            ← Back to Finance
          </Link>
        </div>
        <p className="text-sm text-gray-mid max-w-2xl">
          Pick a CSV exported from your bank and click <span className="text-cream">Upload</span>.
          We parse it, dedupe against existing transactions, and show a preview
          — nothing is written until you click <span className="text-cream">Commit</span>.
          Wells Fargo
          is the default; generic mode works for any CSV with date /
          description / amount columns.
        </p>
      </header>

      {/* Form */}
      <section className="rounded-card-lg border border-white/10 bg-white/[0.02] p-6 mb-6">
        <div className="grid sm:grid-cols-[1fr_auto] gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs uppercase tracking-wide text-gray-mid mb-2">
              Bank format
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as BankFormat)}
              className="w-full bg-ink border border-white/10 rounded-lg px-3 py-2 text-sm text-cream"
            >
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-mid mb-2">
              CSV file
            </label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setError(null);
                setResult(null);
              }}
              className="block text-sm text-cream file:mr-3 file:rounded-lg file:border-0 file:bg-orange file:text-cream file:px-3 file:py-2 file:text-xs file:font-medium file:cursor-pointer hover:file:bg-orange-dark"
            />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            disabled={!file || busy !== "idle"}
            onClick={doPreview}
            className="px-4 py-2 rounded-lg bg-orange hover:bg-orange-dark text-cream text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy === "previewing" ? "Reading…" : "Upload"}
          </button>
          <span className="text-[11px] text-gray-mid">
            Reads the file, dedupes against existing transactions, shows a
            preview. You confirm before anything is saved.
          </span>
          {file && (
            <span className="text-xs text-gray-mid ml-auto">
              {file.name} · {(file.size / 1024).toFixed(1)} KB
            </span>
          )}
        </div>
      </section>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-card border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">
          <div className="font-medium mb-1">{error}</div>
          {errorHint && (
            <div className="text-xs text-red-100/80 mb-3">{errorHint}</div>
          )}
          {errorSample && errorSample.length > 0 && (
            <details className="mt-2" open>
              <summary className="text-xs uppercase tracking-wider text-red-200/70 cursor-pointer hover:text-red-100">
                First {errorSample.length} lines we saw in the file
              </summary>
              <pre className="mt-2 text-[11px] font-mono text-cream/80 bg-black/30 rounded p-3 overflow-x-auto">
                {errorSample.join("\n")}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Commit result */}
      {result && (
        <div className="mb-6 rounded-card border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Imported <b>{result.inserted}</b> transactions
          {result.duplicates_skipped > 0 && <> · skipped <b>{result.duplicates_skipped}</b> duplicates</>}
          {result.categorized > 0 && <> · auto-categorized <b>{result.categorized}</b></>}
          {result.period_start && result.period_end && (
            <> · period <b>{result.period_start}</b> → <b>{result.period_end}</b></>
          )}
          .{" "}
          <Link href="/admin/finance/transactions" className="underline">
            Review →
          </Link>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <section className="rounded-card-lg border border-white/10 bg-white/[0.02] p-6">
          {preview.file_already_imported && (
            <div className="mb-4 rounded-card border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-100">
              This file&apos;s hash matches a prior import. Committing will be
              refused — re-upload only after rotating the file or trimming
              its date range.
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <Stat label="Rows in file" value={preview.row_count.toString()} />
            <Stat label="New" value={preview.new_count.toString()} accent />
            <Stat label="Duplicates" value={preview.duplicate_count.toString()} />
            <Stat label="Auto-categorized" value={preview.categorized_count.toString()} />
            <Stat label="Inflow total" value={fmtMoney(preview.inflow_total)} accent />
            <Stat label="Outflow total" value={fmtMoney(preview.outflow_total)} />
            <Stat label="Period start" value={preview.period_start ?? "—"} />
            <Stat label="Period end" value={preview.period_end ?? "—"} />
          </div>

          <div className="overflow-x-auto mb-6">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-mid uppercase tracking-wide">
                  <th className="text-left px-2 py-2">Date</th>
                  <th className="text-left px-2 py-2">Description</th>
                  <th className="text-right px-2 py-2">Amount</th>
                  <th className="text-left px-2 py-2">Category</th>
                  <th className="text-left px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr
                    key={r.dedup_hash}
                    className={`border-t border-white/5 ${r.is_duplicate ? "opacity-40" : ""}`}
                  >
                    <td className="px-2 py-2 font-mono text-cream/90">{r.txn_date}</td>
                    <td className="px-2 py-2 text-cream/80 max-w-md truncate">
                      {r.description}
                    </td>
                    <td
                      className={`px-2 py-2 text-right font-mono ${
                        r.amount >= 0 ? "text-emerald-300" : "text-cream/80"
                      }`}
                    >
                      {fmtMoney(r.amount)}
                    </td>
                    <td className="px-2 py-2 text-gray-mid">
                      {r.category_id ?? <span className="text-amber-300">uncategorized</span>}
                    </td>
                    <td className="px-2 py-2">
                      {r.is_duplicate ? (
                        <span className="text-gray-mid">duplicate</span>
                      ) : (
                        <span className="text-emerald-300">new</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.row_count > preview.rows.length && (
              <p className="mt-2 text-xs text-gray-mid">
                Showing first {preview.rows.length} of {preview.row_count} rows.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-white/5">
            <button
              type="button"
              disabled={busy !== "idle" || preview.new_count === 0 || preview.file_already_imported}
              onClick={doCommit}
              className="px-4 py-2 rounded-lg bg-orange hover:bg-orange-dark text-cream text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy === "committing"
                ? "Importing…"
                : `Commit ${preview.new_count} transaction${preview.new_count === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setError(null);
              }}
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

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-mid mb-1">{label}</div>
      <div className={`text-lg font-medium ${accent ? "text-orange" : "text-cream"}`}>
        {value}
      </div>
    </div>
  );
}
