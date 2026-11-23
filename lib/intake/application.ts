import { adminUrl } from "@/lib/origins";
import { clean, esc, notifyAddress, sendMail } from "./notify";
import type { IntakeCtx, KindHandler } from "./types";

/**
 * Student application (was app/api/apply). Whitelisted fields only: status and
 * priority are decided in screening, never by the sender. A chosen cohort must
 * belong to the key's org and be accepting applications.
 */

export type ApplicationInput = {
  cohort_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  dob: string | null;
  grade: string;
  school: string | null;
  location: string | null;
  guardian_name: string;
  guardian_email: string;
  guardian_phone: string | null;
  motivation: string | null;
  referral: string | null;
};

const isISODate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export const application: KindHandler<ApplicationInput> = {
  scope: "intake:forms",
  validate(body) {
    const first_name = clean(body.first_name, 120);
    const last_name = clean(body.last_name, 120);
    const grade = clean(body.grade, 40);
    const guardian_name = clean(body.guardian_name, 120);
    const guardian_email = clean(body.guardian_email, 160).toLowerCase();
    for (const [v, label] of [
      [first_name, "student first name"],
      [last_name, "student last name"],
      [grade, "grade"],
      [guardian_name, "parent/guardian name"],
      [guardian_email, "parent/guardian email"],
    ] as const) {
      if (!v) return { ok: false, error: `Missing ${label}.` };
    }
    if (!guardian_email.includes("@")) return { ok: false, error: "Invalid parent/guardian email." };
    const cohort = clean(body.cohort_id, 40);
    if (cohort && !/^[0-9a-f-]{36}$/i.test(cohort)) return { ok: false, error: "Invalid program." };
    const email = clean(body.email, 160).toLowerCase();
    const dob = clean(body.dob, 10);
    return {
      ok: true,
      data: {
        cohort_id: cohort || null,
        first_name,
        last_name,
        email: email.includes("@") ? email : null,
        phone: clean(body.phone, 40) || null,
        dob: isISODate(dob) ? dob : null,
        grade,
        school: clean(body.school, 160) || null,
        location: clean(body.location, 160) || null,
        guardian_name,
        guardian_email,
        guardian_phone: clean(body.guardian_phone, 40) || null,
        motivation: clean(body.motivation, 2000) || null,
        referral: clean(body.referral, 300) || null,
      },
    };
  },
  async run(ctx: IntakeCtx, d) {
    let cohortName: string | null = null;
    if (d.cohort_id) {
      const { data: cohort } = await ctx.db
        .from("cohorts")
        .select("id, name")
        .eq("id", d.cohort_id)
        .eq("org_id", ctx.org.id)
        .eq("accepting_applications", true)
        .maybeSingle();
      // A cohort that closed between page load and submit: keep the
      // application as general interest rather than lose it.
      cohortName = cohort?.name ?? null;
      if (!cohort) d = { ...d, cohort_id: null };
    }

    const { data, error } = await ctx.db
      .from("applications")
      .insert({ ...d, org_id: ctx.org.id })
      .select("id")
      .single();
    if (error || !data) throw new Error(`applications insert: ${error?.message ?? "no row"}`);

    const to = notifyAddress(ctx.org, "INTAKE_NOTIFY_EMAIL");
    if (to) {
      const student = `${d.first_name} ${d.last_name}`;
      const program = cohortName ?? "General interest";
      await sendMail(ctx.org, {
        to,
        subject: `New application: ${student} (${program})`,
        html: `<div style="font-family:monospace;background:#f9f9f9;padding:24px;border-radius:8px;font-size:14px;line-height:1.7;">
  <strong>New Student Application</strong><br><br>
  Student: ${esc(student)} (Grade ${esc(d.grade)})<br>
  Program: ${esc(program)}<br>
  School: ${esc(d.school || "not specified")}<br>
  Guardian: ${esc(d.guardian_name)} · ${esc(d.guardian_email)}${d.guardian_phone ? ` · ${esc(d.guardian_phone)}` : ""}<br>
  How they heard: ${esc(d.referral || "not specified")}<br><br>
  <a href="${adminUrl("/admin/intake")}">Review it in BloomOS</a>
</div>`,
      });
    }
    return { id: data.id as string, cohort_name: cohortName };
  },
};

/** Cohorts this org is taking applications for, for the website's program picker. */
export async function openCohorts(ctx: IntakeCtx): Promise<{ id: string; name: string }[]> {
  const { data, error } = await ctx.db
    .from("cohorts")
    .select("id, name")
    .eq("org_id", ctx.org.id)
    .eq("accepting_applications", true)
    .in("status", ["planning", "active"])
    .order("start_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`cohorts read: ${error.message}`);
  return (data ?? []) as { id: string; name: string }[];
}
