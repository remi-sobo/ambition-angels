import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";
import { storyVerdicts } from "@/lib/comms/story-gate";

/**
 * Fill one slot of an edition (story-bank branch). A story goes into a slot
 * only if the consent gate says it is usable right now (approved, and every
 * identifiable subject holds a live grant). The refusal says why.
 */

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const gate = await requirePermission("comms.manage", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.slot_key !== "string" || !body.slot_key.trim()) {
    return NextResponse.json({ error: "Which slot?" }, { status: 400 });
  }
  const slotKey = body.slot_key.trim();
  const db = getSupabaseAdmin();

  const { data: edition } = await db
    .from("comms_editions")
    .select("id, status")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!edition) return NextResponse.json({ error: "Edition not found" }, { status: 404 });
  if (edition.status === "sent") {
    return NextResponse.json({ error: "This edition has already gone out. Its content is the record of what was sent." }, { status: 409 });
  }

  const update: Record<string, unknown> = {};
  if ("story_id" in body) {
    const v = body.story_id;
    if (v === null || v === "") update.story_id = null;
    else if (!isUuid(v)) return NextResponse.json({ error: "Invalid story_id" }, { status: 400 });
    else {
      const verdict = (await storyVerdicts(db, ctx.orgId, [v])).get(v);
      if (!verdict?.publishable) {
        return NextResponse.json(
          { error: `That story can't be used yet. ${verdict?.reason ?? ""}`.trim(), code: "consent" },
          { status: 403 },
        );
      }
      update.story_id = v;
    }
  }
  if ("metric_ids" in body) {
    const raw = Array.isArray(body.metric_ids) ? body.metric_ids.filter(isUuid) : [];
    if (raw.length > 0) {
      const { data: defs } = await db.from("metric_definitions").select("id").eq("org_id", ctx.orgId).in("id", raw);
      if (((defs ?? []) as unknown[]).length !== raw.length) {
        return NextResponse.json({ error: "One of those metrics wasn't found." }, { status: 404 });
      }
    }
    update.metric_ids = raw.length > 0 ? raw : null;
  }
  if ("content" in body) {
    const v = body.content;
    if (v === null || v === "") update.content = null;
    else if (typeof v === "string") update.content = v.slice(0, 20000);
    else return NextResponse.json({ error: "content must be text" }, { status: 400 });
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data, error } = await db
    .from("comms_edition_slots")
    .update(update)
    .eq("edition_id", params.id)
    .eq("slot_key", slotKey)
    .eq("org_id", ctx.orgId)
    .select("id, slot_key, story_id, metric_ids, content, position")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save the slot." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Slot not found" }, { status: 404 });

  if (edition.status === "planning") {
    await db.from("comms_editions").update({ status: "drafting" }).eq("id", params.id).eq("org_id", ctx.orgId);
  }
  await audit(req, { action: "comms.edition.slot_fill", entityType: "comms_edition", entityId: params.id, after: { slot_key: slotKey, fields: Object.keys(update) } });
  return NextResponse.json({ ok: true, slot: data });
}
