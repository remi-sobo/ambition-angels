import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-03-31.basil",
});

export async function POST(req: NextRequest) {
  const { amount, name, email, recurring, paymentMethodId } = await req.json();

  if (!amount || amount < 1) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const amountCents = Math.round(amount * 100);

  try {
    if (!recurring) {
      // ── One-time PaymentIntent ──
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: "usd",
        receipt_email: email || undefined,
        metadata: { name: name || "", email: email || "", type: "one-time" },
      });

      return NextResponse.json({ clientSecret: paymentIntent.client_secret });
    } else {
      // ── Recurring: Customer + Subscription ──
      if (!paymentMethodId) {
        return NextResponse.json({ error: "paymentMethodId required for recurring" }, { status: 400 });
      }

      // Find or create customer
      const customers = await stripe.customers.list({ email: email || undefined, limit: 1 });
      let customer = customers.data[0];
      if (!customer) {
        customer = await stripe.customers.create({
          email: email || undefined,
          name: name || undefined,
          payment_method: paymentMethodId,
          invoice_settings: { default_payment_method: paymentMethodId },
          metadata: { source: "ambition_angels_donation" },
        });
      } else {
        await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
        await stripe.customers.update(customer.id, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });
      }

      // Find or create a price for this amount
      const prices = await stripe.prices.list({
        active: true,
        type: "recurring",
        currency: "usd",
        expand: ["data.product"],
      });

      let price = prices.data.find((p) => p.unit_amount === amountCents);

      if (!price) {
        // Find or create the product
        const products = await stripe.products.list({ active: true });
        let product = products.data.find((p) => p.name === "Monthly Donation – Ambition Angels");
        if (!product) {
          product = await stripe.products.create({ name: "Monthly Donation – Ambition Angels" });
        }

        price = await stripe.prices.create({
          unit_amount: amountCents,
          currency: "usd",
          recurring: { interval: "month" },
          product: product.id,
        });
      }

      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: price.id }],
        payment_settings: {
          payment_method_types: ["card"],
          save_default_payment_method: "on_subscription",
        },
        expand: ["latest_invoice.payment_intent"],
        metadata: { name: name || "", email: email || "", type: "recurring" },
      });

      const invoice = subscription.latest_invoice as Stripe.Invoice;
      const paymentIntent = invoice?.payment_intent as Stripe.PaymentIntent;

      return NextResponse.json({
        clientSecret: paymentIntent?.client_secret ?? null,
        subscriptionId: subscription.id,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error("Stripe error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
