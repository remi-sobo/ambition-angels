import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const KINDS = ["loi", "application", "interim_report", "final_report", "financial_report", "other"] as const;

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// POST /api/admin/grants/:id/requirements — add a deadline to the calendar.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid grant id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const kind = KINDS.includes(body.kind as (typeof KINDS)[number]) ? (body.kind as string) : "";
  if (!kind) return NextResponse.json({ error: "kind is invalid" }, { status: 400 });
  if (!isISODate(body.due_date)) {
    return NextResponse.json({ error: "due_date must be YYYY-MM-DD" }, { status: 400 });
  }

  const insert: Record<string, unknown> = {
    grant_id: params.id,
    kind,
    due_date: body.due_date,
  };
  if (typeof body.label === "string" && body.label.trim()) insert.label = body.label.slice(0, 200);
  if (typeof body.notes === "string" && body.notes.trim()) insert.notes = body.notes.slice(0, 1000);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("grant_requirements")
    .insert(insert)
    .select("*")
    .single();
  if (error) {
    if (error.code === "23503") {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.grant_requirement.create",
    entityType: "grant_requirements",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ ok: true, requirement: data });
}
