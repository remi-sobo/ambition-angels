import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";

// PATCH /api/admin/finance/rules/:id — partial update for an existing rule.
// Most commonly used to toggle enabled, bump priority, or rewrite pattern.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if ("pattern" in body && typeof body.pattern === "string") {
    update.pattern = body.pattern.trim();
  }
  if (
    "pattern_type" in body &&
    ["contains", "starts_with", "regex"].includes(body.pattern_type as string)
  ) {
    update.pattern_type = body.pattern_type;
  }
  if ("category_id" in body && typeof body.category_id === "string") {
    update.category_id = body.category_id;
  }
  if ("restricted" in body && typeof body.restricted === "boolean") {
    update.restricted = body.restricted;
  }
  if ("priority" in body && typeof body.priority === "number") {
    update.priority = body.priority;
  }
  if ("enabled" in body && typeof body.enabled === "boolean") {
    update.enabled = body.enabled;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("fin_category_rules")
    .update(update)
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, rule: data });
}

// DELETE /api/admin/finance/rules/:id — remove the rule. Doesn't recategor-
// ize transactions that already matched it; the database has already taken
// the decision. The user can run "Apply to uncategorized" if they want to
// re-run rules from scratch after disabling and editing.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("fin_category_rules").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
