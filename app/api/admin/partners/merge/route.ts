import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// Merge one partner org into another (dedupe the near-duplicates the import
// left behind, e.g. "EOYDC" vs "East Oakland Youth Development Center").
// The `merge_id` org is absorbed into `keep_id`: contacts + interactions
// move over, blank fields fill in, the further-along stage wins, then the
// merged org is deleted.

// Stage advancement rank (lapsed is treated as the lowest).
const RANK: Record<string, number> = {
  lapsed: -1, prospect: 0, outreach: 1, pilot: 2, active: 3, anchor: 4,
};

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const keepId = typeof body?.keep_id === "string" ? body.keep_id : "";
  const mergeId = typeof body?.merge_id === "string" ? body.merge_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(keepId) || !/^[0-9a-f-]{36}$/i.test(mergeId)) {
    return NextResponse.json({ error: "Valid keep_id and merge_id required" }, { status: 400 });
  }
  if (keepId === mergeId) {
    return NextResponse.json({ error: "Cannot merge an org into itself" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  // Org fence: service-role client bypasses RLS — scope to the caller's org.
  const { data: rows } = await supabase
    .from("partners").select("*").eq("org_id", ctx.orgId).in("id", [keepId, mergeId]);
  const keep = (rows ?? []).find((r) => r.id === keepId);
  const merge = (rows ?? []).find((r) => r.id === mergeId);
  if (!keep || !merge) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

  // 1) Move interactions wholesale.
  await supabase.from("partner_interactions")
    .update({ partner_id: keepId })
    .eq("org_id", ctx.orgId)
    .eq("partner_id", mergeId);

  // 2) Move contacts, skipping ones whose email already exists on keep
  //    (their interactions stay with keep; the duplicate contact is dropped).
  const [{ data: keepContacts }, { data: mergeContacts }] = await Promise.all([
    supabase.from("partner_contacts").select("email").eq("org_id", ctx.orgId).eq("partner_id", keepId),
    supabase.from("partner_contacts").select("id, email").eq("org_id", ctx.orgId).eq("partner_id", mergeId),
  ]);
  const keepEmails = new Set(
    (keepContacts ?? []).map((c) => (c.email ?? "").toLowerCase()).filter(Boolean)
  );
  for (const c of (mergeContacts ?? []) as Array<{ id: string; email: string | null }>) {
    const email = (c.email ?? "").toLowerCase();
    if (email && keepEmails.has(email)) {
      await supabase.from("partner_contacts").delete().eq("org_id", ctx.orgId).eq("id", c.id);
    } else {
      await supabase.from("partner_contacts")
        .update({ partner_id: keepId, org_id: keep.org_id, is_primary: false })
        .eq("org_id", ctx.orgId)
        .eq("id", c.id);
    }
  }

  // 3) Fill blanks on keep from merge; take the further-along stage and the
  //    most recent touch.
  const update: Record<string, unknown> = {};
  for (const f of [
    "city", "region", "domain", "notes", "champion_name", "champion_email",
    "champion_role", "teen_count", "program_type", "mou_status", "mou_start",
    "mou_end", "data_agreement_signed", "referral", "priority_score", "score_factors",
  ] as const) {
    const kv = (keep as Record<string, unknown>)[f];
    const mv = (merge as Record<string, unknown>)[f];
    const keepBlank = kv == null || kv === "" || (f === "mou_status" && kv === "none");
    if (keepBlank && mv != null && mv !== "" && !(f === "mou_status" && mv === "none")) {
      update[f] = mv;
    }
  }
  if ((RANK[merge.status] ?? 0) > (RANK[keep.status] ?? 0)) update.status = merge.status;
  if (merge.last_touch_at && (!keep.last_touch_at || merge.last_touch_at > keep.last_touch_at)) {
    update.last_touch_at = merge.last_touch_at;
  }
  if (Object.keys(update).length > 0) {
    await supabase.from("partners").update(update).eq("org_id", ctx.orgId).eq("id", keepId);
  }

  // 4) Delete the absorbed org.
  const { error: delErr } = await supabase.from("partners").delete().eq("org_id", ctx.orgId).eq("id", mergeId);
  if (delErr) {
    console.error("Merge delete failed:", delErr.message);
    return NextResponse.json({ error: "Merge failed during cleanup" }, { status: 500 });
  }

  await audit(req, {
    action: "program.partner.merge",
    entityType: "partner",
    entityId: keepId,
    before: merge,
    after: { merged_from: merge.name, ...update },
  });
  return NextResponse.json({ ok: true });
}
