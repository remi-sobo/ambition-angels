"use client";

import { useState } from "react";
import Link from "next/link";
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
  type Completeness,
  type EditionStatus,
  type FilledSlot,
} from "@/lib/comms/formats";
import type { EditionDetail, EditionRow } from "@/lib/comms/editions-server";
import { performanceVerdict, type EditionPerformance } from "@/lib/comms/loop";

/** What GET on the compile route answers with. */
type CompilePreview = {
  body: string;
  warnings: string[];
  blocked: string[];
  subject: string;
};

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
  performance = null,
}: {
  detail: EditionDetail;
  stories: PickableStory[];
  metrics: PickableMetric[];
  /** After-send numbers; only ever set on a sent edition. */
  performance?: EditionPerformance | null;
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

  // Slots pointing at a story the publishable view no longer answers for.
  // Compile refuses these server-side; naming them here keeps the button from
  // inviting a click that can only fail.
  const lapsed = slots
    .filter((s) => s.story_id && !storyById.has(s.story_id))
    .map((s) => s.slot_def.label);

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

            {/* On a sent edition the slot is a record, not a control: name the
                story that rode in it and nothing else. */}
            {def.kind === "story" && sent && story && (
              <p className="text-[11px] text-ink-3">Story: {story.title}</p>
            )}

            {/* Story slots: the picker reads publishable stories only. */}
            {def.kind === "story" && !sent && (
              <div className="space-y-2">
                {/* story_id set but not in the publishable list means consent
                    lapsed since this slot was filled (spec §10). Rendering the
                    empty state here would hide a revocation behind a "Pick a
                    story" button — the one thing this module must never do. */}
                {slot.story_id && !story && (
                  <div className="rounded-card border border-status-watch-text/30 bg-status-watch-bg px-3 py-2">
                    <p className="text-[11px] text-status-watch-text leading-relaxed">
                      The story in this slot can&apos;t be used any more — it needs to be approved,
                      and everyone in it needs current consent. Compiling is blocked until you
                      remove it or fix it in the bank.
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => saveSlot(slot.slot_key, { story_id: null })}
                      className="mt-1 text-[11px] text-ink-2 hover:text-ink-1 underline underline-offset-2"
                    >
                      Remove it from this slot
                    </button>
                  </div>
                )}
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
                  !slot.story_id && (
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
                  )
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

      <CompilePanel
        edition={edition}
        completeness={completeness}
        lapsed={lapsed}
        performance={performance}
      />
    </div>
  );
}

/**
 * Compile (spec §6.5, §7.4).
 *
 * Preview first, always. The preview and the compile run the same code on the
 * server, so what you read here is what lands in the campaign — and consent is
 * re-checked at this moment, not at the moment each slot was filled.
 *
 * After compiling, this hands off. The existing comms page owns segments, test
 * sends, suppression, and the send itself; there is one sender in this product
 * and this is not a second one.
 */
