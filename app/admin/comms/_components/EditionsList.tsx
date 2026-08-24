"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/app/admin/_components/Button";
import { StatusChip } from "@/app/admin/_components/StatusChip";
import { TYPE } from "@/lib/admin/typeScale";
import { EDITION_STATUS_LABEL, type EditionStatus } from "@/lib/comms/formats";
import type { EditionWithProgress, FormatRow } from "@/lib/comms/editions-server";
import type { Status } from "@/lib/admin/status";

/**
 * The editions list (spec §7.4).
 *
 * "Plan the year" is the feature that matters here: it creates the whole
 * cadence up front with target dates, so the deadlines exist months out and
 * nothing gets written the week it is due.
 *
 * Completeness renders as text, not a gauge — "3 of 5 slots filled" says the
 * same thing without pretending to be a measurement.
 */

function statusFor(s: string, targetDate: string | null): Status {
  if (s === "sent") return "healthy";
  if (s === "compiled" || s === "review") return "due";
  // Only an unsent edition can be late, and only if it has a date to be late
  // against.
  if (targetDate && targetDate < new Date().toISOString().slice(0, 10)) return "critical";
  return "neutral";
}

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

export default function EditionsList({
  editions,
  formats,
}: {
  editions: EditionWithProgress[];
  formats: FormatRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  async function post(payload: Record<string, unknown>, then?: (id: string) => void) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/comms/editions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as
        | { error?: string; id?: string; created?: number; skipped?: number }
        | null;
      if (!res.ok) {
        setError(json?.error ?? "Could not do that.");
        return;
      }
      if (json?.id && then) then(json.id);
      else {
        const made = json?.created ?? 0;
        const skipped = json?.skipped ?? 0;
        setNote(
          made === 0
            ? "Those dates were already planned."
            : `Planned ${made} edition${made === 1 ? "" : "s"}${skipped ? `, ${skipped} already existed` : ""}.`,
        );
        setTimeout(() => setNote(null), 4000);
        router.refresh();
      }
    } finally {
      setBusy(false);
      setPicking(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = editions.filter((e) => e.status !== "sent");
  const sent = editions.filter((e) => e.status === "sent");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-1">
          {editions.length === 0
            ? "Nothing planned yet."
            : `${upcoming.length} in progress${sent.length ? `, ${sent.length} sent` : ""}.`}
        </p>
        <div className="flex items-center gap-2">
          {note && <span className="text-[11px] text-ink-3">{note}</span>}
          <Button onClick={() => setPicking((p) => !p)} disabled={busy || formats.length === 0}>
            + New edition
          </Button>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs text-status-critical-text bg-status-critical-bg rounded-card px-3 py-2">
          {error}
        </p>
      )}

      {picking && (
        <div className="mt-3 rounded-card-lg border border-hairline bg-surface p-4">
          <span className={TYPE.cardLabel}>Which format?</span>
          <ul className="mt-2 space-y-2">
            {formats.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-hairline bg-tile px-3 py-2"
              >
                <span>
                  <span className="text-sm text-ink-1">{f.name}</span>
                  <span className="ml-2 text-[11px] text-ink-3">
                    {f.cadence} · {f.slots.length} slots
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      post({ format_id: f.id }, (id) => router.push(`/admin/comms/editions/${id}`))
                    }
                  >
                    Create one
                  </Button>
                  {f.cadence !== "adhoc" && (
                    <Button
                      size="sm"
                      disabled={busy}
                      title="Create the whole cadence up front, with target dates"
                      onClick={() => post({ format_id: f.id, plan_year: true, from: today })}
                    >
                      Plan the year
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editions.length === 0 ? (
        <div className="mt-6 rounded-card-lg border border-hairline bg-surface p-8 text-center">
          <p className={TYPE.sectionTitle}>Nothing on the calendar.</p>
          <p className="mt-1 text-sm text-ink-2 max-w-md mx-auto">
            Plan the year now and the deadlines exist months out — which is the difference between
            writing a newsletter and scrambling to produce one.
          </p>
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {[...upcoming, ...sent].map((e) => (
            <li key={e.id} className="rounded-card-lg border border-hairline bg-surface">
              <Link
                href={`/admin/comms/editions/${e.id}`}
                className="block p-4 hover:bg-tile/60 rounded-card-lg"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={TYPE.cardTitle}>{e.title}</span>
                  <StatusChip status={statusFor(e.status, e.target_date)}>
                    {EDITION_STATUS_LABEL[e.status as EditionStatus] ?? e.status}
                  </StatusChip>
                </div>
                <p className="mt-1 text-[11px] text-ink-3">
                  {e.format_name}
                  {e.target_date ? ` · ${fmtDate(e.target_date)}` : " · no date set"}
                  {" · "}
                  {e.completeness.label}
                </p>
                {e.completeness.requiredMissing.length > 0 && e.status !== "sent" && (
                  <p className="mt-1 text-[11px] text-ink-3">
                    Still needs: {e.completeness.requiredMissing.join(", ")}.
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
