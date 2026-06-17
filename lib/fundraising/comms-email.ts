import { unsubscribeUrl } from "./unsubscribe";

// Shared rendering for campaign emails (test + send). Plain-text body with
// {{first_name}} personalization, wrapped in a light branded HTML shell with a
// compliant unsubscribe footer.

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function personalize(body: string, firstName: string): string {
  return body.replace(/\{\{\s*first_name\s*\}\}/gi, firstName || "friend");
}

export function campaignHtml(bodyText: string, constituentId: string | null): string {
  const paras = bodyText
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;color:#3D3D3D;font-size:15px;line-height:1.6;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  const unsub = constituentId
    ? `<a href="${unsubscribeUrl(constituentId)}" style="color:#9CA3AF;">Unsubscribe</a>`
    : "Reply to unsubscribe";
  return `<div style="font-family:'Helvetica Neue',sans-serif;max-width:560px;margin:0 auto;padding:28px;">
    ${paras}
    <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0 12px;" />
    <p style="color:#9CA3AF;font-size:12px;margin:0;">Ambition Angels · 380 Portage Ave, Palo Alto, CA 94306 · EIN 87-2513010 · ${unsub}</p>
  </div>`;
}

export function campaignText(bodyText: string, constituentId: string | null): string {
  const footer = constituentId ? `\nUnsubscribe: ${unsubscribeUrl(constituentId)}` : "";
  return `${bodyText}\n\n— Ambition Angels · EIN 87-2513010${footer}`;
}
