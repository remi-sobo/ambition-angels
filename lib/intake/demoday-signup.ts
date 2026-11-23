import { adminUrl } from "@/lib/origins";
import { clean, EMAIL_RE, esc, notifyAddress, sendMail } from "./notify";
import type { KindHandler } from "./types";

/** Demo Day supporter sign-up (was app/api/demoday/signup). AA-only: needs aa.demoday. */

const ENGAGEMENT_OPTIONS = [
  "As a potential funder",
  "As a connector",
  "As a mentor",
  "Just staying informed",
];

export type DemodaySignupInput = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  company: string | null;
  title: string | null;
  engagement: string[];
  note: string | null;
};

export const demodaySignup: KindHandler<DemodaySignupInput> = {
  scope: "intake:forms",
  entitlement: "aa.demoday",
  validate(body) {
    const first_name = clean(body.first_name, 80);
    const last_name = clean(body.last_name, 80);
    const email = clean(body.email, 200);
    if (!first_name || !last_name || !email) {
      return { ok: false, error: "First name, last name, and email are required." };
    }
    if (!EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email address." };
    const engagement = Array.isArray(body.engagement)
      ? body.engagement.map((v) => clean(v, 80)).filter((v) => ENGAGEMENT_OPTIONS.includes(v))
      : [];
    return {
      ok: true,
      data: {
        first_name,
        last_name,
        email,
        phone: clean(body.phone, 40) || null,
        company: clean(body.company, 160) || null,
        title: clean(body.title, 160) || null,
        engagement,
        note: clean(body.note, 2000) || null,
      },
    };
  },
  async run(ctx, d) {
    const { data, error } = await ctx.db
      .from("demoday_signups")
      .insert({ ...d, source: "Demo Day Signup", org_id: ctx.org.id })
      .select("id")
      .single();
    if (error || !data) throw new Error(`demoday_signups insert: ${error?.message ?? "no row"}`);

    const to = notifyAddress(ctx.org, "DEMODAY_NOTIFY_EMAIL");
    if (to) {
      const line = (label: string, v: string | null) =>
        v ? `<tr><td style="padding:6px 12px 6px 0;color:#6B7280;vertical-align:top;">${label}</td><td style="padding:6px 0;color:#0E0E0E;">${esc(v)}</td></tr>` : "";
      await sendMail(ctx.org, {
        to,
        replyTo: d.email,
        subject: `New Demo Day signup: ${d.first_name} ${d.last_name}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;">
  <strong>New Demo Day signup</strong>
  <table style="margin-top:12px;border-collapse:collapse;">
    ${line("Name", `${d.first_name} ${d.last_name}`)}
    ${line("Email", d.email)}
    ${line("Phone", d.phone)}
    ${line("Company", d.company)}
    ${line("Role / title", d.title)}
    ${line("Interested in", d.engagement.length ? d.engagement.join(", ") : null)}
    ${line("Note", d.note)}
  </table>
  <p><a href="${adminUrl("/admin/demoday")}">See all sign-ups in BloomOS</a></p>
</div>`,
      });
    }
    return { id: data.id as string };
  },
};
