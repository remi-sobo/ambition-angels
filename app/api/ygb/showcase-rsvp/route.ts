import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`ygb-showcase:${ip}`, { limit: 15, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = str(body.email);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
  }

  // "6+" → 6; clamp to a sane range.
  const guests = parseInt(str(body.guest_count), 10);
  const showcase_guest_count = Number.isFinite(guests) ? Math.min(Math.max(guests, 1), 20) : 1;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ygb_registrations")
    .update({ showcase_attending: true, showcase_guest_count })
    .ilike("parent_email", email)
    .select("id");

  if (error) {
    console.error("YGB showcase RSVP error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "We couldn't find a registration with that email. Please register first." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
