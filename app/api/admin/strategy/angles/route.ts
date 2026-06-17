/**
 * POST /api/admin/strategy/angles — create a new funding angle. Slugifies the
 * name into `key`, appends after the last angle by sort_order. The resident-org
 * default + RLS apply; org_id is not accepted from the client.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const BADGES = [
  "north-star", "proven", "building", "reframed",
  "productizing", "core-thesis", "new", "emerging-stub",
];

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = str(body?.name);
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const key = slugify(name);
  if (!key) return NextResponse.json({ error: "name must contain letters or numbers" }, { status: 400 });

  const badge = str(body?.status_badge);
  if (badge && !BADGES.includes(badge)) {
    return NextResponse.json({ error: "invalid status_badge" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: last } = await supabase
    .from("strategy_angles")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = ((last?.sort_order as number | undefined) ?? 0) + 1;

  const { data, error } = await supabase
    .from("strategy_angles")
    .insert({
      key,
      name,
      status_badge: badge,
      hook: str(body?.hook),
      funds: str(body?.funds),
      want: str(body?.want),
      ask: str(body?.ask),
      approach: str(body?.approach),
      sort_order: sortOrder,
    })
    .select("id, key")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "An angle with that name already exists." }, { status: 409 });
    }
    console.error("[strategy/angles] insert failed:", error.message);
    return NextResponse.json({ error: "Could not create angle" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.strategy_angle.create",
    entityType: "strategy_angles",
    entityId: data.id,
    after: { key: data.key, name },
  });

  return NextResponse.json({ id: data.id, key: data.key });
}
