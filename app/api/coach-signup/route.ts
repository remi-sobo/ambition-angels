import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sendToBloomOS } from "@/lib/site/bloomos";

// Ambition Coach sign-up (/coach). One form, two kinds: a professional
// volunteering to coach, or a young adult asking for a coach. Rows land in
// coach_people for the resident org and are worked in BloomOS at
// /admin/programs/coach (fenced by aa.coach). Whitelisted fields only;
// status is set by staff, never by the client.

const clean = (v: unknown, max = 500): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export async function POST(req: NextRequest) {
  const rl = rateLimit(`coach-signup:${getClientIp(req)}`, { limit: 8, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many sign-ups from this connection. Please try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot: real people never fill this hidden field.
  if (clean(body.website)) return NextResponse.json({ success: true });

  const kind = body.kind === "student" ? "student" : body.kind === "coach" ? "coach" : null;
  if (!kind) return NextResponse.json({ error: "Choose coach or student." }, { status: 400 });

  const first_name = clean(body.first_name, 80);
  const last_name = clean(body.last_name, 80);
  const email = clean(body.email, 200).toLowerCase();
  const phone = clean(body.phone, 40);
  const field = clean(body.field, 120);
  const role = clean(body.role, 160);
  const company = clean(body.company, 120);
  const linkedin = clean(body.linkedin, 300);
  const school = clean(body.school, 160);
  const program = clean(body.program, 160);
  const goal = clean(body.goal, 1000);
  const ageRaw = clean(body.age, 3);
  const timing = clean(body.timing, 80);
  const referral = clean(body.referral, 200);
  const note = clean(body.note, 1500);

  if (!first_name || !last_name || !email || !field) {
    return NextResponse.json({ error: "Please add your name, email and field." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
  }
  if (kind === "coach" && !role) {
    return NextResponse.json({ error: "Please add your role." }, { status: 400 });
  }
  let age: number | null = null;
  if (kind === "student") {
    age = /^\d{1,2}$/.test(ageRaw) ? Number(ageRaw) : null;
    if (age === null || age < 16 || age > 30) {
      return NextResponse.json({ error: "Please add your age. Ambition Coach is for ages 18 to 24." }, { status: 400 });
    }
    if (age < 18) {
      return NextResponse.json(
        { error: "Ambition Coach is for ages 18 to 24 right now. Ask your teacher or program about introships on Ambition." },
        { status: 400 },
      );
    }
  }

  // BloomOS stores the sign-up and sends BOTH emails, because
  // the confirmation carries a private coach link only BloomOS can make.
  const sent = await sendToBloomOS("coach_signup", {
    kind, first_name, last_name, email, phone, field, role, company, linkedin,
    age: ageRaw, school, program, goal, timing, referral, note,
  });
  if (sent.outcome === "rejected") return NextResponse.json({ error: sent.error }, { status: 400 });
  if (sent.outcome === "failed") {
    return NextResponse.json(
      { error: "We couldn't save that. Please try again, or email hello@ambitionangels.org." },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true });
}
