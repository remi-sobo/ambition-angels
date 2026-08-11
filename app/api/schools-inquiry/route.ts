import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { getResidentOrgId } from "@/lib/admin/orgs";

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

/** Map the public form's setting label onto the partners.kind check constraint. */
function kindForSetting(setting: string): "school" | "nonprofit" | "other" {
  if (setting.startsWith("High school") || setting.startsWith("Community college")) {
    return "school";
  }
  if (setting === "Other" || setting === "Individual mentor or parent") return "other";
  return "nonprofit";
}

function buildConfirmationHTML(name: string, orgName: string): string {
  const firstName = name.trim().split(/\s+/)[0] || "there";
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
            <div style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">We got your note.</div>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <div style="font-size:22px;font-weight:700;color:#ffffff;margin-bottom:16px;">
              Thanks, ${escapeHTML(firstName)}.
            </div>
            <div style="font-size:15px;color:rgba(255,255,255,0.65);line-height:1.8;margin-bottom:24px;">
              You asked about bringing Ambition to <strong style="color:#ffffff;">${escapeHTML(orgName)}</strong>. We'll reach out personally — usually the same day — to walk you through what it takes and answer everything a first meeting usually covers.
            </div>
            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:24px;margin-bottom:32px;">
              <div style="font-size:11px;font-weight:700;color:#E8500A;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:14px;">The whole ask, up front</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.5);line-height:1.8;">
                ✦ &nbsp;Chromebooks or a computer lab<br>
                ✦ &nbsp;Fifteen minutes, twice a week<br>
                ✦ &nbsp;One adult who owns it
              </div>
            </div>
            <div style="font-size:14px;color:rgba(255,255,255,0.5);line-height:1.7;margin-bottom:24px;">
              Most of our school and program partnerships are fully sponsored by a donor, so the school pays nothing in year one.
            </div>
            <div style="font-size:14px;color:rgba(255,255,255,0.5);line-height:1.7;">
              Talk soon,
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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, email, role, organization, student_count, setting } = body;

  if (!name || !email || !role || !organization || !setting) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = getSupabase();
  // Lands on the BloomOS partner spine, same as the program-partner form —
  // partners rows flow to the fundraising views and HubSpot from there.
  const { error: dbError } = await supabase.from("partners").insert({
    org_id: await getResidentOrgId(),
    name: String(organization),
    kind: kindForSetting(String(setting)),
    status: "prospect",
    champion_name: String(name),
    champion_email: String(email).toLowerCase(),
    champion_role: String(role),
    teen_count: student_count || null,
    program_type: String(setting),
    external_source: "schools_form",
    last_touch_at: new Date().toISOString().slice(0, 10),
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
    subject: "Bringing Ambition to your students — next steps",
    html: buildConfirmationHTML(String(name), String(organization)),
  }).catch((err) => console.error("Resend confirmation error:", err));

  // Notification to Remi (non-blocking)
  resend.emails.send({
    from: "Ambition Angels <careers@mail.ambitionangels.org>",
    to: "remi@ambitionangels.org",
    subject: `New /schools inquiry: ${organization} (${name})`,
    html: `<div style="font-family:monospace;background:#f9f9f9;padding:24px;border-radius:8px;font-size:14px;line-height:1.7;">
  <strong>New Schools &amp; Programs Inquiry</strong><br><br>
  Name: ${escapeHTML(String(name))}<br>
  Email: ${escapeHTML(String(email))}<br>
  Role: ${escapeHTML(String(role))}<br>
  Organization: ${escapeHTML(String(organization))}<br>
  Students: ${escapeHTML(String(student_count || "not specified"))}<br>
  Setting: ${escapeHTML(String(setting))}
</div>`,
  }).catch((err) => console.error("Resend notification error:", err));

  return NextResponse.json({ success: true });
}
