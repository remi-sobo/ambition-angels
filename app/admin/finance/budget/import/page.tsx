"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "../../../_components/PageHeader";
import PageShell from "../../../_components/ui/PageShell";
import Button from "../../../_components/ui/Button";
import { Select } from "../../../_components/ui/Input";
import { TextField } from "../../../_components/ui/Field";
import Notice from "../../../_components/ui/Notice";
import Figure, { SummaryStrip } from "../../../_components/ui/Figure";
import DataTable, { type DataTableColumn } from "../../../_components/ui/DataTable";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
import { TYPE } from "@/lib/admin/typeScale";

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

const SPEC = { sortable: [], defaultSort: null, pageSize: 1000 } as const;

function fmt(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// Budget import from QuickBooks: the Form archetype as a full page, because
// it is multi-step (V4 Stage G2: reading width, kit fields, Figure strip with
// sources, DataTable v2 for both previews, saveAction for both requests).
// Only base_amount changes; contingency tiers stay where they were.
export default function QbBudgetImportPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const save = useSaveAction();
  const initialYear = parseInt(sp.get("year") ?? "", 10);

  const [year, setYear] = useState<number>(
    Number.isFinite(initialYear) && initialYear >= 2000 ? initialYear : new Date().getFullYear(),
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState<"idle" | "previewing" | "committing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Per-unmatched override map: account → category_id (empty string = skip).
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  // Categories for the override menus, gathered from the suggestions across
  // every unmatched row (the minimum set the menus need).
  const [categories, setCategories] = useState<CategoryOption[] | null>(null);

  useEffect(() => {
    if (!preview) return;
    const all = new Map<string, CategoryOption>();
    const seed: Record<string, string> = {};
    for (const u of preview.unmatched) {
      seed[u.account] = u.suggestions[0]?.category_id ?? "";
      for (const s of u.suggestions) all.set(s.category_id, { id: s.category_id, group_name: s.group_name, display_name: s.display_name });
    }
    setCategories(Array.from(all.values()));
    setOverrides(seed);
  }, [preview]);

  function form(mode: "preview" | "commit") {
    const fd = new FormData();
    fd.set("file", file as File);
    fd.set("year", String(year));
    fd.set("mode", mode);
    if (mode === "commit") {
      for (const [account, category_id] of Object.entries(overrides)) {
        if (category_id) fd.set(`override:${account}`, category_id);
      }
    }
    return fd;
  }

  async function doPreview() {
    if (!file) return;
    setBusy("previewing");
    setError(null);
    setSuccess(null);
    setPreview(null);
    const r = await save<{ preview: PreviewResponse }>({
      request: () => fetch("/api/admin/finance/budget/import", { method: "POST", body: form("preview") }),
      failure: false,
    });
    setBusy("idle");
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setPreview(r.data.preview);
  }

  async function doCommit() {
    if (!file || !preview) return;
    setBusy("committing");
    setError(null);
    const r = await save<{ upserted: number; year: number; matched: number; overrides: number; skipped: number }>({
      request: () => fetch("/api/admin/finance/budget/import", { method: "POST", body: form("commit") }),
      failure: false,
    });
    setBusy("idle");
    if (!r.ok) {
      setError(r.message);
      return;
    }
    const j = r.data;
    setSuccess(
      `Wrote ${j.upserted} budget lines for ${j.year}: ${j.matched} matched, ${j.overrides} mapped by hand, ${j.skipped} skipped.`,
    );
    setPreview(null);
    setFile(null);
    setOverrides({});
    setTimeout(() => router.push(`/admin/finance/budget?year=${year}`), 1500);
  }

  const matchedColumns: DataTableColumn<MatchedRow>[] = [
    { key: "account", header: "QuickBooks account", card: "title", render: (m) => <span className="text-ink-1">{m.account}</span> },
    { key: "category", header: "Category", className: "text-ink-2", render: (m) => m.category_id },
    { key: "current", header: "Current base", align: "right", className: "tabular-nums text-ink-2", render: (m) => fmt(m.current_base) },
    { key: "new", header: "New base", align: "right", className: "tabular-nums text-ink-1", render: (m) => fmt(m.amount) },
    {
      key: "change",
      header: "Change",
      align: "right",
      className: "tabular-nums",
      render: (m) => {
        const d = m.amount - m.current_base;
        return d === 0 ? (
          <span className="text-ink-2">No change</span>
        ) : (
          <span className={d > 0 ? "text-status-healthy-text" : "text-status-critical-text"}>
            {d > 0 ? "+" : ""}
            {fmt(d)}
          </span>
        );
      },
    },
  ];

  const unmatchedColumns: DataTableColumn<UnmatchedRow>[] = [
    { key: "account", header: "QuickBooks account", card: "title", render: (u) => <span className="text-ink-1">{u.account}</span> },
    { key: "amount", header: "Amount", align: "right", className: "tabular-nums", render: (u) => fmt(u.amount) },
    {
      key: "map",
      header: "Map to",
      render: (u) => (
        <Select
          aria-label={`Category for ${u.account}`}
          value={overrides[u.account] ?? ""}
          onChange={(e) => setOverrides((o) => ({ ...o, [u.account]: e.target.value }))}
          className="max-w-xs text-[13px]"
        >
          <option value="">Skip this row</option>
          {u.suggestions.length > 0 ? (
            <optgroup label="Suggested">
              {u.suggestions.map((s) => (
                <option key={s.category_id} value={s.category_id}>
                  {s.display_name} ({s.group_name})
                </option>
              ))}
            </optgroup>
          ) : null}
          {categories && categories.length > 0 ? (
            <optgroup label="Other suggestions in this file">
              {categories
                .filter((c) => !u.suggestions.some((s) => s.category_id === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name} ({c.group_name})
                  </option>
                ))}
            </optgroup>
          ) : null}
        </Select>
      ),
    },
  ];

  const commitCount = preview ? preview.matched_count + Object.values(overrides).filter(Boolean).length : 0;
  const src = preview ? `From ${preview.filename}, before anything is saved` : "";

  return (
    <PageShell width="reading">
      <PageHeader
        breadcrumb={[
          { label: "Settings", href: "/admin/settings" },
          { label: "Finance", href: "/admin/settings/finance" },
        ]}
        title="Import budget from QuickBooks"
        subtitle="Use a CSV from QuickBooks Budget Overview, or any CSV with an Account column and a Total column. Account names are matched to your categories; you fix any that do not match before anything is saved. Only the base amount changes."
        secondaryActions={
          <Button variant="secondary" href={`/admin/finance/budget?year=${year}`}>
            Back to budget
          </Button>
        }
      />

      <section className="bg-surface border border-hairline rounded-panel p-5 mb-6">
        <div className="grid sm:grid-cols-[120px_1fr] gap-4 items-end">
          <TextField
            label="Year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || year)}
            inputMode="numeric"
          />
          <TextField
            label="QuickBooks CSV"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setError(null);
              setSuccess(null);
            }}
            className="[&_input]:pt-2"
          />
        </div>
        <div className="mt-4">
          <Button onClick={doPreview} disabled={!file} loading={busy === "previewing"}>
            {busy === "previewing" ? "Reading" : "Preview"}
          </Button>
        </div>
      </section>

      {error ? (
        <Notice tone="danger" title="That did not work." className="mb-6">
          {error}
        </Notice>
      ) : null}
      {success ? (
        <Notice tone="success" title="Budget imported." className="mb-6">
          {success}
        </Notice>
      ) : null}

      {preview ? (
        <section className="space-y-5">
          <SummaryStrip label="Import preview">
            <Figure label="Rows in file" value={preview.row_count} source={src} />
            <Figure label="Matched" value={preview.matched_count} source="Account names that match a category" />
            <Figure label="Need mapping" value={preview.unmatched_count} source="No category matched by name" />
            <Figure label="Format" value={preview.detected_format} source="Read from the file's header rows" />
          </SummaryStrip>

          <div>
            <h2 className={`${TYPE.cardTitle} mb-2`}>Will overwrite</h2>
            <DataTable
              label="Budget lines that will be overwritten"
              noun={{ one: "line", many: "lines" }}
              columns={matchedColumns}
              data={{ rows: preview.matched, total: preview.matched.length, page: 0, pageSize: SPEC.pageSize }}
              getRowId={(m) => m.account + m.category_id}
              getRowLabel={(m) => m.account}
              spec={SPEC}
              state={{ page: 0, sort: null }}
              baseHref="/admin/settings/finance/budget-import"
              emptyMessage="No automatic matches yet. Map them below."
            />
          </div>

          {preview.unmatched.length > 0 ? (
            <div>
              <h2 className={`${TYPE.cardTitle} mb-1`}>Needs mapping</h2>
              <p className={`${TYPE.bodyMuted} mb-2`}>
                Pick a category for each, or skip it to leave that line out of the import.
              </p>
              <DataTable
                label="QuickBooks accounts that need a category"
                noun={{ one: "account", many: "accounts" }}
                columns={unmatchedColumns}
                data={{ rows: preview.unmatched, total: preview.unmatched.length, page: 0, pageSize: SPEC.pageSize }}
                getRowId={(u) => u.account}
                getRowLabel={(u) => u.account}
                spec={SPEC}
                state={{ page: 0, sort: null }}
                baseHref="/admin/settings/finance/budget-import"
              />
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setPreview(null);
                setOverrides({});
              }}
            >
              Cancel
            </Button>
            <Button onClick={doCommit} loading={busy === "committing"}>
              {busy === "committing" ? "Writing" : `Commit ${commitCount} budget lines`}
            </Button>
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}
