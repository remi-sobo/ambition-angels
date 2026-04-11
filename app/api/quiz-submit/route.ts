import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

function buildEmailHTML(
  teenname: string,
  careers: { title: string; description: string; salary: string; why: string }[]
): string {
  const topThree = careers.slice(0, 3);
  const rest = careers.slice(3);

  const careerRows = topThree
    .map(
      (c, i) => `
    <tr>
      <td style="padding:16px 20px;border-bottom:1px solid #f0eeea;">
        <div style="font-size:11px;font-weight:700;color:#E8500A;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">#${i + 1} Top Match</div>
        <div style="font-size:17px;font-weight:700;color:#0E0E0E;margin-bottom:4px;">${c.title}</div>
        <div style="font-size:13px;color:#6B6960;margin-bottom:6px;">${c.description}</div>
        <div style="font-size:12px;font-weight:600;color:#E8500A;">${c.salary}</div>
        <div style="font-size:12px;color:#6B6960;margin-top:4px;font-style:italic;">${c.why}</div>
      </td>
    </tr>`
    )
    .join("");

  const restRows = rest
    .map(
      (c, i) => `
    <tr>
      <td style="padding:10px 20px;border-bottom:1px solid #f0eeea;">
        <span style="font-size:12px;font-weight:600;color:#0E0E0E;">${i + 4}. ${c.title}</span>
        <span style="font-size:12px;color:#6B6960;margin-left:8px;">${c.salary}</span>
      </td>
    </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF8;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

        <!-- Header -->
        <tr>
          <td style="background:#0E0E0E;padding:32px 32px 28px;text-align:center;">
            <div style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">Ambition Angels</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px;letter-spacing:0.1em;text-transform:uppercase;">Career Match Results</div>
          </td>
        </tr>

        <!-- Intro -->
        <tr>
          <td style="padding:28px 32px 8px;">
            <div style="font-size:22px;font-weight:700;color:#0E0E0E;margin-bottom:10px;">
              ${teenname ? `Here are ${teenname}'s top career matches.` : "Here are your top career matches."}
            </div>
            <div style="font-size:14px;color:#6B6960;line-height:1.6;">
              Based on your quiz answers, here are the 10 careers that fit best — ranked by how deeply they match your strengths, interests, and goals.
            </div>
          </td>
        </tr>

        <!-- Top 3 -->
        <tr>
          <td style="padding:20px 32px 0;">
            <div style="font-size:11px;font-weight:700;color:#6B6960;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Your Top Matches</div>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0eeea;border-radius:12px;overflow:hidden;">
              ${careerRows}
            </table>
          </td>
        </tr>

        <!-- Rest -->
        ${
          rest.length > 0
            ? `
        <tr>
          <td style="padding:20px 32px 0;">
            <div style="font-size:11px;font-weight:700;color:#6B6960;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Also Strong Fits</div>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0eeea;border-radius:12px;overflow:hidden;">
              ${restRows}
            </table>
          </td>
        </tr>`
            : ""
        }

        <!-- CTA -->
        <tr>
          <td style="padding:28px 32px;">
            <div style="background:#E8500A;border-radius:16px;padding:28px;text-align:center;">
              <div style="font-size:16px;font-weight:700;color:#ffffff;margin-bottom:8px;">Ready to try one of these careers?</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-bottom:20px;">Download the Ambition app and start a 30-day simulated internship. 15 minutes a day. Free.</div>
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="padding-right:8px;">
                    <a href="https://apps.apple.com/us/app/ambition-shape-your-future/id1557562279" style="display:inline-block;background:#ffffff;color:#E8500A;font-weight:700;font-size:13px;padding:12px 20px;border-radius:50px;text-decoration:none;">Download for iOS</a>
                  </td>
                  <td>
                    <a href="https://play.google.com/store/apps/details?id=com.theambitionapp.ambitionappRN" style="display:inline-block;background:rgba(255,255,255,0.15);color:#ffffff;font-weight:700;font-size:13px;padding:12px 20px;border-radius:50px;text-decoration:none;border:1px solid rgba(255,255,255,0.3);">Download for Android</a>
                  </td>
                </tr>
              </table>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:0 32px 32px;text-align:center;">
            <div style="font-size:12px;color:#C8C6BE;line-height:1.6;">
              Sent with care by Remi &amp; the Ambition Angels team.<br>
              <a href="https://www.ambitionangels.org" style="color:#E8500A;text-decoration:none;">ambitionangels.org</a>
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { answers, audienceMode, careers } = body;

  if (!answers || !audienceMode || !careers) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Save to Supabase
  const supabase = getSupabase();
  const { error: dbError } = await supabase.from("quiz_submissions").insert({
    email: answers.email || null,
    teen_name: answers.teenname || null,
    audience: audienceMode,
    age: answers.age || null,
    status: answers.status || null,
    location: answers.location || null,
    subjects: answers.subjects?.join(", ") || null,
    work_style: answers.workstyle?.join(", ") || null,
    problem_types: answers.problemtypes?.join(", ") || null,
    good_at: answers.goodat || null,
    people_come: answers.peoplecome || null,
    free_time: answers.freetime || null,
    flow_state: answers.flowstate || null,
    dream_day: answers.dreamday || null,
    future_self: answers.futureself || null,
    money_vs_meaning: answers.moneyvsmeaning ?? null,
    career_matches: careers,
  });

  if (dbError) {
    console.error("Supabase insert error:", dbError);
  }

  // Send email if provided
  const email = answers.email;
  if (email && email.includes("@")) {
    try {
      await resend.emails.send({
        from: "Ambition Angels <remi@ambitionangels.org>",
        to: email,
        subject: `${answers.teenname ? `${answers.teenname}'s` : "Your"} top 10 career matches`,
        html: buildEmailHTML(answers.teenname || "", careers),
      });
    } catch (err) {
      console.error("Resend error:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
