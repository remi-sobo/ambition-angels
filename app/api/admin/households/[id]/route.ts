import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const uuidArr = (v: unknown): string[] =>
  Array.isArray(v) ? Array.from(new Set(v.filter(isUuid))) : [];

// PATCH (rename / salutation / add+remove members) and DELETE a household.
// Deleting detaches its members automatically — constituents.household_id is
// FK ON DELETE SET NULL.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (typeof body.salutation === "string") update.salutation = body.salutation.trim() || null;
  const addIds = uuidArr(body.add_member_ids);
  const removeIds = uuidArr(body.remove_member_ids);

  if (Object.keys(update).length === 0 && addIds.length === 0 && removeIds.length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = createServerSupabase();

  // Confirm the household is visible to the caller (RLS scopes reads to the
  // org). Without this, a rename of a foreign household would no-op and still
  // 200, and an add could point a constituent at another org's household.
  const { data: hh } = await supabase
    .from("households")
    .select("id")
    .eq("id", params.id)
    .maybeSingle();
  if (!hh) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from("households").update(update).eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Adds: validate org membership the same way the create route does, then
  // point each at this household.
  if (addIds.length > 0) {
    const { data: owned, error: vErr } = await supabase
      .from("constituents")
      .select("id")
      .in("id", addIds);
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
    const ownedIds = new Set((owned ?? []).map((r) => (r as { id: string }).id));
    const rejected = addIds.filter((id) => !ownedIds.has(id));
    if (rejected.length > 0) {
      return NextResponse.json(
        { error: "Some members are not in your organization", rejected },
        { status: 422 }
      );
    }
    const { error } = await supabase
      .from("constituents")
      .update({ household_id: params.id })
      .in("id", addIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Removes: only detach constituents currently in THIS household, so a stray
  // id can't strip someone's membership elsewhere. Last-member removal leaves
  // an empty household row for v1 (see spec open decision #2).
  if (removeIds.length > 0) {
    const { error } = await supabase
      .from("constituents")
      .update({ household_id: null })
      .in("id", removeIds)
      .eq("household_id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.household.update",
    entityType: "households",
    entityId: params.id,
    after: { ...update, add_member_ids: addIds, remove_member_ids: removeIds },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const supabase = createServerSupabase();
  const { error } = await supabase.from("households").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(req, {
    action: "fundraising.household.delete",
    entityType: "households",
    entityId: params.id,
  });
  return NextResponse.json({ ok: true });
}
