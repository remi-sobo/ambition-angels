import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
      return NextResponse.json({ ok: true, schema: "legacy" });
    }
    console.error("Supabase error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
