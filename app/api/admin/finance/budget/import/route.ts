import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { parseQbBudget, matchAccounts, type MatchInput } from "@/lib/finance/qb-budget";

// POST /api/admin/finance/budget/import
//
// Two-phase, same shape as the bank-CSV import.
//   ?mode=preview → parse the QB CSV, match accounts to fin_categories,
//                   return matched + unmatched rows. No DB writes.
//   ?mode=commit  → upsert fin_budget.base_amount for the matched rows
//                   PLUS any unmatched rows the user manually mapped via
//                   the form fields override[<accountIdx>] = <category_id>.
//
// Contracts:
//   - We only touch base_amount. Contingency tiers stay where they were.
//   - Unmatched-and-unmapped rows are silently skipped, NOT zeroed. So a
//     partial QB export can't accidentally wipe out categories not in
//     the file.
//   - Re-running for the same year overwrites base_amount for matched
//     rows. That's intentional — the QB export IS the source of truth.
export async function POST(req: NextRequest) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart form" }, { status: 400 });
  }

  const file = form.get("file");
  const yearRaw = form.get("year");
  const mode = form.get("mode") === "commit" ? "commit" : "preview";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  const year = parseInt(typeof yearRaw === "string" ? yearRaw : "", 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "year is required and must be 2000..2100" }, { status: 400 });
  }

  const text = await file.text();
  let parsed: ReturnType<typeof parseQbBudget>;
  try {
    parsed = parseQbBudget(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to parse CSV";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (parsed.rows.length === 0) {
    return NextResponse.json(
      { error: "No budget rows parsed. Confirm this is a QuickBooks Budget Overview export." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const [catsRes, existingBudgetRes] = await Promise.all([
    supabase
      .from("fin_categories")
      .select("id, display_name, group_name, kind")
      .eq("enabled", true)
      .order("sort_order"),
    supabase
      .from("fin_budget")
      .select("category_id, base_amount")
      .eq("year", year),
  ]);

  const categories = (catsRes.data ?? []) as MatchInput[];
  const existingMap = new Map(
    ((existingBudgetRes.data ?? []) as Array<{ category_id: string; base_amount: number }>).map(
      (r) => [r.category_id, Number(r.base_amount)]
    )
  );

  const matchResult = matchAccounts(parsed.rows, categories, existingMap);

  if (mode === "preview") {
    return NextResponse.json({
      ok: true,
      preview: {
        year,
        filename: file.name,
        detected_format: parsed.detectedFormat,
        row_count: parsed.rows.length,
        matched_count: matchResult.matched.length,
        unmatched_count: matchResult.unmatched.length,
        matched: matchResult.matched,
        unmatched: matchResult.unmatched,
      },
    });
  }

  // mode === "commit". Read manual overrides for unmatched rows. The client
  // sends them as `override:<account>` → category_id (or empty string to
  // skip the row).
  const overrides = new Map<string, string>();
  form.forEach((v, k) => {
    if (k.startsWith("override:") && typeof v === "string" && v) {
      overrides.set(k.slice("override:".length), v);
    }
  });

  // Build the list of (category_id → base_amount) upserts.
  const upserts = new Map<string, number>(); // category_id → base_amount
  for (const m of matchResult.matched) {
    upserts.set(m.category_id, Math.round(m.amount * 100) / 100);
  }
  for (const u of matchResult.unmatched) {
    const cat = overrides.get(u.account);
    if (!cat) continue;
    // Reject overrides pointing to non-expense categories — silently skip
    // to mirror the matcher's behavior. Belt-and-suspenders since the UI
    // restricts options to expense, but a hand-crafted form post could
    // try otherwise.
    const c = categories.find((x) => x.id === cat);
    if (!c || c.kind !== "expense") continue;
    upserts.set(c.id, Math.round(u.amount * 100) / 100);
  }

  if (upserts.size === 0) {
    return NextResponse.json(
      { error: "Nothing to commit — all rows are unmatched and no manual mappings were provided." },
      { status: 400 }
    );
  }

  // Upsert each (year, category_id) row. We could batch via .upsert(rows)
  // but supabase-js handles the array case fine.
  const rows = Array.from(upserts.entries()).map(([category_id, base_amount]) => ({
    year,
    category_id,
    base_amount,
  }));
  const { error: upErr, count } = await supabase
    .from("fin_budget")
    .upsert(rows, { onConflict: "year,category_id", count: "exact" });
  if (upErr) {
    console.error("[finance] QB budget import upsert failed:", upErr);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  await audit(req, {
    action: "finance.budget.import",
    entityType: "fin_budget",
    after: { year, upserted: count ?? rows.length, filename: file.name },
  });
  return NextResponse.json({
    ok: true,
    year,
    upserted: count ?? rows.length,
    matched: matchResult.matched.length,
    overrides: overrides.size,
    skipped: matchResult.unmatched.length - overrides.size,
  });
}
