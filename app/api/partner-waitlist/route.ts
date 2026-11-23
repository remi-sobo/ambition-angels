import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { adminUrl } from "@/lib/origins";
import { intakeMode, sendToBloomOS } from "@/lib/site/bloomos";

const getSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

const getResend = () => new Resend(process.env.RESEND_API_KEY);

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildConfirmationHTML(firstName: string, role: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0E0E0E;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0E0E0E;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1a1d27;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#E8500A;padding:32px;text-align:center;">
            <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;">Ambition Angels</div>
            <div style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">You&apos;re on the list.</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <div style="font-size:22px;font-weight:700;color:#ffffff;margin-bottom:16px;">
              Welcome, ${firstName}.
            </div>
            <div style="font-size:15px;color:rgba(255,255,255,0.65);line-height:1.8;margin-bottom:24px;">
              You&apos;re on the waitlist for Ambition Angels Guide access. We&apos;re currently in a pilot phase, and we&apos;re hand-selecting the first cohort of Guides who will have access to the platform.
            </div>
            <div style="font-size:15px;color:rgba(255,255,255,0.65);line-height:1.8;margin-bottom:32px;">
              We&apos;ll reach out to you personally when it&apos;s your turn. As a ${role}, you&apos;re exactly who we built this for.
            </div>

            <!-- What to expect box -->
            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:24px;margin-bottom:32px;">
              <div style="font-size:11px;font-weight:700;color:#E8500A;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:14px;">What Guide access includes</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.5);line-height:1.8;">
                ✦ &nbsp;Real-time visibility into what your teen is learning<br>
                ✦ &nbsp;Proprietary career conversation prompts tied to their experience<br>
                ✦ &nbsp;Progress and engagement tracking<br>
                ✦ &nbsp;Support to help you show up for the conversation that matters
              </div>
            </div>

            <div style="font-size:14px;color:rgba(255,255,255,0.5);line-height:1.7;margin-bottom:24px;">
              In the meantime, feel free to explore what the teens experience on the Ambition app at <a href="https://www.ambitionangels.org/the-app" style="color:#E8500A;text-decoration:none;">ambitionangels.org/the-app</a>.
            </div>

            <div style="font-size:14px;color:rgba(255,255,255,0.5);line-height:1.7;">
              With gratitude,
            </div>
            <div style="font-size:16px;font-weight:700;color:#ffffff;margin-top:6px;">Remi Sobomehin</div>
            <div style="font-size:13px;color:#E8500A;">Founder &amp; CEO, Ambition Angels</div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
            <a href="https://www.ambitionangels.org" style="color:rgba(255,255,255,0.3);text-decoration:none;font-size:12px;">ambitionangels.org</a>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Plain-text confirmation for a company inquiry from /companies. Short on
 *  purpose: we got the note, and Remi replies personally. */
function buildCompanyConfirmationText(firstName: string, company: string): string {
  const about = company ? ` about ${company} and Ambition Angels` : "";
  return `Hi ${firstName},

Thank you for reaching out${about}. We got your note.

I'll reply personally within a few days. If you want to talk sooner, just reply to this email.

With gratitude,
Remi
Ambition Angels`;
}

