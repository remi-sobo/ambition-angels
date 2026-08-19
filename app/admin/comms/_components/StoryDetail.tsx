"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/app/admin/_components/Button";
import PageHeader from "@/app/admin/_components/PageHeader";
import { TYPE } from "@/lib/admin/typeScale";
import type { LoadedStory } from "@/lib/comms/stories-server";
import { SUBJECT_TYPES, type SubjectType } from "@/lib/comms/stories";
import ConsentPanel from "./ConsentPanel";
import { ConsentChip, StoryStatusChip, TagChip } from "./StoryChips";

/**
 * Story detail (spec §7.2). Editing is inline and saves on demand — no wizard,
 * no modal stack. The three things that only exist here are the ones capture
 * deliberately deferred: who the story is about, their consent, and the human
 * approval that makes it usable at all.
 */

const SECTION = "rounded-card-lg border border-hairline bg-surface p-4";

const SUBJECT_LABEL: Record<SubjectType, string> = {
  participant: "Participant",
  constituent: "Donor",
  partner: "Partner",
  staff: "Staff",
  none: "No one in particular",
};

export default function StoryDetail({
  story,
  canSeeSubjects,
  goals,
}: {
  story: LoadedStory;
  canSeeSubjects: boolean;
  goals: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(story.title);
  const [body, setBody] = useState(story.body ?? "");
  const [outcome, setOutcome] = useState(story.outcome ?? "");
  const [happenedOn, setHappenedOn] = useState(story.happened_on ?? "");
  const [goalId, setGoalId] = useState(story.strategic_goal_id ?? "");
  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [addingSubject, setAddingSubject] = useState(false);
  const [subjectType, setSubjectType] = useState<SubjectType>("participant");
  const [subjectLabel, setSubjectLabel] = useState("");
  const [isMinor, setIsMinor] = useState(true);

  const fileRef = useRef<HTMLInputElement>(null);

  const dirty =
    title !== story.title ||
    body !== (story.body ?? "") ||
    outcome !== (story.outcome ?? "") ||
    happenedOn !== (story.happened_on ?? "") ||
    goalId !== (story.strategic_goal_id ?? "");

  async function patch(payload: Record<string, unknown>, message = "Saved") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/comms/stories/${story.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? "Could not save that.");
        return false;
      }
      setNote(message);
      setTimeout(() => setNote(null), 2000);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function addSubject() {
    if (!subjectLabel.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/comms/stories/${story.id}/subjects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_type: subjectType,
          display_label: subjectLabel.trim(),
          is_minor: subjectType === "participant" ? isMinor : false,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? "Could not link that person.");
        return;
      }
      setSubjectLabel("");
      setAddingSubject(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/admin/comms/stories/${story.id}/media`, {
        method: "POST",
        body: fd,
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? "Could not add that photo.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const nextStatus =
    story.status === "raw" ? "drafted" : story.status === "drafted" ? "approved" : null;
  const hasMinor = story.subjects.some((s) => s.is_minor);

  return (
    <div className="space-y-4">
      <PageHeader
        title={story.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <StoryStatusChip status={story.status} />
            <ConsentChip state={story.consent_state} />
            {story.captured_by && (
              <span className="text-[11px] text-ink-3">captured by {story.captured_by}</span>
            )}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {note && <span className="text-[11px] text-ink-3">{note}</span>}
            {nextStatus && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  patch(
                    { status: nextStatus },
                    nextStatus === "approved" ? "Approved" : "Marked as drafted",
                  )
                }
              >
                {nextStatus === "approved" ? "Approve" : "Mark drafted"}
              </Button>
            )}
            {story.status === "approved" && (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => patch({ status: "drafted" }, "Approval withdrawn")}
              >
                Withdraw approval
              </Button>
            )}
          </div>
        }
      />

      {/* Management by exception: say the blocking thing once, at the top, and
          say what to do about it. */}
      {!story.publishable && story.blocked_reason && (
        <div className="rounded-card-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3">
          <p className="text-sm text-status-critical-text">
            <span className="font-semibold">Blocked from use.</span> {story.blocked_reason}
          </p>
        </div>
      )}

      {error && (
        <p className="text-xs text-status-critical-text bg-status-critical-bg rounded-card px-3 py-2">
          {error}
        </p>
      )}

      {/* ── The story itself ─────────────────────────────────────────────── */}
      <section className={SECTION}>
        <div className="space-y-3">
          <label className="block">
            <span className={TYPE.cardLabel}>Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="mt-1 w-full rounded-card bg-tile border border-hairline px-3 py-2 text-sm text-ink-1 focus:outline-none focus:border-orange"
            />
          </label>
          <label className="block">
            <span className={TYPE.cardLabel}>The story</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="mt-1 w-full rounded-card bg-tile border border-hairline px-3 py-2 text-sm text-ink-1 focus:outline-none focus:border-orange resize-y"
            />
          </label>
          <label className="block">
            <span className={TYPE.cardLabel}>What changed because of it</span>
            <textarea
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              rows={3}
              placeholder="The outcome, not the activity."
              className="mt-1 w-full rounded-card bg-tile border border-hairline px-3 py-2 text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange resize-y"
            />
          </label>
          {hasMinor && (
            <p className="text-[11px] text-ink-3 leading-relaxed">
              This story is about a minor. Names typed into the text above are sent to the AI as
              written — link the person below instead, so redaction can replace them.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={TYPE.cardLabel}>When it happened</span>
              <input
                type="date"
                value={happenedOn}
                onChange={(e) => setHappenedOn(e.target.value)}
                className="mt-1 w-full rounded-card bg-tile border border-hairline px-3 py-2 text-xs text-ink-1 focus:outline-none focus:border-orange"
              />
            </label>
            <label className="block">
              <span className={TYPE.cardLabel}>Proves which goal</span>
              <select
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className="mt-1 w-full rounded-card bg-tile border border-hairline px-3 py-2 text-xs text-ink-1 focus:outline-none focus:border-orange"
              >
                <option value="">Not linked</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={!dirty || busy || !title.trim()}
              onClick={() =>
                patch({
                  title,
                  body: body || null,
                  outcome: outcome || null,
                  happened_on: happenedOn || null,
                  strategic_goal_id: goalId || null,
                })
              }
            >
              Save changes
            </Button>
          </div>
        </div>
      </section>

      {/* ── Tags ─────────────────────────────────────────────────────────── */}
      <section className={SECTION}>
        <span className={TYPE.cardLabel}>Tags</span>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {story.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1">
              <TagChip tag={t} />
              <button
                type="button"
                aria-label={`Remove ${t}`}
                disabled={busy}
                onClick={() => patch({ tags: story.tags.filter((x) => x !== t) }, "Tag removed")}
                className="text-ink-3 hover:text-ink-1 text-[11px]"
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tagInput.trim()) {
                e.preventDefault();
                void patch({ tags: [...story.tags, tagInput.trim()] }, "Tag added").then((ok) => {
                  if (ok) setTagInput("");
                });
              }
            }}
            placeholder="add a tag…"
            className="rounded-full bg-tile border border-hairline px-2.5 py-0.5 text-[11px] text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange w-28"
          />
        </div>
      </section>

      {/* ── Who it's about, and their consent ────────────────────────────── */}
      <section className={SECTION}>
        <div className="flex items-center justify-between gap-2">
          <span className={TYPE.cardLabel}>Who it&apos;s about</span>
          {!addingSubject && (
            <Button size="sm" variant="ghost" onClick={() => setAddingSubject(true)}>
              + Add someone
            </Button>
          )}
        </div>

        {story.subjects.length === 0 && !addingSubject && (
          <p className="mt-2 text-[11px] text-ink-3">
            Nobody linked. A story about the org itself needs no consent — it publishes on your
            approval alone.
          </p>
        )}

        <div className="mt-3 space-y-4">
          {story.subjects.map((s) => (
            <div key={s.id} className="border-t border-hairline pt-3 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-sm ${s.redacted ? "italic text-ink-3" : "text-ink-1"}`}>
                  {s.display_label}
                </span>
                <span className="text-[11px] text-ink-3">
                  {SUBJECT_LABEL[s.subject_type]}
                  {s.is_minor ? " · minor" : ""}
                </span>
                {!s.redacted && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (!confirm("Unlink this person? Their consent records go with them.")) return;
                      setBusy(true);
                      await fetch(`/api/admin/comms/subjects/${s.id}`, { method: "DELETE" });
                      setBusy(false);
                      router.refresh();
                    }}
                    className="ml-auto text-[11px] text-ink-3 hover:text-status-critical-text"
                  >
                    Unlink
                  </button>
                )}
              </div>
              <div className="mt-2">
                <ConsentPanel subject={s} storyTitle={story.title} />
              </div>
            </div>
          ))}
        </div>

        {addingSubject && (
          <div className="mt-3 rounded-card border border-hairline bg-tile p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block">
                <span className={TYPE.cardLabel}>Who</span>
                <select
                  value={subjectType}
                  onChange={(e) => setSubjectType(e.target.value as SubjectType)}
                  className="mt-1 w-full rounded-card bg-surface border border-hairline px-2 py-1.5 text-xs text-ink-1 focus:outline-none focus:border-orange"
                >
                  {SUBJECT_TYPES.filter((t) => t !== "participant" || canSeeSubjects).map((t) => (
                    <option key={t} value={t}>
                      {SUBJECT_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={TYPE.cardLabel}>What may we call them?</span>
                <input
                  value={subjectLabel}
                  onChange={(e) => setSubjectLabel(e.target.value)}
                  placeholder="Marcus, or a 16-year-old participant"
                  className="mt-1 w-full rounded-card bg-surface border border-hairline px-2 py-1.5 text-xs text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange"
                />
              </label>
            </div>
            {subjectType === "participant" && (
              <label className="flex items-center gap-2 text-[11px] text-ink-2">
                <input
                  type="checkbox"
                  checked={isMinor}
                  onChange={(e) => setIsMinor(e.target.checked)}
                  className="accent-orange"
                />
                Under 18 — redaction becomes unconditional, whatever the consent says.
              </label>
            )}
            {!canSeeSubjects && (
              <p className="text-[11px] text-ink-3">
                You can link a partner, donor, or staff member. Linking a participant needs the
                subjects permission.
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={busy || !subjectLabel.trim()} onClick={addSubject}>
                Link
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingSubject(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ── Photos ───────────────────────────────────────────────────────── */}
      <section className={SECTION}>
        <div className="flex items-center justify-between gap-2">
          <span className={TYPE.cardLabel}>Photos</span>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
            + Add a photo
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </div>

        {story.media.length === 0 ? (
          <p className="mt-2 text-[11px] text-ink-3">
            No photos yet. Location and camera data is stripped from every upload before it&apos;s
            stored.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {story.media.map((m) => (
              <div key={m.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/admin/comms/media/${m.id}/url`}
                  alt={m.caption ?? ""}
                  className="w-24 h-24 rounded-card object-cover border border-hairline bg-tile"
                />
                <button
                  type="button"
                  aria-label="Remove photo"
                  disabled={busy}
                  onClick={async () => {
                    if (!confirm("Remove this photo?")) return;
                    setBusy(true);
                    await fetch(`/api/admin/comms/media/${m.id}`, { method: "DELETE" });
                    setBusy(false);
                    router.refresh();
                  }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ink border border-outline text-ink-2 hover:text-status-critical-text text-[11px] leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
