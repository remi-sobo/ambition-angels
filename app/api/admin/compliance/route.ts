import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const KINDS = [
  "form_990", "state_charitable", "corporate_report", "employment_tax",
  "insurance", "policy", "public_disclosure", "contract", "custom",
] as const;
const RECURS = ["annual", "quarterly", "biennial", "none"] as const;

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = body && typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title || !isISODate(body?.due_date)) {
    return NextResponse.json({ error: "title and due_date are required" }, { status: 400 });
  }

  const insert: Record<string, unknown> = { title, due_date: body!.due_date };
  if (KINDS.includes(body?.kind as (typeof KINDS)[number])) insert.kind = body!.kind;
  if (RECURS.includes(body?.recur as (typeof RECURS)[number])) insert.recur = body!.recur;
  if (typeof body?.jurisdiction === "string" && body.jurisdiction.trim())
    insert.jurisdiction = body.jurisdiction.trim().slice(0, 60);
  if (typeof body?.assigned_to === "string" && body.assigned_to.trim())
    insert.assigned_to = body.assigned_to.trim().slice(0, 60);
  if (typeof body?.notes === "string" && body.notes.trim())
    insert.notes = body.notes.trim().slice(0, 2000);

  const { data, error } = await getSupabaseAdmin()
    .from("compliance_items")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("Create compliance item failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  await audit(req, {
    action: "compliance.item.create",
    entityType: "compliance_item",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
