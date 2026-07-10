import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { entityTableFor } from "@/lib/admin/entities";
import { audit } from "@/lib/audit";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

// ── POST /api/admin/documents/[id]/links — attach to one more record ────────
// The org-match invariant (spec #2 Appendix B), enforced before insert:
// document and target are both read through the session client scoped to the
// caller's org, so a cross-tenant link can never be expressed.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as
    | { entity_type?: unknown; entity_id?: unknown }
    | null;
  const entityType = typeof body?.entity_type === "string" ? body.entity_type : "";
  const entityId = body?.entity_id;
  if (!entityType || !isUuid(entityId)) {
    return NextResponse.json({ error: "entity_type and entity_id are required" }, { status: 400 });
  }
  const table = entityTableFor(entityType);
  if (!table) {
    return NextResponse.json({ error: `Cannot link documents to "${entityType}"` }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const [{ data: doc }, { data: target }] = await Promise.all([
    supabase.from("documents").select("id").eq("id", params.id).eq("org_id", ctx.orgId).maybeSingle(),
    supabase.from(table).select("id").eq("id", entityId).eq("org_id", ctx.orgId).maybeSingle(),
  ]);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (!target) return NextResponse.json({ error: "Link target not found" }, { status: 404 });

  const { data: link, error } = await supabase
    .from("document_links")
    .insert({
      org_id: ctx.orgId,
      document_id: params.id,
      entity_type: entityType,
      entity_id: entityId,
      created_by: ctx.userId,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already linked to that record" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await audit(req, {
    action: "documents.link",
    entityType: "document",
    entityId: params.id,
    after: { entity_type: entityType, entity_id: entityId },
  });
  return NextResponse.json({ ok: true, link });
}

// ── DELETE /api/admin/documents/[id]/links?entity_type=…&entity_id=… ────────
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const entityType = req.nextUrl.searchParams.get("entity_type") ?? "";
  const entityId = req.nextUrl.searchParams.get("entity_id");
  if (!entityType || !isUuid(entityId)) {
    return NextResponse.json({ error: "entity_type and entity_id are required" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: deleted, error } = await supabase
    .from("document_links")
    .delete()
    .eq("document_id", params.id)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if ((deleted ?? []).length === 0) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  await audit(req, {
    action: "documents.unlink",
    entityType: "document",
    entityId: params.id,
    before: { entity_type: entityType, entity_id: entityId },
  });
  return NextResponse.json({ ok: true });
}
