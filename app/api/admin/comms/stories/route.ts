import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { loadBankStories, requireComms, STORY_COLUMNS } from "@/lib/comms/stories-server";
import { normalizeTags, MAX_BODY, MAX_OUTCOME, MAX_TITLE } from "@/lib/comms/stories";

/**
 * Story bank — list and capture (specs/comms-module.md §7.2, Phase 1).
 *
 * The list goes through the same loader the bank PAGE uses, so a
 * server-rendered card and the same card after a client refetch can never
 * disagree about whether a story is publishable.
 *
 * Capture is deliberately forgiving. A title is the only required field —
 * "the modal never blocks on completeness; a raw story beats no story." Tags,
 * subjects, consent, and the goal link all belong to the detail view.
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// ── GET /api/admin/comms/stories ────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase, perms } = g;

  const sp = req.nextUrl.searchParams;
  const stories = await loadBankStories(supabase, ctx.orgId, perms, {
    status: sp.get("status"),
    tag: sp.get("tag"),
    goal: isUuid(sp.get("goal")) ? sp.get("goal") : null,
    q: sp.get("q"),
  });
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
  if (
    body.strategic_goal_id != null &&
    body.strategic_goal_id !== "" &&
    !isUuid(body.strategic_goal_id)
  ) {
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
    .select(STORY_COLUMNS)
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
