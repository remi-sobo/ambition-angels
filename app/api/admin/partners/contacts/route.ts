import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// Create a contact under a partner org (the "partner tag as a contact"
// people — many per org). Mirrors the constituent create path.
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const partnerId = typeof body?.partner_id === "string" ? body.partner_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(partnerId)) {
    return NextResponse.json({ error: "Valid partner_id required" }, { status: 400 });
  }

  const insert: Record<string, unknown> = { partner_id: partnerId };
  const str = (v: unknown, n = 120) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined;
  insert.first_name = str(body?.first_name) ?? null;
  insert.last_name = str(body?.last_name) ?? null;
  insert.title = str(body?.title) ?? null;
  insert.phone = str(body?.phone, 60) ?? null;
  if (typeof body?.email === "string" && body.email.includes("@"))
    insert.email = body.email.trim().toLowerCase().slice(0, 200);
  if (typeof body?.notes === "string" && body.notes.trim())
    insert.notes = body.notes.trim().slice(0, 2000);
  if (Array.isArray(body?.tags))
    insert.tags = (body!.tags as unknown[])
      .filter((t): t is string => typeof t === "string" && !!t.trim())
      .map((t) => t.trim().slice(0, 40))
      .slice(0, 12);
  if (body?.is_primary === true) insert.is_primary = true;

  if (!insert.first_name && !insert.last_name && !insert.email) {
    return NextResponse.json({ error: "A name or email is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  // A partner's org_id scopes the contact (RLS). Pull it from the partner.
  // Org fence: service-role client bypasses RLS — scope to the caller's org.
  const { data: partner } = await supabase
    .from("partners").select("org_id").eq("org_id", ctx.orgId).eq("id", partnerId).maybeSingle();
  if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  insert.org_id = partner.org_id;

  // First contact on an org becomes primary automatically.
  if (insert.is_primary !== true) {
    const { count } = await supabase
      .from("partner_contacts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .eq("partner_id", partnerId);
    if ((count ?? 0) === 0) insert.is_primary = true;
  }

  const { data, error } = await supabase
    .from("partner_contacts").insert(insert).select("id").single();
  if (error || !data) {
    console.error("Create partner contact failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  await audit(req, {
    action: "program.partner_contact.create",
    entityType: "partner_contact",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
