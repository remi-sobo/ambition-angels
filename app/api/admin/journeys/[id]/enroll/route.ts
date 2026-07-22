import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { decideEnrollment } from "@/lib/fundraising/enroll";

// Phase 3 (specs/donor-lifecycle-journeys.md, Amendment 1 §B): manual
// enrollment from the donor profile. All guard logic lives in
// lib/fundraising/enroll.ts (pure, tested); this route gathers the inputs,
// executes the decision, and writes the same row shape the hourly cron
// enroller writes so the cron advances manual enrollees unchanged.
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad journey id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const constituentId = typeof body?.constituent_id === "string" ? body.constituent_id : "";
  if (!isUuid(constituentId)) return NextResponse.json({ error: "constituent_id is required" }, { status: 400 });

  const supabase = createServerSupabase();
  const [journeyRes, cRes, stepRes, existingRes] = await Promise.all([
    supabase.from("journeys").select("id, name, status").eq("id", params.id).maybeSingle(),
    supabase.from("constituents").select("id, emails, do_not_contact").eq("id", constituentId).maybeSingle(),
    supabase
      .from("journey_steps")
      .select("delay_days")
      .eq("journey_id", params.id)
      .order("step_order", { ascending: true })
      .limit(1),
    supabase
      .from("journey_enrollments")
      .select("id, status")
      .eq("journey_id", params.id)
      .eq("constituent_id", constituentId)
      .maybeSingle(),
  ]);
  if (!journeyRes.data) return NextResponse.json({ error: "Journey not found" }, { status: 404 });
  if (journeyRes.data.status !== "active") {
    return NextResponse.json({ error: "This journey is paused — resume it before enrolling anyone." }, { status: 400 });
  }
  if (!cRes.data) return NextResponse.json({ error: "Donor not found" }, { status: 404 });

  const decision = decideEnrollment({
    orgId: ctx.orgId,
    journeyId: params.id,
    constituentId,
    constituent: {
      emails: (cRes.data.emails as string[] | null) ?? null,
      do_not_contact: Boolean(cRes.data.do_not_contact),
    },
    steps: (stepRes.data ?? []) as Array<{ delay_days: number }>,
    existing: (existingRes.data as { id: string; status: string } | null) ?? null,
    nowMs: Date.now(),
  });

  if (decision.kind === "refuse") {
    return NextResponse.json({ error: decision.message }, { status: decision.reason === "already_active" ? 409 : 400 });
  }

  let enrollmentId: string;
  if (decision.kind === "reset") {
    const { error } = await supabase.from("journey_enrollments").update(decision.patch).eq("id", decision.enrollmentId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    enrollmentId = decision.enrollmentId;
  } else {
    const { data, error } = await supabase.from("journey_enrollments").insert(decision.row).select("id").single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not enroll" }, { status: 500 });
    enrollmentId = data.id as string;
  }

  await audit(req, {
    action: "fundraising.journey.enroll",
    entityType: "journey_enrollments",
    entityId: enrollmentId,
    after: { journey_id: params.id, constituent_id: constituentId, mode: decision.kind },
  });
  return NextResponse.json({ ok: true, enrollment_id: enrollmentId });
}
