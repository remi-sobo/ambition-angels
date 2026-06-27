import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { isAckChannel } from "@/lib/fundraising/ack-channels";

// POST /api/admin/acknowledgments/log — record a NON-gift thank-you: a proactive
// note to a donor, a foundation/DAF grant acknowledgment, a volunteer or board
// thank-you, or a milestone touch. The row carries no compliance/receipt block
// (there's no gift behind it), so DAF and volunteer thanks never get
// tax-deductible language. Gift thank-yous still go through /send and /mark.

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const NON_GIFT_SUBJECTS = ["constituent", "opportunity", "volunteer", "milestone"];

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await getAdminUser();

  const body = (await req.json().catch(() => null)) as {
    subject_type?: string;
    subject_id?: string;
    subject_label?: string;
    channel?: string;
    note?: string;
  } | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const subjectType = typeof body.subject_type === "string" ? body.subject_type : "";
  if (!NON_GIFT_SUBJECTS.includes(subjectType)) {
    return NextResponse.json(
      { error: "subject_type must be constituent, opportunity, volunteer, or milestone" },
      { status: 400 }
    );
  }
  const subjectId = typeof body.subject_id === "string" ? body.subject_id : "";
  if (!isUuid(subjectId)) {
    return NextResponse.json({ error: "subject_id (uuid) is required" }, { status: 400 });
  }
  // A logged touch can be any channel (email here means "I emailed them", it
  // does not send); default to a generic log.
  const channel = isAckChannel(body.channel) ? body.channel : "other";

  const supabase = createServerSupabase();
  const { error } = await supabase.from("acknowledgments").insert({
    org_id: ctx.orgId,
    gift_id: null, // no gift behind it → no compliance block, ever
    subject_type: subjectType,
    subject_id: subjectId,
    subject_label: typeof body.subject_label === "string" ? body.subject_label.slice(0, 200) : null,
    template: "non-gift",
    channel,
    body: typeof body.note === "string" ? body.note.slice(0, 1000) : null,
    sent_by: user,
    sent_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[acknowledgments/log]", error.message);
    return NextResponse.json({ error: "Could not log the thank-you" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.acknowledgment.log",
    entityType: "acknowledgments",
    entityId: subjectId,
    after: { subject_type: subjectType, channel },
  });
  return NextResponse.json({ ok: true });
}
