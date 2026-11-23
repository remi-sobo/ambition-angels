"use client";

// The one import wizard (spec #5 E3, V4 Stage F): upload → map → preview →
// commit → done, with Undo. Participants, donors, and donors with gifts all
// come through here. All heavy lifting is server-side (the engine + routes);
// this component holds step state and renders the field vocabulary.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { userMessage } from "@/lib/admin/errors";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import Button from "@/app/admin/_components/ui/Button";
import { StaticTable } from "@/app/admin/_components/ui/DataTable";

type FieldOption = { key: string; label: string; required?: boolean };
type Fields = { spine: FieldOption[]; custom: FieldOption[] };
type ReconYear = { year: string; inserted: number; insertedAmount: number; duplicates: number; duplicateAmount: number };
type Counts = {
  total?: number; valid?: number; invalid?: number; skipped?: number; created?: number; enrolled?: number;
  new_donors?: number; matched_donors?: number; donors_created?: number;
  reconciliation?: { years: ReconYear[] };
};
type RowResult = { row_num: number; status: string; verdict: string | null; error: string | null; summary?: string | null; donor?: string | null };

type Step = "upload" | "map" | "preview" | "commit" | "done" | "undone";
export type EntityType = "student" | "constituent" | "gift";

const ENTITY_CHOICES: { value: EntityType; label: string; hint: string }[] = [
  { value: "gift", label: "Donors and gifts", hint: "one row per gift" },
  { value: "constituent", label: "Donors and contacts", hint: "no gifts" },
  { value: "student", label: "Participants", hint: "onto the program roster" },
];

const NOUN: Record<EntityType, { one: string; many: string }> = {
  gift: { one: "gift", many: "gifts" },
  constituent: { one: "contact", many: "contacts" },
  student: { one: "participant", many: "participants" },
};

