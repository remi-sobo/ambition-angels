"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button, { ButtonLink } from "../../_components/ui/Button";
import Drawer from "../../_components/ui/Drawer";
import Notice from "../../_components/ui/Notice";
import { SelectField, TextField, TextareaField, DateField } from "../../_components/ui/Field";
import { useSaveAction } from "../../_lib/useSaveAction";
import { TYPE } from "@/lib/admin/typeScale";
import AudienceBuilder, { type SegmentOption } from "./AudienceBuilder";

/** New edition: pick a format (the starters are seeded on first use), a
 *  title and a target date. Snapshots the format's slots. */
export function NewEditionButton({ formats, storyId }: { formats: Array<{ id: string; name: string }>; storyId?: string | null }) {
  const save = useSaveAction();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formatId, setFormatId] = useState(formats[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>New edition</Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New edition"
        footer={
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const r = await save<{ id: string }>({
                request: { url: "/api/admin/comms/editions", method: "POST", body: { format_id: formatId || null, title, target_date: date || null } },
                success: "Edition started.",
              });
              setBusy(false);
              if (r.ok) router.push(`/admin/comms/editions/${r.data.id}${storyId ? `?story=${storyId}` : ""}`);
            }}
          >
            Start edition
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          {formats.length > 0 ? (
            <SelectField label="Format" options={formats.map((f) => ({ value: f.id, label: f.name }))} value={formatId} onChange={(e) => setFormatId(e.target.value)} />
          ) : (
            <p className={TYPE.bodyMuted}>The starter formats are set up when you start your first edition. Change them in Comms Settings.</p>
          )}
          <TextField label="Title" hint="Optional. We'll name it from the format and date." value={title} onChange={(e) => setTitle(e.target.value)} />
          <DateField label="Target date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </Drawer>
    </>
  );
}

export type SlotView = {
  slot_key: string;
  label: string;
  kind: string;
  required: boolean;
  hint?: string;
  story_id: string | null;
  content: string | null;
};

export type StoryOption = { id: string; title: string; publishable: boolean; reason: string | null };

/** One slot: pick a story (only usable stories can be chosen; the server
 *  refuses the rest anyway) and/or write the slot's own copy. */
export function SlotEditor({ editionId, slot, stories, locked }: { editionId: string; slot: SlotView; stories: StoryOption[]; locked: boolean }) {
  const save = useSaveAction();
  const router = useRouter();
  const [storyId, setStoryId] = useState(slot.story_id ?? "");
  const [content, setContent] = useState(slot.content ?? "");
  const [busy, setBusy] = useState(false);
  const current = stories.find((s) => s.id === slot.story_id) ?? null;
  const dirty = (storyId || null) !== slot.story_id || (content || null) !== (slot.content || null);

  const persist = async () => {
    setBusy(true);
    const body: Record<string, unknown> = { slot_key: slot.slot_key, content };
    if (slot.kind === "story") body.story_id = storyId || null;
    const r = await save({ request: { url: `/api/admin/comms/editions/${editionId}/slots`, method: "PATCH", body }, success: "Saved." });
    setBusy(false);
    if (r.ok) router.refresh();
    else setStoryId(slot.story_id ?? "");
  };

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={TYPE.cardTitle}>
          {slot.label}
          {slot.required && <span className={`${TYPE.metadata} ml-2 font-normal`}>Required</span>}
        </p>
        <span className={TYPE.metadata}>{slot.kind === "story" ? "From the story bank" : slot.kind === "metrics" ? "Numbers" : slot.kind === "ask" ? "The ask" : "Your words"}</span>
      </div>
      {slot.hint && <p className={`${TYPE.metadata} mt-0.5`}>{slot.hint}</p>}
      {current && !current.publishable && (
        <Notice tone="danger" inline className="mt-2" title={`"${current.title}" can't go out.`}>{current.reason}</Notice>
      )}
      <div className="mt-2 flex flex-col gap-2">
        {slot.kind === "story" && (
          <SelectField
            label="Story"
            placeholder="No story"
            disabled={locked}
            value={storyId}
            onChange={(e) => setStoryId(e.target.value)}
            options={stories.map((s) => ({
              value: s.id,
              label: s.publishable ? s.title : `${s.title} (can't be used: ${s.reason ?? "not ready"})`,
              disabled: !s.publishable,
            }))}
          />
        )}
        {slot.kind !== "metrics" && (
          <TextareaField
            label={slot.kind === "story" ? "Your words (optional, replaces the story text)" : "Text"}
            rows={slot.kind === "story" ? 3 : 4}
            disabled={locked}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        )}
        {slot.kind === "metrics" && <p className={TYPE.bodyMuted}>Numbers come from the Metric Catalog at compile. Pick metrics in a later pass.</p>}
        {!locked && dirty && (
          <div>
            <Button variant="secondary" size="sm" loading={busy} onClick={() => void persist()}>Save slot</Button>
          </div>
        )}
      </div>
    </li>
  );
}

