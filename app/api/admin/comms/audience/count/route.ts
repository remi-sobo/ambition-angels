import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin/requirePermission";
import { resolveRecipients } from "@/lib/fundraising/segments";
import { MAX_RECIPIENTS } from "@/lib/comms/queue-plan";

/**
 * The segment builder's live count (V4 Stage D). Resolves a saved segment, or
 * an unsaved definition being built, through the SAME resolver the send path
 * queues with (lib/fundraising/segments.ts), so the number on screen is the
 * number that would be emailed. Read-only; nothing is saved or queued.
 *
 * Fail closed, inherited from the resolver: an unknown filter or view
 * resolves to nobody with the reason, "My donors" is refused, archived
 * constituents are never members, and do-not-contact, unsubscribed and
 * no-email people are counted out by reason.
 */

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function POST(req: NextRequest) {
  const gate = await requirePermission("fundraising.read", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const orgId = gate.ctx.orgId;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const supabase = createServerSupabase();
  let definition: unknown = body.definition;
  if (isUuid(body.segment_id)) {
    const { data: seg } = await supabase
      .from("segments")
      .select("definition")
      .eq("org_id", orgId)
      .eq("id", body.segment_id)
      .maybeSingle();
    if (!seg) return NextResponse.json({ error: "That audience wasn't found." }, { status: 404 });
    definition = seg.definition;
  }
  const r = await resolveRecipients(supabase, definition ?? {}, orgId);
  return NextResponse.json({
    recipients: r.recipients.length,
    excluded: r.excluded,
    error: r.error ?? null,
    max_recipients: MAX_RECIPIENTS,
    // A few names so the person can sanity-check who is in it.
    sample: r.recipients.slice(0, 5).map((x) => x.name),
    checked_at: new Date().toISOString(),
  });
}
