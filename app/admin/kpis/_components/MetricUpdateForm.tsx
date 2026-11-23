"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/app/admin/_components/ui/Button";
import Drawer from "@/app/admin/_components/ui/Drawer";
import { TextField } from "@/app/admin/_components/ui/Field";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";

// Manual snapshot entry for a catalog metric (V4 Stage G2: the kit Drawer,
// labeled fields, saveAction). POSTs to the snapshot route, which writes
// metric_snapshots (captured_by = the caller's uuid) and syncs the plan-side
// KPI in the same request.
export default function MetricUpdateForm({ metricId, metricName }: { metricId: string; metricName?: string }) {
  const router = useRouter();
  const save = useSaveAction();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(n);

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    const r = await save({
      request: {
        url: `/api/admin/metrics/${metricId}/snapshot`,
        method: "POST",
        body: { value: n, ...(note.trim() ? { note: note.trim() } : {}) },
      },
      success: "Value recorded",
    });
    setBusy(false);
    if (!r.ok) return;
    setOpen(false);
    setValue("");
    setNote("");
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} aria-label={metricName ? `Update ${metricName}` : undefined}>
        Update
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={metricName ? `Update ${metricName}` : "Update this metric"}
        description="Records today's value. The old values stay in the history."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!valid} loading={busy}>
              Save value
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <TextField label="Value" required type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} />
          <TextField label="Note" hint="Optional: where the number came from." value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Drawer>
    </>
  );
}
