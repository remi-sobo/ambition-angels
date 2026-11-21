import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { isOrgCategory } from "@/lib/finance/categories";
import { requirePermission } from "@/lib/admin/requirePermission";
import { bulkCategorizeMessage, parseBulkCategorizeBody } from "@/lib/finance/bulkCategorize";

// POST /api/admin/finance/transactions/bulk { ids: [...], category_id }
//
// The Transactions list's bulk "Categorize as…" (V4 Stage G2, DataTable v2
// "choose" bulk action). Rules in lib/finance/bulkCategorize.ts: finance.write,
// the category must be one of the ACTIVE org's categories (or null to clear),
// and the update is pinned to the active org, so another org's transaction
// ids match nothing and are reported as skipped.
export async function POST(req: NextRequest) {
  const gate = await requirePermission("finance.write");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;

  const parsed = parseBulkCategorizeBody(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { ids, categoryId } = parsed.body;

  const supabase = getSupabaseAdmin();
  let label: string | null = null;
  if (categoryId !== null) {
    let known = false;
    try {
      known = await isOrgCategory(supabase, ctx.orgId, categoryId);
    } catch (e) {
      console.error("[finance] bulk categorize category lookup failed:", e);
      return NextResponse.json({ error: "Could not check that category. Try again." }, { status: 500 });
    }
    if (!known) return NextResponse.json({ error: "Unknown category" }, { status: 400 });
    const { data: cat } = await supabase
      .from("fin_categories")
      .select("display_name")
      .eq("org_id", ctx.orgId)
      .eq("id", categoryId)
      .maybeSingle();
    label = (cat as { display_name?: string } | null)?.display_name ?? categoryId;
  }

  // Org fence: the service-role client bypasses RLS; the org pin is what keeps
  // one tenant's ids from touching another tenant's ledger.
  const { data, error } = await supabase
    .from("fin_transactions")
    .update({ category_id: categoryId })
    .eq("org_id", ctx.orgId)
    .in("id", ids)
    .select("id");
  if (error) {
    console.error("[finance] bulk categorize failed:", error);
    return NextResponse.json({ error: "Could not categorize these transactions. Try again." }, { status: 500 });
  }
  const updated = (data ?? []).length;
  const skipped = ids.length - updated;
  if (updated === 0) {
    return NextResponse.json({ error: "None of these transactions were found." }, { status: 404 });
  }

  await audit(req, {
    action: "finance.transaction.bulk_categorize",
    entityType: "fin_transactions",
    after: { category_id: categoryId, updated, skipped, transaction_ids: ids },
  });
  return NextResponse.json({ ok: true, updated, skipped, message: bulkCategorizeMessage(updated, skipped, label) });
}
