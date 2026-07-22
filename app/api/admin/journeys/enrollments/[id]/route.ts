import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// Phase 3 (specs/donor-lifecycle-journeys.md, Amendment 1 §B.3): cancel a
// single enrollment from the donor profile. Cancel is the only enrollment
// action — the check constraint has no 'paused' status; holding everything
// is done by pausing the whole journey (existing feature).
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.status !== "cancelled") {
    return NextResponse.json({ error: "status must be 'cancelled'" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: enrollment } = await supabase
    .from("journey_enrollments")
    .select("id, status, journey_id, constituent_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!enrollment) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  if (enrollment.status !== "active") {
    return NextResponse.json({ error: "Only active enrollments can be cancelled." }, { status: 400 });
  }

  const { error } = await supabase.from("journey_enrollments").update({ status: "cancelled" }).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(req, {
    action: "fundraising.journey.enrollment.cancel",
    entityType: "journey_enrollments",
    entityId: params.id,
    after: { status: "cancelled", journey_id: enrollment.journey_id, constituent_id: enrollment.constituent_id },
  });
  return NextResponse.json({ ok: true });
}
