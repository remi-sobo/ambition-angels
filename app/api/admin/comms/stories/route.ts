import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { loadSubjectsByStory, requireComms, type StoryPerms } from "@/lib/comms/stories-server";
import {
  isStoryStatus,
  normalizeTags,
  MAX_BODY,
  MAX_OUTCOME,
  MAX_TITLE,
  type StorySubjectView,
} from "@/lib/comms/stories";
import { blockedReason, isStoryPublishable, storyConsentState } from "@/lib/comms/consent";

/**
 * Story bank — list and capture (specs/comms-module.md §7.2, Phase 1).
 *
 * Reads go through the SESSION client so comms.manage RLS is the authority,
 * and every query is pinned to the ACTIVE org: RLS alone would merge rows from
 * every org the caller belongs to.
 *
 * Capture is deliberately forgiving. A title is the only required field —
 * "the modal never blocks on completeness; a raw story beats no story." Tags,
 * subjects, consent, and the goal link all belong to the detail view.
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

const STORY_COLS =
  "id, title, body, outcome, status, tags, happened_on, captured_by, rank_order, strategic_goal_id, source, created_at, updated_at";

type StoryRow = {
  id: string;
  status: string;
  [k: string]: unknown;
};

/** Attach subjects, media counts, and the consent verdict to a page of rows. */
async function decorate(
  supabase: SupabaseClient,
  orgId: string,
  rows: StoryRow[],
  perms: StoryPerms,
) {
  const ids = rows.map((r) => r.id);
  const [subjectsByStory, mediaRes] = await Promise.all([
    loadSubjectsByStory(supabase, orgId, ids, perms),
    ids.length
      ? supabase
          .from("story_media")
          .select("id, story_id, storage_path, mime, caption, kind")
          .eq("org_id", orgId)
          .in("story_id", ids)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);

  const mediaByStory = new Map<string, Array<Record<string, unknown>>>();
  for (const m of (mediaRes.data ?? []) as Array<Record<string, unknown>>) {
    const sid = m.story_id as string;
    const list = mediaByStory.get(sid) ?? [];
    list.push(m);
    mediaByStory.set(sid, list);
  }

  return rows.map((r) => {
    const subjects: StorySubjectView[] = subjectsByStory.get(r.id) ?? [];
    const media = mediaByStory.get(r.id) ?? [];
    return {
      ...r,
      subjects,
      media,
      consent_state: storyConsentState(subjects),
      publishable: isStoryPublishable(r.status, subjects),
      blocked_reason: blockedReason(r.status, subjects),
    };
  });
}

// ── GET /api/admin/comms/stories ────────────────────────────────────────────
// Filters: status, tag, q (title/body), goal (strategic_goal_id).
// Ordered the way the bank reads: human rank first, then most recent.
export async function GET(req: NextRequest) {
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase, perms } = g;

  const sp = req.nextUrl.searchParams;
  let q = supabase
    .from("stories")
    .select(STORY_COLS)
    .eq("org_id", ctx.orgId)
    .order("rank_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);

  const status = sp.get("status");
  if (status && isStoryStatus(status)) q = q.eq("status", status);
  else if (!status) q = q.neq("status", "retired");

  const tag = sp.get("tag");
  if (tag) q = q.contains("tags", [tag.trim().toLowerCase()]);

  const goal = sp.get("goal");
  if (isUuid(goal)) q = q.eq("strategic_goal_id", goal);

  const text = sp.get("q");
  if (text && text.trim()) {
    const like = `%${text.trim().replaceAll("%", "").replaceAll(",", " ")}%`;
    q = q.or(`title.ilike.${like},body.ilike.${like},outcome.ilike.${like}`);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[comms] story list failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stories = await decorate(supabase, ctx.orgId, (data ?? []) as StoryRow[], perms);
  return NextResponse.json({ stories, can_see_subjects: perms.subjects });
}

// ── POST /api/admin/comms/stories ───────────────────────────────────────────
// Capture. Title required, everything else optional.
export async function POST(req: NextRequest) {
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase } = g;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });

  if (body.happened_on != null && body.happened_on !== "" && !isISODate(body.happened_on)) {
    return NextResponse.json({ error: "happened_on must be YYYY-MM-DD" }, { status: 400 });
  }
  if (body.strategic_goal_id != null && body.strategic_goal_id !== "" && !isUuid(body.strategic_goal_id)) {
    return NextResponse.json({ error: "Invalid strategic_goal_id" }, { status: 400 });
  }
  // The goal FK is not org-scoped in the database (Postgres can't express
  // "same org" across it), so prove the target belongs to this tenant before
  // writing. Reading through the session client is the proof: RLS hides
  // another org's goals entirely.
  if (isUuid(body.strategic_goal_id)) {
    const { data: goal } = await supabase
      .from("plan_goals")
      .select("id")
      .eq("id", body.strategic_goal_id)
      .eq("org_id", ctx.orgId)
      .maybeSingle();
    if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  const insert: Record<string, unknown> = {
    org_id: ctx.orgId,
    title: title.slice(0, MAX_TITLE),
    body: typeof body.body === "string" && body.body.trim() ? body.body.slice(0, MAX_BODY) : null,
    outcome:
      typeof body.outcome === "string" && body.outcome.trim()
        ? body.outcome.slice(0, MAX_OUTCOME)
        : null,
    tags: normalizeTags(body.tags),
    happened_on: isISODate(body.happened_on) ? body.happened_on : null,
    strategic_goal_id: isUuid(body.strategic_goal_id) ? body.strategic_goal_id : null,
    captured_by: (await getAdminUser()) ?? null,
    source: "manual",
  };

  const { data, error } = await supabase
    .from("stories")
    .insert(insert)
    .select(STORY_COLS)
    .single();
  if (error || !data) {
    console.error("[comms] story create failed:", error?.message);
    return NextResponse.json({ error: "Could not save the story" }, { status: 500 });
  }

  await audit(req, {
    action: "comms.story.create",
    entityType: "story",
    entityId: data.id as string,
    after: { title, has_outcome: !!insert.outcome },
  });
  return NextResponse.json({ ok: true, story: { ...data, subjects: [], media: [] } });
}
