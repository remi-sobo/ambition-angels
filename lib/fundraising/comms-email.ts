import { unsubscribeUrl } from "./unsubscribe";
import type { OrgCommsSettings } from "@/lib/comms/settings";

// Shared rendering for campaign AND journey emails — changes here ship into
// both paths. Plain-text body with {{first_name}} personalization, wrapped in
// a light branded HTML shell with a compliant footer (org mailing address +
// unsubscribe link from org_comms_settings) and RFC 8058 one-click
// unsubscribe headers.

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function personalize(body: string, firstName: string): string {
  return body.replace(/\{\{\s*first_name\s*\}\}/gi, firstName || "friend");
}

export type CampaignEmailInput = {
  settings: OrgCommsSettings;
  to: string;
  subject: string;
  /** Body already personalized via personalize(). */
  bodyText: string;
  constituentId: string | null;
  /** Attributes an unsubscribe to the campaign that triggered it. */
  campaignId?: string | null;
};

export type CampaignEmailPayload = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
};

// One builder for the whole Resend payload so campaign, test, and journey
// sends can't drift apart on identity, footer, or compliance headers.
export function buildCampaignEmail(input: CampaignEmailInput): CampaignEmailPayload {
  const { settings, constituentId, campaignId } = input;
  const unsubUrl = constituentId ? unsubscribeUrl(constituentId, campaignId) : null;
  return {
    from: `${settings.from_name} <${settings.from_email}>`.trim(),
    to: input.to,
    ...(settings.reply_to ? { replyTo: settings.reply_to } : {}),
    subject: input.subject,
    html: campaignHtml(input.bodyText, settings, unsubUrl),
    text: campaignText(input.bodyText, settings, unsubUrl),
    headers: listUnsubscribeHeaders(settings, unsubUrl),
  };
}

// List-Unsubscribe (mailto + one-click URL) and List-Unsubscribe-Post
// (RFC 8058) — Gmail's bulk-sender requirements. The URL accepts POST with
// List-Unsubscribe=One-Click on the same token.
export function listUnsubscribeHeaders(
  settings: OrgCommsSettings,
  unsubUrl: string | null
): Record<string, string> {
  const mailto = `mailto:${settings.reply_to || settings.from_email}?subject=unsubscribe`;
  if (!unsubUrl) return { "List-Unsubscribe": `<${mailto}>` };
  return {
    "List-Unsubscribe": `<${mailto}>, <${unsubUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

function footerLine(settings: OrgCommsSettings): string {
  return [settings.from_name, settings.mailing_address, settings.footer_text]
    .filter((p): p is string => !!p && p.trim() !== "")
    .join(" · ");
}

export function campaignHtml(
  bodyText: string,
  settings: OrgCommsSettings,
  unsubUrl: string | null
): string {
  const paras = bodyText
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;color:#3D3D3D;font-size:15px;line-height:1.6;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  const unsub = unsubUrl
    ? `<a href="${unsubUrl}" style="color:#9CA3AF;">Unsubscribe</a>`
    : "Reply to unsubscribe";
  return `<div style="font-family:'Helvetica Neue',sans-serif;max-width:560px;margin:0 auto;padding:28px;">
    ${paras}
    <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0 12px;" />
    <p style="color:#9CA3AF;font-size:12px;margin:0;">${escapeHtml(footerLine(settings))} · ${unsub}</p>
  </div>`;
}

export function campaignText(
  bodyText: string,
  settings: OrgCommsSettings,
  unsubUrl: string | null
): string {
  const footer = unsubUrl ? `\nUnsubscribe: ${unsubUrl}` : "\nReply to unsubscribe.";
  return `${bodyText}\n\n— ${footerLine(settings)}${footer}`;
}
