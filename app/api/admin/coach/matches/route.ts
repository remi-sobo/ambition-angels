import { NextRequest, NextResponse } from "next/server";
import { requireEntitlement } from "@/lib/admin/entitlements";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Create an Ambition Coach match: one coach + one student, plus its four
// session rows. Starts "proposed" (invisible on the private pages) until
// staff send the intro.
export async function POST(req: NextRequest) {
  const ent = await requireEntitlement("aa.coach");
  if (!ent.ok) return NextResponse.json({ error: ent.error }, { status: ent.status });
  const orgId = ent.ctx.orgId;
  const db = getSupabaseAdmin();

  const body = await req.json().catch(() => ({}));
  const coachId = typeof body.coach_id === "string" ? body.coach_id : "";
  const studentId = typeof body.student_id === "string" ? body.student_id : "";
  if (!coachId || !studentId) return NextResponse.json({ error: "Pick a coach and a student." }, { status: 400 });

  const { data: people } = await db
    .from("coach_people")
    .select("id, kind")
    .eq("org_id", orgId)
    .in("id", [coachId, studentId]);
  const coach = people?.find((p) => p.id === coachId);
  const student = people?.find((p) => p.id === studentId);
  if (coach?.kind !== "coach" || student?.kind !== "student") {
    return NextResponse.json({ error: "That pairing isn't a coach and a student." }, { status: 400 });
  }

  const { data: existing } = await db
    .from("coach_matches")
    .select("id")
    .eq("org_id", orgId)
    .eq("student_id", studentId)
    .in("status", ["proposed", "intro_sent", "active"])
    .limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json({ error: "That student already has an open match." }, { status: 409 });
  }

  const { data: match, error } = await db
    .from("coach_matches")
    .insert({ org_id: orgId, coach_id: coachId, student_id: studentId })
    .select("id")
    .single();
  if (error || !match) return NextResponse.json({ error: error?.message ?? "Couldn't create the match." }, { status: 500 });

  const { error: sErr } = await db
    .from("coach_sessions")
    .insert([1, 2, 3, 4].map((n) => ({ org_id: orgId, match_id: match.id, n })));
  if (sErr) {
    await db.from("coach_matches").delete().eq("org_id", orgId).eq("id", match.id);
    return NextResponse.json({ error: sErr.message }, { status: 500 });
  }

  await db.from("coach_people").update({ status: "matched" }).eq("org_id", orgId).in("id", [coachId, studentId]);
  return NextResponse.json({ ok: true, id: match.id });
}
