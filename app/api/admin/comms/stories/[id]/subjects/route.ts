import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireComms, subjectTargetExists } from "@/lib/comms/stories-server";
import { isSubjectType, MAX_LABEL, SUBJECT_TABLE } from "@/lib/comms/stories";

/**
 * Link a person to a story (specs/comms-module.md §6.1).
 *
 * `subject_id` is polymorphic with no database FK, so the validation is here:
 * the target is read through the SESSION client, which proves both that it
 * exists and that it belongs to the caller's org — RLS hides everything else.
 *
 * A `participant` subject is writable only by a caller holding
 * comms.subjects.read. RLS enforces that; this route translates the resulting
 * policy violation into a 403 that says why.
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase, perms } = g;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const subjectType = body.subject_type;
  if (!isSubjectType(subjectType)) {
    return NextResponse.json({ error: "Unknown subject_type" }, { status: 400 });
  }
  if (subjectType === "participant" && !perms.subjects) {
    return NextResponse.json(
      { error: "You don't have permission to link a participant to a story." },
      { status: 403 },
    );
  }

  const label = typeof body.display_label === "string" ? body.display_label.trim() : "";
  if (!label) {
    return NextResponse.json(
      { error: "A display label is required — what may this story call them?" },
      { status: 400 },
    );
  }

  // The story must be visible to the caller, in this org, before anything is
  // attached to it.
  const { data: story } = await supabase
    .from("stories")
    .select("id")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });

  let subjectId: string | null = null;
  if (subjectType !== "none") {
    if (body.subject_id != null && body.subject_id !== "") {
      if (!isUuid(body.subject_id)) {
        return NextResponse.json({ error: "Invalid subject_id" }, { status: 400 });
      }
      const table = SUBJECT_TABLE[subjectType];
      if (!(await subjectTargetExists(supabase, table, ctx.orgId, body.subject_id))) {
        return NextResponse.json({ error: "That record wasn't found" }, { status: 404 });
      }
      subjectId = body.subject_id;
    }
  }

  // Safety default, deliberately stricter than the column's own `false`: a
  // participant at a youth-serving org is assumed to be a minor unless someone
  // says otherwise. is_minor makes the redaction boundary unconditional, and
  // the cost of being wrong in each direction is not symmetric.
  const isMinor =
    typeof body.is_minor === "boolean" ? body.is_minor : subjectType === "participant";

  const { data, error } = await supabase
    .from("story_subjects")
    .insert({
      org_id: ctx.orgId,
      story_id: params.id,
      subject_type: subjectType,
      subject_id: subjectId,
      display_label: label.slice(0, MAX_LABEL),
      is_minor: isMinor,
    })
    .select("id, subject_type, subject_id, display_label, is_minor, created_at")
    .single();

  if (error || !data) {
    // 42501 is the RLS refusal — the participant gate, almost always.
    if (error?.code === "42501") {
      return NextResponse.json(
        { error: "You don't have permission to link that person." },
        { status: 403 },
      );
    }
    console.error("[comms] subject link failed:", error?.message);
    return NextResponse.json({ error: "Could not link that person" }, { status: 500 });
  }

  await audit(req, {
    action: "comms.subject.link",
    entityType: "story",
    entityId: params.id,
    // Never the label or the target id — the audit ledger is not an
    // end-run around the permission that hides them.
    after: { subject_type: subjectType, is_minor: isMinor, linked: !!subjectId },
  });
  return NextResponse.json({ ok: true, subject: data });
}
