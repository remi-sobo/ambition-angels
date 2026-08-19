import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { loadStory, requireComms, STORY_COLUMNS } from "@/lib/comms/stories-server";
import {
  isStoryStatus,
  normalizeTags,
  MAX_BODY,
  MAX_OUTCOME,
  MAX_TITLE,
} from "@/lib/comms/stories";

/** One story with its subjects, consents, and media (specs/comms-module.md §7.2). */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// ── GET /api/admin/comms/stories/[id] ───────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase, perms } = g;

  const story = await loadStory(supabase, ctx.orgId, params.id, perms);
  if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });
  return NextResponse.json({ story, can_see_subjects: perms.subjects });
}

// ── PATCH /api/admin/comms/stories/[id] ─────────────────────────────────────
// Edits, the status advance (raw → drafted → approved), and the drag rank.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase } = g;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};

  if ("title" in body) {
    const v = body.title;
    if (typeof v !== "string" || !v.trim()) {
      return NextResponse.json({ error: "A title is required." }, { status: 400 });
    }
    update.title = v.trim().slice(0, MAX_TITLE);
  }
  for (const [field, cap] of [
    ["body", MAX_BODY],
    ["outcome", MAX_OUTCOME],
  ] as const) {
    if (field in body) {
      const v = body[field];
      if (v === null || v === "") update[field] = null;
      else if (typeof v === "string") update[field] = v.slice(0, cap);
      else return NextResponse.json({ error: `${field} must be text` }, { status: 400 });
    }
  }
  if ("tags" in body) update.tags = normalizeTags(body.tags);

  if ("happened_on" in body) {
    const v = body.happened_on;
    if (v === null || v === "") update.happened_on = null;
    else if (isISODate(v)) update.happened_on = v;
    else return NextResponse.json({ error: "happened_on must be YYYY-MM-DD" }, { status: 400 });
  }

  if ("status" in body) {
    if (!isStoryStatus(body.status)) {
      return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    }
    update.status = body.status;
  }

  if ("rank_order" in body) {
    const v = body.rank_order;
    if (v === null) update.rank_order = null;
    else if (typeof v === "number" && Number.isInteger(v)) update.rank_order = v;
    else return NextResponse.json({ error: "rank_order must be an integer or null" }, { status: 400 });
  }

  if ("strategic_goal_id" in body) {
    const v = body.strategic_goal_id;
    if (v === null || v === "") update.strategic_goal_id = null;
    else if (!isUuid(v)) {
      return NextResponse.json({ error: "Invalid strategic_goal_id" }, { status: 400 });
    } else {
      // Same org-scope proof as create: the FK itself can't express it.
      const { data: goal } = await supabase
        .from("plan_goals")
        .select("id")
        .eq("id", v)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
      if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
      update.strategic_goal_id = v;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data: before } = await supabase
    .from("stories")
    .select("status, title")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("stories")
    .update(update)
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .select(STORY_COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Story not found" }, { status: 404 });

  // Approval is the human gate everything downstream depends on, so it gets
  // its own audit action rather than hiding inside a generic update.
  const approved = update.status === "approved" && before?.status !== "approved";
  await audit(req, {
    action: approved ? "comms.story.approve" : "comms.story.update",
    entityType: "story",
    entityId: params.id,
    before: before ?? undefined,
    after: update,
  });
  return NextResponse.json({ ok: true, story: data });
}

// ── DELETE /api/admin/comms/stories/[id] ────────────────────────────────────
// Subjects, consents, and media cascade with the row. Media OBJECTS are not
// removed here — no upload path exists until Phase 2, and orphan cleanup
// belongs with the code that knows the bucket.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase } = g;

  const { data: deleted, error } = await supabase
    .from("stories")
    .delete()
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .select("title");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (deleted ?? []) as Array<{ title: string }>;
  if (rows.length === 0) return NextResponse.json({ error: "Story not found" }, { status: 404 });

  await audit(req, {
    action: "comms.story.delete",
    entityType: "story",
    entityId: params.id,
    before: { title: rows[0].title },
  });
  return NextResponse.json({ ok: true });
}