const inputCls =
  "bg-tile border-hairline rounded-control px-3 py-2 text-ink-1 text-sm focus:outline-none focus:border-orange/40";
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function ImportWizard({
  resumeId,
  cohorts = [],
  initialCohortId = null,
  initialEntity = null,
  entities = ["gift", "constituent", "student"],
}: {
  resumeId?: string | null;
  /** V4 Stage E: the org's open cohorts, for "put everyone in this cohort". */
  cohorts?: { id: string; name: string }[];
  /** Preselected from ?cohort= (the cohort page's "Import a roster file into this cohort"). */
  initialCohortId?: string | null;
  /** Preselected from ?target= (the setup checklist opens on donors and gifts). */
  initialEntity?: EntityType | null;
  /** The targets this person may import (by role and module). */
  entities?: EntityType[];
}) {
  const router = useRouter();
  const save = useSaveAction();
  const confirm = useConfirm();
  const choices = ENTITY_CHOICES.filter((c) => entities.includes(c.value));
  const [step, setStep] = useState<Step>(resumeId ? "commit" : "upload");
  const [entity, setEntity] = useState<EntityType>(
    initialEntity && entities.includes(initialEntity) ? initialEntity : choices[0]?.value ?? "student",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(resumeId ?? null);
  const [header, setHeader] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<Fields>({ spine: [], custom: [] });
  const [counts, setCounts] = useState<Counts>({});
  const [rows, setRows] = useState<RowResult[]>([]);
  const [progress, setProgress] = useState({ created: 0, remaining: 0 });
  const [undoNote, setUndoNote] = useState<string | null>(null);
  const [everyoneCohort, setEveryoneCohort] = useState<string>(
    initialCohortId && cohorts.some((c) => c.id === initialCohortId) ? initialCohortId : "",
  );
  const noun = NOUN[entity];

  const fail = async (res: Response) => {
    const j = await res.json().catch(() => ({}));
    setError(userMessage(res, j));
  };

  const upload = async (file: File) => {
    setBusy(true); setError(null);
    try {
      const csvText = await file.text();
      const res = await fetch("/api/admin/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: entity, filename: file.name, csv_text: csvText }),
      });
      if (!res.ok) return void (await fail(res));
      const j = await res.json();
      setRunId(j.id); setHeader(j.header); setMapping(j.mapping);
      setFields(j.fields); setCounts({ total: j.total });
      setStep("map");
    } finally {
      setBusy(false);
    }
  };

  const stage = async () => {
    if (!runId) return;
    setBusy(true); setError(null);
    try {
      const patch = await fetch(`/api/admin/imports/${runId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entity === "student" ? { map: mapping, cohort_id: everyoneCohort || null } : { map: mapping }),
      });
      if (!patch.ok) return void (await fail(patch));
      const res = await fetch(`/api/admin/imports/${runId}/stage`, { method: "POST" });
      if (!res.ok) return void (await fail(res));
      const j = await res.json();
      setCounts(j.counts);
      const detail = await fetch(`/api/admin/imports/${runId}`);
      if (detail.ok) setRows((await detail.json()).rows as RowResult[]);
      setStep("preview");
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!runId) return;
    setBusy(true); setError(null); setStep("commit");
    try {
      let created = 0;
      // The route is budgeted (200 rows/call) and re-entrant — loop to done.
      for (;;) {
        const res = await fetch(`/api/admin/imports/${runId}/commit`, { method: "POST" });
        if (!res.ok) return void (await fail(res));
        const j = await res.json();
        created += j.created;
        setProgress({ created, remaining: j.remaining });
        if (j.done) break;
      }
      const detail = await fetch(`/api/admin/imports/${runId}`);
      if (detail.ok) setCounts((await detail.json()).counts);
      setStep("done");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!runId || busy) return;
    const ok = await confirm({
      title: "Undo this import?",
      body: "Everything this import created is removed. Records someone has worked on since (a sent thank-you, a new gift, a conversation, attendance) are kept.",
      confirmLabel: "Undo import",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const r = await save<{ message: string }>({
      request: { url: `/api/admin/imports/${runId}/undo`, method: "POST" },
      success: (d) => d.message,
    });
    setBusy(false);
    if (r.ok) {
      setUndoNote(r.data.message);
      setStep("undone");
      router.refresh();
    }
  };

  const reset = () => {
    setStep("upload"); setRunId(null); setCounts({}); setRows([]); setError(null); setUndoNote(null);
  };

  const fieldSelect = (column: string) => (
    <select
      aria-label={`Field for the column ${column}`}
      className={`${inputCls} w-full !py-1.5`}
      value={mapping[column] ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        setMapping((m) => {
          const next = { ...m };
          if (v) next[column] = v; else delete next[column];
          return next;
        });
      }}
    >
      <option value="">(don&apos;t import)</option>
      <optgroup label={entity === "student" ? "Participant fields" : entity === "gift" ? "Donor and gift fields" : "Contact fields"}>
        {fields.spine.map((f) => (
          <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>
        ))}
      </optgroup>
      {fields.custom.length > 0 && (
        <optgroup label="Custom fields">
          {fields.custom.map((f) => (
            <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>
          ))}
        </optgroup>
      )}
    </select>
  );

  const statusLabel = (r: RowResult) =>
    r.status === "valid" ? "Will import" : r.status === "skipped" ? "Skipped" : r.status === "invalid" ? "Needs fixing" : r.status;

  return (
    <div className="bg-surface border border-hairline rounded-panel p-5" data-testid="import-wizard">
      {error && (
        <p role="alert" className="text-sm text-expense bg-expense-bg rounded-control px-3 py-2 mb-3">{error}</p>
      )}

      {step === "upload" && (
        <div>
          <p className="text-sm text-ink-2 mb-3">
            Upload a CSV (save a spreadsheet as CSV). The first row must be column headers. You map columns next,
            then see a preview with duplicates marked. Nothing is saved until you confirm, and you can undo an import afterwards.
          </p>
          <fieldset className="mb-4">
            <legend className="text-sm font-semibold text-ink-1 mb-2">What is in the file?</legend>
            <div className="flex flex-wrap gap-2">
              {choices.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={entity === c.value}
                  onClick={() => setEntity(c.value)}
                  className={`min-h-[44px] text-sm font-semibold px-4 rounded-control border transition-colors ${
                    entity === c.value ? "border-ink-1 bg-tile text-ink-1" : "border-outline bg-surface text-ink-2 hover:text-ink-1"
                  }`}
                >
                  {c.label}
                  <span className="font-normal text-ink-2 ml-1.5">{c.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-semibold text-ink-1 mb-1" htmlFor="import-file">CSV file</label>
          <input
            id="import-file"
            type="file" accept=".csv,text/csv" disabled={busy}
            className="text-sm text-ink-2 file:mr-3 file:rounded-control file:border file:border-outline file:bg-surface file:text-ink-1 file:text-sm file:font-semibold file:px-4 file:py-2 file:cursor-pointer"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
          />
        </div>
      )}

      {step === "map" && (
        <div>
          <p className="text-sm text-ink-2 mb-3">
            Match each column to a field ({counts.total} rows). Columns you leave as &ldquo;don&apos;t import&rdquo; are ignored.
            {entity === "gift" ? " Each row needs a donor (a name or an email), an amount and a date." : ""}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mb-4 max-w-[640px]">
            {header.map((column) => (
              <div key={column} className="contents">
                <div className="text-sm text-ink-1 self-center truncate font-semibold sm:font-normal" title={column}>{column}</div>
                {fieldSelect(column)}
              </div>
            ))}
          </div>
          {entity === "student" && cohorts.length > 0 && (
            <div className="mb-4 max-w-[560px]">
              <label htmlFor="import-everyone-cohort" className="block text-sm font-semibold text-ink-1 mb-1">
                Put everyone in a cohort
              </label>
              <select
                id="import-everyone-cohort"
                className={`${inputCls} w-full`}
                value={everyoneCohort}
                onChange={(e) => setEveryoneCohort(e.target.value)}
              >
                <option value="">No, leave them out of cohorts</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <p className="text-xs text-ink-2 mt-1">
                A Cohort column in the file wins for its rows; this fills the rest. People already on the roster join too.
              </p>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="quiet" onClick={() => setStep("upload")}>Back</Button>
            <Button variant="strong" loading={busy} onClick={() => void stage()}>
              {busy ? "Checking" : "Check the rows"}
            </Button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div>
          <h2 className="text-[17px] font-semibold text-ink-1">Preview</h2>
          <ul className="mt-2 mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Preview totals">
            <li className="text-revenue font-semibold">{counts.valid ?? 0} {noun.many} to import</li>
            {entity === "gift" ? (
              <li className="text-ink-2">{counts.new_donors ?? 0} new donors · {counts.matched_donors ?? 0} already in BloomOS</li>
            ) : null}
            <li className="text-ink-2">{counts.skipped ?? 0} skipped as duplicates</li>
            <li className={(counts.invalid ?? 0) > 0 ? "text-expense font-semibold" : "text-ink-2"}>{counts.invalid ?? 0} need fixing</li>
            <li className="text-ink-2">{counts.total ?? 0} rows in the file</li>
          </ul>
          {rows.length > 0 && (
            // The kit table (V4 P1), first 200 rows, scrolling in its box.
            <div className="max-h-80 overflow-auto mb-3">
              <StaticTable
                label="Dry run, row by row"
                noun={{ one: "row", many: "rows" }}
                rows={rows.slice(0, 200)}
                getRowId={(r) => String(r.row_num)}
                getRowLabel={(r) => `Row ${r.row_num}`}
                columns={[
                  { key: "what", header: "What", card: "title", render: (r) => <span className="text-ink-1">{r.summary ?? "(no name)"}</span> },
                  { key: "row", header: "Row", align: "right", render: (r) => <span className="text-ink-2 tabular-nums">{r.row_num}</span> },
                  {
                    key: "result",
                    header: "Result",
                    render: (r) => (
                      <span className={`whitespace-nowrap ${r.status === "invalid" ? "text-expense font-semibold" : r.status === "valid" ? "text-revenue" : "text-ink-2"}`}>
                        {statusLabel(r)}
                      </span>
                    ),
                  },
                  { key: "why", header: "Why", render: (r) => <span className="text-ink-2">{r.error ?? r.donor ?? ""}</span> },
                ]}
              />
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="quiet" onClick={() => setStep("map")}>Back to matching</Button>
            <Button variant="strong" disabled={busy || (counts.valid ?? 0) === 0} onClick={() => void commit()}>
              {(counts.valid ?? 0) === 0 ? "Nothing to import" : `Import ${counts.valid} ${(counts.valid ?? 0) === 1 ? noun.one : noun.many}`}
            </Button>
          </div>
        </div>
      )}

      {step === "commit" && (
        <div>
          <p className="text-sm text-ink-1 font-semibold mb-1">Importing</p>
          <p className="text-sm text-ink-2 tabular-nums">
            {progress.created} created · {progress.remaining} remaining
          </p>
          {!busy && (
            <Button variant="strong" className="mt-3" onClick={() => void commit()}>Resume import</Button>
          )}
        </div>
      )}

      {step === "done" && (
        <div>
          <h2 className="text-[17px] font-semibold text-ink-1">Import complete</h2>
          <p className="text-sm text-ink-2 mt-1">
            {counts.created ?? 0} {noun.many} created
            {entity === "gift" ? ` · ${counts.donors_created ?? 0} new donors` : ""} · {counts.skipped ?? 0} skipped · {counts.invalid ?? 0} need fixing
            {entity === "student" && (counts.enrolled ?? 0) > 0 ? ` · ${counts.enrolled} enrolled in a cohort` : ""}
          </p>
          {entity === "gift" && (counts.reconciliation?.years?.length ?? 0) > 0 && (
            <div className="mt-3 rounded-control border border-hairline">
              <p className="text-xs text-ink-2 px-3 pt-2">Check these totals against your old system, year by year.</p>
              <ul className="divide-y divide-outline text-sm" aria-label="Totals by year">
                {counts.reconciliation!.years.map((y) => (
                  <li key={y.year} className="flex flex-wrap items-center gap-x-4 px-3 py-2 tabular-nums">
                    <span className="font-semibold text-ink-1 w-12">{y.year}</span>
                    <span>Imported {y.inserted} · {usd(y.insertedAmount)}</span>
                    <span className="text-ink-2">Already recorded {y.duplicates} · {usd(y.duplicateAmount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-4">
            <Button href={entity === "student" ? "/admin/programs/people" : "/admin/fundraising/donors-funders"} variant="strong">
              {entity === "student" ? "View roster" : "View donors"}
            </Button>
            <Button variant="secondary" onClick={reset}>Import another file</Button>
            <Button variant="danger" loading={busy} onClick={() => void undo()}>Undo this import</Button>
          </div>
        </div>
      )}

      {step === "undone" && (
        <div>
          <h2 className="text-[17px] font-semibold text-ink-1">Import undone</h2>
          <p className="text-sm text-ink-2 mt-1">{undoNote}</p>
          <div className="mt-4">
            <Button variant="secondary" onClick={reset}>Import a file</Button>
          </div>
        </div>
      )}
    </div>
  );
}
