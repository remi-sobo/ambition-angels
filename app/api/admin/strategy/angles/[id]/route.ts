/**
 * PATCH /api/admin/strategy/angles/[id] — edit one angle's elements.
 * DELETE /api/admin/strategy/angles/[id] — remove an angle.
 *
 * Session client + RLS (fundraising.write) is the write gate; org_id is never
 * accepted from the client. `key` is intentionally NOT editable — it's the URL
 * slug + the public Strategy Room anchor, so it stays stable even when the name
 * is reworded.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import {
  ANGLE_BADGES,
  ANGLE_TONES,
  ANGLE_TEXT_FIELDS,
  angleFieldMax,
  angleStr,
} from "@/lib/admin/strategy/angle-fields";

export const dynamic = "force-dynamic";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};

  if ("name" in body) {
    const name = angleStr(body.name, 300);
    if (!name) return NextResponse.json({ error: "name cannot be blank" }, { status: 400 });
    update.name = name;
  }
  if ("status_badge" in body) {
    const badge = angleStr(body.status_badge);
    if (badge && !ANGLE_BADGES.includes(badge as (typeof ANGLE_BADGES)[number])) {
      return NextResponse.json({ error: "invalid status_badge" }, { status: 400 });
    }
    update.status_badge = badge; // null clears the badge
  }
  if ("tone" in body) {
    const tone = angleStr(body.tone);
    if (tone && !ANGLE_TONES.includes(tone as (typeof ANGLE_TONES)[number])) {
      return NextResponse.json({ error: "invalid tone" }, { status: 400 });
    }
    update.tone = tone;
  }
  if ("is_active" in body && typeof body.is_active === "boolean") {
    update.is_active = body.is_active;
  }
  if ("sort_order" in body && typeof body.sort_order === "number" && Number.isFinite(body.sort_order)) {
    update.sort_order = Math.trunc(body.sort_order);
  }
  for (const f of ANGLE_TEXT_FIELDS) {
    if (f in body) update[f] = angleStr(body[f], angleFieldMax(f)); // null clears
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: before } = await supabase
    .from("strategy_angles").select("*").eq("id", params.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("strategy_angles").update(update).eq("id", params.id);
  if (error) {
    console.error("[strategy/angles] update failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.strategy_angle.update",
    entityType: "strategy_angles",
    entityId: params.id,
    before,
    after: update,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = createServerSupabase();
  const { data: before } = await supabase
    .from("strategy_angles").select("*").eq("id", params.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("strategy_angles").delete().eq("id", params.id);
  if (error) {
    console.error("[strategy/angles] delete failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.strategy_angle.delete",
    entityType: "strategy_angles",
    entityId: params.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
