"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { TYPE } from "@/lib/admin/typeScale";
import type { FixTarget } from "../_lib/fixTargets";
import FixSheet, { type FiledNote } from "./FixSheet";

/**
 * Capture C6: the provenance line under a history row Capture filed. Everyone
 * who can see the row sees "From a voice note" and the edited stamp; the
 * person who recorded it also gets Fix.
 */
export default function FiledNoteLine({
  editedAt,
  target,
  note,
}: {
  editedAt: string | null;
  /** Present only for the viewer's own cards. */
  target: FixTarget | null;
  note: FiledNote;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const stamp = editedAt ? `Edited ${formatInTimeZone(editedAt, "America/Los_Angeles", "MMM d")}` : null;

  return (
    <div className={`${TYPE.metadata} mt-1 flex flex-wrap items-center gap-x-2`}>
      <span>From a voice note</span>
      {stamp && <span aria-label={stamp}>· {stamp}</span>}
      {done && (
        <span role="status" className="text-ink-1">
          · {done}
        </span>
      )}
      {target && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-my-3 min-h-[44px] px-1 font-semibold text-orange hover:underline"
        >
          Fix
        </button>
      )}
      {open && target && (
        <FixSheet
          target={target}
          note={note}
          onClose={() => setOpen(false)}
          onDone={(what) => {
            setOpen(false);
            setDone(what === "removed" ? "Removed" : what === "moved" ? "Moved" : "Saved");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
