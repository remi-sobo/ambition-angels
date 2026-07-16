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
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { resolveConstituent } from "@/lib/fundraising/constituent-resolve";
import { promoteHsContact } from "@/lib/fundraising/promote-hs-contact";
import { linkProspectToAngle } from "@/lib/fundraising/link-prospect-angle";

export const dynamic = "force-dynamic";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isUuid(body.angle_id)) {
    return NextResponse.json({ error: "angle_id is required" }, { status: 400 });
  }

  const supabase = createServerSupabase();

  // Bench prospect → angle (the unified path): ensure a constituent + link.
  if (isUuid(body.prospect_id)) {
    const r = await linkProspectToAngle(supabase, ctx.orgId, body.prospect_id, body.angle_id, (await getAdminUser()) ?? null);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    if ("skipped" in r) return NextResponse.json({ error: "Already on this angle." }, { status: 409 });
    return NextResponse.json({ id: r.id });
  }

  // A mirror-only prospect joins by hubspot_id (promote to the spine first);
  // otherwise resolve a picked constituent or a free-text name.
  let constituentId: string;
  let warning: string | undefined;
  if (typeof body.hubspot_id === "string" && body.hubspot_id.trim()) {
    const promoted = await promoteHsContact(supabase, ctx.orgId, body.hubspot_id);
    if ("error" in promoted) {
      return NextResponse.json({ error: promoted.error }, { status: promoted.status });
    }
    constituentId = promoted.constituentId;
  } else {
    const resolved = await resolveConstituent(supabase, ctx.orgId, {
      constituentId: body.constituent_id,
      name: body.constituent_name,
    });
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    constituentId = resolved.constituentId;
    warning = resolved.warning;
  }

  const { data, error } = await supabase
    .from("funder_angles")
    .insert({
      org_id: ctx.orgId,
      angle_id: body.angle_id,
      constituent_id: constituentId,
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
    after: { angle_id: body.angle_id, constituent_id: constituentId },
  });

  return NextResponse.json({ id: data.id, warning });
}
