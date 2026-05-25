import { escapeHtml, htmlShell } from "../format";

export type YgbRosterRow = {
  camper_first_name: string;
  camper_last_name: string;
  camper_grade: string;
  camper_age: number | null;
  parent_first_name: string;
  parent_last_name: string;
  parent_email: string;
  parent_phone: string;
  status: string;
  allergies_medical?: string | null;
};

const fullName = (first: string, last: string) => `${first} ${last}`.trim();

/**
 * Internal email to the YGB team on every new registration. Leads with who
 * just signed up, then gives the running roster + live counts so there's a
 * single at-a-glance tab of where enrollment stands.
 */
export function buildYgbRegistrationEmail(args: {
  justRegistered: YgbRosterRow[];
  roster: YgbRosterRow[];
  capacity: number;
}): { subject: string; text: string; html: string } {
  const { justRegistered, roster, capacity } = args;

  const confirmed = roster.filter((r) => r.status === "confirmed").length;
  const waitlisted = roster.filter((r) => r.status === "waitlisted").length;
  const total = roster.length;

  const newNames = justRegistered.map((r) => fullName(r.camper_first_name, r.camper_last_name)).join(", ");
  const parent = justRegistered[0]
    ? fullName(justRegistered[0].parent_first_name, justRegistered[0].parent_last_name)
    : "";

  const subject = `New YGB registration: ${newNames} — ${confirmed}/${capacity} confirmed`;

  // ── Plain-text fallback ──
  const textLines: string[] = [];
  textLines.push(`Just registered (parent: ${parent}, ${justRegistered[0]?.parent_email ?? ""}):`);
  for (const r of justRegistered) {
    textLines.push(
      `  - ${fullName(r.camper_first_name, r.camper_last_name)} · ${r.camper_grade} grade · ${r.status}` +
        (r.allergies_medical ? ` · ALLERGY/MEDICAL: ${r.allergies_medical}` : "")
    );
  }
  textLines.push("");
  textLines.push(`Counts: ${confirmed}/${capacity} confirmed · ${waitlisted} waitlisted · ${total} total`);
  textLines.push("");
  textLines.push("Full roster:");
  roster.forEach((r, i) => {
    textLines.push(
      `  ${i + 1}. ${fullName(r.camper_first_name, r.camper_last_name)} · ${r.camper_grade} · ${r.status} · ${r.parent_email}`
    );
  });
  const text = textLines.join("\n");

  // ── HTML ──
  const justRows = justRegistered
    .map((r) => {
      const tag =
        r.status === "confirmed"
          ? `<span style="color:#1a7f37;font-weight:700;">Confirmed</span>`
          : `<span style="color:#B83D06;font-weight:700;">Waitlisted</span>`;
      const allergy = r.allergies_medical
        ? `<div style="font-size:13px;color:#B83D06;margin-top:2px;">⚠ ${escapeHtml(r.allergies_medical)}</div>`
        : "";
      return `<tr>
        <td style="padding:6px 12px 6px 0;color:#0E0E0E;font-size:15px;">${escapeHtml(
          fullName(r.camper_first_name, r.camper_last_name)
        )}<div style="font-size:13px;color:#6B6960;">${escapeHtml(r.camper_grade)} grade${escapeHtml(
        ""
      )}</div>${allergy}</td>
        <td style="padding:6px 0;font-size:14px;text-align:right;">${tag}</td>
      </tr>`;
    })
    .join("");

  const rosterRows = roster
    .map((r, i) => {
      const tag =
        r.status === "confirmed"
          ? `<span style="color:#1a7f37;">confirmed</span>`
          : `<span style="color:#B83D06;">waitlisted</span>`;
      return `<tr>
        <td style="padding:4px 8px 4px 0;color:#6B6960;font-size:13px;width:24px;">${i + 1}</td>
        <td style="padding:4px 8px 4px 0;color:#0E0E0E;font-size:14px;">${escapeHtml(
          fullName(r.camper_first_name, r.camper_last_name)
        )} <span style="color:#6B6960;">· ${escapeHtml(r.camper_grade)}</span></td>
        <td style="padding:4px 0;color:#6B6960;font-size:13px;text-align:right;">${tag}</td>
      </tr>`;
    })
    .join("");

  const html = htmlShell(`
    <tr><td style="padding-bottom:6px;font-family:Georgia,serif;font-size:22px;color:#0E0E0E;">New YGB Creators Camp registration</td></tr>
    <tr><td style="padding-bottom:18px;color:#6B6960;font-size:14px;">Parent: ${escapeHtml(parent)} · <a href="mailto:${escapeHtml(
    justRegistered[0]?.parent_email ?? ""
  )}" style="color:#E8500A;text-decoration:none;">${escapeHtml(justRegistered[0]?.parent_email ?? "")}</a> · ${escapeHtml(
    justRegistered[0]?.parent_phone ?? ""
  )}</td></tr>
    <tr><td style="padding-bottom:20px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${justRows}</table></td></tr>
    <tr><td style="padding:14px 0;border-top:1px solid #E5E2DA;border-bottom:1px solid #E5E2DA;">
      <span style="font-size:18px;font-weight:800;color:#0E0E0E;">${confirmed}/${capacity}</span>
      <span style="font-size:13px;color:#6B6960;"> confirmed</span>
      &nbsp;·&nbsp; <span style="font-size:15px;font-weight:700;color:#B83D06;">${waitlisted}</span>
      <span style="font-size:13px;color:#6B6960;"> waitlisted</span>
      &nbsp;·&nbsp; <span style="font-size:15px;font-weight:700;color:#0E0E0E;">${total}</span>
      <span style="font-size:13px;color:#6B6960;"> total</span>
    </td></tr>
    <tr><td style="padding-top:18px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#6B6960;padding-bottom:8px;">Full roster</td></tr>
    <tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rosterRows}</table></td></tr>
  `);

  return { subject, text, html };
}
