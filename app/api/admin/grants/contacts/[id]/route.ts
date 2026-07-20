import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { removeGrantContact, updateGrantContact } from "@/lib/fundraising/grantContacts";

// PATCH /api/admin/grants/contacts/:id — edit a contact link's role/notes or
// flip primary (the data layer demotes the old primary first; the partial
// unique index enforces one primary per grant either way).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const patch: { role?: string | null; isPrimary?: boolean; notes?: string | null } = {};
  if ("role" in body) {
    const v = body.role;
    if (v === null || v === "") patch.role = null;
    else if (typeof v === "string") patch.role = v.slice(0, 120);
  }
  if ("notes" in body) {
    const v = body.notes;
    if (v === null || v === "") patch.notes = null;
    else if (typeof v === "string") patch.notes = v.slice(0, 1000);
  }
  if (typeof body.is_primary === "boolean") patch.isPrimary = body.is_primary;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const result = await updateGrantContact(supabase, params.id, patch);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }

  await audit(req, {
    action: "fundraising.grant_contact.update",
    entityType: "grant_contacts",
    entityId: params.id,
    after: patch,
  });
  return NextResponse.json({ ok: true, contact: result.contact });
}

// DELETE /api/admin/grants/contacts/:id — unlink the person from the grant.
// The constituent record itself is never deleted.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = createServerSupabase();
  const result = await removeGrantContact(supabase, params.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  if (result.removed) {
    await audit(req, {
      action: "fundraising.grant_contact.delete",
      entityType: "grant_contacts",
      entityId: params.id,
    });
  }
  return NextResponse.json({ ok: true });
}
