"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import Button from "@/app/admin/_components/ui/Button";

// V4 Stage F: Undo on a finished import in the past-imports list.
export default function UndoImportButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const save = useSaveAction();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="quiet"
      size="sm"
      loading={busy}
      aria-label={`Undo the import ${label}`}
      onClick={async () => {
        const ok = await confirm({
          title: `Undo ${label}?`,
          body: "Everything this import created is removed. Records someone has worked on since (a sent thank-you, a new gift, a conversation, attendance) are kept.",
          confirmLabel: "Undo import",
          destructive: true,
        });
        if (!ok) return;
        setBusy(true);
        const r = await save<{ message: string }>({
          request: { url: `/api/admin/imports/${id}/undo`, method: "POST" },
          success: (d) => d.message,
        });
        setBusy(false);
        if (r.ok) router.refresh();
      }}
    >
      Undo
    </Button>
  );
}