function CompilePanel({
  edition,
  completeness,
  lapsed,
  performance,
}: {
  edition: EditionRow;
  completeness: Completeness;
  /** Labels of slots holding a story that is no longer publishable. */
  lapsed: string[];
  performance: EditionPerformance | null;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<CompilePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(edition.email_campaign_id);

  const sent = edition.status === "sent";

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/comms/editions/${edition.id}/compile`);
      const json = (await res.json().catch(() => null)) as (CompilePreview & { error?: string }) | null;
      if (!res.ok || !json) {
        setError(json?.error ?? "Could not build a preview.");
        return;
      }
      setPreview(json);
    } finally {
      setBusy(false);
    }
  }

  async function compile() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/comms/editions/${edition.id}/compile`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as
        | { error?: string; campaign_id?: string }
        | null;
      if (!res.ok || !json?.campaign_id) {
        setError(json?.error ?? "Could not create the email draft.");
        return;
      }
      setCampaignId(json.campaign_id);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    // The after-the-fact panel (spec §8 phase 6): sends and failures from the
    // campaign, and gifts from recipients inside the attribution window. It
    // claims correlation, in those words — never why anyone gave. No opens:
    // the sender doesn't record them, and decision 6 keeps pixels out of v1.
    return (
      <section className="rounded-card-lg border border-hairline bg-surface p-4 space-y-3">
        <span className={TYPE.cardLabel}>How it did</span>
        {performance ? (
          <>
            <p className="text-sm text-ink-1 leading-relaxed">
              {performanceVerdict(performance)}
            </p>
            {performance.storyTitles.length > 0 && (
              <p className="text-[11px] text-ink-3 leading-relaxed">
                Rode in this edition: {performance.storyTitles.join(" · ")}. Each is marked used
                in the bank and earns its way back into the suggestions over the next six months.
              </p>
            )}
            {performance.gifts && performance.gifts.count > 0 && (
              <p className="text-[11px] text-ink-3 leading-relaxed">
                “Gave” means a recipient of this send gave within {performance.gifts.windowDays}{" "}
                days — a correlation worth watching, not proof of why.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-ink-2 leading-relaxed">
            This edition went out through the campaign it compiled into. Its numbers live on the
            comms page.
          </p>
        )}
        <Link
          href="/admin/fundraising/comms"
          className="inline-block text-[11px] text-ink-2 hover:text-ink-1 underline underline-offset-2"
        >
          Open it on the comms page →
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-card-lg border border-hairline bg-surface p-4 space-y-3">
      <span className={TYPE.cardLabel}>Compile</span>
      <p className="text-sm text-ink-2 leading-relaxed">
        Compiling turns this edition into an email draft on the comms page. Nothing sends here —
        you still attach a segment, send yourself a test, and press send there.
      </p>

      {!completeness.canCompile && (
        <p className="text-[11px] text-ink-3">
          Fill every required slot first. Still needs: {completeness.requiredMissing.join(", ")}.
        </p>
      )}

      {lapsed.length > 0 && (
        <p className="text-[11px] text-status-watch-text">
          Consent lapsed on the story in {lapsed.join(", ")}. Fix it in the bank or take it out of
          the slot — this edition can&apos;t compile until then.
        </p>
      )}

      {error && (
        <p className="text-xs text-status-critical-text bg-status-critical-bg rounded-card px-3 py-2">
          {error}
        </p>
      )}

      {campaignId ? (
        <div className="rounded-card border border-hairline bg-tile px-3 py-2 space-y-1">
          <p className="text-xs text-ink-1">The email draft exists.</p>
          <Link
            href="/admin/fundraising/comms"
            className="text-[11px] text-ink-2 hover:text-ink-1 underline underline-offset-2"
          >
            Attach a segment and send it →
          </Link>
          <p className="text-[11px] text-ink-3 leading-relaxed">
            Changes here don&apos;t reach it on their own. Compile again to rewrite that same draft
            — you won&apos;t end up with two.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={load}>
          {preview ? "Refresh preview" : "Preview"}
        </Button>
        <Button
          size="sm"
          disabled={
            busy ||
            !completeness.canCompile ||
            lapsed.length > 0 ||
            (preview?.blocked.length ?? 0) > 0
          }
          onClick={compile}
        >
          {campaignId ? "Compile again" : "Create the email draft"}
        </Button>
      </div>

      {preview && (
        <div className="space-y-2">
          {preview.blocked.length > 0 && (
            <ul className="rounded-card bg-status-critical-bg px-3 py-2 space-y-1">
              {preview.blocked.map((b) => (
                <li key={b} className="text-[11px] text-status-critical-text leading-relaxed">
                  {b}
                </li>
              ))}
            </ul>
          )}
          {preview.warnings.length > 0 && (
            <ul className="rounded-card bg-status-watch-bg px-3 py-2 space-y-1">
              {preview.warnings.map((w) => (
                <li key={w} className="text-[11px] text-status-watch-text leading-relaxed">
                  {w}
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-card border border-hairline bg-tile px-3 py-2">
            <p className="text-[11px] text-ink-3">
              Subject: <span className="text-ink-2">{preview.subject}</span>
            </p>
          </div>
          <pre className="rounded-card border border-hairline bg-tile px-3 py-2 text-xs text-ink-1 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto font-body">
            {preview.body || "Nothing to send yet."}
          </pre>
          <p className="text-[11px] text-ink-3 leading-relaxed">
            Your footer, mailing address, and unsubscribe link are added when it sends — they
            aren&apos;t missing here, they just aren&apos;t part of the body.
          </p>
        </div>
      )}
    </section>
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
