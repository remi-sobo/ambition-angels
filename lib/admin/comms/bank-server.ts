import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { viewSubject, type RawSubject, type StorySubjectView } from "@/lib/comms/stories";
import {
  blockedReason,
  isStoryPublishable,
  storyConsentState,
  type ConsentRow,
  type ConsentState,
} from "@/lib/comms/consent";

/**
 * Story-bank server reads (V4 Stage D), ported from the story-bank branch's
 * lib/comms/stories-server.ts onto main's guard pattern.
 *
 * On the branch these reads ran on the SESSION client and leaned on RLS:
 * comms.manage for the bank, comms.subjects.read for which participant a
 * story is about. On main every Comms route and page opens with
 * requirePermission("comms.manage", { entitlement: "modules.comms" }) and then
 * reads through the service-role client, which bypasses RLS. So the two rules
 * RLS used to carry are carried here instead:
 *
 *   1. Every read pins `.eq("org_id", orgId)` (tests/tenant-isolation.test.ts
 *      scans this directory and fails the build otherwise).
 *   2. The participant split is a SELECT list. A caller without
 *      comms.subjects.read never has a participant's subject_id, label,
 *      guardian name, notes or evidence pointer fetched at all: participant
 *      rows are read with the safe column set only and shaped into a redacted
 *      stub by viewSubject(). There is no identifying value in process to leak
 *      through a later bug.
 */

const SAFE_CONSENT_COLS = "scope, requested_at, granted_at, expires_at, revoked_at";
const FULL_CONSENT_COLS = `id, ${SAFE_CONSENT_COLS}, granted_by, evidence_document_id, notes, created_at`;

export const STORY_COLUMNS =
  "id, title, body, outcome, status, tags, happened_on, captured_by, rank_order, strategic_goal_id, source, created_at, updated_at";

export type StoryMedia = {
  id: string;
  storage_path: string;
  mime: string | null;
  size_bytes?: number | null;
  caption: string | null;
  kind: string;
  created_at?: string;
};

export type LoadedStory = {
  id: string;
  title: string;
  body: string | null;
  outcome: string | null;
  status: string;
  tags: string[];
  happened_on: string | null;
  captured_by: string | null;
  rank_order: number | null;
  strategic_goal_id: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  subjects: StorySubjectView[];
  media: StoryMedia[];
  consent_state: ConsentState | null;
  publishable: boolean;
  blocked_reason: string | null;
};

type SubjectRow = RawSubject & { story_id: string };

/** Subjects with consents for a set of stories, shaped for the caller. */
export async function loadSubjectsByStory(
  db: SupabaseClient,
  orgId: string,
  storyIds: string[],
  canSeeSubjects: boolean,
): Promise<Map<string, StorySubjectView[]>> {
  const byStory = new Map<string, StorySubjectView[]>();
  if (storyIds.length === 0) return byStory;
  const push = (storyId: string, view: StorySubjectView) => {
    byStory.set(storyId, [...(byStory.get(storyId) ?? []), view]);
  };

  if (canSeeSubjects) {
    const { data } = await db
      .from("story_subjects")
      .select(
        `id, story_id, subject_type, subject_id, display_label, is_minor, consents:story_consents (${FULL_CONSENT_COLS})`,
      )
      .eq("org_id", orgId)
      .in("story_id", storyIds)
      .order("created_at", { ascending: true });
    for (const row of (data ?? []) as unknown as SubjectRow[]) push(row.story_id, viewSubject(row, true));
    return byStory;
  }

  // No comms.subjects.read: non-participants in full, participants as stubs.
  const [visible, hidden] = await Promise.all([
    db
      .from("story_subjects")
      .select(
        `id, story_id, subject_type, subject_id, display_label, is_minor, consents:story_consents (${FULL_CONSENT_COLS})`,
      )
      .eq("org_id", orgId)
      .neq("subject_type", "participant")
      .in("story_id", storyIds)
      .order("created_at", { ascending: true }),
    db
      .from("story_subjects")
      .select(`id, story_id, subject_type, is_minor, consents:story_consents (${SAFE_CONSENT_COLS})`)
      .eq("org_id", orgId)
      .eq("subject_type", "participant")
      .in("story_id", storyIds)
      .order("created_at", { ascending: true }),
  ]);
  for (const row of (visible.data ?? []) as unknown as SubjectRow[]) {
    // Belt and braces: a participant row can only arrive here if the filter
    // above was ignored; redact it rather than trust that.
    push(row.story_id, viewSubject(row, row.subject_type !== "participant"));
  }
  for (const row of (hidden.data ?? []) as unknown as Array<{
    id: string;
    story_id: string;
    is_minor: boolean;
    consents: ConsentRow[] | null;
  }>) {
    push(
      row.story_id,
      viewSubject(
        { id: row.id, subject_type: "participant", subject_id: null, display_label: "", is_minor: row.is_minor, consents: row.consents },
        false,
      ),
    );
  }
  return byStory;
}

