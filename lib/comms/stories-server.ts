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

  const push = (storyId: string, view: StorySubjectView) => {
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
