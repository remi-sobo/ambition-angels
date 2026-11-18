import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getResidentOrgId } from "@/lib/admin/orgs";

// Ambition Coach volunteer sign-up (/coach). Writes onto the BloomOS
// constituent spine rather than a new table: an existing person gets the
// coach tag and their answers merged into custom_fields.coach; a new person
// is created with source "coach_signup". No migration needed.

const COACH_TAG = "ambition_coach_interest";

const clean = (v: unknown, max = 500): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  // Honeypot: real people never fill this hidden field.
  if (clean(body.website)) return NextResponse.json({ success: true });

  const first_name = clean(body.first_name, 80);
  const last_name = clean(body.last_name, 80);
  const email = clean(body.email, 200).toLowerCase();
  const phone = clean(body.phone, 40);
  const company = clean(body.company, 120);
  const role = clean(body.role, 160);
  const field = clean(body.field, 80);
  const linkedin = clean(body.linkedin, 300);
  const timing = clean(body.timing, 80);
  const referral = clean(body.referral, 200);
  const note = clean(body.note, 1500);

  if (!first_name || !last_name || !email || !role || !field) {
    return NextResponse.json({ error: "Please fill in your name, email, role and field." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
  }

  const coach = {
    signed_up_at: new Date().toISOString(),
    company,
    role,
    field,
    linkedin,
    timing,
    referral,
    note,
    status: "new",
  };

  try {
    const supabase = getSupabaseAdmin();
    const org_id = await getResidentOrgId();

    const { data: existing } = await supabase
      .from("constituents")
      .select("id, tags, phones, custom_fields")
      .eq("org_id", org_id)
      .contains("emails", [email])
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();

    if (existing) {
      const tags: string[] = Array.from(new Set([...(existing.tags ?? []), COACH_TAG]));
      const phones: string[] =
        phone && !(existing.phones ?? []).includes(phone) ? [...(existing.phones ?? []), phone] : existing.phones ?? [];
      const custom_fields = { ...(existing.custom_fields ?? {}), coach };
      const { error } = await supabase
        .from("constituents")
        .update({ tags, phones, custom_fields, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("constituents").insert({
        org_id,
        type: "person",
        first_name,
        last_name,
        org_name: company || null,
        emails: [email],
        phones: phone ? [phone] : [],
        tags: [COACH_TAG],
        source: "coach_signup",
        custom_fields: { coach },
      });
      if (error) throw error;
    }
  } catch (err) {
    console.error("coach-signup save failed:", err);
    return NextResponse.json({ error: "We couldn't save that. Please try again, or email hello@ambitionangels.org." }, { status: 500 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  resend.emails
    .send({
      from: "Remi Sobomehin <careers@mail.ambitionangels.org>",
      replyTo: "remi@ambitionangels.org",
      to: email,
      subject: "Thanks for raising your hand",
      text: `Hi ${first_name},

Thank you for signing up to be an Ambition Coach. It means a lot.

Here's what happens next. I'll reach out personally for a short call so I can hear about your work and tell you more about the young people we're matching. When there's a student heading into ${field}, I'll send you their profile before anything is set. You say yes or no.

If you want to talk sooner, just reply to this email.

With gratitude,
Remi
Ambition Angels`,
    })
    .catch((err) => console.error("coach-signup confirmation error:", err));

  resend.emails
    .send({
      from: "Ambition Angels <careers@mail.ambitionangels.org>",
      to: "remi@ambitionangels.org",
      subject: `New Ambition Coach: ${first_name} ${last_name} (${field})`,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7">
<strong>New Ambition Coach sign-up</strong><br><br>
Name: ${esc(first_name)} ${esc(last_name)}<br>
Email: ${esc(email)}<br>
Phone: ${esc(phone) || "not given"}<br>
Role: ${esc(role)}${company ? ` at ${esc(company)}` : ""}<br>
Field: ${esc(field)}<br>
LinkedIn: ${esc(linkedin) || "not given"}<br>
Timing: ${esc(timing) || "not given"}<br>
Heard from: ${esc(referral) || "not given"}<br>
Note: ${esc(note) || "none"}<br><br>
Saved to BloomOS constituents, tag ${COACH_TAG}.
</div>`,
    })
    .catch((err) => console.error("coach-signup notification error:", err));

  return NextResponse.json({ success: true });
}
