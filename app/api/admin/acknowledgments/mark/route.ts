import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { closeAckTaskForGift } from "@/lib/fundraising/ack-tasks";
import { isOfflineChannel } from "@/lib/fundraising/ack-channels";

// POST /api/admin/acknowledgments/mark — record that a gift was thanked on a
// non-email channel (handwritten letter, phone call, text, in person). The
// channel is logged on the donor timeline, so "thanked outside the system" is
// a real, labeled touch rather than a silent status flip.
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getAdminUser();
  const body = (await req.json().catch(() => null)) as {
    gift_id?: string;
    note?: string;
    channel?: string;
  } | null;
  const giftId = typeof body?.gift_id === "string" ? body.gift_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(giftId)) {
    return NextResponse.json({ error: "gift_id is required" }, { status: 400 });
  }
  // Real channel when the caller names one (letter/call/text/in_person); the
  // legacy "other" stays the fallback so older clients keep working.
  const channel = isOfflineChannel(body?.channel) ? (body!.channel as string) : "other";

  const supabase = createServerSupabase();
  const sentAt = new Date().toISOString();
  // Atomic conditional flip — same double-acknowledgment guard as /send.
  const { data: claimed, error: claimErr } = await supabase
    .from("gifts")
    .update({ acknowledgment_status: "sent", acknowledged_at: sentAt })
    .eq("id", giftId)
    .neq("acknowledgment_status", "sent")
    .select("id");
  if (claimErr) {
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json(
      { error: "Gift not found or already acknowledged" },
      { status: 409 }
    );
  }

  // Record that the gift was thanked offline closes its ack task too.
  const ackTaskId = await closeAckTaskForGift(supabase, giftId);

  let warning: string | undefined;
  const { error: ackErr } = await supabase.from("acknowledgments").insert({
    org_id: ctx.orgId,
    gift_id: giftId,
    subject_type: "gift",
    subject_id: giftId,
    ops_task_id: ackTaskId,
    template: "manual",
    channel,
    body: typeof body?.note === "string" ? body.note.slice(0, 500) : null,
    sent_by: user,
    sent_at: sentAt,
  });
  if (ackErr) {
    console.error("acknowledgments insert failed:", ackErr.message);
    warning = "Marked as thanked, but the acknowledgment record could not be stored.";
  }

  await audit(req, {
    action: "fundraising.acknowledgment.mark",
    entityType: "gifts",
    entityId: giftId,
    after: { channel },
  });
  return NextResponse.json({ ok: true, warning });
}
