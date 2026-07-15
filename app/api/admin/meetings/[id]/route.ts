import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { excludeSeries, seriesKey } from "@/lib/meetings/exclusions";
import type { FollowUpStatus } from "@/lib/meetings/types";

const FOLLOW_UP_STATUSES: FollowUpStatus[] = [
  "needs_follow_up",
  "has_follow_up",
  "none_needed",
  "dismissed",
];

// PATCH /api/admin/meetings/[id] — curated human state on a meeting record:
// follow-up status (e.g. "none needed") and title. Org-scoped explicitly.
// With apply_to_series: true (status none_needed/dismissed only), the whole
// calendar series is excluded from the follow-up loop — existing open records
// are swept to the same status and future instances never create records.
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
  const applyToSeries = body.apply_to_series === true;
  if (
    applyToSeries &&
    updates.follow_up_status !== "none_needed" &&
    updates.follow_up_status !== "dismissed"
  ) {
    return NextResponse.json(
      { error: "apply_to_series requires follow_up_status none_needed or dismissed" },
      { status: 400 }
    );
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

  // Series exclusion: derive the stable key from the linked calendar event and
  // hand off to the exclusion sweep (idempotent).
  let seriesExcluded = false;
  const rec = data as { owner_user_id: string; calendar_event_id: string | null; title: string | null };
  if (applyToSeries && rec.calendar_event_id) {
    const { data: ev } = await sb
      .from("calendar_events")
      .select("google_event_id, recurring_event_id, title")
      .eq("id", rec.calendar_event_id)
      .eq("org_id", ctx.orgId)
      .maybeSingle();
    const evRow = ev as {
      google_event_id: string | null;
      recurring_event_id: string | null;
      title: string | null;
    } | null;
    const key = evRow ? seriesKey(evRow) : null;
    if (key) {
      try {
        await excludeSeries(sb, {
          orgId: ctx.orgId,
          ownerUserId: rec.owner_user_id,
          key,
          title: evRow?.title ?? rec.title,
          status: updates.follow_up_status as "none_needed" | "dismissed",
        });
        seriesExcluded = true;
      } catch (e) {
        console.error("[meetings/:id PATCH] series exclusion failed:", e);
      }
    }
  }

  return NextResponse.json({ meeting: data, series_excluded: seriesExcluded });
}
