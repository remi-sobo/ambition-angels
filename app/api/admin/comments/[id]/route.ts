import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";

/**
 * Soft-delete one comment (hide, don't hard-delete). The RLS write policy
 * gates this to members with comments.write in the row's org; the extra
 * author_id filter enforces author-only delete in the app layer (RLS itself
 * is org-shared per spec).
 */
export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const sb = createServerSupabase();
  const now = new Date().toISOString();
  const { error } = await sb
    .from("entity_comments")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", params.id)
    .eq("author_id", ctx.userId)
    .is("deleted_at", null);

  if (error) {
    console.error("[/api/admin/comments/:id DELETE] error:", error.message);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
