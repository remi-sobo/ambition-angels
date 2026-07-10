import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getResidentOrgId } from "@/lib/admin/orgs";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// Public student application intake (modules/02-program.md "Intake").
// Whitelisted fields only — status/priority are decided in screening, never
// by the client. Cohort must be flagged accepting_applications.

const getResend = () => new Resend(process.env.RESEND_API_KEY);
const NOTIFY_TO = process.env.INTAKE_NOTIFY_EMAIL || "remi@ambitionangels.org";

const str = (v: unknown, max = 160) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const isISODate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`apply:${ip}`, { limit: 6, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many applications from this connection. Please try again later." },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const firstName = str(body.first_name, 120);
  const lastName = str(body.last_name, 120);
  const grade = str(body.grade, 40);
  const guardianName = str(body.guardian_name, 120);
  const guardianEmail = str(body.guardian_email, 160).toLowerCase();
  for (const [v, label] of [
    [firstName, "student first name"],
    [lastName, "student last name"],
    [grade, "grade"],
    [guardianName, "parent/guardian name"],
    [guardianEmail, "parent/guardian email"],
  ] as const) {
    if (!v) return NextResponse.json({ error: `Missing ${label}.` }, { status: 400 });
  }
  if (!guardianEmail.includes("@")) {
    return NextResponse.json({ error: "Invalid parent/guardian email." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  let cohortId: string | null = null;
  let cohortName: string | null = null;
  let cohortOrgId: string | null = null;
  const rawCohort = str(body.cohort_id, 40);
  if (rawCohort) {
    if (!/^[0-9a-f-]{36}$/i.test(rawCohort)) {
      return NextResponse.json({ error: "Invalid program." }, { status: 400 });
    }
    const { data: cohort } = await supabase
      .from("cohorts")
      .select("id, name, org_id")
      .eq("id", rawCohort)
      .eq("accepting_applications", true)
      .maybeSingle();
    if (!cohort) {
      return NextResponse.json(
        { error: "That program is no longer accepting applications." },
        { status: 400 }
      );
    }
    cohortId = cohort.id;
    cohortName = cohort.name;
    cohortOrgId = cohort.org_id;
  }

  const email = str(body.email, 160).toLowerCase();
  const dob = str(body.dob, 10);
  const insert = {
    // The target cohort's org when one is chosen; otherwise the resident
    // org this public form belongs to. Never a column default.
    org_id: cohortOrgId ?? (await getResidentOrgId()),
    cohort_id: cohortId,
    first_name: firstName,
    last_name: lastName,
    email: email.includes("@") ? email : null,
    phone: str(body.phone, 40) || null,
    dob: isISODate(dob) ? dob : null,
    grade,
    school: str(body.school, 160) || null,
    location: str(body.location, 160) || null,
    guardian_name: guardianName,
    guardian_email: guardianEmail,
    guardian_phone: str(body.guardian_phone, 40) || null,
    motivation: str(body.motivation, 2000) || null,
    referral: str(body.referral, 300) || null,
  };

  const { data, error } = await supabase
    .from("applications")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("Application insert failed:", error?.message);
    return NextResponse.json(
      { error: "Failed to save. Please try again." },
      { status: 500 }
    );
  }

  const resend = getResend();
  const studentName = `${firstName} ${lastName}`;
  const programLine = cohortName ?? "General interest";

  // Confirmation to the guardian (non-blocking)
  resend.emails.send({
    from: "Ambition Angels <careers@mail.ambitionangels.org>",
    to: guardianEmail,
    subject: `We received ${firstName}'s application`,
    html: `<div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.8;color:#3D3D3D;">
  <p>Hi ${guardianName},</p>
  <p>Thanks for applying — we received <strong>${studentName}</strong>'s application${cohortName ? ` for <strong>${cohortName}</strong>` : ""}. Our team reviews every application and will follow up at this email address with next steps.</p>
  <p>Questions in the meantime? Reply to this email or reach Remi directly at <a href="mailto:remi@ambitionangels.org" style="color:#E8500A;">remi@ambitionangels.org</a>.</p>
  <p>— The Ambition Angels team</p>
</div>`,
  }).catch((err) => console.error("Resend confirmation error:", err));

  // Notification to staff (non-blocking)
  resend.emails.send({
    from: "Ambition Angels <careers@mail.ambitionangels.org>",
    to: NOTIFY_TO,
    subject: `New application: ${studentName} (${programLine})`,
    html: `<div style="font-family:monospace;background:#f9f9f9;padding:24px;border-radius:8px;font-size:14px;line-height:1.7;">
  <strong>New Student Application</strong><br><br>
  Student: ${studentName} (Grade ${grade})<br>
  Program: ${programLine}<br>
  School: ${insert.school || "not specified"}<br>
  Guardian: ${guardianName} · ${guardianEmail}${insert.guardian_phone ? ` · ${insert.guardian_phone}` : ""}<br>
  How they heard: ${insert.referral || "not specified"}<br><br>
  Review it in BloomOS → Program → Intake.
</div>`,
  }).catch((err) => console.error("Resend notification error:", err));

  return NextResponse.json({ success: true });
}
