/**
 * POST /api/admin/strategy/angles — create a new funding/framing angle.
 * Slugifies the name into `key`, appends after the last angle by sort_order.
 * Accepts the full framing shape (hook…flag) so a Reed-drafted angle can be
 * created complete. The resident-org default + RLS apply; org_id is not
 * accepted from the client.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import {
  ANGLE_BADGES,
  ANGLE_TONES,
  ANGLE_TEXT_FIELDS,
  angleFieldMax,
  angleStr,
  slugifyAngle,
} from "@/lib/admin/strategy/angle-fields";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = angleStr(body?.name, 300);
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const key = slugifyAngle(name);
  if (!key) return NextResponse.json({ error: "name must contain letters or numbers" }, { status: 400 });

  const badge = angleStr(body?.status_badge);
  if (badge && !ANGLE_BADGES.includes(badge as (typeof ANGLE_BADGES)[number])) {
    return NextResponse.json({ error: "invalid status_badge" }, { status: 400 });
  }
  const tone = angleStr(body?.tone);
  if (tone && !ANGLE_TONES.includes(tone as (typeof ANGLE_TONES)[number])) {
    return NextResponse.json({ error: "invalid tone" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: last } = await supabase
    .from("strategy_angles")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = ((last?.sort_order as number | undefined) ?? 0) + 1;

  const insert: Record<string, unknown> = {
    key,
    name,
    status_badge: badge,
    tone,
    sort_order: sortOrder,
  };
  for (const f of ANGLE_TEXT_FIELDS) insert[f] = angleStr(body?.[f], angleFieldMax(f));

  const { data, error } = await supabase
    .from("strategy_angles")
    .insert(insert)
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
