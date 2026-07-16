import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { adminUrl } from "@/lib/origins";

// Postgres "relation does not exist" — surfaced if the create_demoday_signups
// migration hasn't been applied. Treated as a clean 503 so the form shows a
// friendly retry rather than a generic 500.
const UNDEFINED_TABLE = "42P01";

const NOTIFY_TO = process.env.DEMODAY_NOTIFY_EMAIL || "remi@ambitionangels.org";

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

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

  const supabase = getSupabaseAdmin();
  const { error: dbError } = await supabase.from("demoday_signups").insert(row);

  if (dbError) {
    if (dbError.code === UNDEFINED_TABLE) {
      console.error("[/api/demoday/signup] demoday_signups table missing — apply migration.");
      return NextResponse.json(
        { error: "Sign-ups aren't ready yet. Please try again shortly." },
        { status: 503 }
      );
    }
    console.error("[/api/demoday/signup] supabase error:", {
      code: dbError.code,
      message: dbError.message,
    });
    return NextResponse.json({ error: "Failed to save. Please try again." }, { status: 500 });
  }

  // Notify Remi (non-blocking — the submission already succeeded).
  if (process.env.RESEND_API_KEY) {
    try {
      const fullName = `${firstName} ${lastName}`;
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: "Ambition Angels <careers@mail.ambitionangels.org>",
        to: NOTIFY_TO,
        replyTo: email,
        subject: `New Demo Day signup: ${fullName}`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#fff;border-radius:12px;">
            <h2 style="color:#E8500A;margin:0 0 16px;font-size:18px;">New Demo Day signup</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:6px 12px 6px 0;color:#6B7280;">Name</td><td style="padding:6px 0;color:#0E0E0E;">${escapeHTML(fullName)}</td></tr>
              <tr><td style="padding:6px 12px 6px 0;color:#6B7280;">Email</td><td style="padding:6px 0;color:#0E0E0E;"><a href="mailto:${escapeHTML(email)}" style="color:#E8500A;text-decoration:none;">${escapeHTML(email)}</a></td></tr>
              ${row.phone ? `<tr><td style="padding:6px 12px 6px 0;color:#6B7280;">Phone</td><td style="padding:6px 0;color:#0E0E0E;">${escapeHTML(row.phone)}</td></tr>` : ""}
              ${row.company ? `<tr><td style="padding:6px 12px 6px 0;color:#6B7280;">Company</td><td style="padding:6px 0;color:#0E0E0E;">${escapeHTML(row.company)}</td></tr>` : ""}
              ${row.title ? `<tr><td style="padding:6px 12px 6px 0;color:#6B7280;">Role / title</td><td style="padding:6px 0;color:#0E0E0E;">${escapeHTML(row.title)}</td></tr>` : ""}
              ${engagement.length ? `<tr><td style="padding:6px 12px 6px 0;color:#6B7280;vertical-align:top;">Interested in</td><td style="padding:6px 0;color:#0E0E0E;">${escapeHTML(engagement.join(", "))}</td></tr>` : ""}
            </table>
            ${row.note ? `
            <div style="margin-top:20px;padding:16px;background:#FFF7F2;border-left:3px solid #E8500A;border-radius:6px;">
              <div style="font-size:11px;font-weight:700;color:#E8500A;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Note</div>
              <div style="font-size:14px;color:#0E0E0E;line-height:1.6;white-space:pre-wrap;">${escapeHTML(row.note)}</div>
            </div>` : ""}
            <p style="color:#9CA3AF;font-size:12px;margin-top:20px;">View all in <a href="${adminUrl("/admin/demoday")}" style="color:#E8500A;">admin → Demo Day</a></p>
          </div>
        `,
      });
    } catch (notifyErr) {
      console.error("[/api/demoday/signup] Resend notify error:", notifyErr);
      // Don't fail — the DB write already succeeded.
    }
  }

  return NextResponse.json({ success: true });
}
