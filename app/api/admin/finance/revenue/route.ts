import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";

const SOURCE_TYPES = [
  "foundation",
  "individual",
  "corporate",
  "government",
  "accelerator",
  "earned",
  "other",
] as const;
const STATUSES = ["secured", "projected", "received"] as const;

function isISODate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// POST /api/admin/finance/revenue — create a pledge / grant / commitment.
export async function POST(req: NextRequest) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getAdminUser();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const year =
    typeof body.year === "number" && Number.isInteger(body.year) ? body.year : new Date().getFullYear();
  const source_type = SOURCE_TYPES.includes(body.source_type as (typeof SOURCE_TYPES)[number])
    ? (body.source_type as string)
    : "";
  const source_name = typeof body.source_name === "string" ? body.source_name.trim() : "";
  const amount = typeof body.amount === "number" && Number.isFinite(body.amount) ? body.amount : NaN;
  const status = STATUSES.includes(body.status as (typeof STATUSES)[number])
    ? (body.status as string)
    : "";

  if (!source_type) return NextResponse.json({ error: "source_type is invalid" }, { status: 400 });
  if (!source_name) return NextResponse.json({ error: "source_name is required" }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 0)
    return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
  if (!status) return NextResponse.json({ error: "status is invalid" }, { status: 400 });

  const insert: Record<string, unknown> = {
    year,
    source_type,
    source_name,
    amount: Math.round(amount * 100) / 100,
    status,
    created_by: user,
  };
  if (body.expected_date && isISODate(body.expected_date)) insert.expected_date = body.expected_date;
  if (typeof body.probability === "number" && body.probability >= 0 && body.probability <= 1)
    insert.probability = body.probability;
  if (typeof body.restricted === "boolean") insert.restricted = body.restricted;
  if (typeof body.restricted_to === "string" && body.restricted_to.trim())
    insert.restricted_to = body.restricted_to.slice(0, 200);
  if (typeof body.notes === "string") insert.notes = body.notes.slice(0, 1000);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("fin_revenue_commitments")
    .insert(insert)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, pledge: data });
}
