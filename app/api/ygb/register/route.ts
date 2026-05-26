import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { buildYgbRegistrationEmail } from "@/lib/email/templates/ygb-registration";

// At/over this many confirmed campers, new sign-ups are waitlisted. Decided
// server-side so the client can't grant itself a confirmed seat.
const CAPACITY = 20;
const MAX_CAMPERS = 4;
const NOTIFY_TO = process.env.YGB_NOTIFY_EMAIL || "remi@ambitionangels.org";

const GRADES = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];
const TSHIRT_SIZES = [
  "Youth XS (2–4)", "Youth S (6–8)", "Youth M (10–12)", "Youth L (14–16)",
  "Youth XL (18–20)", "Adult S", "Adult M", "Adult L",
];

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const bool = (v: unknown) => v === true;

function ageFromDob(dob: string): number | null {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`ygb-register:${ip}`, { limit: 8, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many sign-ups from this connection. Please try again later." },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Shared (family-level) fields. Whitelisted — never trust client `status`/`id`.
  const shared = {
    parent_first_name: str(body.parent_first_name),
    parent_last_name: str(body.parent_last_name),
    parent_email: str(body.parent_email),
    parent_phone: str(body.parent_phone),
    secondary_contact_name: str(body.secondary_contact_name) || null,
    secondary_contact_phone: str(body.secondary_contact_phone) || null,
    secondary_contact_relationship: str(body.secondary_contact_relationship) || null,
    emergency_contact_name: str(body.emergency_contact_name),
    emergency_contact_phone: str(body.emergency_contact_phone),
    emergency_contact_relationship: str(body.emergency_contact_relationship),
    liability_waiver_signed: bool(body.liability_waiver_signed),
    photo_video_release_signed: bool(body.photo_video_release_signed),
    medical_consent_signed: bool(body.medical_consent_signed),
    returning_family: bool(body.returning_family),
    early_access: bool(body.early_access),
  };

  const requiredShared: [string, string][] = [
    [shared.parent_first_name, "parent first name"],
    [shared.parent_last_name, "parent last name"],
    [shared.parent_email, "parent email"],
    [shared.parent_phone, "parent phone"],
    [shared.emergency_contact_name, "emergency contact name"],
    [shared.emergency_contact_phone, "emergency contact phone"],
    [shared.emergency_contact_relationship, "emergency contact relationship"],
  ];
  const missingShared = requiredShared.find(([v]) => !v);
  if (missingShared) {
    return NextResponse.json({ error: `Please provide the ${missingShared[1]}.` }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(shared.parent_email)) {
    return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
  }
  if (!shared.liability_waiver_signed || !shared.photo_video_release_signed || !shared.medical_consent_signed) {
    return NextResponse.json({ error: "All three waivers must be agreed to." }, { status: 400 });
  }

  const rawCampers = Array.isArray(body.campers) ? body.campers : [];
  if (rawCampers.length < 1 || rawCampers.length > MAX_CAMPERS) {
    return NextResponse.json(
      { error: `Please add between 1 and ${MAX_CAMPERS} campers.` },
      { status: 400 }
    );
  }

  const campers = [];
  for (let i = 0; i < rawCampers.length; i++) {
    const c = (rawCampers[i] ?? {}) as Record<string, unknown>;
    const camper = {
      camper_first_name: str(c.camper_first_name),
      camper_last_name: str(c.camper_last_name),
      camper_dob: str(c.camper_dob),
      camper_grade: str(c.camper_grade),
      camper_tshirt_size: str(c.camper_tshirt_size),
      allergies_medical: str(c.allergies_medical) || null,
      special_accommodations: str(c.special_accommodations) || null,
    };
    const label = `Camper ${i + 1}`;
    if (!camper.camper_first_name || !camper.camper_last_name || !camper.camper_dob) {
      return NextResponse.json({ error: `Please complete the name and date of birth for ${label}.` }, { status: 400 });
    }
    if (!GRADES.includes(camper.camper_grade)) {
      return NextResponse.json({ error: `Please select a valid grade for ${label}.` }, { status: 400 });
    }
    if (!TSHIRT_SIZES.includes(camper.camper_tshirt_size)) {
      return NextResponse.json({ error: `Please select a valid t-shirt size for ${label}.` }, { status: 400 });
    }
    const camper_age = ageFromDob(camper.camper_dob);
    if (camper_age === null || camper_age < 3 || camper_age > 18) {
      return NextResponse.json({ error: `Please provide a valid date of birth for ${label}.` }, { status: 400 });
    }
    campers.push({ ...camper, camper_age });
  }

  const supabase = getSupabaseAdmin();

  // Authoritative capacity check, then hand out the remaining confirmed seats
  // to this family's campers in order; the rest waitlist.
  const { count, error: countErr } = await supabase
    .from("ygb_registrations")
    .select("id", { count: "exact", head: true })
    .eq("status", "confirmed");
  if (countErr) {
    console.error("YGB register count error:", countErr);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  let remaining = Math.max(0, CAPACITY - (count ?? 0));

  const rows = campers.map((c) => {
    const status = remaining > 0 ? "confirmed" : "waitlisted";
    if (remaining > 0) remaining--;
    return { ...shared, ...c, status };
  });

  const { data: inserted, error } = await supabase
    .from("ygb_registrations")
    .insert(rows)
    .select("camper_first_name,camper_last_name,camper_grade,camper_age,status,allergies_medical,parent_first_name,parent_last_name,parent_email,parent_phone");
  if (error || !inserted) {
    console.error("YGB register insert error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  // Notify the team with the running roster. Awaited so the serverless
  // function doesn't freeze before the email sends; wrapped so an email
  // failure never fails the registration itself.
  try {
    await sendNotification(supabase);
  } catch (e) {
    console.error("YGB notify error:", e);
  }

  return NextResponse.json({
    ok: true,
    results: inserted.map((r) => ({
      name: `${r.camper_first_name} ${r.camper_last_name}`,
      status: r.status,
    })),
  });
}

async function sendNotification(supabase: ReturnType<typeof getSupabaseAdmin>) {
  if (!process.env.RESEND_API_KEY) {
    console.error("YGB notify skipped: RESEND_API_KEY is not set in this environment.");
    return;
  }

  const { data: roster, error } = await supabase
    .from("ygb_registrations")
    .select(
      "camper_first_name,camper_last_name,camper_grade,camper_age,status,allergies_medical,parent_first_name,parent_last_name,parent_email,parent_phone,created_at"
    )
    .order("created_at", { ascending: true });
  if (error || !roster || roster.length === 0) return;

  // The campers from the most recent registration share the latest created_at.
  const latest = roster[roster.length - 1].created_at;
  const justRegistered = roster.filter((r) => r.created_at === latest);

  const { subject, text, html } = buildYgbRegistrationEmail({
    justRegistered,
    roster,
    capacity: CAPACITY,
  });

  // Resend resolves with { data, error } rather than throwing on API-level
  // failures (invalid key, unverified sender domain, rejected recipient), so
  // the returned error must be inspected — otherwise a failed send looks like
  // success and the team silently stops getting registration emails.
  const { data, error: sendErr } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: "Ambition Angels <careers@mail.ambitionangels.org>",
    to: NOTIFY_TO,
    replyTo: justRegistered[0]?.parent_email,
    subject,
    text,
    html,
  });
  if (sendErr) {
    console.error(`YGB notify: Resend rejected the send to ${NOTIFY_TO}:`, sendErr);
    return;
  }
  console.log(`YGB notify sent to ${NOTIFY_TO} (Resend id: ${data?.id ?? "unknown"}).`);
}
