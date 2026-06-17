/**
 * POST /api/admin/strategy/funder-angles — add a funder to an angle's
 * shortlist. Accepts { angle_id, constituent_id } (from a picked search
 * result) or { angle_id, constituent_name } (match-or-create fallback, shared
 * with the opportunities route). Inserts at stage 'shortlist'. The unique
 * (constituent_id, angle_id) constraint blocks a double-add (→ 409). Never
 * writes the HubSpot mirror.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { resolveConstituent } from "@/lib/fundraising/constituent-resolve";

export const dynamic = "force-dynamic";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isUuid(body.angle_id)) {
    return NextResponse.json({ error: "angle_id is required" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const resolved = await resolveConstituent(supabase, {
    constituentId: body.constituent_id,
    name: body.constituent_name,
  });
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { data, error } = await supabase
    .from("funder_angles")
    .insert({
      angle_id: body.angle_id,
      constituent_id: resolved.constituentId,
      stage: "shortlist",
      created_by: (await getAdminUser()) ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "This funder is already on this angle." }, { status: 409 });
    }
    console.error("[funder-angles] insert failed:", error.message);
    return NextResponse.json({ error: "Could not add funder" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.funder_angle.create",
    entityType: "funder_angles",
    entityId: data.id,
    after: { angle_id: body.angle_id, constituent_id: resolved.constituentId },
  });

  return NextResponse.json({ id: data.id, warning: resolved.warning });
}
