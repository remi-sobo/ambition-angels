"use client";

// Epic M2 — CSV import wizard: parse → map columns → preview → commit. Parses
// client-side (no dependency), auto-guesses the mapping, then posts mapped rows
// to the import API (which dedupes donors by email, skips already-imported
// gifts, and returns a per-year reconciliation report). Commits go in small
// batches so a big donor file lands as reviewable chunks with a running
// reconciliation, and a mid-file failure loses at most one batch (the server
// is idempotent, so re-running the same file only fills the gap).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TYPE } from "@/lib/admin/typeScale";
import {
  emptyReconciliation,
  mergeReconciliation,
  type Reconciliation,
} from "@/lib/fundraising/import-gifts";

type Parsed = { headers: string[]; rows: string[][] };

const BATCH_SIZE = 10;

const FIELDS: Array<{ key: string; label: string; syn: string[] }> = [
  { key: "first_name", label: "First name", syn: ["first name", "first", "firstname", "fname", "donor first name"] },
  { key: "last_name", label: "Last name", syn: ["last name", "last", "lastname", "lname", "surname", "donor last name"] },
  { key: "org_name", label: "Organization", syn: ["organization", "organization name", "org", "org name", "company", "company name"] },
  { key: "email", label: "Email", syn: ["email", "email address", "e-mail", "donor email", "donor email address"] },
  { key: "phone", label: "Phone", syn: ["phone", "phone number", "mobile", "tel", "donor phone"] },
  { key: "tags", label: "Tags", syn: ["tags", "tag", "labels", "campaign", "designation"] },
  { key: "amount", label: "Gift amount", syn: ["amount", "gift amount", "donation", "donation amount", "amount given", "total given", "payment amount", "gross amount", "total"] },
  { key: "gift_date", label: "Gift date", syn: ["gift date", "date", "donation date", "last gift date", "date received", "payment date", "transaction date", "created", "close date"] },
  { key: "method", label: "Gift method", syn: ["method", "payment method", "payment type", "type"] },
];

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm focus:outline-none focus:border-orange/40";

function parseCsv(text: string): Parsed {
  const records: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n") { cur.push(field); records.push(cur); cur = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || cur.length) { cur.push(field); records.push(cur); }
  const headers = (records.shift() ?? []).map((h) => h.trim());
  const rows = records.filter((r) => r.some((x) => x.trim() !== ""));
  return { headers, rows };
}

function autoMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const norm = h.trim().toLowerCase();
    for (const f of FIELDS) {
      if (map[f.key] === undefined && f.syn.includes(norm)) map[f.key] = i;
    }
  });
  return map;
}

type CommitResult = {
  created: number;
  matched: number;
  gifts: number;
  skipped: number;
  gift_duplicates: number;
  reconciliation?: Reconciliation;
  errors: string[];
};

type BatchLine = { index: number; rows: number; gifts: number; duplicates: number; amount: number };

