"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ARTIFACT_TYPE } from "@/lib/finance/reportExport";
import Button from "@/app/admin/_components/ui/Button";
import Notice from "@/app/admin/_components/ui/Notice";
import { TextField } from "@/app/admin/_components/ui/Field";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";

// Spec Finance N3 — the gate banner + the one gated action. The draft above
// always renders; this strip names what stands between it and the exit.
// Waivers go through the existing Contract 7 API (RLS = reports.approve is
// the authority), keyed to THIS draft's rid — which becomes the documents
// row id at export, so the waiver travels with the shipped file.
// V4 Stage G2: kit Notice, labeled field and Buttons; both writes go
// through saveAction.

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
  const save = useSaveAction();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function waive(metricKey: string) {
    if (busy) return;
    setBusy(true);
    const r = await save({
      request: {
        url: "/api/admin/export-waivers",
        method: "POST",
        body: { artifact_type: artifactType, artifact_id: rid, metric_key: metricKey, reason: reason.trim() || null },
      },
      success: "Waiver recorded",
    });
    setBusy(false);
    if (r.ok) router.refresh();
  }

  async function doExport() {
    if (busy) return;
    setBusy(true);
    const r = await save<{ id: string }>({
      request: { url: exportUrl, method: "POST", body: { rid, title, keys } },
    });
    setBusy(false);
    if (!r.ok) {
      router.refresh();
      return;
    }
    setDone(r.data.id);
  }

  if (done) {
    return (
      <Notice
        tone="success"
        title="Exported to Documents."
        action={
          <Button variant="secondary" size="sm" href={backHref}>
            Back to reports
          </Button>
        }
      >
        <a href={`/api/admin/documents/${done}/url`} className="font-semibold underline underline-offset-2">
          Open the file
        </a>
      </Notice>
    );
  }

  return (
    <div className="space-y-3">
      {gate.blocked ? (
        <Notice
          tone="warning"
          title={`Export held: ${gate.blockers.length} unresolved figure${gate.blockers.length === 1 ? "" : "s"}.`}
        >
          The draft shows anyway; only the export waits. Owners and admins can waive a figure on the record.
          <div className="mt-3 space-y-2">
            <TextField
              label="Waiver reason"
              hint="Printed into the exported file and the audit record."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              controlSize="md"
            />
            <div className="flex flex-wrap gap-2">
              {gate.blockers.map((b) => (
                <Button key={b.metricKey} variant="secondary" size="sm" disabled={busy} onClick={() => void waive(b.metricKey)}>
                  Waive {b.metricKey} ({b.reason})
                </Button>
              ))}
            </div>
          </div>
        </Notice>
      ) : null}
      {gate.waived.length > 0 ? (
        <p className="text-xs text-ink-2">
          Shipping with waivers: {gate.waived.map((w) => w.metricKey).join(", ")}. Printed into the exported file.
        </p>
      ) : null}
      {gate.unconfirmed.length > 0 ? (
        <p className="text-xs text-ink-2">Unconfirmed (flagged, never blocking): {gate.unconfirmed.join(", ")}.</p>
      ) : null}
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={() => void doExport()} disabled={gate.blocked || keys.length === 0} loading={busy}>
          {busy ? "Exporting" : "Export to Documents"}
        </Button>
      </div>
    </div>
  );
}
