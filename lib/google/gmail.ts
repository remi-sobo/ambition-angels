import { getGmailClient } from "./auth";

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

/**
 * Sends an email via Gmail API as the authenticated user
 * (remi@ambitionangels.org). The from address is implicit — Gmail's
 * users.messages.send with userId='me' always sends from the authenticated
 * account, so no From header is set explicitly.
 *
 * Replies from recipients land in Remi's inbox naturally.
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  const gmail = getGmailClient();
  const raw = buildMime(params);
  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}

/**
 * Builds a multipart/alternative RFC 2822 message and base64url-encodes it
 * for Gmail's `raw` field. Subject is RFC 2047 encoded; bodies use base64
 * Content-Transfer-Encoding so UTF-8 is safe end-to-end.
 */
function buildMime({ to, subject, html, text, replyTo }: SendEmailParams): string {
  const boundary = `----=_AA_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
  const headers = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (replyTo) headers.push(`Reply-To: ${replyTo}`);

  const body = [
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    wrapBase64(text),
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    wrapBase64(html),
    ``,
    `--${boundary}--`,
  ].join("\r\n");

  const message = `${headers.join("\r\n")}\r\n\r\n${body}`;
  return Buffer.from(message, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function wrapBase64(s: string): string {
  const b64 = Buffer.from(s, "utf8").toString("base64");
  return b64.match(/.{1,76}/g)?.join("\r\n") ?? b64;
}
