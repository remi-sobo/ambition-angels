"use client";

import { useId, useState } from "react";
import Link from "next/link";
import Button from "../../_components/ui/Button";
import Notice from "../../_components/ui/Notice";
import { TextField, TextareaField, CheckboxField } from "../../_components/ui/Field";
import { useSaveAction } from "../../_lib/useSaveAction";
import { shortLabel } from "@/lib/comms/capture";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Capture a story (V4 Stage D; StoryPhone.dc.html). Quick now, details later.
 *
 * Fields: a title, what happened, an optional photo, who it is about (shown
 * as first name and last initial only), and whether anyone can be
 * identified. "It names or shows a participant" is the default: unsure means
 * held. Saving files the story raw and, when it names someone, waiting on
 * consent. "Request consent" records that the ask went out; it sends nothing.
 */
export default function StoryCaptureForm({
  onSaved,
  compact = false,
}: {
  /** Called with the new story id. Default: open the story. */
  onSaved?: (id: string) => void;
  compact?: boolean;
}) {
  const save = useSaveAction();
  const fileId = useId();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [about, setAbout] = useState("");
  const [identifiable, setIdentifiable] = useState(true);
  const [requestConsent, setRequestConsent] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = shortLabel(about);

  const submit = async () => {
    if (!body.trim()) {
      setError("Say what happened, in a sentence or two.");
      return;
    }
    setError(null);
    setBusy(true);
    const r = await save<{ id: string }>({
      request: {
        url: "/api/admin/comms/stories",
        method: "POST",
        body: { title, body, about: identifiable ? about : null, identifiable, request_consent: identifiable && requestConsent },
      },
      success: identifiable ? "Story saved. It waits on consent before it can be used." : "Story saved.",
    });
    if (r.ok && photo) {
      const form = new FormData();
      form.append("file", photo);
      await save({
        request: () => fetch(`/api/admin/comms/stories/${r.data.id}/media`, { method: "POST", body: form }),
        failure: (m) => `The story saved, but the photo didn't: ${m}`,
      });
    }
    setBusy(false);
    if (r.ok) {
      if (onSaved) onSaved(r.data.id);
      else window.location.assign(`/admin/comms/stories/${r.data.id}`);
    }
  };

  const choice = (on: boolean) =>
    `w-full text-left rounded-control border px-3 py-2.5 min-h-[44px] transition-colors ${
      on ? "border-orange bg-orange-light/40" : "border-outline bg-surface hover:bg-tile"
    }`;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {!compact && <p className={TYPE.bodyMuted}>Quick now. Add details later at your desk.</p>}
      <TextField label="Title" hint="Optional. We'll use the first words if you skip it." value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      <TextareaField
        label="What happened?"
        required
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        error={error}
        hint={
          <>
            Talk or type. Prefer to speak?{" "}
            <Link href="/admin/today" className="underline underline-offset-2">Talk to log</Link> files stories too.
          </>
        }
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fileId} className={TYPE.fieldLabel}>Photo</label>
        <input
          id={fileId}
          type="file"
          accept="image/jpeg,image/png"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          className="text-sm text-ink-2 file:mr-3 file:min-h-[44px] file:rounded-control file:border file:border-outline file:bg-surface file:px-3 file:text-sm file:font-semibold"
        />
        <p className={TYPE.metadata}>Optional. Location data is removed before it is saved.</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={`${TYPE.fieldLabel} mb-1`}>Can someone be identified?</legend>
        <button type="button" aria-pressed={identifiable} onClick={() => setIdentifiable(true)} className={choice(identifiable)}>
          <span className={`${TYPE.body} font-semibold block`}>It names or shows a participant</span>
        </button>
        <button type="button" aria-pressed={!identifiable} onClick={() => setIdentifiable(false)} className={choice(!identifiable)}>
          <span className={`${TYPE.body} font-semibold block`}>No one identifiable</span>
          <span className={TYPE.metadata}>No names, faces or details that point to one teen</span>
        </button>
      </fieldset>

      {identifiable && (
        <>
          <TextField
            label="Who is it about?"
            hint={label ? `Shown as ${label}. First name and last initial only.` : "Optional. Shown as first name and last initial only."}
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            maxLength={120}
          />
          <Notice tone="warning" inline>
            This story names a participant. It cannot be used until a guardian&rsquo;s consent is on file.
          </Notice>
          <CheckboxField
            label="Request consent"
            hint="Records that you asked the guardian on file. Nothing is sent from BloomOS."
            checked={requestConsent}
            onChange={(e) => setRequestConsent(e.target.checked)}
          />
        </>
      )}

      <div className="flex flex-col gap-1">
        <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full sm:w-auto">
          Save story
        </Button>
        <p className={TYPE.metadata}>{identifiable ? "Saves to Comms as waiting on consent" : "Saves to Comms for someone to read and approve"}</p>
      </div>
    </form>
  );
}
