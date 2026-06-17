/**
 * PATCH /api/admin/strategy/funder-angles/[id] — move stage, record the go/no-go
 * decision, or edit triage notes. DELETE removes the funder from the angle
 * (the constituent and its gifts are untouched). Opportunity creation on
 * "pursue" is Phase 3 and goes through the opportunities route, not here.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const STAGES = ["shortlist", "qualified", "researched", "pursuing", "parked", "passed"];
const DECISIONS = ["pursue", "park", "pass"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (typeof body.stage === "string" && STAGES.includes(body.stage)) update.stage = body.stage;
  if ("decision" in body) {
    if (body.decision === null) update.decision = null;
    else if (typeof body.decision === "string" && DECISIONS.includes(body.decision)) update.decision = body.decision;
  }
  if ("fit_notes" in body) {
    update.fit_notes =
      body.fit_notes === null || body.fit_notes === ""
        ? null
        : typeof body.fit_notes === "string"
        ? body.fit_notes.slice(0, 4000)
        : undefined;
    if (update.fit_notes === undefined) delete update.fit_notes;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.from("funder_angles").update(update).eq("id", params.id);
  if (error) {
    console.error("[funder-angles] update failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.funder_angle.update",
    entityType: "funder_angles",
    entityId: params.id,
    after: update,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const supabase = createServerSupabase();
  const { error } = await supabase.from("funder_angles").delete().eq("id", params.id);
  if (error) {
    console.error("[funder-angles] delete failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.funder_angle.delete",
    entityType: "funder_angles",
    entityId: params.id,
  });
  return NextResponse.json({ ok: true });
}
