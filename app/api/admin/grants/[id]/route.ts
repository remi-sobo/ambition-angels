import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import {
  autoPlotFinalReport,
  findOrCreateFunder,
  syncGrantProjectStatus,
} from "@/lib/fundraising/grants";

const STAGES = [
  "prospect", "qualified", "loi", "proposal", "submitted",
  "awarded", "declined", "active", "closed",
] as const;

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// PATCH /api/admin/grants/:id — partial update; most-used field is `stage`
// (the pipeline advance). Moving to `awarded` auto-plots a final-report
// requirement at the period end if none exists yet (modules/03: "awarded
// grants auto-plot their reporting schedule" — v1 plots the one deadline
// every funder has; interim cadences get added by hand or a later ring).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if ("stage" in body && STAGES.includes(body.stage as (typeof STAGES)[number]))
    update.stage = body.stage;
  if ("name" in body && typeof body.name === "string" && body.name.trim())
    update.name = body.name.trim();
  if ("amount_requested" in body) {
    if (body.amount_requested === null) update.amount_requested = null;
    else if (typeof body.amount_requested === "number" && body.amount_requested >= 0)
      update.amount_requested = Math.round(body.amount_requested * 100) / 100;
  }
  if ("amount_awarded" in body) {
    if (body.amount_awarded === null) update.amount_awarded = null;
    else if (typeof body.amount_awarded === "number" && body.amount_awarded >= 0)
      update.amount_awarded = Math.round(body.amount_awarded * 100) / 100;
  }
  if ("restrictions" in body) {
    const v = body.restrictions;
    update.restrictions = v === null || v === "" ? null : typeof v === "string" ? v.slice(0, 1000) : undefined;
    if (update.restrictions === undefined) delete update.restrictions;
  }
  if ("period_start" in body) {
    if (body.period_start === null || body.period_start === "") update.period_start = null;
    else if (isISODate(body.period_start)) update.period_start = body.period_start;
  }
  if ("period_end" in body) {
    if (body.period_end === null || body.period_end === "") update.period_end = null;
    else if (isISODate(body.period_end)) update.period_end = body.period_end;
  }
  if ("program" in body) {
    const v = body.program;
    if (v === null || v === "") update.program = null;
    else if (typeof v === "string") update.program = v.slice(0, 200);
  }
  if ("notes" in body) {
    const v = body.notes;
    if (v === null || v === "") update.notes = null;
    else if (typeof v === "string") update.notes = v.slice(0, 2000);
  }
  if ("owner" in body) {
    const v = body.owner;
    if (v === null || v === "") update.owner = null;
    else if (typeof v === "string") update.owner = v.trim().slice(0, 200) || null;
  }

  const supabase = createServerSupabase();

  // Funder: a uuid links an existing organization constituent, a name
  // find-or-creates one (mirrors POST). Funder is required on every grant, so
  // an explicit clear is rejected rather than written to null.
  if (typeof body.funder_id === "string" && /^[0-9a-f-]{36}$/i.test(body.funder_id)) {
    update.funder_id = body.funder_id;
  } else if (
    "funder_name" in body ||
    ("funder_id" in body && (body.funder_id === null || body.funder_id === ""))
  ) {
    const funderName = typeof body.funder_name === "string" ? body.funder_name.trim() : "";
    if (!funderName) {
      return NextResponse.json({ error: "A funder is required for every grant." }, { status: 400 });
    }
    const funder = await findOrCreateFunder(supabase, funderName);
    if ("error" in funder) return NextResponse.json({ error: funder.error }, { status: 500 });
    update.funder_id = funder.id;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("grants")
    .update(update)
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-plot the final report when an award lands.
  if (update.stage === "awarded") {
    await autoPlotFinalReport(supabase, params.id, data.period_end);
  }

  // A grant reaching declined/closed retires its workspace project so it drops
  // off the ops "Active Projects" surface (reported by Shannon — closed grants
  // were lingering there forever).
  if (typeof update.stage === "string") {
    await syncGrantProjectStatus(supabase, params.id, update.stage);
  }

  await audit(req, {
    action: "fundraising.grant.update",
    entityType: "grants",
    entityId: params.id,
    after: update,
  });
  return NextResponse.json({ ok: true, grant: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = createServerSupabase();
  const { data: deleted, error } = await supabase
    .from("grants")
    .delete()
    .eq("id", params.id)
    .select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (deleted && deleted.length > 0) {
    await audit(req, {
      action: "fundraising.grant.delete",
      entityType: "grants",
      entityId: params.id,
      before: deleted[0],
    });
  }
  return NextResponse.json({ ok: true });
}
