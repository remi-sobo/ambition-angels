import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const STATUSES = ["planning", "active", "completed", "archived"] as const;
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = body && typeof body.name === "string" ? body.name.trim().slice(0, 160) : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  // org from session, never a column default (the program-domain defaults are gone).
  const insert: Record<string, unknown> = { name, org_id: ctx.orgId };
  if (STATUSES.includes(body?.status as (typeof STATUSES)[number])) insert.status = body!.status;
  for (const f of ["program", "term", "location"] as const) {
    if (typeof body?.[f] === "string" && (body[f] as string).trim())
      insert[f] = (body[f] as string).trim().slice(0, 160);
  }
  for (const f of ["start_date", "end_date"] as const) {
    if (isISODate(body?.[f])) insert[f] = body![f];
  }
  const capacity = Number(body?.capacity);
  if (Number.isInteger(capacity) && capacity > 0 && capacity <= 10_000) insert.capacity = capacity;

  const { data, error } = await getSupabaseAdmin()
    .from("cohorts")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("Create cohort failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  await audit(req, {
    action: "program.cohort.create",
    entityType: "cohort",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
