import { blockedReason, isStoryPublishable, type ConsentRow } from "./consent";

/**
 * The consent gate every output path asks (V4 Stage D: "a story about an
 * identifiable participant cannot be used in any output until a consent
 * record is on file").
 *
 * One function answers for every path: filling an edition slot, compiling an
 * edition into an email draft, queueing that email, the worker sending each
 * copy, a test send, and the composer. Each caller passes its own client
 * (the request's service-role client after requirePermission, or the worker's)
 * and the org it already pinned; every read here carries that org_id.
 *
 * The rule is lib/comms/consent.ts (isStoryPublishable), which mirrors the
 * SQL view v_publishable_stories: the story is approved (or used), and every
 * identifiable subject holds a live grant that no revocation overrides.
 *
 * FAIL CLOSED: a read error, a missing story, or a subject whose consent rows
 * cannot be read all come back as "not usable", with a reason a person can
 * act on. It never answers "usable" because it could not look.
 */

// The structural slice of a Supabase client this module uses. The query
// builder is thenable and chainable; typing every hop buys nothing here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any };

export type StoryVerdict = {
  id: string;
  title: string;
  publishable: boolean;
  /** Why it cannot be used, in plain words. Null when it can. */
  reason: string | null;
};

const CONSENT_COLS = "scope, requested_at, granted_at, expires_at, revoked_at";
const CANT_CHECK = "We couldn't check consent for this story just now, so it was held back. Try again.";

type SubjectRow = { story_id: string; subject_type: string; consents: ConsentRow[] | null };

/** Verdicts for a set of stories in one org. Unknown ids come back blocked. */
export async function storyVerdicts(
  db: Db,
  orgId: string,
  storyIds: readonly string[],
  today?: string,
): Promise<Map<string, StoryVerdict>> {
  const ids = Array.from(new Set(storyIds.filter(Boolean)));
  const out = new Map<string, StoryVerdict>();
  if (ids.length === 0) return out;

  const blockAll = (reason: string) => {
    for (const id of ids) out.set(id, { id, title: "", publishable: false, reason });
    return out;
  };

  const [storiesRes, subjectsRes] = await Promise.all([
    db.from("stories").select("id, title, status").eq("org_id", orgId).in("id", ids),
    db
      .from("story_subjects")
      .select(`story_id, subject_type, consents:story_consents (${CONSENT_COLS})`)
      .eq("org_id", orgId)
      .in("story_id", ids),
  ]);
  if (storiesRes?.error || subjectsRes?.error) return blockAll(CANT_CHECK);

  const subjectsByStory = new Map<string, SubjectRow[]>();
  for (const s of (subjectsRes?.data ?? []) as SubjectRow[]) {
    // A subject whose consents did not come back as a list is unreadable, and
    // unreadable is not "no one to protect": treat it as no grant on file.
    const row = { ...s, consents: Array.isArray(s.consents) ? s.consents : [] };
    subjectsByStory.set(s.story_id, [...(subjectsByStory.get(s.story_id) ?? []), row]);
  }

  const found = new Map<string, { id: string; title: string; status: string }>();
  for (const st of (storiesRes?.data ?? []) as Array<{ id: string; title: string; status: string }>) {
    found.set(st.id, st);
  }

  for (const id of ids) {
    const st = found.get(id);
    if (!st) {
      out.set(id, { id, title: "", publishable: false, reason: "This story is no longer in the story bank." });
      continue;
    }
    const subjects = subjectsByStory.get(id) ?? [];
    const publishable = isStoryPublishable(st.status, subjects, today);
    out.set(id, {
      id,
      title: st.title,
      publishable,
      reason: publishable ? null : blockedReason(st.status, subjects, today) ?? "This story can't be used yet.",
    });
  }
  return out;
}

/** One sentence naming the first blocked story, or null when all are usable. */
export function firstBlock(verdicts: Map<string, StoryVerdict>): string | null {
  for (const v of Array.from(verdicts.values())) {
    if (!v.publishable) {
      return v.title ? `"${v.title}" can't be used: ${v.reason}` : (v.reason ?? "A story here can't be used yet.");
    }
  }
  return null;
}

/**
 * Does this email campaign carry a story that may no longer be sent?
 *
 * An edition compiles into an ordinary email draft whose body is frozen text,
 * so a consent revoked after compile would otherwise ride along to every
 * inbox. The campaign is linked back through comms_editions.email_campaign_id;
 * every story that edition placed in a slot is checked again here. A campaign
 * with no edition (a hand-written email) has no stories and passes.
 *
 * Returns the reason to refuse, or null.
 */
export async function campaignStoryBlock(
  db: Db,
  orgId: string,
  campaignId: string,
  today?: string,
): Promise<string | null> {
  const eds = await db
    .from("comms_editions")
    .select("id")
    .eq("org_id", orgId)
    .eq("email_campaign_id", campaignId);
  if (eds?.error) return CANT_CHECK;
  const editionIds = ((eds?.data ?? []) as Array<{ id: string }>).map((e) => e.id);
  if (editionIds.length === 0) return null;

  const slots = await db
    .from("comms_edition_slots")
    .select("story_id")
    .eq("org_id", orgId)
    .in("edition_id", editionIds);
  if (slots?.error) return CANT_CHECK;
  const storyIds = ((slots?.data ?? []) as Array<{ story_id: string | null }>)
    .map((s) => s.story_id)
    .filter((v): v is string => !!v);
  if (storyIds.length === 0) return null;

  const block = firstBlock(await storyVerdicts(db, orgId, storyIds, today));
  return block ? `This email holds a story that can't go out. ${block}` : null;
}
