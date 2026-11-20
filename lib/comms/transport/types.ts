import type { CampaignEmailPayload } from "@/lib/fundraising/comms-email";

/**
 * The transport seam (specs/comms-v2-gmail-amendment.md): campaign send, test
 * send and, from G2, the queue worker call only this. Each org's
 * org_comms_settings.transport picks the implementation.
 */
export type Transport = {
  kind: "gmail" | "resend";
  /** The address mail actually leaves from, for the UI and the audit log. */
  fromAddress: string;
  send(email: CampaignEmailPayload): Promise<{ providerMessageId: string | null }>;
};

/**
 * Why a send failed, in the terms the caller acts on:
 * - auth: the sender itself is broken (grant revoked). Stop the whole run;
 *   nothing else will go until someone reconnects.
 * - paused: the sender is fine but Google is limiting it (daily cap, rate
 *   limit). This message did not go. Stop the run and try later.
 * - rejected: the provider refused this one message. It did not go.
 * - unknown: timeout, network or 5xx. It may have gone. Never resend
 *   automatically (a Gmail send can't be safely repeated).
 */
export type TransportFailure = "auth" | "paused" | "rejected" | "unknown";

export class TransportError extends Error {
  constructor(
    public readonly failure: TransportFailure,
    message: string
  ) {
    super(message);
    this.name = "TransportError";
  }
}
