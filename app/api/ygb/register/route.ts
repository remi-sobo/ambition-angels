import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sendToBloomOS } from "@/lib/site/bloomos";

const MAX_CAMPERS = 4;
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

  // BloomOS decides seats, stores the campers and sends the
  // roster email. If it can't be reached, the family sees "received" and the
  // outbox delivers the registration shortly.
  const sent = await sendToBloomOS("ygb_registration", { ...shared, campers });
  if (sent.outcome === "rejected") return NextResponse.json({ error: sent.error }, { status: 400 });
  if (sent.outcome === "failed") {
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  const results =
    sent.outcome === "delivered" && Array.isArray(sent.body.results)
      ? sent.body.results
      : campers.map((c) => ({ name: `${c.camper_first_name} ${c.camper_last_name}`, status: "received" }));
  return NextResponse.json({ ok: true, results });
}

