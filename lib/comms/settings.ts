import type { SupabaseClient } from "@supabase/supabase-js";

// Per-org sending identity (org_comms_settings). Every comms send path —
// campaign send, test send, journeys cron — loads this instead of a
// hardcoded from-address constant, and refuses to send when the row is
// missing or incomplete (a from address and a physical mailing address are
// the CAN-SPAM floor).
//
// transport (specs/comms-v2-gmail-amendment.md): 'gmail' sends as the org's
// connected Google account, so the From address comes from that connection
// and from_email is not required; 'resend' sends from from_email.

export type OrgCommsSettings = {
  org_id: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  mailing_address: string;
  footer_text: string | null;
  daily_send_cap: number;
  transport: CommsTransportKind;
  /** G4: addresses that get a copy of every finished campaign. */
  leadership_copy_emails?: string[];
};

export type CommsTransportKind = "gmail" | "resend";

/** Gmail's own ceiling is about 2,000 a day on Workspace and going over it
 *  locks the account out of all sending (the ED's own mail included) for up
 *  to a day, so a Gmail org's cap defaults to 400 and can't pass 1,800. */
export const GMAIL_DEFAULT_DAILY_CAP = 400;
export const GMAIL_MAX_DAILY_CAP = 1800;

export const SETTINGS_COLUMNS =
  "org_id, from_name, from_email, reply_to, mailing_address, footer_text, daily_send_cap, transport, leadership_copy_emails";

export async function loadOrgCommsSettings(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgCommsSettings | null> {
  const { data } = await supabase
    .from("org_comms_settings")
    .select(SETTINGS_COLUMNS)
    .eq("org_id", orgId)
    .maybeSingle();
  return (data as OrgCommsSettings | null) ?? null;
}

/** Human-readable reason sending must be refused, or null when sendable. */
export function sendBlocker(settings: OrgCommsSettings | null): string | null {
  if (!settings) {
    return "Comms settings are missing for this org. Configure the sending identity on the Comms page first.";
  }
  if (settings.transport === "resend" && !settings.from_email.trim()) {
    return "No from address configured. Set one in Comms settings before sending.";
  }
  if (!settings.mailing_address.trim()) {
    return "No physical mailing address configured. CAN-SPAM requires one in every email. Set it in Comms settings.";
  }
  return null;
}
