import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sendToBloomOS } from "@/lib/site/bloomos";

// Public student application intake (modules/02-program.md "Intake").
// Whitelisted fields only — status/priority are decided in screening, never
// by the client. Cohort must be flagged accepting_applications.

const getResend = () => new Resend(process.env.RESEND_API_KEY);
const str = (v: unknown, max = 160) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
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

  // BloomOS stores the application and alerts staff; the
  // website still thanks the guardian (lib/site/bloomos.ts).
  const sent = await sendToBloomOS("application", {
    first_name: firstName,
    last_name: lastName,
    grade,
    guardian_name: guardianName,
    guardian_email: guardianEmail,
    cohort_id: str(body.cohort_id, 40) || null,
    email: str(body.email, 160),
    phone: str(body.phone, 40),
    dob: str(body.dob, 10),
    school: str(body.school, 160),
    location: str(body.location, 160),
    guardian_phone: str(body.guardian_phone, 40),
    motivation: str(body.motivation, 2000),
    referral: str(body.referral, 300),
  });
  if (sent.outcome === "rejected") return NextResponse.json({ error: sent.error }, { status: 400 });
  if (sent.outcome === "failed") {
    return NextResponse.json({ error: "Failed to save. Please try again." }, { status: 500 });
  }
  const cohortName =
    sent.outcome === "delivered" && typeof sent.body.cohort_name === "string" ? sent.body.cohort_name : null;
  await sendGuardianConfirmation(guardianEmail, guardianName, firstName, `${firstName} ${lastName}`, cohortName);
  return NextResponse.json({ success: true });
}

/** The website's thank-you to the guardian. Same in both intake modes. */
async function sendGuardianConfirmation(
  guardianEmail: string,
  guardianName: string,
  firstName: string,
  studentName: string,
  cohortName: string | null,
): Promise<void> {
  await getResend().emails.send({
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
}
