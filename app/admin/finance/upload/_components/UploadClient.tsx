"use client";

import { useState } from "react";
import type { BankFormat, ImportPreview } from "@/lib/finance/types";
import { TYPE } from "@/lib/admin/typeScale";
import Button from "@/app/admin/_components/ui/Button";
import { SelectField, TextField } from "@/app/admin/_components/ui/Field";
import Notice from "@/app/admin/_components/ui/Notice";
import Figure, { SummaryStrip } from "@/app/admin/_components/ui/Figure";
import DataTable, { type DataTableColumn } from "@/app/admin/_components/ui/DataTable";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";

type CommitResult = {
  ok: true;
  inserted: number;
  duplicates_skipped: number;
  categorized: number;
  period_start: string | null;
  period_end: string | null;
};

type PreviewRow = ImportPreview["rows"][number];

const FORMATS: { value: BankFormat; label: string }[] = [
  { value: "wells-fargo", label: "Wells Fargo" },
  { value: "chase", label: "Chase" },
  { value: "mercury", label: "Mercury" },
  { value: "quickbooks", label: "QuickBooks" },
  { value: "generic", label: "Generic (date, description and amount headers)" },
];

const PREVIEW_SPEC = { sortable: [], defaultSort: null, pageSize: 1000 } as const;

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

