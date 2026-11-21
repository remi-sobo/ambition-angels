"use client";

import { openCapture } from "../capture/_lib/openCapture";

/** Talk to log about this donor: the shell's one Capture modal, with the record as context. */
export default function LookupTalk({ id, name }: { id: string; name: string }) {
  return (
    <button
      type="button"
      onClick={() => openCapture({ type: "constituent", id, name })}
      className="inline-flex flex-1 items-center justify-center gap-2 min-h-[44px] rounded-control bg-orange px-3 text-sm font-semibold text-white hover:bg-orange-dark"
    >
      Talk to log
    </button>
  );
}
