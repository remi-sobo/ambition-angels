import { buildYgbRegistrationEmail } from "@/lib/email/templates/ygb-registration";
import { clean, notifyAddress, sendMail } from "./notify";
import type { KindHandler } from "./types";

/**
 * Young, Gifted & Black camp registration (was app/api/ygb/register).
 * AA-only: needs aa.ygb. One family, one to four campers. Seats are decided
 * here, never by the sender: at or over CAPACITY confirmed campers, the rest
 * waitlist. Capacity and the roster email now count only this org's rows.
 */

const CAPACITY = 20;
const MAX_CAMPERS = 4;
const GRADES = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];
const TSHIRT_SIZES = [
  "Youth XS (2–4)", "Youth S (6–8)", "Youth M (10–12)", "Youth L (14–16)",
  "Youth XL (18–20)", "Adult S", "Adult M", "Adult L",
];

type Shared = {
  parent_first_name: string;
  parent_last_name: string;
  parent_email: string;
  parent_phone: string;
  secondary_contact_name: string | null;
  secondary_contact_phone: string | null;
  secondary_contact_relationship: string | null;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  liability_waiver_signed: boolean;
  photo_video_release_signed: boolean;
  medical_consent_signed: boolean;
  returning_family: boolean;
  early_access: boolean;
};

type Camper = {
  camper_first_name: string;
  camper_last_name: string;
  camper_dob: string;
  camper_grade: string;
  camper_tshirt_size: string;
  allergies_medical: string | null;
  special_accommodations: string | null;
  camper_age: number;
};

export type YgbRegistrationInput = { shared: Shared; campers: Camper[] };

export function ageFromDob(dob: string, now = new Date()): number | null {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

const s = (v: unknown) => clean(v, 300);

export const ygbRegistration: KindHandler<YgbRegistrationInput> = {
  scope: "intake:forms",
  entitlement: "aa.ygb",
  validate(body) {
    const shared: Shared = {
      parent_first_name: s(body.parent_first_name),
      parent_last_name: s(body.parent_last_name),
      parent_email: s(body.parent_email),
      parent_phone: s(body.parent_phone),
      secondary_contact_name: s(body.secondary_contact_name) || null,
      secondary_contact_phone: s(body.secondary_contact_phone) || null,
      secondary_contact_relationship: s(body.secondary_contact_relationship) || null,
      emergency_contact_name: s(body.emergency_contact_name),
      emergency_contact_phone: s(body.emergency_contact_phone),
      emergency_contact_relationship: s(body.emergency_contact_relationship),
      liability_waiver_signed: body.liability_waiver_signed === true,
      photo_video_release_signed: body.photo_video_release_signed === true,
      medical_consent_signed: body.medical_consent_signed === true,
      returning_family: body.returning_family === true,
      early_access: body.early_access === true,
    };
    const required: [string, string][] = [
      [shared.parent_first_name, "parent first name"],
      [shared.parent_last_name, "parent last name"],
      [shared.parent_email, "parent email"],
      [shared.parent_phone, "parent phone"],
      [shared.emergency_contact_name, "emergency contact name"],
      [shared.emergency_contact_phone, "emergency contact phone"],
      [shared.emergency_contact_relationship, "emergency contact relationship"],
    ];
    const missing = required.find(([v]) => !v);
    if (missing) return { ok: false, error: `Please provide the ${missing[1]}.` };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(shared.parent_email)) {
      return { ok: false, error: "Please provide a valid email address." };
    }
    if (!shared.liability_waiver_signed || !shared.photo_video_release_signed || !shared.medical_consent_signed) {
      return { ok: false, error: "All three waivers must be agreed to." };
    }
    const raw = Array.isArray(body.campers) ? body.campers : [];
    if (raw.length < 1 || raw.length > MAX_CAMPERS) {
      return { ok: false, error: `Please add between 1 and ${MAX_CAMPERS} campers.` };
    }
    const campers: Camper[] = [];
    for (let i = 0; i < raw.length; i++) {
      const c = (raw[i] ?? {}) as Record<string, unknown>;
      const label = `Camper ${i + 1}`;
      const camper = {
        camper_first_name: s(c.camper_first_name),
        camper_last_name: s(c.camper_last_name),
        camper_dob: s(c.camper_dob),
        camper_grade: s(c.camper_grade),
        camper_tshirt_size: s(c.camper_tshirt_size),
        allergies_medical: clean(c.allergies_medical, 1000) || null,
        special_accommodations: clean(c.special_accommodations, 1000) || null,
      };
      if (!camper.camper_first_name || !camper.camper_last_name || !camper.camper_dob) {
        return { ok: false, error: `Please complete the name and date of birth for ${label}.` };
      }
      if (!GRADES.includes(camper.camper_grade)) return { ok: false, error: `Please select a valid grade for ${label}.` };
      if (!TSHIRT_SIZES.includes(camper.camper_tshirt_size)) {
        return { ok: false, error: `Please select a valid t-shirt size for ${label}.` };
      }
      const camper_age = ageFromDob(camper.camper_dob);
      if (camper_age === null || camper_age < 3 || camper_age > 18) {
        return { ok: false, error: `Please provide a valid date of birth for ${label}.` };
      }
      campers.push({ ...camper, camper_age });
    }
    return { ok: true, data: { shared, campers } };
  },
  async run(ctx, { shared, campers }) {
    const { count, error: countErr } = await ctx.db
      .from("ygb_registrations")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.org.id)
      .eq("status", "confirmed");
    if (countErr) throw new Error(`ygb count: ${countErr.message}`);

    let remaining = Math.max(0, CAPACITY - (count ?? 0));
    const rows = campers.map((c) => {
      const status = remaining > 0 ? "confirmed" : "waitlisted";
      if (remaining > 0) remaining--;
      return { ...shared, ...c, status, org_id: ctx.org.id };
    });

    const { data: inserted, error } = await ctx.db
      .from("ygb_registrations")
      .insert(rows)
      .select("camper_first_name,camper_last_name,status");
    if (error || !inserted) throw new Error(`ygb insert: ${error?.message ?? "no rows"}`);

    const to = notifyAddress(ctx.org, "YGB_NOTIFY_EMAIL");
    if (to) {
      const { data: roster } = await ctx.db
        .from("ygb_registrations")
        .select(
          "camper_first_name,camper_last_name,camper_grade,camper_age,status,allergies_medical,parent_first_name,parent_last_name,parent_email,parent_phone,created_at",
        )
        .eq("org_id", ctx.org.id)
        .order("created_at", { ascending: true });
      if (roster && roster.length > 0) {
        const latest = roster[roster.length - 1].created_at;
        const justRegistered = roster.filter((r) => r.created_at === latest);
        const { subject, text, html } = buildYgbRegistrationEmail({ justRegistered, roster, capacity: CAPACITY });
        await sendMail(ctx.org, { to, replyTo: shared.parent_email, subject, text, html });
      }
    }

    return {
      results: inserted.map((r) => ({ name: `${r.camper_first_name} ${r.camper_last_name}`, status: r.status })),
    };
  },
};
