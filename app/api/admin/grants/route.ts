import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { autoPlotFinalReport } from "@/lib/fundraising/grants";

const STAGES = [
  "prospect", "qualified", "loi", "proposal", "submitted",
  "awarded", "declined", "active", "closed",
] as const;

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// POST /api/admin/grants — create a grant. The funder is always an
// organization constituent: pass funder_id to link an existing one, or
// funder_name and we find-or-create it (case-insensitive name match).
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getAdminUser();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const stage = STAGES.includes(body.stage as (typeof STAGES)[number])
    ? (body.stage as string)
    : "prospect";

  const supabase = getSupabaseAdmin();

  let funderId: string | null = null;
  if (typeof body.funder_id === "string" && /^[0-9a-f-]{36}$/i.test(body.funder_id)) {
    funderId = body.funder_id;
  } else if (typeof body.funder_name === "string" && body.funder_name.trim()) {
    const funderName = body.funder_name.trim();
    const { data: existing } = await supabase
      .from("constituents")
      .select("id")
      .eq("type", "organization")
      .ilike("org_name", funderName)
      .limit(1)
      .maybeSingle();
    if (existing) {
      funderId = existing.id;
    } else {
      const { data: created, error: cErr } = await supabase
        .from("constituents")
        .insert({ type: "organization", org_name: funderName, source: "manual" })
        .select("id")
        .single();
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
      funderId = created.id;
    }
  }

  const insert: Record<string, unknown> = { name, stage, funder_id: funderId, owner: user };
  if (typeof body.amount_requested === "number" && body.amount_requested >= 0)
    insert.amount_requested = Math.round(body.amount_requested * 100) / 100;
  if (typeof body.amount_awarded === "number" && body.amount_awarded >= 0)
    insert.amount_awarded = Math.round(body.amount_awarded * 100) / 100;
  if (typeof body.restrictions === "string" && body.restrictions.trim())
    insert.restrictions = body.restrictions.slice(0, 1000);
  if (isISODate(body.period_start)) insert.period_start = body.period_start;
  if (isISODate(body.period_end)) insert.period_end = body.period_end;
  if (typeof body.program === "string" && body.program.trim())
    insert.program = body.program.slice(0, 200);
  if (typeof body.notes === "string" && body.notes.trim())
    insert.notes = body.notes.slice(0, 2000);

  const { data, error } = await supabase.from("grants").insert(insert).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A first deadline at creation time (e.g. the application due date) is
  // common enough to take inline. A failure here must not masquerade as
  // success — the grant exists, but the caller is told the deadline didn't.
  let warning: string | undefined;
  if (isISODate(body.first_deadline)) {
    const { error: reqErr } = await supabase.from("grant_requirements").insert({
      grant_id: data.id,
      kind: typeof body.first_deadline_kind === "string" &&
        ["loi", "application", "interim_report", "final_report", "financial_report", "other"].includes(body.first_deadline_kind)
        ? body.first_deadline_kind
        : "application",
      due_date: body.first_deadline,
    });
    if (reqErr) {
      console.error("[grants] first-deadline insert failed:", reqErr.message);
      warning = "Grant created, but the first deadline could not be added — add it from the grant page.";
    }
  }

  // Same award behavior as the PATCH stage-advance path.
  if (stage === "awarded") {
    await autoPlotFinalReport(supabase, data.id, data.period_end);
  }

  await audit(req, {
    action: "fundraising.grant.create",
    entityType: "grants",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ ok: true, grant: data, warning });
}
