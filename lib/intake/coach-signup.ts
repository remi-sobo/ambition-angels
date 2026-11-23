import { adminUrl } from "@/lib/origins";
import { privateUrl } from "@/lib/coach/server";
import { clean, EMAIL_RE, esc, notifyAddress, sendMail } from "./notify";
import type { KindHandler } from "./types";

/**
 * Ambition Coach sign-up (was app/api/coach-signup). AA-only: needs aa.coach.
 *
 * Unlike the other kinds, BloomOS sends the confirmation to the person too,
 * because it carries their private coach page link, which only exists once
 * the coach_people row does. That keeps the link correct even when the
 * website had to queue the submission and retry it later.
 */

export type CoachSignupInput = {
  kind: "coach" | "student";
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  field: string;
  role: string | null;
  company: string | null;
  linkedin: string | null;
  age: number | null;
  school: string | null;
  program: string | null;
  goal: string | null;
  timing: string | null;
  referral: string | null;
  note: string | null;
};

export const coachSignup: KindHandler<CoachSignupInput> = {
  scope: "intake:forms",
  entitlement: "aa.coach",
  validate(body) {
    const kind = body.kind === "student" ? "student" : body.kind === "coach" ? "coach" : null;
    if (!kind) return { ok: false, error: "Choose coach or student." };
    const first_name = clean(body.first_name, 80);
    const last_name = clean(body.last_name, 80);
    const email = clean(body.email, 200).toLowerCase();
    const field = clean(body.field, 120);
    const role = clean(body.role, 160);
    if (!first_name || !last_name || !email || !field) {
      return { ok: false, error: "Please add your name, email and field." };
    }
    if (!EMAIL_RE.test(email)) return { ok: false, error: "That email address doesn't look right." };
    if (kind === "coach" && !role) return { ok: false, error: "Please add your role." };
    let age: number | null = null;
    if (kind === "student") {
      const raw = clean(body.age, 3);
      age = /^\d{1,2}$/.test(raw) ? Number(raw) : null;
      if (age === null || age < 18 || age > 30) {
        return { ok: false, error: "Ambition Coach is for ages 18 to 24." };
      }
    }
    const coach = kind === "coach";
    return {
      ok: true,
      data: {
        kind,
        first_name,
        last_name,
        email,
        phone: clean(body.phone, 40) || null,
        field,
        role: coach ? role : null,
        company: coach ? clean(body.company, 120) || null : null,
        linkedin: clean(body.linkedin, 300) || null,
        age,
        school: coach ? null : clean(body.school, 160) || null,
        program: coach ? null : clean(body.program, 160) || null,
        goal: coach ? null : clean(body.goal, 1000) || null,
        timing: clean(body.timing, 80) || null,
        referral: clean(body.referral, 200) || null,
        note: clean(body.note, 1500) || null,
      },
    };
  },
  async run(ctx, d) {
    const { data, error } = await ctx.db
      .from("coach_people")
      .insert({ ...d, org_id: ctx.org.id })
      .select("id, access_token")
      .single();
    if (error || !data) throw new Error(`coach_people insert: ${error?.message ?? "no row"}`);
    const personId = data.id as string;
    const page = privateUrl(data.access_token as string);

    const text =
      d.kind === "coach"
        ? `Hi ${d.first_name},

Thank you for signing up to be an Ambition Coach. It means a lot.

Here's what happens next. I'll reach out personally for a short call so I can hear about your work and tell you more about the young people we're matching. When there's a student heading into ${d.field}, I'll send you their profile before anything is set. You say yes or no.

This is your own Ambition Coach page. Once you're matched, your student's profile, the prep for each session and their plan all show up here:
${page}

It's just for you, so please don't forward it. If you want to talk sooner, just reply to this email.

With gratitude,
Remi
Ambition Angels`
        : `Hi ${d.first_name},

Thanks for signing up for an Ambition Coach. We got your info.

Here's what happens next. I'll look for a professional who works in ${d.field} and reach out when I have a match. When you get the intro email, it's on you to reply and get your first session on the calendar.

This is your own Ambition Coach page. Your coach, the prep for each session and your Ambition Plan all live here:
${page}

It's just for you, so don't share it. If you have questions, just reply to this email.

Rooting for you,
Remi
Ambition Angels`;

    const confirm = sendMail(ctx.org, {
      from: "Remi Sobomehin <careers@mail.ambitionangels.org>",
      replyTo: "remi@ambitionangels.org",
      to: d.email,
      subject: d.kind === "coach" ? "Thanks for raising your hand" : "We got your Ambition Coach sign-up",
      text,
    }).then(async () => {
      await ctx.db.from("coach_people").update({ link_sent_at: new Date().toISOString() }).eq("id", personId);
    });

    const to = notifyAddress(ctx.org);
    const lines =
      d.kind === "coach"
        ? `Role: ${esc(d.role)}${d.company ? ` at ${esc(d.company)}` : ""}<br>LinkedIn: ${esc(d.linkedin) || "not given"}<br>`
        : `Age: ${d.age}<br>School: ${esc(d.school) || "not given"}<br>Program: ${esc(d.program) || "not given"}<br>Goal: ${esc(d.goal) || "not given"}<br>`;
    const alert = to
      ? sendMail(ctx.org, {
          to,
          subject: `New Ambition Coach ${d.kind}: ${d.first_name} ${d.last_name} (${d.field})`,
          html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7">
Name: ${esc(d.first_name)} ${esc(d.last_name)}<br>
Email: ${esc(d.email)}<br>
Phone: ${esc(d.phone) || "not given"}<br>
Field: ${esc(d.field)}<br>
${lines}Timing: ${esc(d.timing) || "not given"}<br>
Heard from: ${esc(d.referral) || "not given"}<br>
Note: ${esc(d.note) || "none"}<br><br>
See all sign-ups in BloomOS: ${adminUrl("/admin/programs/coach")}
</div>`,
        })
      : Promise.resolve();

    await Promise.allSettled([confirm, alert]);
    return { id: personId };
  },
};
