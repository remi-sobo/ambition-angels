import { NextRequest, NextResponse } from "next/server";
import { requireEntitlement } from "@/lib/admin/entitlements";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { MATCH_STATUSES } from "@/lib/coach/program";
import { sendIntro, sendPrivateLink, type CoachPerson } from "@/lib/coach/server";

// Staff actions on one Ambition Coach match.
//   status      set the match status
//   send_intro  group intro email (coach + student, Remi cc'd), then each
//               person's private link; match becomes visible on their pages
//   delete      remove a match (sessions and plan go with it)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ent = await requireEntitlement("aa.coach");
  if (!ent.ok) return NextResponse.json({ error: ent.error }, { status: ent.status });
  const orgId = ent.ctx.orgId;
  const db = getSupabaseAdmin();

  const body = await req.json().catch(() => ({}));
  const { data: match } = await db
    .from("coach_matches")
    .select("id, coach_id, student_id, status")
    .eq("org_id", orgId)
    .eq("id", params.id)
    .maybeSingle();
  if (!match) return NextResponse.json({ error: "Match not found." }, { status: 404 });

  if (body.action === "status") {
    if (!(MATCH_STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    }
    const { error } = await db
      .from("coach_matches")
      .update({ status: body.status })
      .eq("org_id", orgId)
      .eq("id", match.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (body.status === "done") {
      await db
        .from("coach_people")
        .update({ status: "done" })
        .eq("org_id", orgId)
        .in("id", [match.coach_id, match.student_id]);
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "send_intro") {
    const { data: people } = await db
      .from("coach_people")
      .select("*")
      .eq("org_id", orgId)
      .in("id", [match.coach_id, match.student_id]);
    const coach = (people ?? []).find((p) => p.id === match.coach_id) as CoachPerson | undefined;
    const student = (people ?? []).find((p) => p.id === match.student_id) as CoachPerson | undefined;
    if (!coach || !student) return NextResponse.json({ error: "Coach or student is missing." }, { status: 404 });
    try {
      await sendIntro(coach, student);
      await Promise.all([sendPrivateLink(coach), sendPrivateLink(student)]);
    } catch (err) {
      return NextResponse.json(
        { error: `The intro didn't send: ${err instanceof Error ? err.message : "unknown error"}` },
        { status: 502 },
      );
    }
    const now = new Date().toISOString();
    await db
      .from("coach_matches")
      .update({ status: match.status === "proposed" ? "intro_sent" : match.status, intro_sent_at: now })
      .eq("org_id", orgId)
      .eq("id", match.id);
    await db
      .from("coach_people")
      .update({ link_sent_at: now })
      .eq("org_id", orgId)
      .in("id", [coach.id, student.id]);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    const { error } = await db.from("coach_matches").delete().eq("org_id", orgId).eq("id", match.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await db
      .from("coach_people")
      .update({ status: "ready" })
      .eq("org_id", orgId)
      .eq("status", "matched")
      .in("id", [match.coach_id, match.student_id]);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
