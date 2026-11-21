import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";
import { isCadence, parseSlots } from "@/lib/comms/formats";

/** Edit a format's name, cadence or slots, or archive it. Editions already
 *  created keep their own snapshot of the slots. */
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const gate = await requirePermission("comms.manage", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    if (!body.name.trim()) return NextResponse.json({ error: "Name the format." }, { status: 400 });
    update.name = body.name.trim().slice(0, 120);
  }
  if ("cadence" in body) {
    if (!isCadence(body.cadence)) return NextResponse.json({ error: "Unknown cadence" }, { status: 400 });
    update.cadence = body.cadence;
  }
  if ("slots" in body) {
    try {
      update.slots = parseSlots(body.slots);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Slots are malformed." }, { status: 400 });
    }
  }
  if (typeof body.is_archived === "boolean") update.is_archived = body.is_archived;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  const { data, error } = await getSupabaseAdmin()
    .from("comms_formats")
    .update(update)
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save the format." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Format not found" }, { status: 404 });
  await audit(req, { action: "comms.format.update", entityType: "comms_format", entityId: params.id, after: { fields: Object.keys(update) } });
  return NextResponse.json({ ok: true });
}
