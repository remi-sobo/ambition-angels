import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sendToBloomOS } from "@/lib/site/bloomos";

// Values the "How would you like to engage?" checkboxes can send. Anything
// outside this set is dropped so the column can't be stuffed with junk.
const ENGAGEMENT_OPTIONS = [
  "As a potential funder",
  "As a connector",
  "As a mentor",
  "Just staying informed",
];

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── POST /api/demoday/signup ─────────────────────────────────────────────────
// Public endpoint hit by the static signup page (public/demoday/signup). Saves
// the supporter to `demoday_signups` (shown in /admin/demoday) and emails Remi.
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`demoday-signup:${ip}`, { limit: 12, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many submissions from this connection. Please try again later." },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const firstName = str(body.first_name);
  const lastName = str(body.last_name);
  const email = str(body.email);

  if (!firstName || !lastName || !email) {
    return NextResponse.json(
      { error: "First name, last name, and email are required." },
      { status: 400 }
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  // Whitelist the engagement selections; ignore anything unexpected.
  const engagement = Array.isArray(body.engagement)
    ? body.engagement
        .map((v) => str(v))
        .filter((v) => ENGAGEMENT_OPTIONS.includes(v))
    : [];

  const row = {
    first_name: firstName,
    last_name: lastName,
    email,
    phone: str(body.phone) || null,
    company: str(body.company) || null,
    title: str(body.title) || null,
    engagement,
    note: str(body.note) || null,
    source: "Demo Day Signup",
  };

  // BloomOS stores the sign-up and emails Remi.
  const { first_name, last_name, email: em, phone, company, title, note } = row;
  const sent = await sendToBloomOS("demoday_signup", {
    first_name, last_name, email: em, phone, company, title, engagement, note,
  });
  if (sent.outcome === "rejected") return NextResponse.json({ error: sent.error }, { status: 400 });
  if (sent.outcome === "failed") {
    return NextResponse.json({ error: "Failed to save. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
