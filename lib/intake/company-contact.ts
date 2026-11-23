import { adminUrl } from "@/lib/origins";
import { clean, esc, notifyAddress, sendMail } from "./notify";
import type { KindHandler } from "./types";

/**
 * A company, a would-be Guide, or a MESA student raising a hand (was
 * app/api/partner-waitlist). Lands in partner_waitlist, now with org_id from
 * the key instead of the table's old resident-org column default.
 *
 * The role decides the shape: "MESA Student" needs no last name,
 * "Corporate Partner" is a company lead, anything else is a Guide.
 */

export type CompanyContactInput = {
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  teen_count: string | null;
  company: string | null;
  role_category: string | null;
  interest: string | null;
  problem_to_solve: string | null;
};

const optional = (v: unknown) => clean(v, 300) || null;

export const companyContact: KindHandler<CompanyContactInput> = {
  scope: "intake:forms",
  validate(body) {
    const first_name = clean(body.first_name, 80);
    const last_name = clean(body.last_name, 80);
    const email = clean(body.email, 200);
    const role = clean(body.role, 120);
    const isStudent = role === "MESA Student";
    if (!first_name || !email || !role || (!isStudent && !last_name)) {
      return { ok: false, error: "Missing required fields" };
    }
    return {
      ok: true,
      data: {
        first_name,
        last_name,
        email,
        role,
        teen_count: clean(body.teen_count, 40) || null,
        company: optional(body.company),
        role_category: optional(body.role_category),
        interest: optional(body.interest),
        problem_to_solve: clean(body.problem_to_solve, 2000) || null,
      },
    };
  },
  async run(ctx, d) {
    const { problem_to_solve, ...row } = d;
    const { data, error } = await ctx.db
      .from("partner_waitlist")
      .insert({ ...row, org_id: ctx.org.id })
      .select("id")
      .single();
    if (error || !data) throw new Error(`partner_waitlist insert: ${error?.message ?? "no row"}`);

    const to = notifyAddress(ctx.org);
    if (to) {
      const prefix =
        d.role === "Corporate Partner"
          ? "New company inquiry"
          : d.role === "MESA Student"
            ? "New MESA student signup"
            : "New Guide waitlist signup";
      const line = (label: string, v: string | null) =>
        v ? `<tr><td style="padding:6px 12px 6px 0;color:#6B7280;">${label}</td><td style="padding:6px 0;color:#0E0E0E;">${esc(v)}</td></tr>` : "";
      await sendMail(ctx.org, {
        to,
        replyTo: d.email,
        subject: `${prefix}: ${d.first_name} ${d.last_name}`.trim(),
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;">
  <strong>${prefix}</strong>
  <table style="margin-top:12px;border-collapse:collapse;">
    ${line("Name", `${d.first_name} ${d.last_name}`.trim())}
    ${line("Email", d.email)}
    ${line("Role", d.role)}
    ${line("Company", d.company)}
    ${line("Role category", d.role_category)}
    ${line("Interest", d.interest)}
    ${line("Teens", d.teen_count)}
  </table>
  ${problem_to_solve ? `<p style="margin-top:12px;"><strong>What they want to solve</strong><br>${esc(problem_to_solve)}</p>` : ""}
  <p><a href="${adminUrl("/admin/legacy")}">See it in BloomOS</a></p>
</div>`,
      });
    }
    return { id: data.id as string };
  },
};
