import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import Stripe from "stripe";
import { escapeHtml } from "@/lib/security/escapeHtml";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

const getResend = () => new Resend(process.env.RESEND_API_KEY);

function buildReceiptHTML(firstName: string, amount: number, recurring: boolean): string {
  const formattedAmount = `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const type = recurring ? "monthly recurring" : "one-time";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0E0E0E;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0E0E0E;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1a1d27;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#E8500A;padding:32px;text-align:center;">
            <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;">Ambition Angels</div>
            <div style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">Donation Receipt</div>
          </td>
        </tr>

        <!-- Amount -->
        <tr>
          <td style="padding:40px 40px 0;text-align:center;">
            <div style="font-size:56px;font-weight:900;color:#E8500A;letter-spacing:-2px;line-height:1;">${formattedAmount}</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.4);margin-top:8px;text-transform:uppercase;letter-spacing:0.1em;">${type} gift</div>
          </td>
        </tr>

        <!-- Thank you -->
        <tr>
          <td style="padding:32px 40px 0;">
            <div style="font-size:22px;font-weight:700;color:#ffffff;margin-bottom:12px;">
              Thank you, ${escapeHtml(firstName)}.
            </div>
            <div style="font-size:15px;color:rgba(255,255,255,0.6);line-height:1.7;">
              Your ${type} gift of ${formattedAmount} directly funds career internships for teens who need them most. Every dollar gives a student a real look at what a career feels like — before they have to choose one.
            </div>
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:28px 40px;">
            <div style="height:1px;background:rgba(255,255,255,0.08);"></div>
          </td>
        </tr>

        <!-- Tax statement -->
        <tr>
          <td style="padding:0 40px;">
            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;">
              <div style="font-size:10px;font-weight:700;color:#E8500A;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Tax Deduction Statement</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.5);line-height:1.7;">
                Ambition Angels is a US 501(c)(3) nonprofit. EIN 87-2513010. No goods or services were provided in exchange for this contribution. Please retain this email as your official donation receipt for tax purposes.
              </div>
            </div>
          </td>
        </tr>

        <!-- Signature -->
        <tr>
          <td style="padding:32px 40px 40px;">
            <div style="font-size:14px;color:rgba(255,255,255,0.6);line-height:1.7;margin-bottom:20px;">
              With gratitude,
            </div>
            <div style="font-size:16px;font-weight:700;color:#ffffff;">Remi Sobomehin</div>
            <div style="font-size:13px;color:#E8500A;">Founder &amp; CEO, Ambition Angels</div>
            <div style="margin-top:20px;">
              <a href="https://www.ambitionangels.org" style="color:#E8500A;text-decoration:none;font-size:13px;">ambitionangels.org</a>
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// A tax receipt is only sent for a payment Stripe confirms succeeded, for the
// amount Stripe actually received, to an email address Stripe has on that
// payment. Before this check anyone could make the site email an official
// "Donation Receipt" for any amount to any address.
const getStripe = () =>
  new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-03-25.dahlia" });

function idOf(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "id" in v && typeof (v as { id: unknown }).id === "string") {
    return (v as { id: string }).id;
  }
  return null;
}

async function verifiedPayment(
  paymentId: string,
  subscriptionId: string | null
): Promise<{ amount: number; emails: Set<string> } | null> {
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(paymentId);
  if (pi.status !== "succeeded" || !pi.amount_received) return null;

  const emails = new Set<string>();
  const add = (e: unknown) => {
    if (typeof e === "string" && e.includes("@")) emails.add(e.trim().toLowerCase());
  };
  add(pi.receipt_email);
  add(pi.metadata?.email);

  const customerId = idOf(pi.customer);
  if (customerId) {
    const customer = await stripe.customers.retrieve(customerId);
    if (!("deleted" in customer && customer.deleted)) add((customer as Stripe.Customer).email);
  }
  if (subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    // Only trust the subscription's email when it belongs to the same customer.
    if (customerId && idOf(sub.customer) === customerId) add(sub.metadata?.email);
  }
  return { amount: pi.amount_received / 100, emails };
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(`send-receipt:${getClientIp(req)}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again in a few minutes." }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const paymentId = typeof body?.paymentId === "string" ? body.paymentId : "";
  const subscriptionId = typeof body?.subscriptionId === "string" ? body.subscriptionId : null;
  const recurring = !!body?.recurring;

  if (!email || !/^pi_[A-Za-z0-9_]+$/.test(paymentId)) {
    return NextResponse.json({ error: "Missing email or payment" }, { status: 400 });
  }

  let amount: number;
  try {
    const verified = await verifiedPayment(paymentId, subscriptionId);
    if (!verified || !verified.emails.has(email.toLowerCase())) {
      return NextResponse.json({ error: "Payment not found" }, { status: 400 });
    }
    amount = verified.amount;
  } catch (err) {
    console.error("send-receipt: Stripe lookup failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Payment not found" }, { status: 400 });
  }

  const firstName = name.split(" ")[0] || "Friend";

  try {
    await getResend().emails.send({
      from: "Ambition Angels <careers@mail.ambitionangels.org>",
      to: email,
      subject: `Your donation receipt — Ambition Angels`,
      html: buildReceiptHTML(firstName, amount, recurring),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Resend error:", err);
    return NextResponse.json({ error: "Failed to send receipt" }, { status: 500 });
  }
}
