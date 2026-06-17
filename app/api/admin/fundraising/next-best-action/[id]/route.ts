/**
 * PATCH /api/admin/fundraising/next-best-action/:id — record the disposition of
 * a persisted NBA suggestion. { status: 'applied' | 'dismissed' }. Applying the
 * actual move (setting the opportunity's next_step) goes through the
 * opportunities PATCH route separately; this only stamps follow-through.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { status?: unknown };
  if (body.status !== "applied" && body.status !== "dismissed") {
    return NextResponse.json({ error: "status must be 'applied' or 'dismissed'" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("fr_nba_suggestions")
    .update({ status: body.status, decided_at: new Date().toISOString(), decided_by: await getAdminUser() })
    .eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
