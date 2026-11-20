import { google } from "googleapis";
import { googleOAuthClientFor } from "@/lib/google/oauth";
import type { CampaignEmailPayload } from "@/lib/fundraising/comms-email";
import { markGmailConnectionBroken, type GmailConnection } from "@/lib/comms/gmail-connection";
import { buildRawMessage, formatAddress } from "./mime";
import { TransportError, type Transport, type TransportFailure } from "./types";

/**
 * Gmail transport: users.messages.send as the org's connected account. The
 * mail lands in that account's Sent folder and replies come back to its inbox.
 *
 * The From address is always the connected account. Gmail would rewrite any
 * other address anyway, so only the display name comes from org settings.
 */
export function gmailTransport(conn: GmailConnection, fromName: string): Transport {
  const auth = googleOAuthClientFor();
  auth.setCredentials({ refresh_token: conn.refreshToken });
  const gmail = google.gmail({ version: "v1", auth });
  const from = formatAddress(fromName, conn.accountEmail);

  return {
    kind: "gmail",
    fromAddress: conn.accountEmail,
    async send(email: CampaignEmailPayload) {
      let raw: string;
      try {
        raw = buildRawMessage({
          from,
          to: email.to,
          subject: email.subject,
          text: email.text,
          html: email.html,
          replyTo: email.replyTo,
          headers: email.headers,
        });
      } catch (err) {
        throw new TransportError("rejected", err instanceof Error ? err.message : "Couldn't build the message");
      }

      try {
        const res = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
        return { providerMessageId: res.data.id ?? null };
      } catch (err) {
        const failure = classifyGmailError(err);
        if (failure.breaksConnection) {
          await markGmailConnectionBroken(conn.id, failure.message);
        }
        throw new TransportError(failure.failure, failure.message);
      }
    },
  };
}

/** Sort a googleapis error into what the caller does next. Google's error
 *  body is never stored or logged in full, only a short reason. */
export function classifyGmailError(err: unknown): {
  failure: TransportFailure;
  message: string;
  /** True only when the grant itself is dead and someone must reconnect. */
  breaksConnection: boolean;
} {
  const e = err as { code?: number | string; status?: number; message?: string; response?: { status?: number; data?: { error?: string } } };
  const status = Number(e?.response?.status ?? e?.status ?? e?.code) || 0;
  const oauthError = e?.response?.data?.error ?? "";
  const msg = String(e?.message ?? "");

  if (oauthError === "invalid_grant" || /invalid_grant/i.test(msg) || status === 401) {
    return {
      failure: "auth",
      breaksConnection: true,
      message: "Google stopped accepting BloomOS's permission to send from this account. Reconnect Gmail in Comms settings.",
    };
  }
  if (status === 429 || (status === 403 && /daily|limit exceeded|quota|rate/i.test(msg))) {
    return {
      failure: "paused",
      breaksConnection: false,
      message: "Google is limiting how much this Gmail account can send right now. The rest can go later.",
    };
  }
  if (status === 400) {
    return { failure: "rejected", breaksConnection: false, message: "Gmail refused this message (bad address or content)." };
  }
  if (status === 403) {
    return {
      failure: "auth",
      breaksConnection: true,
      message: "Gmail refused to send from this account (permission or account restriction). Reconnect Gmail in Comms settings.",
    };
  }
  return { failure: "unknown", breaksConnection: false, message: "No clear answer from Gmail. This email may or may not have gone out." };
}
