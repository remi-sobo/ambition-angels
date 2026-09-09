"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ARTIFACT_TYPE } from "@/lib/finance/reportExport";

// Spec Finance N3 — the gate banner + the one gated action. The draft above
// always renders; this strip names what stands between it and the exit.
// Waivers go through the existing Contract 7 API (RLS = reports.approve is
// the authority), keyed to THIS draft's rid — which becomes the documents
// row id at export, so the waiver travels with the shipped file.

type Blocker = { metricKey: string; reason: string };

export default function ExportControls({
  rid,
  title,
  keys,
  gate,
  // Shared with Impact → Reports since Spec Impact I2 (decision 2: one gate
  // strip, parameterized). The defaults ARE the N3 finance behavior.
  artifactType = ARTIFACT_TYPE,
  exportUrl = "/api/admin/finance/reports/export",
  backHref = "/admin/finance/reports",
}: {
  rid: string;
  title: string;
  keys: string[];
  gate: { blocked: boolean; blockers: Blocker[]; waived: Blocker[]; unconfirmed: string[] };
  artifactType?: string;
  exportUrl?: string;
  backHref?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function waive(metricKey: string) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/export-waivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifact_type: artifactType,
          artifact_id: rid,
          metric_key: metricKey,
          reason: reason.trim() || null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error ?? "Waiver refused — reports.approve required.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function doExport() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(exportUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rid, title, keys }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error ?? "Export blocked.");
        router.refresh();
        return;
      }
      setDone(j.id as string);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-revenue/40 bg-revenue/10 px-4 py-3 text-sm text-revenue flex items-center gap-3 flex-wrap">
        Exported to the file cabinet.
        <a href={`/api/admin/documents/${done}/url`} className="font-semibold underline">
          Open the file
        </a>
        <a href={backHref} className="ml-auto text-xs font-semibold text-ink-2 hover:text-ink-1">
          ← Reports
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {gate.blocked && (
        <div className="rounded-xl border border-[#D9BE86] bg-[#F4E8D0] px-4 py-3 space-y-2">
          <p className="text-xs text-[#A56A1B] font-semibold">
            Export blocked — {gate.blockers.length} unresolved figure
            {gate.blockers.length === 1 ? "" : "s"}. The draft renders anyway; only the exit is
            gated.
          </p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Waiver reason (goes into the shipped file and the audit record)"
            maxLength={500}
            className="w-full text-xs bg-surface border-[1.5px] border-outline rounded-lg px-3 py-1.5 text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange"
          />
          <div className="flex flex-wrap gap-2">
            {gate.blockers.map((b) => (
              <button
                key={b.metricKey}
                type="button"
                disabled={busy}
                onClick={() => void waive(b.metricKey)}
                className="text-[11px] font-semibold text-[#A56A1B] border-[1.5px] border-[#D9BE86] rounded-full px-3 py-1 hover:bg-[#EFE6D4] transition-colors disabled:opacity-40"
              >
                Waive {b.metricKey} ({b.reason})
              </button>
            ))}
          </div>
        </div>
      )}
      {gate.waived.length > 0 && (
        <p className="text-[11px] text-ink-3">
          Shipping with waivers: {gate.waived.map((w) => w.metricKey).join(", ")} — printed into
          the exported file.
        </p>
      )}
      {gate.unconfirmed.length > 0 && (
        <p className="text-[11px] text-ink-3">
          Unconfirmed (flagged, never blocking): {gate.unconfirmed.join(", ")}.
        </p>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          disabled={busy || gate.blocked || keys.length === 0}
          onClick={() => void doExport()}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark rounded-full px-4 py-2 transition-colors disabled:opacity-40"
        >
          {busy ? "Exporting…" : "Export to file cabinet"}
        </button>
        {err && <span className="text-xs text-expense">{err}</span>}
      </div>
    </div>
  );
}
