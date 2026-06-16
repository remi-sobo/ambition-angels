import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const strArr = (v: unknown): string[] | undefined =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean)
    : undefined;

// PATCH /api/admin/constituents/[id] — edit a donor record. Partial: only the
// fields present in the body change. Arrays (emails/phones/tags) replace.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (body.type === "person" || body.type === "organization") update.type = body.type;
  for (const f of ["first_name", "last_name", "org_name", "street", "city", "state", "postal_code", "notes"] as const) {
    if (typeof body[f] === "string") update[f] = (body[f] as string).trim() || null;
  }
  const emails = strArr(body.emails);
  if (emails) update.emails = emails;
  const phones = strArr(body.phones);
  if (phones) update.phones = phones;
  const tags = strArr(body.tags);
  if (tags) update.tags = tags;
  if (typeof body.do_not_contact === "boolean") update.do_not_contact = body.do_not_contact;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.from("constituents").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(req, {
    action: "fundraising.constituent.update",
    entityType: "constituents",
    entityId: params.id,
    after: update,
  });
  return NextResponse.json({ ok: true });
}
