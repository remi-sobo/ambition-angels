import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ctxHasPermission } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";
import { loadStory, STORY_COLUMNS } from "@/lib/admin/comms/bank-server";
import { MAX_BODY, MAX_OUTCOME, MAX_TITLE, normalizeTags } from "@/lib/comms/stories";

/**
 * One story: read, edit, approve or retire (ported from the story-bank
 * branch). 'used' is never set by hand: the edition sync sets it when the
 * email the story went out in reads as sent. Approval is the human gate the
 * consent rule sits on top of; it does not bypass consent.
 */

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isISODate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const SETTABLE_STATUS = new Set(["raw", "drafted", "approved", "retired"]);

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const gate = await requirePermission("comms.manage", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const canSee = await ctxHasPermission(gate.ctx, "comms.subjects.read");
  const story = await loadStory(getSupabaseAdmin(), gate.ctx.orgId, params.id, canSee);
  if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });
  return NextResponse.json({ story, can_see_subjects: canSee });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const gate = await requirePermission("comms.manage", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if ("title" in body) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "A title is required." }, { status: 400 });
    }
    update.title = body.title.trim().slice(0, MAX_TITLE);
  }
  for (const [field, cap] of [["body", MAX_BODY], ["outcome", MAX_OUTCOME]] as const) {
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
    if (typeof body.status !== "string" || !SETTABLE_STATUS.has(body.status)) {
      return NextResponse.json({ error: "That status can't be set by hand." }, { status: 400 });
    }
    update.status = body.status;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: before } = await db
    .from("stories")
    .select("status")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Story not found" }, { status: 404 });

  const { data, error } = await db
    .from("stories")
    .update(update)
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .select(STORY_COLUMNS)
    .maybeSingle();
  if (error) {
    console.error("[comms] story update failed:", error.message);
    return NextResponse.json({ error: "The story couldn't be saved." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Story not found" }, { status: 404 });

  const approved = update.status === "approved" && before.status !== "approved";
  await audit(req, {
    action: approved ? "comms.story.approve" : "comms.story.update",
    entityType: "story",
    entityId: params.id,
    before: { status: before.status },
    after: { ...update, body: undefined, outcome: undefined },
  });
  return NextResponse.json({ ok: true, story: data });
}
