import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";

/**
 * Unread badge feed for the sidebar. Uses the SESSION client so the
 * notifications read policy (recipient_id = auth.uid() AND notifications.read)
 * scopes the count to the current user automatically — no recipient filter
 * is passed here, and none should be.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createServerSupabase();
  const { count, error } = await sb
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  if (error) {
    console.error("[/api/admin/notifications/unread-count] error:", error.message);
    return NextResponse.json({ count: 0 });
  }

  return NextResponse.json({ count: count ?? 0 });
}
