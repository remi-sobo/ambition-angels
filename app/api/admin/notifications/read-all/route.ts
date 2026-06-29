import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";

/**
 * Mark all of the current user's unread notifications read. The session
 * client + update RLS policy scope the write to recipient_id = auth.uid(),
 * so the read_at IS NULL filter is the only WHERE we need.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createServerSupabase();
  const { error } = await sb
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (error) {
    console.error("[/api/admin/notifications/read-all] error:", error.message);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
