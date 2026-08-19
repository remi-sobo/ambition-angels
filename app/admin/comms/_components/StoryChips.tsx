"use client";

import { StatusChip } from "@/app/admin/_components/StatusChip";
import { CONSENT_LABEL, consentStatus } from "@/lib/comms/bank";
import type { ConsentState } from "@/lib/comms/consent";

/**
 * The bank's chips. Consent state and story status both render through the
 * shared StatusChip so a colour means the same thing here as everywhere else
 * in the admin, and both stay readable in greyscale — the label carries the
 * meaning, the dot only reinforces it.
 */

export function ConsentChip({ state }: { state: ConsentState | null }) {
  // A story about the org itself has nobody to protect. Saying nothing is
  // right: a "no consent needed" chip on every partnership announcement would
  // be noise, and healthy is supposed to recede.
  if (state === null) return null;
  return <StatusChip status={consentStatus(state)}>{CONSENT_LABEL[state] ?? state}</StatusChip>;
}

const STATUS_LABEL: Record<string, string> = {
  raw: "Raw",
  drafted: "Drafted",
  approved: "Approved",
  used: "Used",
  retired: "Retired",
};

export function StoryStatusChip({ status }: { status: string }) {
  // Deliberately quiet: workflow position is not severity. Approved is the one
  // that earns a tint, because it is the gate everything downstream depends on.
  if (status === "approved") return <StatusChip status="healthy">Approved</StatusChip>;
  return <StatusChip status="neutral">{STATUS_LABEL[status] ?? status}</StatusChip>;
}

export function TagChip({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-tile border border-hairline px-2 py-0.5 text-[11px] text-ink-2">
      {tag}
    </span>
  );
}

/** The person a story is about. A redacted subject reads as a placeholder in
 *  italics, so it is visibly a stand-in rather than someone actually called
 *  "a young person". */
export function SubjectChip({
  label,
  redacted,
}: {
  label: string;
  redacted: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-tile border border-hairline px-2 py-0.5 text-[11px] ${
        redacted ? "text-ink-3 italic" : "text-ink-2"
      }`}
      title={redacted ? "You don't have permission to see who this is." : undefined}
    >
      {label}
    </span>
  );
}
