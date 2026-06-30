import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";

/**
 * Mark one notification read. Writes through the SESSION client so the
 * notifications update policy (recipient_id = auth.uid()) enforces you can
 * only ever mark your own — no ownership check is needed in app code.
 */
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const sb = createServerSupabase();
  const { error } = await sb
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", params.id)
    .is("read_at", null); // idempotent: don't re-stamp an already-read row

  if (error) {
    console.error("[/api/admin/notifications/:id/read] error:", error.message);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
