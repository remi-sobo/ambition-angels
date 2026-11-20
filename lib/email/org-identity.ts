import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOrgCommsSettings, sendBlocker, type OrgCommsSettings } from "@/lib/comms/settings";
import { transportFor, resendTransportFor, type Transport } from "@/lib/comms/transport";
import type { CampaignEmailPayload } from "@/lib/fundraising/comms-email";
import { receiptEmailHtml, receiptEmailText, type ReceiptGift } from "@/lib/fundraising/receipt";

/**
 * Who an email to an org's donors is FROM: display name, sender, reply-to,
 * mailing address, footer and (for receipts) the tax-status statement. Every
 * donor-facing send path (the manual thank-you, the stewardship auto-receipt,
 * the printed receipt letters) resolves it here, and nothing falls back to
 * another org's identity.
 *
 * Sources, all existing per-org data (no migration):
 * - org_comms_settings: from_name, from_email, reply_to, mailing_address,
 *   footer_text, transport (edited on the Comms settings page).
 * - orgs.settings jsonb: legal_name and ein, the legal identity a tax receipt
 *   needs (operator-set, the same place as email_domain).
 * - orgs.name: the display name when from_name is blank.
 *
 * Fail closed: a missing piece is a refusal with a plain reason, never a
 * default. The one exception is Ambition Angels (orgs.slug
 * 'ambition-angels', the slug its own migrations seed by), which keeps the
 * exact identity its acknowledgments used before this resolver existed.
 * That default is matched on AA's slug only, so no other org can reach it.
 */

export const AMBITION_ANGELS_SLUG = "ambition-angels";

/** AA's acknowledgment identity, byte for byte what was hardcoded before. */
export const AA_ACK_FROM = "Ambition Angels <careers@mail.ambitionangels.org>";
export const AA_TAX_STATEMENT =
  "Ambition Angels is a 501(c)(3) nonprofit organization. " +
  "Please retain this letter as your receipt for tax purposes.";
const AA_FOOTER_LINE = "Ambition Angels · ambitionangels.org";
const AA_LETTERHEAD = "380 Portage Ave, Palo Alto, CA 94306 · EIN 87-2513010";

/** The Resend domain BloomOS sends from today belongs to Ambition Angels. No
 *  other org may put a from address on it. */
const AA_SENDING_DOMAIN = "ambitionangels.org";

export type EmailPurpose = "donor" | "receipt";

export type OrgIdentityRow = {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown> | null;
};

export type OrgEmailIdentity = {
  orgId: string;
  displayName: string;
  /** The From header. On Gmail the transport replaces the address with the
   *  connected account and keeps the display name. */
  from: string;
  replyTo: string | null;
  mailingAddress: string;
  /** Plain-text footer under a donor email. */
  footerLine: string;
  /** Receipt letterhead line (address and EIN). */
  letterhead: string;
  /** The IRS tax-status statement; null when the org has none on file. */
  taxStatement: string | null;
  /** How the mail leaves: AA's fixed Resend sender, or the org's own comms
   *  transport (Gmail or Resend) from org_comms_settings. */
  sender: { kind: "aa-default" } | { kind: "comms"; settings: OrgCommsSettings };
};

