"use client";

import { useState } from "react";
import { TYPE } from "@/lib/admin/typeScale";
import type { CaptureContext } from "../_lib/captureApi";
import CaptureModal from "./CaptureModal";

/**
 * "Record" on a record's own page (specs/bloomos-capture.md, C5): opens the
 * capture modal with this donor, partner, or opportunity as the context
 * prior, so "had coffee, she wants the numbers" lands on the right person
 * without naming them. The page decides whether to render it (ai.capture).
 */
export default function RecordButton({ context }: { context: CaptureContext }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${TYPE.button} inline-flex min-h-[36px] items-center gap-1.5 rounded-control border border-hairline px-3 text-ink-1 transition-colors hover:border-orange/50 hover:text-orange`}
        aria-label={`Record a note about ${context.name}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
        Record
      </button>
      {open && <CaptureModal surface="entity_page" context={context} onClose={() => setOpen(false)} />}
    </>
  );
}