/** Optional free-text field from a public form: trimmed, capped, or null. */
function optionalText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, 300);
  return t || null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    first_name,
    last_name,
    email,
    role,
    teen_count,
    company,
    role_category,
    problem_to_solve,
    interest,
  } = body;

  // The /mesa/students page reuses this submission path for a lightweight
  // student signup (first name + email only), tagged role "MESA Student".
  // Students have no last name field and must not receive the Guide-branded
  // confirmation email below.
  const isStudent = role === "MESA Student";
  // /companies posts here with role "Corporate Partner". A company lead gets
  // its own short confirmation, never the Guide waitlist email.
  const isCorporate = role === "Corporate Partner";

  if (!first_name || !email || !role || (!isStudent && !last_name)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // INTAKE_MODE=api: BloomOS stores the contact and alerts staff. The
  // confirmations to the person below are the website's either way.
  const viaBloomOS = intakeMode() === "api";
  if (viaBloomOS) {
    const sent = await sendToBloomOS("company_contact", {
      first_name, last_name: last_name || "", email, role, teen_count: teen_count || null,
      company, role_category, interest, problem_to_solve,
    });
    if (sent.outcome === "rejected") return NextResponse.json({ error: sent.error }, { status: 400 });
    if (sent.outcome === "failed") {
      return NextResponse.json({ error: "Failed to save. Please try again." }, { status: 500 });
    }
  }

  // Save to Supabase (db mode only; in api mode BloomOS stored it above)
  const { error: dbError } = viaBloomOS
    ? { error: null }
    : await getSupabase().from("partner_waitlist").insert({
    first_name,
    last_name: last_name || "",
    email,
    role,
    teen_count: teen_count || null,
    company: optionalText(company),
    role_category: optionalText(role_category),
    interest: optionalText(interest),
  });

  if (dbError) {
    console.error("Supabase error:", dbError.message);
    return NextResponse.json({ error: "Failed to save. Please try again." }, { status: 500 });
  }

  // Confirmation to the person who wrote in (non-blocking). Companies get a
  // short personal note. Guides get the Guide waitlist email. MESA students
  // get neither: the Guide email describes Guide access and would confuse them.
  if (isCorporate) {
    try {
      await getResend().emails.send({
        from: "Remi Sobomehin <careers@mail.ambitionangels.org>",
        replyTo: "remi@ambitionangels.org",
        to: email,
        subject: "We got your note",
        text: buildCompanyConfirmationText(String(first_name).trim(), optionalText(company) ?? ""),
      });
    } catch (emailErr) {
      console.error("Resend error:", emailErr);
      // Don't fail. The DB write succeeded.
    }
  } else if (!isStudent) {
    try {
      await getResend().emails.send({
        from: "Ambition Angels <careers@mail.ambitionangels.org>",
        to: email,
        subject: "You're on the Ambition Angels Guide waitlist",
        html: buildConfirmationHTML(first_name, role),
      });
    } catch (emailErr) {
      console.error("Resend error:", emailErr);
      // Don't fail. The DB write succeeded.
    }
  }

  // Notification to Remi (non-blocking). In api mode BloomOS sends it.
  if (!viaBloomOS) try {
    const subjectPrefix = isCorporate
      ? "New company inquiry"
      : isStudent
        ? "New MESA student signup"
        : "New Guide waitlist signup";
    await getResend().emails.send({
      from: "Ambition Angels <careers@mail.ambitionangels.org>",
      to: "remi@ambitionangels.org",
      subject: `${subjectPrefix}: ${first_name} ${last_name}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#fff;border-radius:12px;">
          <h2 style="color:#E8500A;margin:0 0 16px;font-size:18px;">${subjectPrefix}</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 12px 6px 0;color:#6B7280;">Name</td><td style="padding:6px 0;color:#0E0E0E;">${first_name} ${last_name}</td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#6B7280;">Email</td><td style="padding:6px 0;color:#0E0E0E;"><a href="mailto:${email}" style="color:#E8500A;text-decoration:none;">${email}</a></td></tr>
            ${company ? `<tr><td style="padding:6px 12px 6px 0;color:#6B7280;">Company</td><td style="padding:6px 0;color:#0E0E0E;">${escapeHTML(String(company))}</td></tr>` : ""}
            <tr><td style="padding:6px 12px 6px 0;color:#6B7280;">Role</td><td style="padding:6px 0;color:#0E0E0E;">${role}</td></tr>
            ${role_category ? `<tr><td style="padding:6px 12px 6px 0;color:#6B7280;">Role category</td><td style="padding:6px 0;color:#0E0E0E;">${escapeHTML(String(role_category))}</td></tr>` : ""}
            ${teen_count ? `<tr><td style="padding:6px 12px 6px 0;color:#6B7280;">Teens</td><td style="padding:6px 0;color:#0E0E0E;">${teen_count}</td></tr>` : ""}
          </table>
          ${problem_to_solve ? `
          <div style="margin-top:20px;padding:16px;background:#FFF7F2;border-left:3px solid #E8500A;border-radius:6px;">
            <div style="font-size:11px;font-weight:700;color:#E8500A;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">What they want to solve</div>
            <div style="font-size:14px;color:#0E0E0E;line-height:1.6;white-space:pre-wrap;">${escapeHTML(String(problem_to_solve))}</div>
          </div>` : ""}
          <p style="color:#9CA3AF;font-size:12px;margin-top:20px;">View all in <a href="${adminUrl()}" style="color:#E8500A;">admin</a></p>
        </div>
      `,
    });
  } catch (notifyErr) {
    console.error("Resend notify error:", notifyErr);
  }

  return NextResponse.json({ success: true });
}
