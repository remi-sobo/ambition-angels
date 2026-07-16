import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import {
  autoPlotFinalReport,
  findOrCreateFunder,
  isTerminalGrantStage,
} from "@/lib/fundraising/grants";

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
  const ctx = await getOrgContext();
  if (!ctx) {
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

  const supabase = createServerSupabase();

  let funderId: string | null = null;
  if (typeof body.funder_id === "string" && /^[0-9a-f-]{36}$/i.test(body.funder_id)) {
    funderId = body.funder_id;
  } else if (typeof body.funder_name === "string" && body.funder_name.trim()) {
    const funder = await findOrCreateFunder(supabase, ctx.orgId, body.funder_name);
    if ("error" in funder) return NextResponse.json({ error: funder.error }, { status: 500 });
    funderId = funder.id;
  }
  // Every grant is tied to a funder (enforced NOT NULL in Postgres too).
  if (!funderId) {
    return NextResponse.json({ error: "A funder is required for every grant." }, { status: 400 });
  }

  const insert: Record<string, unknown> = { org_id: ctx.orgId, name, stage, funder_id: funderId, owner: user };
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
      org_id: ctx.orgId,
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

  // Every grant gets its own project — the place to assemble the grant (LOI,
  // budget, narrative, review, submit, report) as real ops_tasks. Best-effort:
  // if this fails the grant still exists, so we surface a warning rather than a
  // 500, and the grant page self-heals by creating the missing project on first
  // load (Phase 3). org_id is taken explicitly from the grant row, never the
  // column default, so this stays correct once a second tenant exists; RLS
  // governs the insert via the same authenticated client as the grant insert.
  // A grant backfilled straight into a terminal stage (declined/closed) gets a
  // 'done' project — its work is already over, so it must not land on the ops
  // "Active Projects" surface.
  const projectDone = isTerminalGrantStage(stage);
  const { error: projErr } = await supabase.from("ops_projects").insert({
    grant_id: data.id,
    org_id: data.org_id,
    title: data.name,
    category: "fundraising",
    created_by: user ?? "remi",
    status: projectDone ? "done" : "active",
    ...(projectDone ? { completed_at: new Date().toISOString() } : {}),
  });
  if (projErr) {
    console.error("[grants] linked-project insert failed:", projErr.message);
    const msg = "its project couldn't be created — open the grant page, which will retry on load";
    warning = warning ? `${warning} Also, ${msg}.` : `Grant created, but ${msg}.`;
  }

  // Same award behavior as the PATCH stage-advance path.
  if (stage === "awarded") {
    await autoPlotFinalReport(supabase, ctx.orgId, data.id, data.period_end);
  }

  await audit(req, {
    action: "fundraising.grant.create",
    entityType: "grants",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ ok: true, grant: data, warning });
}
