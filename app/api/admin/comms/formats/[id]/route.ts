import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireComms } from "@/lib/comms/stories-server";
import { isCadence, parseSlots } from "@/lib/comms/formats";

/**
 * Edit a format (spec §7.4a).
 *
 * Edits apply to FUTURE editions only. Nothing here reaches into an edition
 * already created — those hold their own slot snapshot, taken at create time.
 * That is what makes renaming a slot safe.
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase } = g;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if ("name" in body) {
    const v = typeof body.name === "string" ? body.name.trim() : "";
    if (!v) return NextResponse.json({ error: "A format needs a name." }, { status: 400 });
    update.name = v.slice(0, 120);
  }
  if ("cadence" in body) {
    if (!isCadence(body.cadence)) return NextResponse.json({ error: "Unknown cadence" }, { status: 400 });
    update.cadence = body.cadence;
  }
  if ("slots" in body) {
    try {
      update.slots = parseSlots(body.slots);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }
  if ("is_archived" in body) update.is_archived = body.is_archived === true;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("comms_formats")
    .update(update)
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .select("id, name, cadence, slots, is_archived, created_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Format not found" }, { status: 404 });

  await audit(req, {
    action: "comms.format.update",
    entityType: "comms_format",
    entityId: params.id,
    after: { fields: Object.keys(update) },
  });
  return NextResponse.json({ ok: true, format: data });
}

// Formats are ARCHIVED, never deleted: comms_editions references them with
// `on delete restrict` precisely so an edition's provenance survives.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase } = g;

  const { data, error } = await supabase
    .from("comms_formats")
    .update({ is_archived: true })
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .select("id, name")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Format not found" }, { status: 404 });

  await audit(req, {
    action: "comms.format.archive",
    entityType: "comms_format",
    entityId: params.id,
    before: { name: data.name },
  });
  return NextResponse.json({ ok: true });
}
