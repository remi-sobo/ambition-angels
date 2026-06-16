import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const STAGES = [
  "identify", "qualify", "cultivate", "solicit", "steward", "lost",
] as const;

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// PATCH /api/admin/opportunities/:id — partial update; the most-used field
// is `stage` (the pipeline move).
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
  if ("name" in body)
    update.name =
      body.name === null || body.name === ""
        ? null
        : typeof body.name === "string"
        ? body.name.trim().slice(0, 200)
        : undefined;
  if ("ask_amount" in body) {
    if (body.ask_amount === null) update.ask_amount = null;
    else if (typeof body.ask_amount === "number" && body.ask_amount >= 0)
      update.ask_amount = Math.round(body.ask_amount * 100) / 100;
  }
  if ("probability" in body) {
    if (body.probability === null) update.probability = null;
    else if (typeof body.probability === "number" && body.probability >= 0 && body.probability <= 100)
      update.probability = Math.round(body.probability);
  }
  if ("capacity_rating" in body) {
    if (body.capacity_rating === null) update.capacity_rating = null;
    else if (
      typeof body.capacity_rating === "number" &&
      body.capacity_rating >= 1 &&
      body.capacity_rating <= 5
    )
      update.capacity_rating = Math.round(body.capacity_rating);
  }
  if ("affinity_rating" in body) {
    if (body.affinity_rating === null) update.affinity_rating = null;
    else if (
      typeof body.affinity_rating === "number" &&
      body.affinity_rating >= 1 &&
      body.affinity_rating <= 5
    )
      update.affinity_rating = Math.round(body.affinity_rating);
  }
  if ("expected_close" in body) {
    if (body.expected_close === null || body.expected_close === "") update.expected_close = null;
    else if (isISODate(body.expected_close)) update.expected_close = body.expected_close;
  }
  if ("next_step" in body)
    update.next_step =
      body.next_step === null || body.next_step === ""
        ? null
        : typeof body.next_step === "string"
        ? body.next_step.trim().slice(0, 500)
        : undefined;
  if (update.next_step === undefined) delete update.next_step;
  if ("next_step_due" in body) {
    if (body.next_step_due === null || body.next_step_due === "") update.next_step_due = null;
    else if (isISODate(body.next_step_due)) update.next_step_due = body.next_step_due;
  }
  if ("owner" in body)
    update.owner =
      body.owner === null || body.owner === ""
        ? null
        : typeof body.owner === "string"
        ? body.owner.trim().slice(0, 100)
        : undefined;
  if (update.owner === undefined) delete update.owner;
  if ("notes" in body)
    update.notes =
      body.notes === null || body.notes === ""
        ? null
        : typeof body.notes === "string"
        ? body.notes.slice(0, 4000)
        : undefined;
  if (update.notes === undefined) delete update.notes;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: before } = await supabase
    .from("opportunities")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("opportunities").update(update).eq("id", params.id);
  if (error) {
    console.error("Update opportunity failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await audit(req, {
    action:
      "stage" in update ? "fundraising.opportunity.stage" : "fundraising.opportunity.update",
    entityType: "opportunity",
    entityId: params.id,
    before,
    after: update,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: before } = await supabase
    .from("opportunities")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("opportunities").delete().eq("id", params.id);
  if (error) {
    console.error("Delete opportunity failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.opportunity.delete",
    entityType: "opportunity",
    entityId: params.id,
    before,
  });

  return NextResponse.json({ ok: true });
}
