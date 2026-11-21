import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { findOrCreateProgram } from "@/lib/admin/program/programs";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/admin/requirePermission";
import { createOwnerFor } from "@/lib/admin/owners-server";

const STATUSES = ["planning", "active", "completed", "archived"] as const;
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: NextRequest) {
  const guard = await requirePermission("program.write");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const ctx = guard.ctx;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = body && typeof body.name === "string" ? body.name.trim().slice(0, 160) : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  // org from session, never a column default (the program-domain defaults are gone).
  // V4 B2: the creator owns a new cohort (and a program it creates) unless
  // the request names an owner.
  const owner = await createOwnerFor(body, ctx);
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: 400 });
  const insert: Record<string, unknown> = { name, org_id: ctx.orgId, owner_id: owner.ownerId };
  if (STATUSES.includes(body?.status as (typeof STATUSES)[number])) insert.status = body!.status;
  for (const f of ["term", "location"] as const) {
    if (typeof body?.[f] === "string" && (body[f] as string).trim())
      insert[f] = (body[f] as string).trim().slice(0, 160);
  }
  for (const f of ["start_date", "end_date"] as const) {
    if (isISODate(body?.[f])) insert[f] = body![f];
  }
  const capacity = Number(body?.capacity);
  if (Number.isInteger(capacity) && capacity > 0 && capacity <= 10_000) insert.capacity = capacity;

  const supabase = getSupabaseAdmin();
  // Program is a real parent entity now (D4): resolve the name to a program_id
  // (find-or-create), and dual-write the free-text `program` = the program's
  // name so unmigrated readers (cohort lists, rollups) render unchanged.
  if (typeof body?.program === "string" && body.program.trim()) {
    const program = await findOrCreateProgram(supabase, ctx.orgId, body.program, { ownerId: owner.ownerId });
    if (program) {
      insert.program_id = program.id;
      insert.program = program.name;
    }
  }

  const { data, error } = await supabase
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
