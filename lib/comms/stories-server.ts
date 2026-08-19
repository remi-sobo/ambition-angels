import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, type OrgContext } from "@/lib/admin/auth";
import { hasPermission } from "@/lib/admin/permissions";
import { viewSubject, type RawSubject, type StorySubjectView } from "./stories";
import type { ConsentRow } from "./consent";

/**
 * Story-bank server reads (specs/comms-module.md §6.3).
 *
 * Two permissions decide what comes back:
 *   comms.manage        — the module gate. RLS enforces it; this module only
 *                         ever runs after a route has confirmed it.
 *   comms.subjects.read — whether the caller may learn WHICH participant a
 *                         story is about.
 *
 * ── Why there is a service-role read in here ────────────────────────────────
 * RLS hides participant `story_subjects` rows from a caller without
 * comms.subjects.read. That is the right boundary, but taken alone it leaves
 * such a caller looking at a story that is blocked from every output with
 * nothing on screen explaining why — and "blocked for reasons you can't see"
 * is how people learn to work around a control.
 *
 * So for exactly that caller, this module re-reads the participant rows with
 * the service-role client and hands back a redacted projection: the consent
 * state and whether the subject is a minor, and nothing else. The SELECT list
 * IS the redaction — `subject_id`, `display_label`, `granted_by`, `notes`, and
 * the evidence pointer are never fetched, so there is no identifying value in
 * process to leak through a later bug. Every such read is pinned with
 * `.eq("org_id", orgId)`; tests/tenant-isolation.test.ts fails the build
 * otherwise.
 */

/** Consent columns that are safe for a caller who may not see the participant.
 *  Dates and scopes decide the chip; `granted_by` (a guardian's name) does not
 *  appear here on purpose. */
const SAFE_CONSENT_COLS = "scope, requested_at, granted_at, expires_at, revoked_at";
const FULL_CONSENT_COLS = `id, ${SAFE_CONSENT_COLS}, granted_by, evidence_document_id, notes, created_at`;

export type StoryPerms = {
  /** Holds comms.manage — may read and write the bank at all. */
  manage: boolean;
  /** Holds comms.subjects.read — may see identifiable participants. */
  subjects: boolean;
};

/** Both comms permissions in one pair of round trips, through the SESSION
 *  client so the answer is scoped to the caller. */
export async function loadStoryPerms(
  supabase: SupabaseClient,
  orgId: string,
): Promise<StoryPerms> {
  const [manage, subjects] = await Promise.all([
    hasPermission(supabase, orgId, "comms.manage"),
    hasPermission(supabase, orgId, "comms.subjects.read"),
  ]);
  return { manage, subjects };
}

type SubjectRow = RawSubject & { story_id: string };

/**
 * Subjects (with their consent rows) for a set of stories, keyed by story id
 * and already shaped for the caller.
 *
 * Path 1 — the session client reads whatever RLS permits. For an owner/admin
 * that is everything; for a staff user it is every non-participant subject.
 * Path 2 — only when the caller lacks comms.subjects.read: a narrow
 * service-role read fills in the participant rows as redacted stubs.
 */
export async function loadSubjectsByStory(
  supabase: SupabaseClient,
  orgId: string,
  storyIds: string[],
  perms: StoryPerms,
): Promise<Map<string, StorySubjectView[]>> {
  const byStory = new Map<string, StorySubjectView[]>();
  if (storyIds.length === 0) return byStory;

  // The two reads below are meant to be disjoint — RLS hides from the session
  // read exactly what the service-role fill-in supplies. Dedupe by id anyway,
  // so this function is correct on its own terms rather than only because a
  // policy elsewhere holds. A duplicated subject would double a consent chip
  // and, worse, show the redacted stub NEXT to the real name.
  const seen = new Set<string>();
  const push = (storyId: string, view: StorySubjectView) => {
    if (seen.has(view.id)) return;
    seen.add(view.id);
    const list = byStory.get(storyId) ?? [];
    list.push(view);
    byStory.set(storyId, list);
  };

  const { data: visible } = await supabase
    .from("story_subjects")
    .select(
      `id, story_id, subject_type, subject_id, display_label, is_minor,
       consents:story_consents (${FULL_CONSENT_COLS})`,
    )
    .eq("org_id", orgId)
    .in("story_id", storyIds)
    .order("created_at", { ascending: true });

  for (const row of (visible ?? []) as unknown as SubjectRow[]) {
    push(row.story_id, viewSubject(row, perms.subjects));
  }

  if (!perms.subjects) {
    // The redacted fill-in. Columns are chosen, not filtered: nothing
    // identifying is selected, so nothing identifying can escape.
    const { data: hidden } = await getSupabaseAdmin()
      .from("story_subjects")
      .select(`id, story_id, is_minor, consents:story_consents (${SAFE_CONSENT_COLS})`)
      .eq("org_id", orgId)
      .eq("subject_type", "participant")
      .in("story_id", storyIds)
      .order("created_at", { ascending: true });

    for (const row of (hidden ?? []) as unknown as Array<{
      id: string;
      story_id: string;
      is_minor: boolean;
      consents: ConsentRow[] | null;
    }>) {
      push(
        row.story_id,
        viewSubject(
          {
            id: row.id,
            subject_type: "participant",
            subject_id: null,
            display_label: "",
            is_minor: row.is_minor,
            consents: row.consents,
          },
          false,
        ),
      );
    }
  }

  return byStory;
}

