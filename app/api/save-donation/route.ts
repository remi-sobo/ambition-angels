import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sendToBloomOS } from "@/lib/site/bloomos";

export async function POST(req: NextRequest) {
  // Public write path — throttle per IP to deter spam and card-testing.
  const rl = rateLimit(`save-donation:${getClientIp(req)}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again in a few minutes." }, { status: 429 });
  }

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

  // BloomOS records the gift (upsert by Stripe payment id)
  // and emails Remi. The donor's receipt is send-receipt, unchanged.
  const sent = await sendToBloomOS("donation", {
    firstName: resolvedFirst, lastName: resolvedLast, email: email || null,
    amount: Number(amount), recurring: !!recurring, stripePaymentId, subscriptionId: subscriptionId ?? null,
  });
  if (sent.outcome === "rejected") return NextResponse.json({ error: sent.error }, { status: 400 });
  if (sent.outcome === "failed") return NextResponse.json({ error: "Failed to save." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
