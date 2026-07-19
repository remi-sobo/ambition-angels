import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import {
  suggestCategories,
  SUGGEST_BATCH,
  type CategoryForAI,
  type TxnForAI,
} from "@/lib/finance/ai-categorize";

export const maxDuration = 120;

// POST /api/admin/finance/categorize/suggest
//
// Read-only: loads the oldest uncategorized transactions (up to SUGGEST_BATCH)
// plus the enabled categories, asks Claude for a category per transaction, and
// returns the suggestions enriched with the transaction + category display
// data. Nothing is written — the apply route does that after the user confirms.
export async function POST() {
  // Org fence: the service-role client bypasses RLS. Without an org filter this
  // route reads every tenant's uncategorized transactions and ships them to the
  // AI — scope both reads to the caller's org.
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI categorization isn't configured (ANTHROPIC_API_KEY)." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();

  const [{ data: catsRaw }, { data: txnsRaw, count }] = await Promise.all([
    supabase
      .from("fin_categories")
      .select("id, display_name, group_name, kind, functional_class")
      .eq("org_id", ctx.orgId)
      .eq("enabled", true)
      .order("sort_order"),
    supabase
      .from("fin_transactions")
      .select("id, txn_date, description, amount", { count: "exact" })
      .eq("org_id", ctx.orgId)
      .is("category_id", null)
      .order("txn_date", { ascending: true })
      .limit(SUGGEST_BATCH),
  ]);

  const categories = (catsRaw ?? []) as CategoryForAI[];
  const txns = (txnsRaw ?? []).map((t) => ({
    id: t.id as string,
    txn_date: t.txn_date as string,
    description: t.description as string,
    amount: Number(t.amount),
  }));

  if (txns.length === 0) {
    return NextResponse.json({ ok: true, suggestions: [], remaining: 0 });
  }

  let suggestions;
  try {
    suggestions = await suggestCategories(
      txns.map((t): TxnForAI => ({ id: t.id, description: t.description, amount: t.amount })),
      categories
    );
  } catch (e) {
    console.error("[finance categorize suggest] failed:", e);
    return NextResponse.json({ error: "Couldn't get suggestions. Try again." }, { status: 502 });
  }

  // Join suggestions back to the transaction + category for display.
  const catById = new Map(categories.map((c) => [c.id, c]));
  const txnById = new Map(txns.map((t) => [t.id, t]));
  const enriched = suggestions
    .map((s) => {
      const t = txnById.get(s.id);
      const c = catById.get(s.category_id);
      if (!t || !c) return null;
      return {
        id: s.id,
        txn_date: t.txn_date,
        description: t.description,
        amount: t.amount,
        category_id: s.category_id,
        category_name: c.display_name,
        confidence: s.confidence,
        rule_pattern: s.rule_pattern,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    // Highest-confidence first so the easy wins are at the top.
    .sort((a, b) => b.confidence - a.confidence);

  const total = count ?? txns.length;
  return NextResponse.json({
    ok: true,
    suggestions: enriched,
    // Uncategorized beyond this batch — the UI tells the user to re-run.
    remaining: Math.max(0, total - txns.length),
  });
}