/**
 * Confirm a polymorphic subject target exists in the caller's org, and return
 * nothing but that fact.
 *
 * Read through the SESSION client on purpose: RLS on the target table is what
 * proves the caller may reference it at all. A staff user who cannot read a
 * student row has no business attaching one to a story.
 */
export async function subjectTargetExists(
  supabase: SupabaseClient,
  table: string,
  orgId: string,
  subjectId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from(table)
    .select("id")
    .eq("id", subjectId)
    .eq("org_id", orgId)
    .maybeSingle();
  return !!data;
}

/**
 * The gate every comms route opens with: a session, an active org, and
 * comms.manage.
 *
 * RLS is still the hard boundary underneath — this exists so a caller without
 * the key gets an honest 403 instead of the empty list RLS would hand back,
 * which reads as "you have no stories" rather than "this isn't yours."
 */
export type CommsGate =
  | { ok: false; res: NextResponse }
  | { ok: true; ctx: OrgContext; supabase: SupabaseClient; perms: StoryPerms };

export async function requireComms(): Promise<CommsGate> {
  const ctx = await getOrgContext();
  if (!ctx) {
    return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const supabase = createServerSupabase();
  const perms = await loadStoryPerms(supabase, ctx.orgId);
  if (!perms.manage) {
    return {
      ok: false,
      res: NextResponse.json({ error: "You don't have access to Comms." }, { status: 403 }),
    };
  }
  return { ok: true, ctx, supabase, perms };
}

// ── Shared reads: the bank list and one story ────────────────────────────────
// The page and the API route call the SAME loader, so a server-rendered card
// and the same card after a client refetch can never disagree about whether a
// story is publishable.

import {
  blockedReason,
  isStoryPublishable,
  storyConsentState,
  type ConsentState,
} from "./consent";

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
  suggestion_score: number | null;
};

type Decoratable = { id: string; status: string } & Record<string, unknown>;

async function decorateStories(
  supabase: SupabaseClient,
  orgId: string,
  rows: Decoratable[],
  perms: StoryPerms,
): Promise<LoadedStory[]> {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];

  const [subjectsByStory, mediaRes, scoreRes] = await Promise.all([
    loadSubjectsByStory(supabase, orgId, ids, perms),
    supabase
      .from("story_media")
      .select("id, story_id, storage_path, mime, size_bytes, caption, kind, created_at")
      .eq("org_id", orgId)
      .in("story_id", ids)
      .order("created_at", { ascending: true }),
    // The deterministic rank behind the drag rank (v_story_suggestions).
    supabase
      .from("v_story_suggestions")
      .select("id, suggestion_score")
      .eq("org_id", orgId)
      .in("id", ids),
  ]);

  const mediaByStory = new Map<string, StoryMedia[]>();
  for (const m of (mediaRes.data ?? []) as Array<StoryMedia & { story_id: string }>) {
    const list = mediaByStory.get(m.story_id) ?? [];
    list.push(m);
    mediaByStory.set(m.story_id, list);
  }
  const scoreById = new Map<string, number>();
  for (const r of (scoreRes.data ?? []) as Array<{ id: string; suggestion_score: number }>) {
    scoreById.set(r.id, Number(r.suggestion_score));
  }

  return rows.map((r) => {
    const subjects = subjectsByStory.get(r.id) ?? [];
    return {
      ...(r as unknown as Omit<LoadedStory, "subjects" | "media" | "consent_state" | "publishable" | "blocked_reason" | "suggestion_score">),
      subjects,
      media: mediaByStory.get(r.id) ?? [],
      consent_state: storyConsentState(subjects),
      publishable: isStoryPublishable(r.status, subjects),
      blocked_reason: blockedReason(r.status, subjects),
      suggestion_score: scoreById.get(r.id) ?? null,
    };
  });
}

export type BankFilters = {
  status?: string | null;
  tag?: string | null;
  goal?: string | null;
  q?: string | null;
};

/** The bank list. Retired stories are hidden unless explicitly asked for — they
 *  are the revocation graveyard, not working material. */
export async function loadBankStories(
  supabase: SupabaseClient,
  orgId: string,
  perms: StoryPerms,
  filters: BankFilters = {},
): Promise<LoadedStory[]> {
  let q = supabase
    .from("stories")
    .select(STORY_COLUMNS)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (filters.status) q = q.eq("status", filters.status);
  else q = q.neq("status", "retired");
  if (filters.tag) q = q.contains("tags", [filters.tag.trim().toLowerCase()]);
  if (filters.goal) q = q.eq("strategic_goal_id", filters.goal);
  if (filters.q && filters.q.trim()) {
    const like = `%${filters.q.trim().replaceAll("%", "").replaceAll(",", " ")}%`;
    q = q.or(`title.ilike.${like},body.ilike.${like},outcome.ilike.${like}`);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[comms] bank read failed:", error.message);
    return [];
  }
  return decorateStories(supabase, orgId, (data ?? []) as Decoratable[], perms);
}

/** One story, fully decorated, or null when it isn't visible to this caller. */
export async function loadStory(
  supabase: SupabaseClient,
  orgId: string,
  storyId: string,
  perms: StoryPerms,
): Promise<LoadedStory | null> {
  const { data } = await supabase
    .from("stories")
    .select(STORY_COLUMNS)
    .eq("id", storyId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return null;
  const [one] = await decorateStories(supabase, orgId, [data as Decoratable], perms);
  return one ?? null;
}
