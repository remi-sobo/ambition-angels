import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const KINDS = ["call", "email", "meeting", "event", "note"] as const;

// Log a partner touch (call / email / meeting / note). Also bumps the
// org's last_touch_at so cadence health stays accurate — the same gesture
// "Log touch" used to do, now with a typed, timelined record.
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const partnerId = typeof body?.partner_id === "string" ? body.partner_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(partnerId)) {
    return NextResponse.json({ error: "Valid partner_id required" }, { status: 400 });
  }
  const kind = KINDS.includes(body?.kind as (typeof KINDS)[number])
    ? (body!.kind as string)
    : "note";

  const insert: Record<string, unknown> = { partner_id: partnerId, kind };
  if (typeof body?.contact_id === "string" && /^[0-9a-f-]{36}$/i.test(body.contact_id))
    insert.contact_id = body.contact_id;
  if (typeof body?.notes === "string" && body.notes.trim())
    insert.notes = body.notes.trim().slice(0, 4000);
  // occurred_at: accept a calendar day (anchored at noon) or default to now.
  if (typeof body?.occurred_at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.occurred_at))
    insert.occurred_at = `${body.occurred_at}T12:00:00Z`;
  insert.logged_by = (await getAdminUser()) ?? null;

  const supabase = getSupabaseAdmin();
  const { data: partner } = await supabase
    .from("partners").select("org_id").eq("id", partnerId).maybeSingle();
  if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  insert.org_id = partner.org_id;

  const { data, error } = await supabase
    .from("partner_interactions").insert(insert).select("id, occurred_at").single();
  if (error || !data) {
    console.error("Log partner interaction failed:", error?.message);
    return NextResponse.json({ error: "Log failed" }, { status: 500 });
  }

  // Keep the org touch-date in sync (only move it forward).
  const day = (data.occurred_at as string).slice(0, 10);
  await supabase
    .from("partners")
    .update({ last_touch_at: day })
    .eq("id", partnerId)
    .or(`last_touch_at.is.null,last_touch_at.lt.${day}`);

  await audit(req, {
    action: "program.partner_interaction.create",
    entityType: "partner_interaction",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
