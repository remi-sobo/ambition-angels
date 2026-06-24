/**
 * POST /api/admin/fundraising/prospects/promote — promote one or more prospects
 * from the HubSpot-mirror Prospects list into the major-gift pipeline.
 *
 * For each contact we resolve (or create) an internal constituent, open an
 * opportunity at the `identify` stage, and record the promotion in
 * fr_prospect_promoted so the Prospects list filters them out — they've "moved"
 * into the pipeline. Mirrors the disqualify suppression-set pattern; never
 * touches the read-only mirror.
 *
 * Body: { hubspot_ids: string[] } (or { hubspot_id: string }).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { resolveConstituent } from "@/lib/fundraising/constituent-resolve";
import { pushOpportunityToHubSpot } from "@/lib/hubspot/sync-out";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type ContactRow = {
  hubspot_id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  email: string | null;
};

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as
    | { hubspot_ids?: unknown; hubspot_id?: unknown }
    | null;
  const list = Array.isArray(body?.hubspot_ids)
    ? body!.hubspot_ids
    : typeof body?.hubspot_id === "string"
    ? [body!.hubspot_id]
    : [];
  const ids = list.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 100);
  if (ids.length === 0) return NextResponse.json({ error: "No hubspot ids" }, { status: 400 });

  const supabase = createServerSupabase();
  const by = await getAdminUser();
  const ctx = await getOrgContext();

  const [{ data: contacts }, { data: alreadyRows }] = await Promise.all([
    supabase.from("hs_contacts").select("hubspot_id, first_name, last_name, company, email").in("hubspot_id", ids),
    supabase.from("fr_prospect_promoted").select("hubspot_id").in("hubspot_id", ids),
  ]);
  const already = new Set((alreadyRows ?? []).map((r) => r.hubspot_id as string));

  let promoted = 0;
  const results: Array<{ hubspot_id: string; opportunity_id?: string; skipped?: boolean; error?: string }> = [];

  for (const c of (contacts ?? []) as ContactRow[]) {
    if (already.has(c.hubspot_id)) {
      results.push({ hubspot_id: c.hubspot_id, skipped: true });
      continue;
    }
    const name =
      [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.company || c.email || "Unknown prospect";

    const resolved = await resolveConstituent(supabase, { name });
    if ("error" in resolved) {
      results.push({ hubspot_id: c.hubspot_id, error: resolved.error });
      continue;
    }
    const constituentId = resolved.constituentId;

    const { data: opp, error: oppErr } = await supabase
      .from("opportunities")
      .insert({ constituent_id: constituentId, stage: "identify", owner: by ?? null })
      .select("id")
      .single();
    if (oppErr || !opp) {
      console.error("[prospects/promote] opportunity insert failed:", oppErr?.message);
      results.push({ hubspot_id: c.hubspot_id, error: "Could not open an opportunity" });
      continue;
    }

    await supabase.from("fr_prospect_promoted").upsert(
      {
        hubspot_id: c.hubspot_id,
        org_id: ctx?.orgId ?? null,
        constituent_id: constituentId,
        opportunity_id: opp.id,
        promoted_by: by,
      },
      { onConflict: "hubspot_id" }
    );

    await audit(req, {
      action: "fundraising.prospect.promote",
      entityType: "opportunity",
      entityId: opp.id,
      after: { hubspot_id: c.hubspot_id, constituent_id: constituentId, stage: "identify" },
    });
    await pushOpportunityToHubSpot(opp.id).catch(() => {});

    promoted += 1;
    results.push({ hubspot_id: c.hubspot_id, opportunity_id: opp.id });
  }

  return NextResponse.json({ ok: true, promoted, results });
}
