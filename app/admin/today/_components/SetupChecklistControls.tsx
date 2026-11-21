"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/app/admin/_components/ui/Button";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
import { openCapture } from "@/app/admin/capture/_lib/openCapture";

// V4 Stage F: the checklist's two client controls. "Finish later" hides the
// list for the org (the only manual control; steps finish from real data).

export function FinishLaterButton() {
  const router = useRouter();
  const save = useSaveAction();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="md"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        const r = await save({
          request: { url: "/api/admin/settings/setup-checklist", method: "POST", body: { dismissed: true } },
          success: "Setup list hidden. Bring it back from Settings → Organization.",
        });
        setBusy(false);
        if (r.ok) router.refresh();
      }}
    >
      Finish later
    </Button>
  );
}

export function ShowChecklistAgain() {
  const router = useRouter();
  const save = useSaveAction();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="quiet"
      size="md"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        const r = await save({
          request: { url: "/api/admin/settings/setup-checklist", method: "POST", body: { dismissed: false } },
          success: "The setup list is back on Home.",
        });
        setBusy(false);
        if (r.ok) router.refresh();
      }}
    >
      Show the setup list on Home again
    </Button>
  );
}

export function TalkToLogLink({ label, className }: { label: string; className: string }) {
  return (
    <button type="button" className={className} onClick={() => openCapture()}>
      {label}
    </button>
  );
}
