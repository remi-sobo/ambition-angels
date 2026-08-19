import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireComms } from "@/lib/comms/stories-server";

/** Unlink a person from a story. Their consent rows cascade with them. */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase } = g;

  // RLS hides a participant subject from a caller without comms.subjects.read,
  // so the delete simply matches nothing for them — which is the right answer,
  // and reads to the caller as "not found" rather than leaking its existence.
  const { data: deleted, error } = await supabase
    .from("story_subjects")
    .delete()
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .select("story_id, subject_type");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (deleted ?? []) as Array<{ story_id: string; subject_type: string }>;
  if (rows.length === 0) return NextResponse.json({ error: "Subject not found" }, { status: 404 });

  await audit(req, {
    action: "comms.subject.unlink",
    entityType: "story",
    entityId: rows[0].story_id,
    before: { subject_type: rows[0].subject_type },
  });
  return NextResponse.json({ ok: true });
}
