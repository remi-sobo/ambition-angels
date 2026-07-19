import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { loadRules, matchRule, bumpHitCounts } from "@/lib/finance/categorize";

// POST /api/admin/finance/rules/apply-all
//
// Walks every uncategorized transaction, runs the rule chain, and updates
// the ones that match. Returns counts for the UI. Touched-only update —
// transactions that don't match any rule are left untouched (still null
// category_id). Restricted flag is OR'd in when a matching rule has it set,
// so a previously-marked restricted txn is never un-restricted.
//
// This is O(uncategorized × rules); both sides are small (hundreds at most
// in steady state, dozens of rules), so we do it in-process rather than a
// SQL update with regex joins.
export async function POST(req: NextRequest) {
  // Org fence: the service-role client bypasses RLS, so this mass update MUST
  // be constrained to the caller's org — else it would rewrite every tenant's
  // transactions with this org's rules.
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = ctx.orgId;
  const supabase = getSupabaseAdmin();

  const { data: uncatRaw, error: selErr } = await supabase
    .from("fin_transactions")
    .select("id, description, restricted")
    .eq("org_id", orgId)
    .is("category_id", null);
  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  const uncat = (uncatRaw ?? []) as Array<{
    id: string;
    description: string;
    restricted: boolean;
  }>;

  const rules = await loadRules(supabase, orgId);
  if (rules.length === 0) {
    // The invocation itself is the audited action — log it even when
    // there were no rules to apply.
    await audit(req, {
      action: "finance.rules.apply_all",
      entityType: "fin_transactions",
      after: { matched: 0, considered: uncat.length, rules: 0 },
    });
    return NextResponse.json({
      ok: true,
      matched: 0,
      considered: uncat.length,
      message: "No rules defined — nothing to apply.",
    });
  }

  const hits = new Map<string, number>();
  let matched = 0;
  // Per-row update — Supabase doesn't bulk update with per-row values. With
  // a few hundred uncategorized rows this is fine.
  for (const t of uncat) {
    const r = matchRule(t.description, rules);
    if (!r) continue;
    const update: { category_id: string; restricted?: boolean } = {
      category_id: r.category_id,
    };
    if (r.restricted && !t.restricted) update.restricted = true;
    const { error: updErr } = await supabase
      .from("fin_transactions")
      .update(update)
      .eq("org_id", orgId)
      .eq("id", t.id);
    if (updErr) {
      console.error("[finance] apply-all update failed for", t.id, updErr.message);
      continue;
    }
    matched++;
    hits.set(r.id, (hits.get(r.id) ?? 0) + 1);
  }

  await bumpHitCounts(supabase, hits);

  await audit(req, {
    action: "finance.rules.apply_all",
    entityType: "fin_transactions",
    after: { matched, considered: uncat.length },
  });
  return NextResponse.json({
    ok: true,
    matched,
    considered: uncat.length,
    remaining: uncat.length - matched,
  });
}
