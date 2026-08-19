"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/app/admin/_components/Button";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Capture a win in about fifteen seconds, from a phone (spec §7.2).
 *
 * The design constraint is the whole feature: staff witness the wins but have
 * no fast way to record them, so anything that makes this slower makes the
 * bank empty. A title is the only required field. Tags, subjects, consent, and
 * the goal link are all deferred to the detail view — the sheet never blocks
 * on completeness, because a raw story beats no story.
 *
 * The second field asks for the OUTCOME, not the event. That wording is the
 * teaching made structural: storytelling centres on what changed, not what
 * happened.
 */
export default function CaptureSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [outcome, setOutcome] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      // A tick, so the sheet is mounted before focus moves — otherwise iOS
      // opens the keyboard and then scrolls the sheet out from under it.
      const t = setTimeout(() => titleRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function save() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/comms/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim() || null,
          outcome: outcome.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? "Could not save that.");
        return;
      }
      setTitle("");
      setBody("");
      setOutcome("");
      onClose();
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Capture a win"
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-card border-[1.5px] border-outline bg-ink shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 space-y-4">
          <div>
            <h2 className={TYPE.modalTitle}>Capture a win</h2>
            <p className="text-xs text-ink-2 mt-0.5">
              Rough is fine. You can fill in the rest later.
            </p>
          </div>

          <label className="block">
            <span className={TYPE.cardLabel}>What happened</span>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
              }}
              placeholder="Marcus landed the internship"
              maxLength={200}
              className="mt-1 w-full rounded-card bg-tile border-[1.5px] border-outline px-3 py-2 text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange"
            />
          </label>

          <label className="block">
            <span className={TYPE.cardLabel}>The story</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="A few sentences. Who, what, when — however it comes out."
              className="mt-1 w-full rounded-card bg-tile border-[1.5px] border-outline px-3 py-2 text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange resize-y"
            />
          </label>

          <label className="block">
            <span className={TYPE.cardLabel}>What changed because of it</span>
            <textarea
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              rows={2}
              placeholder="The outcome, not the activity. This is the part donors remember."
              className="mt-1 w-full rounded-card bg-tile border-[1.5px] border-outline px-3 py-2 text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange resize-y"
            />
          </label>

          {/* Standing hint, not a one-time toast: the redaction boundary can
              replace a linked subject's name, but it cannot know a nickname
              someone typed into free text. */}
          <p className="text-[11px] text-ink-3 leading-relaxed">
            Keep participants&apos; full names out of the text itself — link the person on the
            story instead, so consent and redaction can do their job.
          </p>

          {error && (
            <p className="text-xs text-status-critical-text bg-status-critical-bg rounded-card px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!title.trim() || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
