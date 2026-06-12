import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import {
  receiptEmailText,
  receiptEmailHtml,
  type ReceiptGift,
} from "@/lib/fundraising/receipt";

// POST /api/admin/acknowledgments/send — send the thank-you + receipt for
// one gift. The caller supplies only the personal note and subject; the
// IRS compliance block is rebuilt here from the gift row, so the client
// cannot alter or omit it.
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getAdminUser();
  const body = (await req.json().catch(() => null)) as {
    gift_id?: string;
    subject?: string;
    personal_note?: string;
  } | null;
  const giftId = typeof body?.gift_id === "string" ? body.gift_id : "";
  const personalNote = typeof body?.personal_note === "string" ? body.personal_note.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(giftId)) {
    return NextResponse.json({ error: "gift_id is required" }, { status: 400 });
  }
  if (!personalNote) {
    return NextResponse.json({ error: "personal_note is required" }, { status: 400 });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY is not configured" }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  const { data: gift, error } = await supabase
    .from("gifts")
    .select(
      "id, amount, gift_date, method, fair_market_value, deductible_amount, acknowledgment_status, constituent:constituents(first_name, last_name, org_name, type, emails)"
    )
    .eq("id", giftId)
    .maybeSingle();
  if (error || !gift) {
    return NextResponse.json({ error: "Gift not found" }, { status: 404 });
  }
  if (gift.acknowledgment_status === "sent") {
    return NextResponse.json({ error: "This gift is already acknowledged" }, { status: 409 });
  }
  const constituent = gift.constituent as unknown as {
    first_name: string | null;
    last_name: string | null;
    org_name: string | null;
    type: string;
    emails: string[];
  } | null;
  const toEmail = constituent?.emails?.[0];
  if (!toEmail) {
    return NextResponse.json(
      { error: "This donor has no email on file — use 'Mark as thanked' for letters/calls." },
      { status: 400 }
    );
  }

  const receiptGift: ReceiptGift = {
    amount: Number(gift.amount),
    gift_date: gift.gift_date,
    method: gift.method,
    fair_market_value: gift.fair_market_value === null ? null : Number(gift.fair_market_value),
    deductible_amount: gift.deductible_amount === null ? null : Number(gift.deductible_amount),
  };
  const subject =
    typeof body?.subject === "string" && body.subject.trim()
      ? body.subject.trim().slice(0, 150)
      : "Thank you for supporting Ambition Angels";
  const text = receiptEmailText(personalNote, receiptGift);
  const html = receiptEmailHtml(personalNote, receiptGift);

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: sendErr } = await resend.emails.send({
      from: "Ambition Angels <careers@mail.ambitionangels.org>",
      to: toEmail,
      subject,
      text,
      html,
    });
    if (sendErr) {
      console.error("Acknowledgment send failed:", sendErr);
      return NextResponse.json({ error: "Email send failed" }, { status: 502 });
    }
  } catch (e) {
    console.error("Acknowledgment send failed:", e);
    return NextResponse.json({ error: "Email send failed" }, { status: 502 });
  }

  const sentAt = new Date().toISOString();
  // Record the exact content (regenerable + auditable), then flip the gift.
  const { error: ackErr } = await supabase.from("acknowledgments").insert({
    gift_id: giftId,
    template: "receipt-v1",
    channel: "email",
    subject,
    body: text,
    sent_by: user,
    sent_at: sentAt,
  });
  if (ackErr) console.error("acknowledgments insert failed:", ackErr.message);
  const { error: giftErr } = await supabase
    .from("gifts")
    .update({ acknowledgment_status: "sent", acknowledged_at: sentAt })
    .eq("id", giftId);
  if (giftErr) console.error("gift ack-status update failed:", giftErr.message);

  await audit(req, {
    action: "fundraising.acknowledgment.send",
    entityType: "gifts",
    entityId: giftId,
    after: { to: toEmail, subject, channel: "email" },
  });
  return NextResponse.json({ ok: true });
}
