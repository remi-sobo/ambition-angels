import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServerSupabase } from "@/lib/supabase/server";
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

  const supabase = createServerSupabase();
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
  const sentAt = new Date().toISOString();

  // Claim the gift BEFORE emailing: an atomic conditional update is the
  // double-send guard — two overlapping requests can't both pass it. If the
  // email then fails, the claim is reverted.
  const { data: claimed, error: claimErr } = await supabase
    .from("gifts")
    .update({ acknowledgment_status: "sent", acknowledged_at: sentAt })
    .eq("id", giftId)
    .eq("acknowledgment_status", "pending")
    .select("id");
  if (claimErr) {
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json(
      { error: "This gift is already acknowledged (or being acknowledged right now)" },
      { status: 409 }
    );
  }

  // Two failure shapes, two responses (exactly-once is impossible against
  // an external mail API, so choose the safe side of each):
  // - Resend returns an error object → the email definitively did NOT go
  //   out: release the claim, fully retryable.
  // - The call throws (network/timeout) → the email MAY have gone out:
  //   keep the claim so the queue can't double-email a donor, and tell the
  //   operator to verify in Resend.
  let sendResult: Awaited<ReturnType<Resend["emails"]["send"]>>;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    sendResult = await resend.emails.send({
      from: "Ambition Angels <careers@mail.ambitionangels.org>",
      to: toEmail,
      subject,
      text,
      html,
    });
  } catch (e) {
    console.error("Acknowledgment send outcome unknown:", e);
    return NextResponse.json(
      {
        error:
          "Send status unknown — the gift stays marked as acknowledged so the donor can't be double-emailed. Check the Resend dashboard; if it truly failed, re-thank from the donor's profile.",
      },
      { status: 502 }
    );
  }
  if (sendResult.error) {
    console.error("Acknowledgment send rejected:", sendResult.error);
    // Definitive rejection — release the claim for retry.
    await supabase
      .from("gifts")
      .update({ acknowledgment_status: "pending", acknowledged_at: null })
      .eq("id", giftId);
    return NextResponse.json({ error: "Email send failed — try again" }, { status: 502 });
  }

  // Email is out and the gift is already marked sent. A failure recording
  // the content can't un-send the email — report it as a warning, never as
  // failure (the queue must not re-email this gift).
  let warning: string | undefined;
  const { error: ackErr } = await supabase.from("acknowledgments").insert({
    gift_id: giftId,
    template: "receipt-v1",
    channel: "email",
    subject,
    body: text,
    sent_by: user,
    sent_at: sentAt,
  });
  if (ackErr) {
    console.error("acknowledgments insert failed:", ackErr.message);
    warning = "Email sent, but the content record could not be stored.";
  }

  await audit(req, {
    action: "fundraising.acknowledgment.send",
    entityType: "gifts",
    entityId: giftId,
    after: { to: toEmail, subject, channel: "email" },
  });
  return NextResponse.json({ ok: true, warning });
}
