import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import type { FollowUpStatus } from "@/lib/meetings/types";

const FOLLOW_UP_STATUSES: FollowUpStatus[] = [
  "needs_follow_up",
  "has_follow_up",
  "none_needed",
  "dismissed",
];

// PATCH /api/admin/meetings/[id] — curated human state on a meeting record:
// follow-up status (e.g. "none needed") and title. Org-scoped explicitly.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if ("follow_up_status" in body) {
    if (!FOLLOW_UP_STATUSES.includes(body.follow_up_status as FollowUpStatus)) {
      return NextResponse.json({ error: "follow_up_status is invalid" }, { status: 400 });
    }
    updates.follow_up_status = body.follow_up_status;
  }
  if ("title" in body) {
    if (body.title !== null && typeof body.title !== "string") {
      return NextResponse.json({ error: "title must be a string or null" }, { status: 400 });
    }
    updates.title = body.title;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No supported fields" }, { status: 400 });
  }
  updates.updated_at = new Date().toISOString();

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("meeting_records")
    .update(updates)
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("[meetings/:id PATCH] error:", error.message);
    return NextResponse.json({ error: "Failed to update meeting" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ meeting: data });
}
