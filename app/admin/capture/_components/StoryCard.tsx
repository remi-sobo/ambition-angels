"use client";

import { useState } from "react";
import Button from "../../_components/ui/Button";
import Notice from "../../_components/ui/Notice";
import { TextField, TextareaField } from "../../_components/ui/Field";
import { TYPE } from "@/lib/admin/typeScale";
import { storyHold } from "@/lib/capture/cardKind";
import { isUncertain, type CardView } from "../_lib/cardView";
import { editStory, keepStory } from "../_lib/captureApi";

/**
 * The story card (V4 §8, CapturePhone.dc.html and StoryPhone.dc.html).
 *
 * A story about an identifiable participant is held until consent is on file.
 * BloomOS on main has no story bank and no consent table yet (Stage D lands
 * them), so "Keep story" keeps it as a held draft: the capture card itself,
 * with its consent hold on it. It is never sent, published or filed anywhere
 * else from here. The participant is named by first name and last initial
 * only; "No one identifiable" is a claim the server re-checks and refuses when
 * the words still name someone (storyIdentifiable fails closed).
 */
export default function StoryCardBody({
  card,
  busy,
  onReplace,
  onError,
  actions = true,
}: {
  card: CardView;
  busy: boolean;
  onReplace: (card: CardView) => void;
  onError: (message: string) => void;
  /** False when the person cannot file this card: words only, no actions
   *  (the stack offers "Send to a teammate" instead). */
  actions?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const p = card.payload;
  const [text, setText] = useState(typeof p.text === "string" ? p.text : "");
  const [about, setAbout] = useState(typeof p.about === "string" ? p.about : "");
  const hold = storyHold(p);
  const held = card.status === "held";

  const keep = async () => {
    setSaving(true);
    const r = await keepStory(card.id);
    setSaving(false);
    if (r.ok) onReplace(r.data.card);
    else onError(r.error);
  };

  const save = async (patch: { text?: string; about?: string | null; identifiable?: boolean }) => {
    setSaving(true);
    const r = await editStory(card.id, patch);
    setSaving(false);
    if (r.ok) {
      onReplace(r.data.card);
      setEditing(false);
      if (patch.identifiable === false && r.data.card.payload.identifiable !== false) {
        onError("It still names or points to someone, so it stays held until consent is on file.");
      }
    } else onError(r.error);
  };

  return (
    <>
      {typeof p.title === "string" && p.title && <p className={`${TYPE.cardTitle} mt-2`}>{p.title}</p>}
      {editing ? (
        <div className="mt-2 grid gap-3">
          <TextareaField label="What happened?" value={text} onChange={(e) => setText(e.target.value)} rows={3} />
          <TextField
            label="Who is it about? (optional)"
            hint="First name and last initial only."
            value={about}
            onChange={(e) => setAbout(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="lg" disabled={saving || !text.trim()} onClick={() => void save({ text, about: about.trim() || null })}>
              {saving ? "Saving" : "Save changes"}
            </Button>
            <Button type="button" variant="quiet" size="lg" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className={`${TYPE.body} mt-2`}>{typeof p.text === "string" ? p.text : ""}</p>
      )}
      {typeof p.about === "string" && p.about && !editing && (
        <p className={`${TYPE.metadata} mt-1`}>
          About {p.about}
          {isUncertain(card, "about") ? " · check this name" : ""}
        </p>
      )}

      {hold === "consent" ? (
        <div className="mt-3">
          <Notice tone="warning" title="Needs consent before it can be used">
            This story names or points to a participant. It is kept as a held draft and can&apos;t be used until a
            guardian&apos;s consent is on file. BloomOS can&apos;t record consent yet; that arrives with the Comms story bank.
          </Notice>
        </div>
      ) : (
        <p className={`${TYPE.metadata} mt-2`}>No one identifiable. It is kept as a story draft.</p>
      )}

      {held && actions && !editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" size="lg" disabled={busy || saving} onClick={() => void keep()}>
            {saving ? "Saving" : "Keep story"}
          </Button>
          <Button type="button" variant="secondary" size="lg" disabled={busy || saving} onClick={() => setEditing(true)}>
            Edit
          </Button>
          {hold === "consent" && (
            <Button type="button" variant="quiet" size="lg" disabled={busy || saving} onClick={() => void save({ identifiable: false, about: null })}>
              No one identifiable
            </Button>
          )}
        </div>
      )}
    </>
  );
}
