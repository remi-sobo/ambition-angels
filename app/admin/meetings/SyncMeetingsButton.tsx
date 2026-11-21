"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
import Button from "@/app/admin/_components/ui/Button";

/** Pull past external calendar events into matched meeting records. Idempotent.
 *  The Meetings page's one primary action (V4 Stage G), saved through
 *  saveAction so a failed sync is said. */
export default function SyncMeetingsButton() {
  const router = useRouter();
  const save = useSaveAction();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    const r = await save({
      request: { url: "/api/admin/meetings/sync", method: "POST" },
      failure: "Couldn't sync meetings. Try again.",
      success: "Meetings synced from your calendar",
    });
    setBusy(false);
    if (r.ok) startTransition(() => router.refresh());
  }

  return (
    <Button type="button" onClick={sync} loading={busy}>
      {busy ? "Syncing" : "Sync from calendar"}
    </Button>
  );
}
