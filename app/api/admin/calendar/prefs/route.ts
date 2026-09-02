import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";

// Working-hours preferences for the week grid (calendar_prefs). Session
// client: the table's RLS is self-only + membership-bound, so a user can only
// ever touch their own row, in their active org.

function minuteField(v: unknown, lo: number, hi: number): number | null {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) return null;
  return n;
}

export async function PATCH(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const patch: Record<string, number> = {};
  if ("day_start_minute" in body) {
    const v = minuteField(body.day_start_minute, 0, 1439);
    if (v === null) return NextResponse.json({ error: "day_start_minute must be 0..1439" }, { status: 400 });
    patch.day_start_minute = v;
  }
  if ("day_end_minute" in body) {
    const v = minuteField(body.day_end_minute, 1, 1440);
    if (v === null) return NextResponse.json({ error: "day_end_minute must be 1..1440" }, { status: 400 });
    patch.day_end_minute = v;
  }
  if ("default_block_minute" in body) {
    const v = minuteField(body.default_block_minute, 15, 1440);
    if (v === null) return NextResponse.json({ error: "default_block_minute must be 15..1440" }, { status: 400 });
    patch.default_block_minute = v;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Upsert against current values so a partial patch can't invert the window.
  const sb = createServerSupabase();
  const { data: existing } = await sb
    .from("calendar_prefs")
    .select("day_start_minute, day_end_minute")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const start = patch.day_start_minute ?? (existing?.day_start_minute as number | undefined) ?? 540;
  const end = patch.day_end_minute ?? (existing?.day_end_minute as number | undefined) ?? 1020;
  if (end <= start) {
    return NextResponse.json({ error: "Day must end after it starts" }, { status: 400 });
  }

  const { error } = await sb.from("calendar_prefs").upsert(
    {
      user_id: ctx.userId,
      org_id: ctx.orgId,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) {
    console.error("[calendar/prefs PATCH] failed:", error.message);
    return NextResponse.json({ error: "Couldn't save preferences" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
