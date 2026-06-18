import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

type ApplyItem = { id: string; category_id: string; create_rule?: boolean; pattern?: string };

// POST /api/admin/finance/categorize/apply
//
// Writes the user-confirmed AI suggestions: sets category_id on each
// transaction, and — when the user opted in — creates a "contains" rule from
// the merchant pattern so future imports auto-categorize. Rules are de-duped
// (same lowercased pattern + category) so re-running never spams the rule list.
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { items?: unknown } | null;
  const itemsRaw = body && Array.isArray(body.items) ? body.items : null;
  if (!itemsRaw) return NextResponse.json({ error: "items[] required" }, { status: 400 });

  const items: ApplyItem[] = [];
  for (const r of itemsRaw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const category_id = typeof o.category_id === "string" ? o.category_id : "";
    if (!id || !category_id) continue;
    items.push({
      id,
      category_id,
      create_rule: o.create_rule === true,
      pattern: typeof o.pattern === "string" ? o.pattern.trim().toLowerCase() : "",
    });
  }
  if (items.length === 0) return NextResponse.json({ error: "No valid items." }, { status: 400 });

  const supabase = getSupabaseAdmin();

  // Apply category assignments (one update per transaction; the set is small).
  let updated = 0;
  const updateErrors: string[] = [];
  await Promise.all(
    items.map(async (it) => {
      const { error } = await supabase
        .from("fin_transactions")
        .update({ category_id: it.category_id })
        .eq("id", it.id)
        .is("category_id", null); // don't clobber a category set since the suggestion
      if (error) updateErrors.push(error.message);
      else updated += 1;
    })
  );

  // Create rules for opted-in items, de-duped against existing patterns.
  let rulesCreated = 0;
  const ruleCandidates = items.filter((it) => it.create_rule && it.pattern && it.pattern.length >= 3);
  if (ruleCandidates.length > 0) {
    const patterns = Array.from(new Set(ruleCandidates.map((it) => it.pattern!)));
    const { data: existing } = await supabase
      .from("fin_category_rules")
      .select("pattern, category_id")
      .in("pattern", patterns);
    const existingKey = new Set((existing ?? []).map((r) => `${r.pattern}::${r.category_id}`));

    // One rule per unique (pattern, category) that doesn't already exist.
    const seen = new Set<string>();
    const toInsert: Array<{ pattern: string; pattern_type: string; category_id: string; priority: number }> = [];
    for (const it of ruleCandidates) {
      const key = `${it.pattern}::${it.category_id}`;
      if (existingKey.has(key) || seen.has(key)) continue;
      seen.add(key);
      toInsert.push({ pattern: it.pattern!, pattern_type: "contains", category_id: it.category_id, priority: 0 });
    }
    if (toInsert.length > 0) {
      const { data, error } = await supabase.from("fin_category_rules").insert(toInsert).select("id");
      if (!error) rulesCreated = data?.length ?? 0;
    }
  }

  await audit(req, {
    action: "finance.categorize.ai_apply",
    entityType: "fin_transactions",
    after: { updated, rulesCreated },
  });

  return NextResponse.json({ ok: true, updated, rulesCreated, errors: updateErrors.slice(0, 5) });
}
