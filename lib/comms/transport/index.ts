import type { OrgCommsSettings } from "@/lib/comms/settings";
import { getActiveGmailConnection, getGmailConnectionStatus } from "@/lib/comms/gmail-connection";
import { gmailTransport } from "./gmail";
import { resendTransport } from "./resend";
import type { Transport } from "./types";

export { TransportError, type Transport, type TransportFailure } from "./types";

/** Resend from a fixed From line (Ambition Angels' acknowledgment sender). */
export function resendTransportFor(from: string): { transport: Transport } | { blocked: string } {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { blocked: "Email is not configured on the server (RESEND_API_KEY)." };
  return { transport: resendTransport(key, from) };
}

/** The transport for an org, or the reason it can't send right now. */
export async function transportFor(
  settings: OrgCommsSettings
): Promise<{ transport: Transport } | { blocked: string }> {
  if (settings.transport === "resend") {
    const key = process.env.RESEND_API_KEY;
    if (!key) return { blocked: "Email is not configured on the server (RESEND_API_KEY)." };
    return { transport: resendTransport(key, settings.from_email) };
  }

  const conn = await getActiveGmailConnection(settings.org_id);
  if (!conn) {
    const status = await getGmailConnectionStatus(settings.org_id);
    return {
      blocked:
        status.state === "error"
          ? `Gmail stopped working for ${status.accountEmail}. ${status.reason ?? "Reconnect it in Comms settings."}`
          : "Connect a Gmail account in Comms settings before sending.",
    };
  }
  return { transport: gmailTransport(conn, settings.from_name) };
}
