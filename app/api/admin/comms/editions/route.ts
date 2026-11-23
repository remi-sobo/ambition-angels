import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";
import { createEdition, loadFormats } from "@/lib/admin/comms/editions-server";
import { editionTitleFor } from "@/lib/comms/formats";

/**
 * Create an edition from a format (story-bank branch, onto requirePermission
 * and the service-role client with an org pin). The format's slots are
 * snapshotted onto the edition, so a later format edit never reaches back.
 */

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isISODate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: NextRequest) {
  const gate = await requirePermission("comms.manage", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const db = getSupabaseAdmin();
  let formatId = isUuid(body.format_id) ? body.format_id : null;
  if (!formatId) {
    // First visit: seed the starter formats and default to the first.
    const formats = await loadFormats(db, ctx.orgId, { seed: true });
    formatId = formats.find((f) => !f.is_archived)?.id ?? null;
  }
  if (!formatId) return NextResponse.json({ error: "Pick a format." }, { status: 400 });
  const { data: format } = await db
    .from("comms_formats")
    .select("id, name")
    .eq("id", formatId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!format) return NextResponse.json({ error: "Format not found" }, { status: 404 });

  const target = isISODate(body.target_date) ? body.target_date : null;
  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 200)
      : editionTitleFor(format.name as string, target ?? new Date().toISOString().slice(0, 10));
  const subject = typeof body.subject === "string" && body.subject.trim() ? body.subject.trim().slice(0, 200) : null;

  const res = await createEdition(db, ctx.orgId, { formatId, title, targetDate: target, subject });
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 500 });
  await audit(req, { action: "comms.edition.create", entityType: "comms_edition", entityId: res.id, after: { title, format_id: formatId } });
  return NextResponse.json({ ok: true, id: res.id });
}
