import type { SupabaseClient } from "@supabase/supabase-js";

// Per-org sending identity (org_comms_settings). Every comms send path —
// campaign send, test send, journeys cron — loads this instead of a
// hardcoded from-address constant, and refuses to send when the row is
// missing or incomplete (a from address and a physical mailing address are
// the CAN-SPAM floor).

export type OrgCommsSettings = {
  org_id: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  mailing_address: string;
  footer_text: string | null;
  daily_send_cap: number;
};

export async function loadOrgCommsSettings(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgCommsSettings | null> {
  const { data } = await supabase
    .from("org_comms_settings")
    .select("org_id, from_name, from_email, reply_to, mailing_address, footer_text, daily_send_cap")
    .eq("org_id", orgId)
    .maybeSingle();
  return (data as OrgCommsSettings | null) ?? null;
}

/** Human-readable reason sending must be refused, or null when sendable. */
export function sendBlocker(settings: OrgCommsSettings | null): string | null {
  if (!settings) {
    return "Comms settings are missing for this org — configure the sending identity on the Comms page first.";
  }
  if (!settings.from_email.trim()) {
    return "No from address configured — set one in Comms settings before sending.";
  }
  if (!settings.mailing_address.trim()) {
    return "No physical mailing address configured — CAN-SPAM requires one in every email. Set it in Comms settings.";
  }
  return null;
}
