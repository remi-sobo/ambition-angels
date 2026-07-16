import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { DEFAULT_RULES } from "@/lib/finance/default-rules";

// POST /api/admin/finance/rules/seed
//
// Inserts the predefined default rule set into fin_category_rules, skipping
// patterns that already exist (idempotent — safe to click the button
// repeatedly without piling up dupes). Doesn't run rules against existing
// transactions on its own; the user follows with "Apply to uncategorized"
// to backfill.
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  // Pull existing patterns once and skip anything that matches by
  // (pattern, category_id). The matcher is case-insensitive; we compare
  // as-stored to avoid losing intentional case-sensitivity edits the user
  // might have made.
  const { data: existing, error: selErr } = await supabase
    .from("fin_category_rules")
    .select("pattern, category_id");
  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  const existingSet = new Set(
    (existing ?? []).map((r) => `${r.pattern}|${r.category_id}`)
  );

  const toInsert = DEFAULT_RULES.filter(
    (r) => !existingSet.has(`${r.pattern}|${r.category_id}`)
  ).map((r) => ({
    org_id: ctx.orgId,
    pattern: r.pattern,
    pattern_type: r.pattern_type,
    category_id: r.category_id,
    priority: r.priority,
    enabled: true,
  }));

  if (toInsert.length === 0) {
    // The invocation itself is the audited action — log the no-op too.
    await audit(req, {
      action: "finance.rules.seed",
      entityType: "fin_category_rules",
      after: { inserted: 0, skipped: DEFAULT_RULES.length },
    });
    return NextResponse.json({
      ok: true,
      inserted: 0,
      skipped: DEFAULT_RULES.length,
      message: "Default rule set is already seeded.",
    });
  }

  const { error: insErr, count } = await supabase
    .from("fin_category_rules")
    .insert(toInsert, { count: "exact" });
  if (insErr) {
    // FK violation = a category_id in our seed isn't in fin_categories yet.
    // Either the migration hasn't run or we got out of sync with the seed.
    if (insErr.code === "23503") {
      return NextResponse.json(
        {
          error:
            "One or more default rules reference a category that doesn't exist in fin_categories. Run the create_fin_schema migration to seed the canonical category list first.",
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  await audit(req, {
    action: "finance.rules.seed",
    entityType: "fin_category_rules",
    after: { inserted: count ?? toInsert.length },
  });
  return NextResponse.json({
    ok: true,
    inserted: count ?? toInsert.length,
    skipped: DEFAULT_RULES.length - toInsert.length,
  });
}
