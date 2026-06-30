/**
 * PUT /api/admin/strategy/room-meta — upsert the Strategy Room presentation
 * copy (hero, stat chips, "this year" block) for the caller's org. One row per
 * org. Session client + RLS (fundraising.write) is the write gate; org_id comes
 * from the session, never the client.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

function toPairs(v: unknown, a: string, b: string, aMax: number, bMax: number): { [k: string]: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({ [a]: text(x[a], aMax), [b]: text(x[b], bMax) }))
    .filter((row) => row[a] || row[b])
    .slice(0, 12);
}

export async function PUT(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const row = {
    org_id: ctx.orgId,
    eyebrow: text(body.eyebrow, 200),
    headline: text(body.headline, 200),
    headline_accent: text(body.headline_accent, 200),
    subtitle: text(body.subtitle, 2000),
    stats: toPairs(body.stats, "value", "label", 40, 120),
    this_year_heading: text(body.this_year_heading, 200),
    year_intro: text(body.year_intro, 2000),
    this_year: toPairs(body.this_year, "label", "body", 80, 1000),
  };

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("strategy_room_meta")
    .upsert(row, { onConflict: "org_id" });
  if (error) {
    console.error("[strategy/room-meta] upsert failed:", error.message);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.strategy_room_meta.update",
    entityType: "strategy_room_meta",
    entityId: ctx.orgId,
    after: row,
  });
  return NextResponse.json({ ok: true });
}
