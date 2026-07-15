import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { hasPermission } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

// Accept or dismiss one Reed plan proposal (Reed strategy Phase D).
// Accept now APPLIES the proposal into the real plan (plan_*), behind org.manage
// (the plan is leadership-owned) and human-initiated (this click is the confirm).
// The parent is resolved to a real plan row — directly, or via a parent proposal
// that was accepted first (its applied_id). Dismiss just records the decision.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action;
  if (action !== "accept" && action !== "dismiss") {
    return NextResponse.json({ error: "action must be 'accept' or 'dismiss'" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const stamp = { decided_by: ctx.email, decided_at: new Date().toISOString() };

  if (action === "dismiss") {
    const { error } = await supabase.from("reed_plan_proposals").update({ status: "dismissed", ...stamp }).eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: "dismissed" });
  }

  // accept → apply
  if (!(await hasPermission(supabase, ctx.orgId, "org.manage"))) {
    return NextResponse.json({ error: "Requires org.manage" }, { status: 403 });
  }
  const { data: prop } = await supabase
    .from("reed_plan_proposals")
    .select("id, proposed_type, parent_ref, payload, status")
    .eq("id", params.id)
    .maybeSingle();
  if (!prop) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((prop as { status: string }).status !== "proposed") {
    return NextResponse.json({ error: "Already decided" }, { status: 409 });
  }

  const applied = await applyProposal(supabase, ctx.orgId, prop as ProposalRow);
  if ("error" in applied) return NextResponse.json({ error: applied.error }, { status: 400 });

  const { error: updErr } = await supabase
    .from("reed_plan_proposals")
    .update({ status: "accepted", applied_id: applied.id, ...stamp })
    .eq("id", params.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, status: "accepted", applied_id: applied.id });
}

type ProposalRow = {
  proposed_type: string;
  parent_ref: { type?: string; id?: string | null } | null;
  payload: Record<string, unknown> | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

// Resolve a parent reference to a real plan row id. The id may already be a real
// plan_objectives/plan_goals row, or it may be a sibling proposal that was
// accepted first (use its applied_id).
async function resolveParent(
  sb: SupabaseClient,
  orgId: string,
  parentType: "objective" | "goal",
  parentId: string,
): Promise<string | null> {
  const table = parentType === "objective" ? "plan_objectives" : "plan_goals";
  let q = sb.from(table).select("id").eq("id", parentId).eq("org_id", orgId);
  // Never parent new work onto a soft-deleted objective (it's hidden/archived).
  if (parentType === "objective") q = q.is("deleted_at", null);
  const real = await q.maybeSingle();
  if (real.data) return parentId;
  const viaProposal = await sb
    .from("reed_plan_proposals")
    .select("applied_id, proposed_type")
    .eq("id", parentId)
    .eq("org_id", orgId)
    .maybeSingle();
  const p = viaProposal.data as { applied_id: string | null; proposed_type: string } | null;
  if (p?.applied_id && p.proposed_type === parentType) return p.applied_id;
  return null;
}

async function insertRow(sb: SupabaseClient, table: string, row: Record<string, unknown>) {
  return sb.from(table).insert(row).select("id").single();
}

async function applyProposal(
  sb: SupabaseClient,
  orgId: string,
  prop: ProposalRow,
): Promise<{ id: string } | { error: string }> {
  const type = prop.proposed_type;
  const payload = prop.payload ?? {};
  const title = str(payload.title);
  if (!title) return { error: "Proposal has no title." };
  const parent = prop.parent_ref ?? null;
  const parentType = parent?.type === "objective" ? "objective" : parent?.type === "goal" ? "goal" : null;
  const parentId = typeof parent?.id === "string" ? parent.id : null;

  // status / sort_order / source are intentionally omitted — the DB defaults
  // apply (and avoid per-table enum mismatches). current is never set (Phase D
  // never claims a KPI's actual).
  if (type === "objective") {
    const { data, error } = await insertRow(sb, "plan_objectives", {
      org_id: orgId,
      title,
      three_year_statement: str(payload.three_year_statement),
      owner: str(payload.owner),
    });
    return error ? { error: error.message } : { id: (data as { id: string }).id };
  }

  if (type === "goal") {
    let objectiveId: string | null = null;
    if (parentType === "objective" && parentId) {
      objectiveId = await resolveParent(sb, orgId, "objective", parentId);
      if (!objectiveId) return { error: "Parent objective not found — accept or create it first." };
    }
    const { data, error } = await insertRow(sb, "plan_goals", {
      org_id: orgId,
      objective_id: objectiveId,
      title,
      description: str(payload.description),
      target_date: str(payload.target_date),
      owner: str(payload.owner),
    });
    return error ? { error: error.message } : { id: (data as { id: string }).id };
  }

  if (type === "initiative") {
    if (parentType !== "goal" || !parentId) return { error: "An initiative must ladder to a goal." };
    const goalId = await resolveParent(sb, orgId, "goal", parentId);
    if (!goalId) return { error: "Parent goal not found — accept or create it first." };
    const { data, error } = await insertRow(sb, "plan_initiatives", {
      org_id: orgId,
      goal_id: goalId,
      title,
      description: str(payload.description),
      owner: str(payload.owner),
    });
    return error ? { error: error.message } : { id: (data as { id: string }).id };
  }

  if (type === "kpi") {
    let goalId: string | null = null;
    let objectiveId: string | null = null;
    if (parentType === "goal" && parentId) {
      goalId = await resolveParent(sb, orgId, "goal", parentId);
      if (!goalId) return { error: "Parent goal not found — accept or create it first." };
      const g = await sb.from("plan_goals").select("objective_id").eq("id", goalId).eq("org_id", orgId).maybeSingle();
      objectiveId = (g.data as { objective_id: string | null } | null)?.objective_id ?? null;
    } else if (parentType === "objective" && parentId) {
      objectiveId = await resolveParent(sb, orgId, "objective", parentId);
      if (!objectiveId) return { error: "Parent objective not found — accept or create it first." };
    }
    if (!goalId && !objectiveId) return { error: "A KPI must ladder to a goal or objective." };
    const { data, error } = await insertRow(sb, "plan_kpis", {
      org_id: orgId,
      goal_id: goalId,
      objective_id: objectiveId,
      title,
      unit: str(payload.unit),
      target: num(payload.target),
      owner: str(payload.owner),
      cadence: str(payload.cadence),
      metric_key: str(payload.metric_key),
    });
    return error ? { error: error.message } : { id: (data as { id: string }).id };
  }

  return { error: `Unknown proposal type: ${type}` };
}
