import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";
import { planEnrollment, parseEnrollBody } from "@/lib/admin/program/enroll";

/**
 * POST /api/admin/programs/enroll   { ids: string[], cohort_id: string }
 *
 * Bulk enroll (V4 Stage E, spec §9 "Enroll a roster in a cohort: under 10
 * clicks"). The Roster's "Enroll in cohort…" bulk action (DataTable v2
 * `choose`) sends the selected participant ids and the chosen cohort here.
 *
 * Fences, in order:
 *  1. program.write (requirePermission; the active org comes from it);
 *  2. the target cohort must be in the ACTIVE org (else 404) and not archived;
 *  3. every read and write is pinned to org_id = ctx.orgId, so a participant
 *     id from another org is skipped, never enrolled;
 *  4. idempotent: someone already enrolled (or finished) is left alone; a
 *     dropped member is re-enrolled; only new people are inserted. Sending
 *     the same request twice changes nothing the second time.
 * One audit row per request, with the counts and the ids written.
 */
export async function POST(req: NextRequest) {
  const gate = await requirePermission("program.write");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;

  const parsed = parseEnrollBody(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { ids, cohortId } = parsed;

  const db = getSupabaseAdmin();
  const { data: cohort } = await db
    .from("cohorts")
    .select("id, name, status")
    .eq("org_id", ctx.orgId)
    .eq("id", cohortId)
    .maybeSingle();
  if (!cohort) return NextResponse.json({ error: "That cohort is not in this organization." }, { status: 404 });
  if (cohort.status === "archived") {
    return NextResponse.json({ error: "That cohort is archived. Reopen it before adding people." }, { status: 409 });
  }

  const [{ data: people, error: peopleErr }, { data: existing, error: existingErr }] = await Promise.all([
    db.from("students").select("id").eq("org_id", ctx.orgId).in("id", ids),
    db
      .from("cohort_members")
      .select("id, student_id, status")
      .eq("org_id", ctx.orgId)
      .eq("cohort_id", cohortId)
      .in("student_id", ids),
  ]);
  if (peopleErr || existingErr) {
    console.error("[enroll] read failed:", peopleErr?.message ?? existingErr?.message);
    return NextResponse.json({ error: "Could not read the roster. Nothing was changed." }, { status: 500 });
  }

  const plan = planEnrollment(
    ids,
    ((people ?? []) as { id: string }[]).map((p) => p.id),
    (existing ?? []) as { id: string; student_id: string; status: string }[],
  );
  if (plan.inOrg === 0) {
    return NextResponse.json({ error: "Those people were not found in this organization." }, { status: 404 });
  }

  if (plan.insert.length > 0) {
    const { error } = await db.from("cohort_members").upsert(
      plan.insert.map((student_id) => ({ org_id: ctx.orgId, cohort_id: cohortId, student_id, status: "enrolled" })),
      { onConflict: "cohort_id,student_id", ignoreDuplicates: true },
    );
    if (error) {
      console.error("[enroll] insert failed:", error.message);
      return NextResponse.json({ error: "Could not enroll them. Nothing was changed." }, { status: 500 });
    }
  }
  if (plan.reenroll.length > 0) {
    const { error } = await db
      .from("cohort_members")
      .update({ status: "enrolled", ended_on: null })
      .eq("org_id", ctx.orgId)
      .eq("cohort_id", cohortId)
      .in("id", plan.reenroll);
    if (error) {
      console.error("[enroll] re-enroll failed:", error.message);
      return NextResponse.json({ error: "Some people could not be re-enrolled. Try again." }, { status: 500 });
    }
  }

  const counts = {
    added: plan.insert.length,
    reenrolled: plan.reenroll.length,
    already: plan.already,
    skipped: plan.skipped,
  };
  if (counts.added + counts.reenrolled > 0) {
    await audit(req, {
      action: "program.cohort.bulk_enroll",
      entityType: "cohort",
      entityId: cohortId,
      after: { ...counts, student_ids: plan.insert.concat(plan.reenrollStudents) },
    });
  }
  return NextResponse.json({ ok: true, cohort: { id: cohort.id, name: cohort.name }, ...counts });
}
