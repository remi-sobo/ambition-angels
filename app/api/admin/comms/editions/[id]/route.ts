import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";

/** Rename an edition, set its subject line or date, or archive it. A sent
 *  edition is the record of what went out and is not edited. */

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isISODate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const gate = await requirePermission("comms.manage", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (typeof body.title === "string") {
    if (!body.title.trim()) return NextResponse.json({ error: "A title is required." }, { status: 400 });
    update.title = body.title.trim().slice(0, 200);
  }
  if ("subject" in body) update.subject = typeof body.subject === "string" && body.subject.trim() ? body.subject.trim().slice(0, 200) : null;
  if ("target_date" in body) {
    if (body.target_date === null || body.target_date === "") update.target_date = null;
    else if (isISODate(body.target_date)) update.target_date = body.target_date;
    else return NextResponse.json({ error: "target_date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (body.archive === true) update.status = "archived";
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: ed } = await db.from("comms_editions").select("status").eq("id", params.id).eq("org_id", ctx.orgId).maybeSingle();
  if (!ed) return NextResponse.json({ error: "Edition not found" }, { status: 404 });
  if (ed.status === "sent") return NextResponse.json({ error: "This edition has already gone out." }, { status: 409 });
  const { error } = await db.from("comms_editions").update(update).eq("id", params.id).eq("org_id", ctx.orgId);
  if (error) return NextResponse.json({ error: "Could not save the edition." }, { status: 500 });
  await audit(req, { action: "comms.edition.update", entityType: "comms_edition", entityId: params.id, after: update });
  return NextResponse.json({ ok: true });
}
