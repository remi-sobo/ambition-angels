import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const getResend = () => new Resend(process.env.RESEND_API_KEY);

function buildDonationNotifyHTML(params: {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  amount: number;
  recurring: boolean;
  stripePaymentId: string;
}): string {
  const donor = [params.first_name, params.last_name].filter(Boolean).join(" ") || "Anonymous";
  const amountStr = `$${params.amount.toFixed(2)}`;
  const cadence = params.recurring ? "Monthly recurring" : "One-time";
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#fff;border-radius:12px;">
      <h2 style="color:#E8500A;margin:0 0 16px;font-size:18px;">New donation — ${amountStr}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 12px 6px 0;color:#6B7280;">Donor</td><td style="padding:6px 0;color:#0E0E0E;">${donor}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#6B7280;">Email</td><td style="padding:6px 0;color:#0E0E0E;">${params.email ? `<a href="mailto:${params.email}" style="color:#E8500A;text-decoration:none;">${params.email}</a>` : "—"}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#6B7280;">Amount</td><td style="padding:6px 0;color:#E8500A;font-weight:bold;">${amountStr}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#6B7280;">Cadence</td><td style="padding:6px 0;color:#0E0E0E;">${cadence}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#6B7280;">Stripe ID</td><td style="padding:6px 0;color:#6B7280;font-family:monospace;font-size:12px;">${params.stripePaymentId}</td></tr>
      </table>
      <p style="color:#9CA3AF;font-size:12px;margin-top:20px;">View all in <a href="https://www.ambitionangels.org/admin" style="color:#E8500A;">admin</a> · <a href="https://dashboard.stripe.com" style="color:#E8500A;">Stripe</a></p>
    </div>
  `;
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const {
    firstName,
    lastName,
    name,        // legacy fallback
    email,
    amount,
    recurring,
    stripePaymentId,
    subscriptionId,
  } = await req.json();

  if (!amount || !stripePaymentId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Support both new (firstName/lastName) and old (name) shapes
  const resolvedFirst = firstName ?? (name ? name.split(" ")[0] : null) ?? null;
  const resolvedLast  = lastName  ?? (name ? name.split(" ").slice(1).join(" ") : null) ?? null;

  const { error } = await supabase.from("donations").insert({
    first_name: resolvedFirst,
    last_name:  resolvedLast,
    email:      email || null,
    amount:     Number(amount),
    recurring:  !!recurring,
    stripe_payment_id: stripePaymentId,
    subscription_id:   subscriptionId ?? null,
    status:     "succeeded",
  });

  if (error) {
    // If the new columns don't exist yet, fall back to old schema
    if (error.message?.includes("first_name") || error.message?.includes("last_name")) {
      const { error: fallbackError } = await supabase.from("donations").insert({
        name:  [resolvedFirst, resolvedLast].filter(Boolean).join(" ") || null,
        email: email || null,
        amount: Number(amount),
        recurring: !!recurring,
        stripe_payment_id: stripePaymentId,
      });
      if (fallbackError) {
        console.error("Supabase fallback error:", fallbackError);
        return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      }
      // Notify Remi on legacy-schema success too
      void getResend().emails.send({
        from: "Ambition Angels <careers@mail.ambitionangels.org>",
        to: "remi@ambitionangels.org",
        subject: `💸 New donation: $${Number(amount).toFixed(2)}${recurring ? " /mo" : ""}`,
        html: buildDonationNotifyHTML({
          first_name: resolvedFirst,
          last_name: resolvedLast,
          email: email || null,
          amount: Number(amount),
          recurring: !!recurring,
          stripePaymentId,
        }),
      }).catch((e) => console.error("Resend notify error:", e));
      return NextResponse.json({ ok: true, schema: "legacy" });
    }
    console.error("Supabase error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notify Remi — every successful donation (non-blocking)
  void getResend().emails.send({
    from: "Ambition Angels <careers@mail.ambitionangels.org>",
    to: "remi@ambitionangels.org",
    subject: `💸 New donation: $${Number(amount).toFixed(2)}${recurring ? " /mo" : ""}`,
    html: buildDonationNotifyHTML({
      first_name: resolvedFirst,
      last_name: resolvedLast,
      email: email || null,
      amount: Number(amount),
      recurring: !!recurring,
      stripePaymentId,
    }),
  }).catch((e) => console.error("Resend notify error:", e));

  return NextResponse.json({ ok: true });
}
