import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { pushConstituentToHubSpot } from "@/lib/hubspot/sync-out";

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
  // Soft archive: hide from working lists/queues while keeping all history.
  if (typeof body.archived === "boolean")
    update.archived_at = body.archived ? new Date().toISOString() : null;
  // Household membership: a uuid joins, explicit null leaves.
  if (isUuid(body.household_id)) update.household_id = body.household_id;
  else if (body.household_id === null) update.household_id = null;

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

  // Outbound sync to a connected HubSpot (no-op when standalone).
  await pushConstituentToHubSpot(params.id);

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/constituents/[id] — hard delete, allowed ONLY for records
// with no financial footprint (no gifts, no grants as funder). Those have
// gifts ON DELETE SET NULL, so deleting would orphan giving as anonymous — for
// them the caller must archive or merge instead (409). Opportunities,
// interactions, soft credits cascade away cleanly.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const supabase = createServerSupabase();
  const [giftsCount, grantsCount] = await Promise.all([
    supabase.from("gifts").select("id", { count: "exact", head: true }).eq("constituent_id", params.id),
    supabase.from("grants").select("id", { count: "exact", head: true }).eq("funder_id", params.id),
  ]);
  const gifts = giftsCount.count ?? 0;
  const grants = grantsCount.count ?? 0;
  if (gifts > 0 || grants > 0) {
    return NextResponse.json(
      {
        error: "Has financial history — archive or merge instead of deleting.",
        gift_count: gifts,
        grant_count: grants,
      },
      { status: 409 }
    );
  }

  const { data: before } = await supabase
    .from("constituents")
    .select("id, first_name, last_name, org_name, type")
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("constituents").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(req, {
    action: "fundraising.constituent.delete",
    entityType: "constituents",
    entityId: params.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
