"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/app/admin/_components/Button";
import PageHeader from "@/app/admin/_components/PageHeader";
import { StatusChip } from "@/app/admin/_components/StatusChip";
import { TYPE } from "@/lib/admin/typeScale";
import {
  EDITION_STATUS_LABEL,
  editionCompleteness,
  isSlotFilled,
  SLOT_KIND_LABEL,
  type EditionStatus,
  type FilledSlot,
} from "@/lib/comms/formats";
import type { EditionDetail } from "@/lib/comms/editions-server";

/**
 * The edition builder (spec §7.4).
 *
 * The format's slots render as a vertical sequence in order, each one a panel.
 * Story slots open a picker that reads ONLY publishable stories — a blocked
 * story simply isn't there, and the bank is where you go to fix it. Metric
 * slots state their staleness rather than hiding it.
 *
 * Each filled story slot keeps its own editable copy, so the edition holds
 * final text and the story stays the reusable source.
 */

export type PickableStory = {
  id: string;
  title: string;
  body: string | null;
  outcome: string | null;
};

export type PickableMetric = {
  id: string;
  name: string;
  unit: string | null;
  latest: number | null;
  captured_on: string | null;
  stale: boolean;
};

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

function daysAgo(iso: string): number {
  return Math.max(
    0,
    Math.round((Date.now() - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000),
  );
}

export default function EditionBuilder({
  detail,
  stories,
  metrics,
}: {
  detail: EditionDetail;
  stories: PickableStory[];
  metrics: PickableMetric[];
}) {
  const router = useRouter();
  const { edition, format } = detail;
  const [slots, setSlots] = useState<FilledSlot[]>(detail.slots);
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [title, setTitle] = useState(edition.title);
  const [subject, setSubject] = useState(edition.subject ?? "");
  const [targetDate, setTargetDate] = useState(edition.target_date ?? "");

  const sent = edition.status === "sent";
  const completeness = editionCompleteness(slots);

  async function saveSlot(slotKey: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/comms/editions/${edition.id}/slots`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot_key: slotKey, ...payload }),
      });
      const json = (await res.json().catch(() => null)) as
        | { error?: string; slot?: FilledSlot }
        | null;
      if (!res.ok) {
        setError(json?.error ?? "Could not save that.");
        return;
      }
      if (json?.slot) {
        setSlots((prev) => prev.map((s) => (s.slot_key === slotKey ? { ...s, ...json.slot } : s)));
      }
      setNote("Saved");
      setTimeout(() => setNote(null), 1500);
      router.refresh();
    } finally {
      setBusy(false);
      setOpenPicker(null);
    }
  }

  async function saveEdition(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/comms/editions/${edition.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? "Could not save that.");
        return;
      }
      setNote("Saved");
      setTimeout(() => setNote(null), 1500);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const storyById = new Map(stories.map((s) => [s.id, s]));

  return (
    <div className="space-y-4">
      <PageHeader
        title={edition.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusChip status={sent ? "healthy" : "neutral"}>
              {EDITION_STATUS_LABEL[edition.status as EditionStatus] ?? edition.status}
            </StatusChip>
            <span className="text-[11px] text-ink-3">
              {format?.name ?? "Format"}
              {edition.target_date ? ` · ${fmtDate(edition.target_date)}` : ""}
              {" · "}
              {completeness.label}
            </span>
          </span>
        }
        actions={note ? <span className="text-[11px] text-ink-3">{note}</span> : undefined}
      />

      {sent && (
        <div className="rounded-card-lg border border-hairline bg-tile px-4 py-3">
          <p className="text-sm text-ink-2">
            This edition went out{edition.sent_at ? ` on ${fmtDate(edition.sent_at.slice(0, 10))}` : ""}.
            Its content is the record of what was sent, so it&apos;s read-only now.
          </p>
        </div>
      )}

      {!sent && completeness.requiredMissing.length > 0 && (
        <div className="rounded-card-lg border border-hairline bg-surface px-4 py-3">
          <p className="text-sm text-ink-1">
            Still needs: {completeness.requiredMissing.join(", ")}.
          </p>
        </div>
      )}

      {error && (
        <p className="text-xs text-status-critical-text bg-status-critical-bg rounded-card px-3 py-2">
          {error}
        </p>
      )}

      {/* ── The edition's own details ───────────────────────────────────── */}
      {!sent && (
        <section className="rounded-card-lg border border-hairline bg-surface p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={TYPE.cardLabel}>Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-card bg-tile border border-hairline px-3 py-2 text-sm text-ink-1 focus:outline-none focus:border-orange"
              />
            </label>
            <label className="block">
              <span className={TYPE.cardLabel}>Target date</span>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="mt-1 w-full rounded-card bg-tile border border-hairline px-3 py-2 text-xs text-ink-1 focus:outline-none focus:border-orange"
              />
            </label>
          </div>
          <label className="block">
            <span className={TYPE.cardLabel}>Email subject line</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What recipients see in their inbox"
              className="mt-1 w-full rounded-card bg-tile border border-hairline px-3 py-2 text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange"
            />
          </label>
          <Button
            size="sm"
            disabled={
              busy ||
              !title.trim() ||
              (title === edition.title &&
                subject === (edition.subject ?? "") &&
                targetDate === (edition.target_date ?? ""))
            }
            onClick={() =>
              saveEdition({ title, subject: subject || null, target_date: targetDate || null })
            }
          >
            Save details
          </Button>
        </section>
      )}

      {/* ── The slots, in format order ──────────────────────────────────── */}
      {slots.map((slot) => {
        const def = slot.slot_def;
        const story = slot.story_id ? storyById.get(slot.story_id) : null;
        const filled = isSlotFilled(slot);
        return (
          <section
            key={slot.slot_key}
            className="rounded-card-lg border border-hairline bg-surface p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={TYPE.cardTitle}>{def.label}</span>
              <span className="text-[11px] text-ink-3">{SLOT_KIND_LABEL[def.kind]}</span>
              {def.required && !filled && (
                <StatusChip status="watch" dot={false}>
                  Required
                </StatusChip>
              )}
            </div>
            {def.hint && <p className="text-[11px] text-ink-3 leading-relaxed">{def.hint}</p>}

            {/* Story slots: the picker reads publishable stories only. */}
            {def.kind === "story" && !sent && (
              <div className="space-y-2">
                {story ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-card border border-hairline bg-tile px-3 py-2">
                    <span className="text-xs text-ink-1">{story.title}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => saveSlot(slot.slot_key, { story_id: null })}
                      className="ml-auto text-[11px] text-ink-3 hover:text-ink-1"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      setOpenPicker(openPicker === slot.slot_key ? null : slot.slot_key)
                    }
                  >
                    Pick a story
                  </Button>
                )}

                {openPicker === slot.slot_key && (
                  <div className="rounded-card border border-hairline bg-tile p-2 max-h-72 overflow-y-auto">
                    {stories.length === 0 ? (
                      <p className="text-[11px] text-ink-3 p-2 leading-relaxed">
                        No stories are ready to use. A story needs to be approved and everyone in it
                        needs current consent — the story bank is where you fix that.
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {stories.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                saveSlot(slot.slot_key, {
                                  story_id: s.id,
                                  // Seed the editable copy from the story, so
                                  // the edition holds final text and the story
                                  // stays the reusable source.
                                  ...(slot.content
                                    ? {}
                                    : {
                                        content: [s.body, s.outcome]
                                          .filter(Boolean)
                                          .join("\n\n"),
                                      }),
                                })
                              }
                              className="w-full text-left rounded-card px-2 py-1.5 hover:bg-surface"
                            >
                              <span className="block text-xs text-ink-1">{s.title}</span>
                              {s.body && (
                                <span className="block text-[11px] text-ink-3 line-clamp-1">
                                  {s.body}
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Metric slots: values and staleness stated, never hidden. */}
            {def.kind === "metrics" && (
              <div className="flex flex-wrap gap-1.5">
                {metrics.length === 0 && (
                  <p className="text-[11px] text-ink-3">No metrics defined yet.</p>
                )}
                {metrics.map((m) => {
                  const on = (slot.metric_ids ?? []).includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={busy || sent || m.latest === null}
                      onClick={() => {
                        const next = on
                          ? (slot.metric_ids ?? []).filter((x) => x !== m.id)
                          : [...(slot.metric_ids ?? []), m.id];
                        saveSlot(slot.slot_key, { metric_ids: next });
                      }}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-colors disabled:opacity-40 ${
                        on
                          ? "bg-orange text-white border-orange"
                          : "bg-tile text-ink-2 border-hairline hover:border-outline"
                      }`}
                    >
                      {m.name}
                      {m.latest !== null && (
                        <span className="ml-1 tabular-nums opacity-80">{m.latest}</span>
                      )}
                      {m.stale && m.captured_on && (
                        <span className="ml-1 text-status-watch-text">
                          · {daysAgo(m.captured_on)}d old
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Every kind except metrics carries editable copy.
                Keyed on the PERSISTED content so that when the stored value
                changes underneath — picking a story seeds this box from the
                story — the textarea remounts and shows it. Without the key,
                useState keeps its first value and the seeded copy is saved to
                the database but invisible until a reload. */}
            {def.kind !== "metrics" && (
              <SlotText
                key={`${slot.slot_key}:${slot.content ?? ""}`}
                slot={slot}
                disabled={busy || sent}
                placeholder={def.hint ?? "Write this section."}
                onSave={(content) => saveSlot(slot.slot_key, { content })}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}

function SlotText({
  slot,
  disabled,
  placeholder,
  onSave,
}: {
  slot: FilledSlot;
  disabled: boolean;
  placeholder: string;
  onSave: (content: string | null) => void;
}) {
  const [text, setText] = useState(slot.content ?? "");
  const dirty = text !== (slot.content ?? "");
  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full rounded-card bg-tile border border-hairline px-3 py-2 text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange resize-y leading-relaxed disabled:opacity-70"
      />
      {!disabled && (
        <Button size="sm" variant="secondary" disabled={!dirty} onClick={() => onSave(text || null)}>
          Save section
        </Button>
      )}
    </div>
  );
}