// The bank-CSV importer, preview then commit (V4 Stage G2: kit fields, Notice,
// a Figure strip with sources and DataTable v2 for the preview; both requests
// go through saveAction, nothing optimistic). Nothing is written until Commit.
export default function UploadClient() {
  const save = useSaveAction();
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<BankFormat>("wells-fargo");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState<"idle" | "previewing" | "committing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorSample, setErrorSample] = useState<string[] | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  function send(mode: "preview" | "commit") {
    const fd = new FormData();
    fd.set("file", file as File);
    fd.set("format", format);
    fd.set("mode", mode);
    let body: { sample?: unknown; hint?: unknown } | null = null;
    return {
      run: () =>
        save<{ preview?: ImportPreview } & Partial<CommitResult>>({
          request: async () => {
            const res = await fetch("/api/admin/finance/import", { method: "POST", body: fd });
            body = await res.clone().json().catch(() => null);
            return res;
          },
          failure: false,
        }),
      body: () => body as { sample?: unknown; hint?: unknown } | null,
    };
  }

  async function doPreview() {
    if (!file) return;
    setBusy("previewing");
    setError(null);
    setErrorSample(null);
    setErrorHint(null);
    setPreview(null);
    setResult(null);
    const req = send("preview");
    const r = await req.run();
    setBusy("idle");
    if (!r.ok) {
      setError(r.message);
      const b = req.body();
      if (Array.isArray(b?.sample)) setErrorSample(b!.sample as string[]);
      if (typeof b?.hint === "string") setErrorHint(b!.hint as string);
      return;
    }
    setPreview(r.data.preview ?? null);
  }

  async function doCommit() {
    if (!file || !preview) return;
    setBusy("committing");
    setError(null);
    const r = await send("commit").run();
    setBusy("idle");
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setResult(r.data as CommitResult);
    setPreview(null);
    setFile(null);
  }

  const columns: DataTableColumn<PreviewRow>[] = [
    { key: "description", header: "Description", card: "title", render: (r) => <span className="text-ink-1">{r.description}</span> },
    { key: "date", header: "Date", className: "tabular-nums text-ink-2 whitespace-nowrap", render: (r) => r.txn_date },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      className: "tabular-nums whitespace-nowrap",
      render: (r) => <span className={r.amount >= 0 ? "text-status-healthy-text" : "text-ink-1"}>{fmtMoney(r.amount)}</span>,
    },
    {
      key: "category",
      header: "Category",
      render: (r) => r.category_id ?? <span className="text-status-watch-text">Uncategorized</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (r.is_duplicate ? <span className="text-ink-2">Duplicate, skipped</span> : <span className="text-status-healthy-text font-semibold">New</span>),
    },
  ];

  const src = file ? `From ${file.name}, before anything is saved` : "From the file you picked";

  return (
    <div className="space-y-6">
      <section className="bg-surface border border-hairline rounded-panel p-5">
        <h2 className={`${TYPE.cardTitle} mb-1`}>Bank transactions (CSV)</h2>
        <p className={`${TYPE.bodyMuted} mb-4`}>
          Pick a CSV exported from your bank. BloomOS reads it, skips anything already imported and shows a preview.
          Nothing is saved until you commit. Generic works for any CSV with date, description and amount columns.
        </p>
        <div className="grid sm:grid-cols-2 gap-4 items-end">
          <SelectField
            label="Bank format"
            value={format}
            onChange={(e) => setFormat(e.target.value as BankFormat)}
            options={FORMATS}
          />
          <TextField
            label="CSV file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setError(null);
              setResult(null);
            }}
            hint={file ? `${file.name}, ${(file.size / 1024).toFixed(1)} KB` : undefined}
            className="[&_input]:pt-2"
          />
        </div>
        <div className="mt-5 flex items-center gap-3 flex-wrap">
          <Button onClick={doPreview} disabled={!file} loading={busy === "previewing"}>
            {busy === "previewing" ? "Reading" : "Preview import"}
          </Button>
          <span className="text-[13px] text-ink-2">You confirm before anything is saved.</span>
        </div>
      </section>

      {error ? (
        <Notice tone="danger" title={error}>
          {errorHint ?? null}
          {errorSample && errorSample.length > 0 ? (
            <details className="mt-2" open>
              <summary className="text-xs font-semibold cursor-pointer">First {errorSample.length} lines in the file</summary>
              <pre className="mt-2 text-xs font-mono text-ink-1 bg-tile rounded-control p-3 overflow-x-auto">{errorSample.join("\n")}</pre>
            </details>
          ) : null}
        </Notice>
      ) : null}

      {result ? (
        <Notice
          tone="success"
          title={`Imported ${result.inserted} transaction${result.inserted === 1 ? "" : "s"}.`}
          action={
            <Button variant="secondary" size="sm" href="/admin/finance/transactions">
              Review transactions
            </Button>
          }
        >
          {result.duplicates_skipped > 0 ? `Skipped ${result.duplicates_skipped} duplicates. ` : ""}
          {result.categorized > 0 ? `Categorized ${result.categorized} by your rules. ` : ""}
          {result.period_start && result.period_end ? `Covers ${result.period_start} to ${result.period_end}. ` : ""}
          Then set your current balance so cash matches the bank.
        </Notice>
      ) : null}

      {preview ? (
        <section className="space-y-4">
          {preview.file_already_imported ? (
            <Notice tone="warning" title="This file was imported before.">
              Committing will be refused. Re-upload only after trimming its date range.
            </Notice>
          ) : null}
          <SummaryStrip label="Import preview">
            <Figure label="Rows in file" value={preview.row_count} source={src} />
            <Figure label="New" value={preview.new_count} source="Not already in your ledger" />
            <Figure label="Duplicates" value={preview.duplicate_count} source="Already imported, will be skipped" />
            <Figure label="Categorized by rules" value={preview.categorized_count} source="Matched one of your category rules" />
          </SummaryStrip>
          <SummaryStrip label="Import totals">
            <Figure label="Money in" value={fmtMoney(preview.inflow_total)} source={src} />
            <Figure label="Money out" value={fmtMoney(preview.outflow_total)} source={src} />
            <Figure label="First date" value={preview.period_start} source="Earliest transaction in the file" />
            <Figure label="Last date" value={preview.period_end} source="Latest transaction in the file" />
          </SummaryStrip>
          <DataTable
            label="Import preview"
            noun={{ one: "row", many: "rows" }}
            columns={columns}
            data={{ rows: preview.rows, total: preview.rows.length, page: 0, pageSize: PREVIEW_SPEC.pageSize }}
            getRowId={(r) => r.dedup_hash}
            getRowLabel={(r) => r.description}
            spec={PREVIEW_SPEC}
            state={{ page: 0, sort: null }}
            baseHref="/admin/settings/finance/upload"
          />
          {preview.row_count > preview.rows.length ? (
            <p className="text-xs text-ink-2">
              Showing the first {preview.rows.length} of {preview.row_count} rows.
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setPreview(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={doCommit}
              disabled={preview.new_count === 0 || preview.file_already_imported}
              loading={busy === "committing"}
            >
              {busy === "committing"
                ? "Importing"
                : `Commit ${preview.new_count} transaction${preview.new_count === 1 ? "" : "s"}`}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
