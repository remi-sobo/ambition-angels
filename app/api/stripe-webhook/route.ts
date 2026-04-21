import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

// Stripe webhooks deliver the object shape from the API version at time of
// event creation, which may include fields removed from newer TS type defs.
// We use this looser type to safely access those fields at runtime.
type InvoiceWebhook = Stripe.Invoice & {
  subscription?: string | null;
  payment_intent?: string | Stripe.PaymentIntent | null;
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

const getResend = () => new Resend(process.env.RESEND_API_KEY);

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Must disable body parser so we get raw bytes for signature verification
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing stripe-signature or STRIPE_WEBHOOK_SECRET" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabase();
    switch (event.type) {

      // ── Payment failed (one-time) ──────────────────────────────────────────
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await supabase
          .from("donations")
          .update({ status: "failed" })
          .eq("stripe_payment_id", pi.id);
        break;
      }

      // ── Monthly payment failed — email Remi ───────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as InvoiceWebhook;
        const amt = ((invoice.amount_due ?? 0) / 100).toFixed(2);
        await getResend().emails.send({
          from: "Ambition Angels <careers@mail.ambitionangels.org>",
          to: "remi@ambitionangels.org",
          subject: "⚠️ Monthly donation payment failed",
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fff;border-radius:12px;">
              <h2 style="color:#E8500A;margin:0 0 16px;">Monthly Donation Failed</h2>
              <p style="color:#3D3D3D;margin:0 0 8px;">A monthly donor's payment failed.</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr>
                  <td style="padding:6px 0;color:#9CA3AF;font-size:13px;">Customer</td>
                  <td style="padding:6px 0;color:#0E0E0E;font-size:13px;">${invoice.customer_email ?? "Unknown"}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#9CA3AF;font-size:13px;">Amount</td>
                  <td style="padding:6px 0;color:#E8500A;font-size:13px;font-weight:bold;">$${amt}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#9CA3AF;font-size:13px;">Subscription ID</td>
                  <td style="padding:6px 0;color:#0E0E0E;font-size:12px;font-family:monospace;">${invoice.subscription ?? "N/A"}</td>
                </tr>
              </table>
              <p style="color:#9CA3AF;font-size:12px;margin-top:24px;">Review in <a href="https://dashboard.stripe.com" style="color:#E8500A;">Stripe Dashboard</a></p>
            </div>
          `,
        });
        break;
      }

      // ── Monthly payment succeeded — insert new donation row ───────────────
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as InvoiceWebhook;

        // Only record subscription renewals (not the initial charge, which is
        // handled client-side in DonateModal → save-donation)
        if (invoice.subscription && invoice.billing_reason === "subscription_cycle") {
          const piRaw = invoice.payment_intent;
          const piId = typeof piRaw === "string" ? piRaw : (piRaw as Stripe.PaymentIntent | null)?.id;
          const amt = (invoice.amount_paid ?? 0) / 100;

          await supabase.from("donations").insert({
            email: invoice.customer_email ?? null,
            amount: amt,
            recurring: true,
            stripe_payment_id: piId ?? invoice.id,
            subscription_id: invoice.subscription,
            status: "succeeded",
          });

          // Notify Remi on recurring renewals (non-blocking)
          void getResend().emails.send({
            from: "Ambition Angels <careers@mail.ambitionangels.org>",
            to: "remi@ambitionangels.org",
            subject: `🔁 Monthly renewal: $${amt.toFixed(2)}`,
            html: `
              <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#fff;border-radius:12px;">
                <h2 style="color:#E8500A;margin:0 0 16px;font-size:18px;">Monthly donation renewed — $${amt.toFixed(2)}</h2>
                <table style="width:100%;border-collapse:collapse;font-size:14px;">
                  <tr><td style="padding:6px 12px 6px 0;color:#6B7280;">Donor</td><td style="padding:6px 0;color:#0E0E0E;">${invoice.customer_email ?? "Unknown"}</td></tr>
                  <tr><td style="padding:6px 12px 6px 0;color:#6B7280;">Amount</td><td style="padding:6px 0;color:#E8500A;font-weight:bold;">$${amt.toFixed(2)}</td></tr>
                  <tr><td style="padding:6px 12px 6px 0;color:#6B7280;">Subscription</td><td style="padding:6px 0;color:#6B7280;font-family:monospace;font-size:12px;">${invoice.subscription}</td></tr>
                </table>
                <p style="color:#9CA3AF;font-size:12px;margin-top:20px;">View in <a href="https://dashboard.stripe.com" style="color:#E8500A;">Stripe</a></p>
              </div>
            `,
          }).catch((e) => console.error("Resend notify error:", e));
        }
        break;
      }

      // ── Subscription cancelled — mark records ─────────────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await supabase
          .from("donations")
          .update({ status: "cancelled" })
          .eq("subscription_id", sub.id);
        break;
      }

      default:
        // Unhandled event — that's fine
        break;
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    // Return 200 so Stripe doesn't retry indefinitely for non-critical errors
    return NextResponse.json({ received: true, warning: "Handler error" });
  }

  return NextResponse.json({ received: true });
}
