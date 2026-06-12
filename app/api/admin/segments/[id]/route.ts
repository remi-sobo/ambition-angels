import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("segments")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("segments").delete().eq("id", params.id);
  if (error) {
    console.error("Delete segment failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await audit(req, {
    action: "fundraising.segment.delete",
    entityType: "segment",
    entityId: params.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
