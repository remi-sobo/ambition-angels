import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getResidentOrgId } from "@/lib/admin/orgs";
import { privateUrl } from "@/lib/coach/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { intakeMode, sendToBloomOS } from "@/lib/site/bloomos";

// Ambition Coach sign-up (/coach). One form, two kinds: a professional
// volunteering to coach, or a young adult asking for a coach. Rows land in
// coach_people for the resident org and are worked in BloomOS at
// /admin/programs/coach (fenced by aa.coach). Whitelisted fields only;
// status is set by staff, never by the client.

const clean = (v: unknown, max = 500): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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

  // INTAKE_MODE=api: BloomOS stores the sign-up and sends BOTH emails, because
  // the confirmation carries a private coach link only BloomOS can make.
  if (intakeMode() === "api") {
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

  let token: string;
  let personId: string;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("coach_people")
      .insert({
        org_id: await getResidentOrgId(),
        kind,
        first_name,
        last_name,
        email,
        phone: phone || null,
        field,
        role: kind === "coach" ? role : null,
        company: kind === "coach" ? company || null : null,
        linkedin: linkedin || null,
        age,
        school: kind === "student" ? school || null : null,
        program: kind === "student" ? program || null : null,
        goal: kind === "student" ? goal || null : null,
        timing: timing || null,
        referral: referral || null,
        note: note || null,
      })
      .select("id, access_token")
      .single();
    if (error || !data) throw error ?? new Error("no row");
    token = data.access_token as string;
    personId = data.id as string;
  } catch (err) {
    console.error("coach-signup save failed:", err);
    return NextResponse.json(
      { error: "We couldn't save that. Please try again, or email hello@ambitionangels.org." },
      { status: 500 },
    );
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const page = privateUrl(token);

  const confirmation =
    kind === "coach"
      ? `Hi ${first_name},

Thank you for signing up to be an Ambition Coach. It means a lot.

Here's what happens next. I'll reach out personally for a short call so I can hear about your work and tell you more about the young people we're matching. When there's a student heading into ${field}, I'll send you their profile before anything is set. You say yes or no.

This is your own Ambition Coach page. Once you're matched, your student's profile, the prep for each session and their plan all show up here:
${page}

It's just for you, so please don't forward it. If you want to talk sooner, just reply to this email.

With gratitude,
Remi
Ambition Angels`
      : `Hi ${first_name},

Thanks for signing up for an Ambition Coach. We got your info.

Here's what happens next. I'll look for a professional who works in ${field} and reach out when I have a match. When you get the intro email, it's on you to reply and get your first session on the calendar.

This is your own Ambition Coach page. Your coach, the prep for each session and your Ambition Plan all live here:
${page}

It's just for you, so don't share it. If you have questions, just reply to this email.

Rooting for you,
Remi
Ambition Angels`;

  const confirm = resend.emails
    .send({
      from: "Remi Sobomehin <careers@mail.ambitionangels.org>",
      replyTo: "remi@ambitionangels.org",
      to: email,
      subject: kind === "coach" ? "Thanks for raising your hand" : "We got your Ambition Coach sign-up",
      text: confirmation,
    })
    .then(() =>
      getSupabaseAdmin().from("coach_people").update({ link_sent_at: new Date().toISOString() }).eq("id", personId),
    )
    .catch((err) => console.error("coach-signup confirmation error:", err));

  const lines =
    kind === "coach"
      ? `Role: ${esc(role)}${company ? ` at ${esc(company)}` : ""}<br>LinkedIn: ${esc(linkedin) || "not given"}<br>`
      : `Age: ${age}<br>School: ${esc(school) || "not given"}<br>Program: ${esc(program) || "not given"}<br>Goal: ${esc(goal) || "not given"}<br>`;

  const alert = resend.emails
    .send({
      from: "Ambition Angels <careers@mail.ambitionangels.org>",
      to: "remi@ambitionangels.org",
      subject: `New Ambition Coach ${kind}: ${first_name} ${last_name} (${field})`,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7">
<strong>New Ambition Coach ${kind} sign-up</strong><br><br>
Name: ${esc(first_name)} ${esc(last_name)}<br>
Email: ${esc(email)}<br>
Phone: ${esc(phone) || "not given"}<br>
Field: ${esc(field)}<br>
${lines}Timing: ${esc(timing) || "not given"}<br>
Heard from: ${esc(referral) || "not given"}<br>
Note: ${esc(note) || "none"}<br><br>
See all sign-ups in BloomOS: https://www.ambitionangels.org/admin/programs/coach
</div>`,
    })
    .catch((err) => console.error("coach-signup notification error:", err));

  // Await so the sends aren't cut off when the function returns.
  await Promise.allSettled([confirm, alert]);
  return NextResponse.json({ success: true });
}