type Decoratable = { id: string; status: string } & Record<string, unknown>;

async function decorate(
  db: SupabaseClient,
  orgId: string,
  rows: Decoratable[],
  canSeeSubjects: boolean,
): Promise<LoadedStory[]> {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const [subjectsByStory, mediaRes] = await Promise.all([
    loadSubjectsByStory(db, orgId, ids, canSeeSubjects),
    db
      .from("story_media")
      .select("id, story_id, storage_path, mime, size_bytes, caption, kind, created_at")
      .eq("org_id", orgId)
      .in("story_id", ids)
      .order("created_at", { ascending: true }),
  ]);
  const mediaByStory = new Map<string, StoryMedia[]>();
  for (const m of (mediaRes.data ?? []) as Array<StoryMedia & { story_id: string }>) {
    mediaByStory.set(m.story_id, [...(mediaByStory.get(m.story_id) ?? []), m]);
  }
  return rows.map((r) => {
    const subjects = subjectsByStory.get(r.id) ?? [];
    return {
      ...(r as unknown as Omit<LoadedStory, "subjects" | "media" | "consent_state" | "publishable" | "blocked_reason">),
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
      subjects,
      media: mediaByStory.get(r.id) ?? [],
      consent_state: storyConsentState(subjects),
      publishable: isStoryPublishable(r.status, subjects),
      blocked_reason: blockedReason(r.status, subjects),
    };
  });
}

export type BankFilters = { status?: string | null; q?: string | null };

/** The bank list, newest first. Retired stories only when asked for. */
export async function loadBankStories(
  db: SupabaseClient,
  orgId: string,
  canSeeSubjects: boolean,
  filters: BankFilters = {},
): Promise<{ stories: LoadedStory[]; error: string | null }> {
  let q = db
    .from("stories")
    .select(STORY_COLUMNS)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (filters.status) q = q.eq("status", filters.status);
  else q = q.neq("status", "retired");
  if (filters.q && filters.q.trim()) {
    const like = `%${filters.q.trim().replaceAll("%", "").replaceAll(",", " ")}%`;
    q = q.or(`title.ilike.${like},body.ilike.${like},outcome.ilike.${like}`);
  }
  const { data, error } = await q;
  if (error) {
    console.error("[comms] bank read failed:", error.message);
    return { stories: [], error: "The story bank couldn't be read just now." };
  }
  return { stories: await decorate(db, orgId, (data ?? []) as Decoratable[], canSeeSubjects), error: null };
}

/** One story, decorated, or null when it is not in this org. */
export async function loadStory(
  db: SupabaseClient,
  orgId: string,
  storyId: string,
  canSeeSubjects: boolean,
): Promise<LoadedStory | null> {
  const { data } = await db
    .from("stories")
    .select(STORY_COLUMNS)
    .eq("id", storyId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return null;
  const [one] = await decorate(db, orgId, [data as Decoratable], canSeeSubjects);
  return one ?? null;
}

/** Confirm a polymorphic subject target is a row in this org. */
export async function subjectTargetExists(
  db: SupabaseClient,
  table: string,
  orgId: string,
  subjectId: string,
): Promise<boolean> {
  const { data } = await db.from(table).select("id").eq("id", subjectId).eq("org_id", orgId).maybeSingle();
  return !!data;
}
