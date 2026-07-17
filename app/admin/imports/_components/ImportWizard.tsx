"use client";

// CSV import wizard (spec #5 E3): upload → map → preview → commit → done.
// All heavy lifting is server-side (the engine + routes); this component
// holds step state and renders the org's field vocabulary for mapping.

import { useState } from "react";
import { useRouter } from "next/navigation";

type FieldOption = { key: string; label: string; required?: boolean };
type Fields = { spine: FieldOption[]; custom: FieldOption[] };
type Counts = { total?: number; valid?: number; invalid?: number; skipped?: number; created?: number };
type RowResult = { row_num: number; status: string; verdict: string | null; error: string | null };

type Step = "upload" | "map" | "preview" | "commit" | "done";

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm focus:outline-none focus:border-orange/40";
const btnCls =
  "text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50";
const quietBtnCls = "text-xs text-ink-2 hover:text-ink-1 px-2 py-2";

export default function ImportWizard({ resumeId }: { resumeId?: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(resumeId ? "commit" : "upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(resumeId ?? null);
  const [header, setHeader] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<Fields>({ spine: [], custom: [] });
  const [counts, setCounts] = useState<Counts>({});
  const [problems, setProblems] = useState<RowResult[]>([]);
  const [progress, setProgress] = useState({ created: 0, remaining: 0 });

  const fail = async (res: Response) => {
    const j = await res.json().catch(() => ({}));
    setError(j.error ?? `HTTP ${res.status}`);
  };

  const upload = async (file: File) => {
    setBusy(true); setError(null);
    try {
      const csvText = await file.text();
      const res = await fetch("/api/admin/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: "student", filename: file.name, csv_text: csvText }),
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
        body: JSON.stringify({ map: mapping }),
      });
      if (!patch.ok) return void (await fail(patch));
      const res = await fetch(`/api/admin/imports/${runId}/stage`, { method: "POST" });
      if (!res.ok) return void (await fail(res));
      const j = await res.json();
      setCounts(j.counts);
      const detail = await fetch(`/api/admin/imports/${runId}`);
      if (detail.ok) {
        const d = await detail.json();
        setProblems((d.rows as RowResult[]).filter((r) => r.status !== "valid"));
      }
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

  const fieldSelect = (column: string) => (
    <select
      className={`${inputCls} w-full !py-1 !text-xs`}
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
      <option value="">— don&apos;t import —</option>
      <optgroup label="Participant fields">
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

  return (
    <div className="bg-surface shadow-panel border-[1.5px] border-outline rounded-card p-4">
      {error && (
        <p className="text-xs text-expense bg-expense-bg rounded-lg px-3 py-2 mb-3">{error}</p>
      )}

      {step === "upload" && (
        <div>
          <p className="text-sm text-ink-2 mb-3">
            Upload a CSV of participants. The first row must be column headers; you&apos;ll map
            columns to fields next. Nothing is written until you confirm the preview.
          </p>
          <input
            type="file" accept=".csv,text/csv" disabled={busy}
            className="text-sm text-ink-2 file:mr-3 file:rounded-full file:border-0 file:bg-orange file:text-white file:text-xs file:font-semibold file:px-4 file:py-2 file:cursor-pointer"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
          />
        </div>
      )}

      {step === "map" && (
        <div>
          <p className="text-sm text-ink-2 mb-3">
            Map columns to fields ({counts.total} rows). Unmapped columns are ignored.
          </p>
          <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: "1fr 1fr", maxWidth: 560 }}>
            {header.map((column) => (
              <div key={column} className="contents">
                <div className="text-xs text-ink-1 self-center truncate" title={column}>{column}</div>
                {fieldSelect(column)}
              </div>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button className={quietBtnCls} onClick={() => setStep("upload")}>Back</button>
            <button className={btnCls} disabled={busy} onClick={() => void stage()}>
              {busy ? "Checking…" : "Validate rows"}
            </button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div>
          <div className="flex flex-wrap gap-4 text-sm mb-3">
            <span className="text-revenue font-semibold">{counts.valid ?? 0} to create</span>
            <span className="text-ink-2">{counts.skipped ?? 0} skipped (duplicates)</span>
            <span className={(counts.invalid ?? 0) > 0 ? "text-expense font-semibold" : "text-ink-2"}>
              {counts.invalid ?? 0} invalid
            </span>
            <span className="text-ink-3">{counts.total ?? 0} total</span>
          </div>
          {problems.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-outline mb-3">
              <table className="w-full text-[12px]">
                <tbody>
                  {problems.slice(0, 100).map((r) => (
                    <tr key={r.row_num} className="border-b border-outline last:border-0">
                      <td className="px-2 py-1 text-ink-3 tabular-nums w-14">#{r.row_num}</td>
                      <td className={`px-2 py-1 w-20 ${r.status === "invalid" ? "text-expense" : "text-ink-2"}`}>
                        {r.status}
                      </td>
                      <td className="px-2 py-1 text-ink-2">{r.error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button className={quietBtnCls} onClick={() => setStep("map")}>Back to mapping</button>
            <button className={btnCls} disabled={busy || (counts.valid ?? 0) === 0} onClick={() => void commit()}>
              {(counts.valid ?? 0) === 0 ? "Nothing to import" : `Import ${counts.valid} participants`}
            </button>
          </div>
        </div>
      )}

      {step === "commit" && (
        <div>
          <p className="text-sm text-ink-1 font-semibold mb-1">Importing…</p>
          <p className="text-xs text-ink-2 tabular-nums">
            {progress.created} created · {progress.remaining} remaining
          </p>
          {!busy && (
            <button className={`${btnCls} mt-3`} onClick={() => void commit()}>Resume import</button>
          )}
        </div>
      )}

      {step === "done" && (
        <div>
          <p className="text-sm text-ink-1 font-semibold mb-1">Import complete</p>
          <p className="text-xs text-ink-2">
            {counts.created ?? 0} created · {counts.skipped ?? 0} skipped · {counts.invalid ?? 0} invalid
          </p>
          <div className="flex gap-2 mt-3">
            <a href="/admin/students" className={btnCls}>View roster</a>
            <button className={quietBtnCls} onClick={() => {
              setStep("upload"); setRunId(null); setCounts({}); setProblems([]); setError(null);
            }}>
              Import another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
