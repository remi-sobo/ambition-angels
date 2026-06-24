/**
 * POST /api/admin/fundraising/prospects/promote — promote prospects from the
 * bench (fr_prospects) into the major-gift pipeline.
 *
 * For each prospect: resolve (or create) an internal constituent, open an
 * opportunity at the `identify` stage, and flip the bench row to
 * status='promoted' (recording the constituent + opportunity). The Prospects
 * list shows only active rows, so promoted ones "move" into the pipeline.
 *
 * Body: { prospect_ids: string[] } (or { prospect_id: string }).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";
import { resolveConstituent } from "@/lib/fundraising/constituent-resolve";
import { pushOpportunityToHubSpot } from "@/lib/hubspot/sync-out";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type ProspectRow = {
  id: string;
  name: string;
  status: string;
  constituent_id: string | null;
  opportunity_id: string | null;
};

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as
    | { prospect_ids?: unknown; prospect_id?: unknown }
    | null;
  const list = Array.isArray(body?.prospect_ids)
    ? body!.prospect_ids
    : typeof body?.prospect_id === "string"
    ? [body!.prospect_id]
    : [];
  const ids = list.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 100);
  if (ids.length === 0) return NextResponse.json({ error: "No prospect ids" }, { status: 400 });

  const supabase = createServerSupabase();
  const by = await getAdminUser();

  const { data: prospects } = await supabase
    .from("fr_prospects")
    .select("id, name, status, constituent_id, opportunity_id")
    .in("id", ids);

  let promoted = 0;
  const results: Array<{ id: string; opportunity_id?: string; skipped?: boolean; error?: string }> = [];

  for (const p of (prospects ?? []) as ProspectRow[]) {
    if (p.status === "promoted" && p.opportunity_id) {
      results.push({ id: p.id, opportunity_id: p.opportunity_id, skipped: true });
      continue;
    }

    const resolved = await resolveConstituent(supabase, {
      constituentId: p.constituent_id ?? undefined,
      name: p.name,
    });
    if ("error" in resolved) {
      results.push({ id: p.id, error: resolved.error });
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
      results.push({ id: p.id, error: "Could not open an opportunity" });
      continue;
    }

    await supabase
      .from("fr_prospects")
      .update({
        status: "promoted",
        constituent_id: constituentId,
        opportunity_id: opp.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", p.id);

    await audit(req, {
      action: "fundraising.prospect.promote",
      entityType: "opportunity",
      entityId: opp.id,
      after: { prospect_id: p.id, constituent_id: constituentId, stage: "identify" },
    });
    await pushOpportunityToHubSpot(opp.id).catch(() => {});

    promoted += 1;
    results.push({ id: p.id, opportunity_id: opp.id });
  }

  return NextResponse.json({ ok: true, promoted, results });
}
