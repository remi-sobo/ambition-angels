/**
 * Per-interaction controls for the Constituent 360 timeline (Phase 1C.c).
 *
 * PATCH { is_private: boolean } toggles whether a logged email (or other
 * interaction) shows on the profile. Durable against the Gmail re-sync: the
 * sync upserts with ignoreDuplicates, so an existing row's is_private is never
 * overwritten. (Unlink/reassign is intentionally not offered here — matching is
 * by verified email, so the correct fix for a bad attach is the constituent's
 * email, and a null constituent_id would both violate NOT NULL and resurrect on
 * the next sync.)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { is_private?: unknown };
  if (typeof body.is_private !== "boolean") {
    return NextResponse.json({ error: "is_private (boolean) required" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("interactions")
    .update({ is_private: body.is_private })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
