import { Resend } from "resend";
import type { CampaignEmailPayload } from "@/lib/fundraising/comms-email";
import { TransportError, type Transport } from "./types";

/** The existing Resend path, behind the seam unchanged: mail leaves from
 *  org_comms_settings.from_email on a domain verified in Resend. */
export function resendTransport(apiKey: string, fromEmail: string): Transport {
  const client = new Resend(apiKey);
  return {
    kind: "resend",
    fromAddress: fromEmail,
    async send(email: CampaignEmailPayload) {
      try {
        const { data, error } = await client.emails.send(email);
        if (error) throw new TransportError("rejected", error.message);
        return { providerMessageId: data?.id ?? null };
      } catch (err) {
        if (err instanceof TransportError) throw err;
        throw new TransportError("unknown", err instanceof Error ? err.message : "Resend did not answer");
      }
    },
  };
}
