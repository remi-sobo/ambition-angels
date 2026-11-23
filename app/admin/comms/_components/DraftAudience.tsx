"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "../../_components/ui/Button";
import Drawer from "../../_components/ui/Drawer";
import { useSaveAction } from "../../_lib/useSaveAction";
import AudienceBuilder, { type SegmentOption } from "./AudienceBuilder";

/**
 * Choose who a draft email goes to, with the live count (V4 Stage D). Also
 * closes 06-comms C-3 for the audience: a compiled edition, or any draft,
 * can get its segment after it was created. Attaching never sends.
 */
export default function DraftAudience({
  campaignId,
  segments,
  segmentId,
  autoOpen = false,
}: {
  campaignId: string;
  segments: SegmentOption[];
  segmentId: string | null;
  autoOpen?: boolean;
}) {
  const save = useSaveAction();
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const [picked, setPicked] = useState<string | null>(segmentId);
  const [busy, setBusy] = useState(false);
  const [sendable, setSendable] = useState(false);
  return (
    <>
      <Button variant="quiet" size="sm" onClick={() => setOpen(true)}>{segmentId ? "Audience" : "Choose audience"}</Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Who gets this email"
        description="The count is the send's own count, checked as you change it."
        width={560}
        footer={
          <Button
            variant="primary"
            loading={busy}
            disabled={!picked || !sendable}
            onClick={async () => {
              setBusy(true);
              const r = await save({ request: { url: `/api/admin/comms/${campaignId}`, method: "PATCH", body: { segment_id: picked } }, success: "Audience attached. Send a test, then send." });
              setBusy(false);
              if (r.ok) {
                setOpen(false);
                router.refresh();
              }
            }}
          >
            Use this audience
          </Button>
        }
      >
        <AudienceBuilder segments={segments} value={segmentId} onChange={setPicked} onCount={setSendable} />
      </Drawer>
    </>
  );
}
