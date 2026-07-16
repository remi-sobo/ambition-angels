import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const PATTERN_TYPES = ["contains", "starts_with", "regex"] as const;
type PatternType = (typeof PATTERN_TYPES)[number];

// POST /api/admin/finance/rules — create a new category rule.
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const pattern = typeof body.pattern === "string" ? body.pattern.trim() : "";
  if (!pattern) {
    return NextResponse.json({ error: "pattern is required" }, { status: 400 });
  }
  const pattern_type = (PATTERN_TYPES as readonly string[]).includes(body.pattern_type as string)
    ? (body.pattern_type as PatternType)
    : "contains";
  const category_id = typeof body.category_id === "string" ? body.category_id : "";
  if (!category_id) {
    return NextResponse.json({ error: "category_id is required" }, { status: 400 });
  }
  // Validate regex early so a bad pattern doesn't get persisted.
  if (pattern_type === "regex") {
    try {
      new RegExp(pattern, "i");
    } catch (e) {
      return NextResponse.json({ error: `Invalid regex: ${(e as Error).message}` }, { status: 400 });
    }
  }
  const restricted = typeof body.restricted === "boolean" ? body.restricted : false;
  const priority =
    typeof body.priority === "number" && Number.isInteger(body.priority) ? body.priority : 0;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("fin_category_rules")
    .insert({ org_id: ctx.orgId, pattern, pattern_type, category_id, restricted, priority })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23503") {
      return NextResponse.json({ error: "Unknown category" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await audit(req, {
    action: "finance.rule.create",
    entityType: "fin_category_rules",
    entityId: data.id,
    after: data,
  });
  return NextResponse.json({ ok: true, rule: data });
}
