import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { addGrantContact, findOrCreatePersonContact } from "@/lib/fundraising/grantContacts";

// POST /api/admin/grants/:id/contacts — attach a person to the grant. Either
// an existing person constituent (constituent_id) or a new one typed inline
// (first_name [+ last_name/email], find-or-created by email so the CRM stays
// deduped). Mirrors the requirements route: session client, RLS-governed.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid grant id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const supabase = createServerSupabase();

  let constituentId =
    typeof body.constituent_id === "string" && /^[0-9a-f-]{36}$/i.test(body.constituent_id)
      ? body.constituent_id
      : "";
  if (!constituentId) {
    const firstName = typeof body.first_name === "string" ? body.first_name.trim().slice(0, 120) : "";
    if (!firstName) {
      return NextResponse.json(
        { error: "Pick an existing person or type a name for a new one." },
        { status: 400 }
      );
    }
    const person = await findOrCreatePersonContact(supabase, ctx.orgId, {
      firstName,
      lastName: typeof body.last_name === "string" ? body.last_name.trim().slice(0, 120) : undefined,
      email:
        typeof body.email === "string" && body.email.includes("@")
          ? body.email.trim().slice(0, 200)
          : undefined,
    });
    if ("error" in person) return NextResponse.json({ error: person.error }, { status: 500 });
    constituentId = person.id;
  }

  const result = await addGrantContact(supabase, ctx.orgId, {
    grantId: params.id,
    constituentId,
    role: typeof body.role === "string" ? body.role.slice(0, 120) : null,
    isPrimary: body.is_primary === true,
    notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : null,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }

  await audit(req, {
    action: "fundraising.grant_contact.create",
    entityType: "grant_contacts",
    entityId: result.contact.id,
    after: {
      grant_id: params.id,
      constituent_id: constituentId,
      role: result.contact.role,
      is_primary: result.contact.is_primary,
    },
  });
  return NextResponse.json({ ok: true, contact: result.contact });
}