type RunResult = CommitResult & { reconciliation: Reconciliation; batches: BatchLine[] };

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function ImportWizard() {
  const router = useRouter();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [map, setMap] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);

  const ingest = (text: string) => {
    const p = parseCsv(text);
    if (p.headers.length === 0 || p.rows.length === 0) { setError("No rows found — check the file has a header row and data."); return; }
    setError("");
    setParsed(p);
    setMap(autoMap(p.headers));
    setResult(null);
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => ingest(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const buildRows = (p: Parsed): Record<string, string>[] =>
    p.rows.map((cells) => {
      const row: Record<string, string> = {};
      for (const f of FIELDS) {
        const idx = map[f.key];
        if (idx !== undefined && cells[idx] !== undefined) row[f.key] = cells[idx].trim();
      }
      return row;
    });

  const commit = async () => {
    if (!parsed) return;
    if (map.email === undefined && map.first_name === undefined && map.org_name === undefined) {
      setError("Map at least an email, first name, or organization column.");
      return;
    }
    setBusy(true);
    setError("");
    // Batched commit: small chunks land sequentially so each gets its own
    // reconciliation line and a mid-file failure loses at most one batch.
    const allRows = buildRows(parsed);
    const batchCount = Math.ceil(allRows.length / BATCH_SIZE);
    const totals: RunResult = {
      created: 0, matched: 0, gifts: 0, skipped: 0, gift_duplicates: 0,
      reconciliation: emptyReconciliation(), batches: [], errors: [],
    };
    try {
      for (let b = 0; b < batchCount; b++) {
        setProgress(`Batch ${b + 1} of ${batchCount}…`);
        const slice = allRows.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
        const res = await fetch("/api/admin/import/constituents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: slice }),
        });
        const j = (await res.json().catch(() => ({}))) as Partial<CommitResult> & { error?: string };
        if (!res.ok) throw new Error(`Batch ${b + 1} of ${batchCount}: ${j.error ?? `HTTP ${res.status}`}`);
        totals.created += j.created ?? 0;
        totals.matched += j.matched ?? 0;
        totals.gifts += j.gifts ?? 0;
        totals.skipped += j.skipped ?? 0;
        totals.gift_duplicates += j.gift_duplicates ?? 0;
        totals.errors.push(...(j.errors ?? []));
        const recon = j.reconciliation ?? emptyReconciliation();
        totals.batches.push({
          index: b + 1,
          rows: slice.length,
          gifts: recon.inserted,
          duplicates: recon.duplicates,
          amount: recon.insertedAmount,
        });
        mergeReconciliation(totals.reconciliation, recon);
      }
      setResult(totals);
      router.refresh();
    } catch (err) {
      // Partial progress is safe: the server skips already-imported donors and
      // gifts, so re-running the same file only fills in what's missing.
      setError(
        (err instanceof Error ? err.message : "Import failed") +
          (totals.batches.length > 0
            ? ` (${totals.batches.length} batch(es) already landed — re-run the same file to continue; nothing will double)`
            : "")
      );
    } finally {
      setProgress("");
      setBusy(false);
    }
  };

  if (result) {
    return (
      <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-6 space-y-4">
        <h2 className={TYPE.cardTitle}>Import complete</h2>
        <p className="text-sm text-ink-2">
          <strong className="text-ink-1">{result.created}</strong> created ·{" "}
          <strong className="text-ink-1">{result.matched}</strong> matched existing ·{" "}
          <strong className="text-ink-1">{result.gifts}</strong> gifts recorded ·{" "}
          <strong className="text-ink-1">{result.gift_duplicates}</strong> gifts already imported ·{" "}
          {result.skipped} skipped
        </p>

        {result.reconciliation.years.length > 0 && (
          <div>
            <h3 className="text-xs font-heading font-bold text-ink-1 mb-2">
              Reconciliation by year — check these against the source system&apos;s totals
            </h3>
            <table className="text-xs">
              <thead>
                <tr className="text-ink-3 uppercase tracking-wider">
                  <th className="text-left pr-6 py-1 font-semibold">Year</th>
                  <th className="text-right pr-6 py-1 font-semibold">Gifts</th>
                  <th className="text-right pr-6 py-1 font-semibold">Imported</th>
                  <th className="text-right py-1 font-semibold">Skipped as duplicate</th>
                </tr>
              </thead>
              <tbody>
                {result.reconciliation.years.map((y) => (
                  <tr key={y.year} className="border-t border-hairline text-ink-2 tabular-nums">
                    <td className="pr-6 py-1">{y.year}</td>
                    <td className="text-right pr-6 py-1">{y.inserted}</td>
                    <td className="text-right pr-6 py-1">{usd(y.insertedAmount)}</td>
                    <td className="text-right py-1">{y.duplicates > 0 ? `${y.duplicates} (${usd(y.duplicateAmount)})` : "—"}</td>
                  </tr>
                ))}
                <tr className="border-t border-outline font-semibold text-ink-1 tabular-nums">
                  <td className="pr-6 py-1">Total</td>
                  <td className="text-right pr-6 py-1">{result.reconciliation.inserted}</td>
                  <td className="text-right pr-6 py-1">{usd(result.reconciliation.insertedAmount)}</td>
                  <td className="text-right py-1">{result.reconciliation.duplicates > 0 ? `${result.reconciliation.duplicates} (${usd(result.reconciliation.duplicateAmount)})` : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {result.batches.length > 1 && (
          <details className="text-xs text-ink-3">
            <summary className="cursor-pointer">{result.batches.length} batches</summary>
            <ul className="mt-2 space-y-0.5 tabular-nums">
              {result.batches.map((b) => (
                <li key={b.index}>
                  Batch {b.index}: {b.rows} rows · {b.gifts} gifts ({usd(b.amount)}){b.duplicates > 0 ? ` · ${b.duplicates} already imported` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}

        {result.errors.length > 0 && (
          <details className="text-xs text-ink-3">
            <summary className="cursor-pointer text-[#A56A1B]">{result.errors.length} row note(s)</summary>
            <ul className="mt-2 space-y-0.5">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </details>
        )}
        <button onClick={() => { setParsed(null); setResult(null); }} className="text-xs font-semibold text-orange hover:text-orange-dark transition-colors">
          Import another file
        </button>
      </section>
    );
  }

  if (!parsed) {
    return (
      <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-6 space-y-4">
        <div>
          <h2 className={`${TYPE.cardTitle} mb-1`}>Upload a CSV</h2>
          <p className="text-[11px] text-ink-3">First row = headers. Donors dedupe by email; an amount + date column adds a gift per row.</p>
        </div>
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="text-sm text-ink-2" />
        <details className="text-[11px] text-ink-3">
          <summary className="cursor-pointer">or paste CSV</summary>
          <textarea
            onChange={(e) => e.target.value.includes("\n") && ingest(e.target.value)}
            rows={6}
            placeholder="first_name,last_name,email,amount,gift_date&#10;Ada,Lovelace,ada@example.org,100,2026-01-15"
            className={inputCls + " w-full mt-2 font-mono"}
          />
        </details>
        {error && <p className="text-expense text-xs">{error}</p>}
      </section>
    );
  }

  const preview = buildRows(parsed).slice(0, 5);
  return (
    <div className="space-y-4">
      <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className={TYPE.cardTitle}>Map columns · {parsed.rows.length} rows</h2>
          <button onClick={() => setParsed(null)} className="text-[11px] text-ink-3 hover:text-ink-1">Start over</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold">
              {f.label}
              <select
                value={map[f.key] ?? ""}
                onChange={(e) => setMap((m) => { const n = { ...m }; if (e.target.value === "") delete n[f.key]; else n[f.key] = Number(e.target.value); return n; })}
                className={inputCls}
              >
                <option value="" className="bg-tile shadow-tile">— ignore —</option>
                {parsed.headers.map((h, i) => (<option key={i} value={i} className="bg-tile shadow-tile">{h || `Column ${i + 1}`}</option>))}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-outline"><h3 className="text-xs font-heading font-bold text-ink-1">Preview (first 5)</h3></div>
        <div className="overflow-x-auto">
          <table className="text-xs min-w-full">
            <thead>
              <tr className="text-ink-3 uppercase tracking-wider">
                {FIELDS.filter((f) => map[f.key] !== undefined).map((f) => <th key={f.key} className="text-left px-3 py-2 font-semibold">{f.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} className="border-t border-hairline">
                  {FIELDS.filter((f) => map[f.key] !== undefined).map((f) => <td key={f.key} className="px-3 py-2 text-ink-2 whitespace-nowrap">{row[f.key] || "—"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button onClick={commit} disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-5 py-2.5 rounded-full transition-colors disabled:opacity-50">
          {busy ? progress || "Importing…" : `Import ${parsed.rows.length} rows`}
        </button>
        {error && <span className="text-expense text-xs">{error}</span>}
      </div>
    </div>
  );
}
