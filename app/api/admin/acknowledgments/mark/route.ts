import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// POST /api/admin/acknowledgments/mark — record that a gift was thanked
// outside the system (handwritten letter, phone call, in person). Keeps the
// queue honest without forcing every thank-you through email.
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getAdminUser();
  const body = (await req.json().catch(() => null)) as {
    gift_id?: string;
    note?: string;
  } | null;
  const giftId = typeof body?.gift_id === "string" ? body.gift_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(giftId)) {
    return NextResponse.json({ error: "gift_id is required" }, { status: 400 });
  }

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

  let warning: string | undefined;
  const { error: ackErr } = await supabase.from("acknowledgments").insert({
    gift_id: giftId,
    template: "manual",
    channel: "other",
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
    after: { channel: "other" },
  });
  return NextResponse.json({ ok: true, warning });
}
