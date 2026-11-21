"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "../../_components/ui/Button";
import Drawer from "../../_components/ui/Drawer";
import { useSaveAction } from "../../_lib/useSaveAction";
import StoryCaptureForm from "./StoryCaptureForm";

/** "Add a story": the capture form in the kit drawer (a sheet on a phone). */
export function AddStoryButton({ label = "Add a story" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>{label}</Button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Capture a story" description="Quick now. Add details later.">
        <StoryCaptureForm
          compact
          onSaved={(id) => {
            setOpen(false);
            router.push(`/admin/comms/stories/${id}`);
          }}
        />
      </Drawer>
    </>
  );
}

/** Move Stage C's kept story drafts into the bank (one click, idempotent). */
export function MoveDraftsButton({ count }: { count: number }) {
  const save = useSaveAction();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        const r = await save<{ moved: number; failed: number }>({
          request: { url: "/api/admin/comms/stories/from-capture", method: "POST" },
          success: (d) => `${d.moved} ${d.moved === 1 ? "story" : "stories"} moved in${d.failed ? `, ${d.failed} couldn't be` : ""}.`,
        });
        setBusy(false);
        if (r.ok) router.refresh();
      }}
    >
      Move {count} into stories
    </Button>
  );
}