/** Put a story into the first empty story slot of an edition (the one-click
 *  hand-off from a story's "Use in an edition"). */
export function PutStoryHere({ editionId, slotKey, storyId }: { editionId: string; slotKey: string; storyId: string }) {
  const save = useSaveAction();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="primary"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        const r = await save({ request: { url: `/api/admin/comms/editions/${editionId}/slots`, method: "PATCH", body: { slot_key: slotKey, story_id: storyId } }, success: "Story placed." });
        setBusy(false);
        if (r.ok) router.push(`/admin/comms/editions/${editionId}`);
      }}
    >
      Put it here
    </Button>
  );
}

/**
 * Compile: choose who it goes to (with the live count), then make the email
 * draft. Nothing is sent here; the draft goes through Emails' reviewed send.
 */
export function CompilePanel({
  editionId,
  segments,
  segmentId,
  campaignId,
  campaignStatus,
  blocked,
  canCompile,
}: {
  editionId: string;
  segments: SegmentOption[];
  segmentId: string | null;
  campaignId: string | null;
  campaignStatus: string | null;
  blocked: string[];
  canCompile: boolean;
}) {
  const save = useSaveAction();
  const router = useRouter();
  const [segment, setSegment] = useState<string | null>(segmentId);
  const [busy, setBusy] = useState(false);
  const [madeId, setMadeId] = useState<string | null>(campaignId);
  const lockedByCampaign = !!campaignStatus && campaignStatus !== "draft";

  if (lockedByCampaign && campaignId) {
    return (
      <div className="flex flex-col gap-2">
        <p className={TYPE.body}>This edition&rsquo;s email is {campaignStatus}.</p>
        <ButtonLink href={`/admin/comms/emails/${campaignId}`} variant="secondary">See results</ButtonLink>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <AudienceBuilder segments={segments} value={segment} onChange={setSegment} />
      {blocked.length > 0 && (
        <Notice tone="warning" inline title="Not ready to compile yet.">
          <ul className="list-disc pl-4">{blocked.map((b) => <li key={b}>{b}</li>)}</ul>
        </Notice>
      )}
      <div className="flex flex-col gap-1">
        <Button
          variant="primary"
          loading={busy}
          disabled={!canCompile || blocked.length > 0}
          onClick={async () => {
            setBusy(true);
            const r = await save<{ campaign_id: string }>({
              request: { url: `/api/admin/comms/editions/${editionId}/compile`, method: "POST", body: { segment_id: segment } },
              success: "Email draft ready. Review it and send from Emails.",
            });
            setBusy(false);
            if (r.ok) {
              setMadeId(r.data.campaign_id);
              router.refresh();
            }
          }}
        >
          {madeId ? "Update the email draft" : "Make the email draft"}
        </Button>
        <p className={TYPE.metadata}>Nothing is sent from here. You check the count, send a test and send from Emails.</p>
      </div>
      {madeId && (
        <Link href={`/admin/comms/emails?draft=${madeId}`} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-orange">
          Review and send in Emails
        </Link>
      )}
    </div>
  );
}
