import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";
import { isCadence, parseSlots } from "@/lib/comms/formats";

/** Create a format: a named, ordered set of slots (story-bank branch). */
export async function POST(req: NextRequest) {
  const gate = await requirePermission("comms.manage", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) return NextResponse.json({ error: "Name the format." }, { status: 400 });
  let slots;
  try {
    slots = parseSlots(body.slots ?? [{ label: "Main story", kind: "story", required: true }]);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Slots are malformed." }, { status: 400 });
  }
  const { data, error } = await getSupabaseAdmin()
    .from("comms_formats")
    .insert({ org_id: ctx.orgId, name, cadence: isCadence(body.cadence) ? body.cadence : "adhoc", slots })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: "Could not save the format." }, { status: 500 });
  await audit(req, { action: "comms.format.create", entityType: "comms_format", entityId: data.id as string, after: { name } });
  return NextResponse.json({ ok: true, id: data.id });
}
