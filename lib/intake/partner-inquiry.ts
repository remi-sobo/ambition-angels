import { adminUrl } from "@/lib/origins";
import { clean, esc, notifyAddress, sendMail } from "./notify";
import type { KindHandler } from "./types";

/**
 * A school or program asking to partner. Two website forms send this kind:
 *
 *   source "schools_form"  /schools inquiry (was app/api/schools-inquiry)
 *   source "signup_form"   program partner sign-up (was app/api/program-partner-signup)
 *
 * Both land on the partners spine as a prospect, same as before.
 */

export type PartnerInquiryInput = {
  source: "schools_form" | "signup_form";
  org_name: string;
  kind: "school" | "nonprofit" | "other";
  champion_name: string;
  champion_email: string;
  champion_role: string | null;
  teen_count: string | null;
  program_type: string;
  referral: string | null;
};

/** Map the /schools setting label onto the partners.kind check constraint. */
export function kindForSetting(setting: string): "school" | "nonprofit" | "other" {
  if (/^(High school|Middle school|Charter school|CTE or AVID|Community college)/.test(setting)) {
    return "school";
  }
  if (setting === "Other" || setting === "Individual mentor or parent") return "other";
  return "nonprofit";
}

export const partnerInquiry: KindHandler<PartnerInquiryInput> = {
  scope: "intake:forms",
  validate(body) {
    const source = body.source === "schools_form" || body.source === "signup_form" ? body.source : null;
    if (!source) return { ok: false, error: "Unknown partner inquiry source." };
    const email = clean(body.email, 200).toLowerCase();
    const teen = clean(body.teen_count ?? body.student_count, 40) || null;

    if (source === "schools_form") {
      const name = clean(body.name, 160);
      const role = clean(body.role, 160);
      const organization = clean(body.organization, 200);
      const setting = clean(body.setting, 160);
      if (!name || !email || !role || !organization || !setting) {
        return { ok: false, error: "Missing required fields" };
      }
      return {
        ok: true,
        data: {
          source,
          org_name: organization,
          kind: kindForSetting(setting),
          champion_name: name,
          champion_email: email,
          champion_role: role,
          teen_count: teen,
          program_type: setting,
          referral: null,
        },
      };
    }

    const first = clean(body.first_name, 80);
    const last = clean(body.last_name, 80);
    const orgName = clean(body.org_name, 200);
    const programType = clean(body.program_type, 160);
    if (!first || !last || !orgName || !email || !programType) {
      return { ok: false, error: "Missing required fields" };
    }
    return {
      ok: true,
      data: {
        source,
        org_name: orgName,
        kind: "nonprofit",
        champion_name: `${first} ${last}`,
        champion_email: email,
        champion_role: null,
        teen_count: teen,
        program_type: programType,
        referral: clean(body.referral, 300) || null,
      },
    };
  },
  async run(ctx, d) {
    const { data, error } = await ctx.db
      .from("partners")
      .insert({
        org_id: ctx.org.id,
        name: d.org_name,
        kind: d.kind,
        status: "prospect",
        champion_name: d.champion_name,
        champion_email: d.champion_email,
        ...(d.champion_role ? { champion_role: d.champion_role } : {}),
        teen_count: d.teen_count,
        program_type: d.program_type,
        ...(d.referral ? { referral: d.referral } : {}),
        external_source: d.source,
        last_touch_at: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`partners insert: ${error?.message ?? "no row"}`);

    const to = notifyAddress(ctx.org);
    if (to) {
      const label = d.source === "schools_form" ? "New /schools inquiry" : "New Program Partner";
      await sendMail(ctx.org, {
        to,
        replyTo: d.champion_email,
        subject: `${label}: ${d.org_name} (${d.champion_name})`,
        html: `<div style="font-family:monospace;background:#f9f9f9;padding:24px;border-radius:8px;font-size:14px;line-height:1.7;">
  <strong>${label}</strong><br><br>
  Name: ${esc(d.champion_name)}<br>
  Email: ${esc(d.champion_email)}<br>
  ${d.champion_role ? `Role: ${esc(d.champion_role)}<br>` : ""}
  Organization: ${esc(d.org_name)}<br>
  Students: ${esc(d.teen_count || "not specified")}<br>
  Setting: ${esc(d.program_type)}<br>
  ${d.referral ? `How they heard: ${esc(d.referral)}<br>` : ""}<br>
  <a href="${adminUrl(`/admin/partners/${data.id}`)}">Open in BloomOS</a>
</div>`,
      });
    }
    return { id: data.id as string };
  },
};
