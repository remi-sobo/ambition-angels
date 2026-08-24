import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireComms } from "@/lib/comms/stories-server";
import { loadFormats } from "@/lib/comms/editions-server";
import { isCadence, parseSlots } from "@/lib/comms/formats";

/**
 * Formats (spec §6.1, §7.4a) — the reusable structure of a publication.
 *
 * GET seeds the four starters on an org's first visit, which is why the list
 * is never empty for someone who can actually use it.
 */

export async function GET() {
  const g = await requireComms();
  if (!g.ok) return g.res;
  const formats = await loadFormats(g.supabase, g.ctx.orgId, { seed: true });
  return NextResponse.json({ formats });
}

export async function POST(req: NextRequest) {
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase } = g;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "A format needs a name." }, { status: 400 });
  if (!isCadence(body.cadence)) {
    return NextResponse.json({ error: "Unknown cadence" }, { status: 400 });
  }

  let slots;
  try {
    slots = parseSlots(body.slots);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("comms_formats")
    .insert({ org_id: ctx.orgId, name: name.slice(0, 120), cadence: body.cadence, slots })
    .select("id, name, cadence, slots, is_archived, created_at")
    .single();
  if (error || !data) {
    console.error("[comms] format create failed:", error?.message);
    return NextResponse.json({ error: "Could not create that format." }, { status: 500 });
  }

  await audit(req, {
    action: "comms.format.create",
    entityType: "comms_format",
    entityId: data.id as string,
    after: { name, cadence: body.cadence, slots: slots.length },
  });
  return NextResponse.json({ ok: true, format: data });
}
