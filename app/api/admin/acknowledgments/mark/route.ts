import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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

  const supabase = getSupabaseAdmin();
  const { data: gift, error } = await supabase
    .from("gifts")
    .select("id, acknowledgment_status")
    .eq("id", giftId)
    .maybeSingle();
  if (error || !gift) {
    return NextResponse.json({ error: "Gift not found" }, { status: 404 });
  }
  if (gift.acknowledgment_status === "sent") {
    return NextResponse.json({ error: "This gift is already acknowledged" }, { status: 409 });
  }

  const sentAt = new Date().toISOString();
  const { error: ackErr } = await supabase.from("acknowledgments").insert({
    gift_id: giftId,
    template: "manual",
    channel: "other",
    body: typeof body?.note === "string" ? body.note.slice(0, 500) : null,
    sent_by: user,
    sent_at: sentAt,
  });
  if (ackErr) console.error("acknowledgments insert failed:", ackErr.message);
  const { error: giftErr } = await supabase
    .from("gifts")
    .update({ acknowledgment_status: "sent", acknowledged_at: sentAt })
    .eq("id", giftId);
  if (giftErr) {
    return NextResponse.json({ error: giftErr.message }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.acknowledgment.mark",
    entityType: "gifts",
    entityId: giftId,
    after: { channel: "other" },
  });
  return NextResponse.json({ ok: true });
}
