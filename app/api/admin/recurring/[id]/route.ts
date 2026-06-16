import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const STATUSES = ["active", "paused", "cancelled"] as const;
const FREQS = ["weekly", "monthly", "quarterly", "annually"] as const;

// PATCH a recurring plan: status (pause/resume/cancel), amount, frequency.
// Pausing/cancelling clears the failure flag (it's no longer actionable).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (STATUSES.includes(body.status as (typeof STATUSES)[number])) {
    update.status = body.status;
    if (body.status !== "active") update.last_payment_failed_at = null;
  }
  if (typeof body.amount === "number" && body.amount > 0) update.amount = Math.round(body.amount * 100) / 100;
  if (FREQS.includes(body.frequency as (typeof FREQS)[number])) update.frequency = body.frequency;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.from("recurring_plans").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(req, {
    action: "fundraising.recurring.update",
    entityType: "recurring_plans",
    entityId: params.id,
    after: update,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const supabase = createServerSupabase();
  const { error } = await supabase.from("recurring_plans").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(req, {
    action: "fundraising.recurring.delete",
    entityType: "recurring_plans",
    entityId: params.id,
  });
  return NextResponse.json({ ok: true });
}
