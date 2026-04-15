import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const getSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

const getResend = () => new Resend(process.env.RESEND_API_KEY);

function buildConfirmationHTML(firstName: string, orgName: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0E0E0E;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0E0E0E;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1a1d27;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        <tr>
          <td style="background:#E8500A;padding:32px;text-align:center;">
            <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;">Ambition Angels</div>
            <div style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">Welcome to the program.</div>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <div style="font-size:22px;font-weight:700;color:#ffffff;margin-bottom:16px;">
              You're in, ${firstName}.
            </div>
            <div style="font-size:15px;color:rgba(255,255,255,0.65);line-height:1.8;margin-bottom:24px;">
              We received your application to bring Ambition Angels to <strong style="color:#ffffff;">${orgName}</strong>. We're reviewing it now and will send your program code and Guide dashboard login within 24 hours — usually same day.
            </div>
            <div style="font-size:15px;color:rgba(255,255,255,0.65);line-height:1.8;margin-bottom:32px;">
              In the meantime, if you have any questions or want to talk through the best way to set this up for your program, reply to this email or reach Remi directly at <a href="mailto:remi@ambitionangels.org" style="color:#E8500A;text-decoration:none;">remi@ambitionangels.org</a>.
            </div>
            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:24px;margin-bottom:32px;">
              <div style="font-size:11px;font-weight:700;color:#E8500A;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:14px;">What's coming your way</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.5);line-height:1.8;">
                ✦ &nbsp;Your program code — share it with your teens to connect them to your dashboard<br>
                ✦ &nbsp;Guide dashboard login — see what each student is working on in real time<br>
                ✦ &nbsp;Career conversation prompts tied to what your teens are experiencing<br>
                ✦ &nbsp;A short setup guide so you're ready to go on day one
              </div>
            </div>
            <div style="font-size:14px;color:rgba(255,255,255,0.5);line-height:1.7;margin-bottom:24px;">
              The model is simple: block 15 minutes, twice a week. Students pick a career, start their internship, and earn real rewards for finishing. You watch it happen from your dashboard.
            </div>
            <div style="font-size:14px;color:rgba(255,255,255,0.5);line-height:1.7;">
              With gratitude,
            </div>
            <div style="font-size:16px;font-weight:700;color:#ffffff;margin-top:6px;">Remi Sobomehin</div>
            <div style="font-size:13px;color:#E8500A;">Founder &amp; CEO, Ambition Angels</div>
          </td>
        </tr>
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

function buildNotificationHTML(data: {
  first_name: string;
  last_name: string;
  org_name: string;
  email: string;
  program_type: string;
  teen_count: string | null;
  referral: string | null;
}): string {
  return `<div style="font-family:monospace;background:#f9f9f9;padding:24px;border-radius:8px;font-size:14px;line-height:1.7;">
  <strong>New Program Partner Signup</strong><br><br>
  Name: ${data.first_name} ${data.last_name}<br>
  Org: ${data.org_name}<br>
  Email: ${data.email}<br>
  Program Type: ${data.program_type}<br>
  Teen Count: ${data.teen_count || "not specified"}<br>
  How they heard: ${data.referral || "not specified"}
</div>`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { first_name, last_name, org_name, email, program_type, teen_count, referral } = body;

  if (!first_name || !last_name || !org_name || !email || !program_type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { error: dbError } = await supabase.from("program_partners").insert({
    first_name,
    last_name,
    org_name,
    email,
    program_type,
    teen_count: teen_count || null,
    referral: referral || null,
  });

  if (dbError) {
    console.error("Supabase error:", dbError.message);
    return NextResponse.json({ error: "Failed to save. Please try again." }, { status: 500 });
  }

  const resend = getResend();

  // Confirmation to submitter (non-blocking)
  resend.emails.send({
    from: "Ambition Angels <careers@mail.ambitionangels.org>",
    to: email,
    subject: "Welcome to Ambition Angels — here's how to get started",
    html: buildConfirmationHTML(first_name, org_name),
  }).catch((err) => console.error("Resend confirmation error:", err));

  // Notification to Remi (non-blocking)
  resend.emails.send({
    from: "Ambition Angels <careers@mail.ambitionangels.org>",
    to: "remi@ambitionangels.org",
    subject: `New Program Partner: ${org_name} (${first_name} ${last_name})`,
    html: buildNotificationHTML({ first_name, last_name, org_name, email, program_type, teen_count, referral }),
  }).catch((err) => console.error("Resend notification error:", err));

  return NextResponse.json({ success: true });
}
