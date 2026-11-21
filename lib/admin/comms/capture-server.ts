import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { shortName } from "@/lib/capture/cardKind";
import { todayISO } from "@/lib/comms/consent";
import { MAX_BODY, MAX_OUTCOME, MAX_TITLE } from "@/lib/comms/stories";

/**
 * Filing a captured story into the bank (V4 Stage D): the Comms capture form
 * (desktop drawer and StoryPhone), Talk to log's "Keep story", and the
 * one-time move of the Stage C held drafts all come through here, so a story
 * enters the bank the same way whichever door it used.
 *
 * Rules, all fail closed:
 *   - Status is always 'raw'. Approval is a later human click.
 *   - Identifiable (the default when unsure) means one participant subject is
 *     written, labelled with first name and last initial only (shortName), or
 *     "a participant" when no name was given. That subject has no consent
 *     row, so the story is blocked from every output until a grant is filed.
 *     is_minor defaults to true (a participant at a youth-serving org is
 *     assumed to be a minor unless someone says otherwise).
 *   - "No one identifiable" is recorded as an explicit 'none' subject, so the
 *     decision is on file rather than implied by an empty list.
 *   - "Request consent" records that the ask went out (requested_at today).
 *     That is PENDING and does not publish. Nothing is emailed from here.
 *
 * A staff member without comms.subjects.read may file a participant subject
 * this way (they typed the name; they already know it), but can never read it
 * back: the bank shows them "a young person". They cannot edit or remove a
 * participant subject afterwards (the subjects route refuses), because
 * removing one would unblock the story.
 */

export type FileStoryInput = {
  title?: string | null;
  body: string;
  outcome?: string | null;
  /** Who it is about, as typed or heard. Shortened before it is stored. */
  about?: string | null;
  /** Anything but an explicit false is treated as identifiable. */
  identifiable?: unknown;
  requestConsent?: boolean;
  capturedBy: string | null;
  source: "manual" | "reed" | "import";
  happenedOn?: string | null;
};

export type FileStoryResult = { ok: true; storyId: string; identifiable: boolean } | { ok: false; status: number; error: string };

/** "Jaylen practiced with two staff. They asked..." -> first eight words. */
export function titleFromBody(body: string): string {
  const words = body.trim().split(/\s+/).filter(Boolean);
  const t = words.slice(0, 8).join(" ");
  return (words.length > 8 ? `${t}...` : t).slice(0, MAX_TITLE) || "Untitled story";
}

export async function fileStory(db: SupabaseClient, orgId: string, input: FileStoryInput): Promise<FileStoryResult> {
  const body = (input.body ?? "").trim();
  if (!body) return { ok: false, status: 400, error: "A story needs a few words about what happened." };
  const title = (input.title ?? "").trim().slice(0, MAX_TITLE) || titleFromBody(body);
  const identifiable = input.identifiable !== false;
  const label = shortName(input.about ?? null);

  const { data: story, error } = await db
    .from("stories")
    .insert({
      org_id: orgId,
      title,
      body: body.slice(0, MAX_BODY),
      outcome: input.outcome?.trim() ? input.outcome.trim().slice(0, MAX_OUTCOME) : null,
      status: "raw",
      tags: [],
      happened_on: input.happenedOn ?? null,
      captured_by: input.capturedBy,
      source: input.source,
    })
    .select("id")
    .single();
  if (error || !story) {
    console.error("[comms] story file failed:", error?.message);
    return { ok: false, status: 500, error: "The story couldn't be saved. Try again." };
  }
  const storyId = story.id as string;

  const { data: subject, error: subErr } = await db
    .from("story_subjects")
    .insert({
      org_id: orgId,
      story_id: storyId,
      subject_type: identifiable ? "participant" : "none",
      subject_id: null,
      display_label: identifiable ? label ?? "a participant" : "No one identifiable",
      is_minor: identifiable,
    })
    .select("id")
    .single();
  if (subErr || !subject) {
    // A story without its subject row would read as "nobody to protect" and
    // could publish on approval alone. Take the story back out.
    await db.from("stories").delete().eq("id", storyId).eq("org_id", orgId);
    console.error("[comms] story subject failed:", subErr?.message);
    return { ok: false, status: 500, error: "The story couldn't be saved. Try again." };
  }

  if (identifiable && input.requestConsent) {
    const { error: cErr } = await db.from("story_consents").insert({
      org_id: orgId,
      story_subject_id: subject.id as string,
      scope: ["first_name", "quote"],
      requested_at: todayISO(),
      notes: "Consent requested when the story was captured.",
    });
    // The story is saved and blocked either way; a failed request note only
    // means the "requested" date is missing. Say so in the log, not the UI.
    if (cErr) console.error("[comms] consent request note failed:", cErr.message);
  }

  return { ok: true, storyId, identifiable };
}