export type IdentityResult = { ok: true; identity: OrgEmailIdentity } | { ok: false; reason: string };

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function domainOf(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

function onAaDomain(email: string): boolean {
  const d = domainOf(email);
  return d === AA_SENDING_DOMAIN || d.endsWith(`.${AA_SENDING_DOMAIN}`);
}

const EIN_RE = /^\d{2}-?\d{7}$/;

/** Pure: build the identity from already-loaded rows, or the reason it can't
 *  be built for this purpose. */
export function buildOrgEmailIdentity(
  org: OrgIdentityRow | null,
  comms: OrgCommsSettings | null,
  purpose: EmailPurpose
): IdentityResult {
  if (!org) return { ok: false, reason: "This organization could not be found, so nothing was sent." };

  if (org.slug === AMBITION_ANGELS_SLUG) {
    return {
      ok: true,
      identity: {
        orgId: org.id,
        displayName: "Ambition Angels",
        from: AA_ACK_FROM,
        replyTo: null,
        mailingAddress: comms?.mailing_address ?? "",
        footerLine: AA_FOOTER_LINE,
        letterhead: AA_LETTERHEAD,
        taxStatement: AA_TAX_STATEMENT,
        sender: { kind: "aa-default" },
      },
    };
  }

  const blocker = sendBlocker(comms);
  if (blocker || !comms) {
    return {
      ok: false,
      reason: `Donor emails can't go out until this org's sending identity is set up. ${blocker ?? ""}`.trim(),
    };
  }
  const fromEmail = comms.from_email.trim();
  if (comms.transport === "resend" && onAaDomain(fromEmail)) {
    return {
      ok: false,
      reason:
        "This org's from address is on Ambition Angels' sending domain. Connect your own Gmail or set your own from address in Comms settings.",
    };
  }
  if (comms.reply_to && onAaDomain(comms.reply_to)) {
    return {
      ok: false,
      reason: "This org's reply-to address is an Ambition Angels address. Change it in Comms settings.",
    };
  }

  const displayName = comms.from_name.trim() || org.name.trim();
  const mailingAddress = comms.mailing_address.trim();
  const legalName = str(org.settings?.legal_name);
  const ein = str(org.settings?.ein);
  const hasLegal = !!legalName && EIN_RE.test(ein);

  if (purpose === "receipt" && !hasLegal) {
    return {
      ok: false,
      reason:
        "Tax receipts need your organization's legal name and EIN on file, and they aren't set yet. Ask your BloomOS administrator to add them to your org profile, then send again. Nothing was sent.",
    };
  }

  return {
    ok: true,
    identity: {
      orgId: org.id,
      displayName,
      from: fromEmail ? `${displayName} <${fromEmail}>` : displayName,
      replyTo: comms.reply_to?.trim() || null,
      mailingAddress,
      footerLine: [displayName, mailingAddress, comms.footer_text]
        .filter((p): p is string => !!p && p.trim() !== "")
        .join(" · "),
      letterhead: hasLegal ? `${mailingAddress} · EIN ${ein}` : mailingAddress,
      taxStatement: hasLegal
        ? `${legalName} is a 501(c)(3) nonprofit organization, EIN ${ein}. ` +
          "Please retain this letter as your receipt for tax purposes."
        : null,
      sender: { kind: "comms", settings: comms },
    },
  };
}

/** Load and build the identity for `orgId`. */
export async function resolveOrgEmailIdentity(
  supabase: SupabaseClient,
  orgId: string,
  purpose: EmailPurpose
): Promise<IdentityResult> {
  const [{ data: org }, comms] = await Promise.all([
    supabase.from("orgs").select("id, name, slug, settings").eq("id", orgId).maybeSingle(),
    loadOrgCommsSettings(supabase, orgId),
  ]);
  return buildOrgEmailIdentity((org as OrgIdentityRow | null) ?? null, comms, purpose);
}

/** The transport this identity sends through, or why it can't send now. */
export async function transportForIdentity(
  identity: OrgEmailIdentity
): Promise<{ transport: Transport } | { blocked: string }> {
  if (identity.sender.kind === "aa-default") return resendTransportFor(identity.from);
  return transportFor(identity.sender.settings);
}

/** The thank-you plus receipt email for one gift, sent as `identity`. The
 *  identity must come from a "receipt" resolve, which guarantees a tax
 *  statement. */
export function buildReceiptEmail(
  identity: OrgEmailIdentity,
  input: { to: string; subject: string; personalNote: string; gift: ReceiptGift }
): CampaignEmailPayload {
  if (!identity.taxStatement) throw new Error("buildReceiptEmail: identity has no tax statement");
  const receiptIdentity = { taxStatement: identity.taxStatement, footerLine: identity.footerLine };
  return {
    from: identity.from,
    to: input.to,
    ...(identity.replyTo ? { replyTo: identity.replyTo } : {}),
    subject: input.subject,
    text: receiptEmailText(input.personalNote, input.gift, receiptIdentity),
    html: receiptEmailHtml(input.personalNote, input.gift, receiptIdentity),
    headers: {},
  };
}
