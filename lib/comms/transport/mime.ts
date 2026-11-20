/**
 * RFC 5322 message builder for the Gmail transport, ported from the Team
 * Esface email engine (src/lib/email/gmail.ts buildRawMessage). Pure, so the
 * exact bytes are unit-tested.
 *
 * It refuses a line break inside any address or header value, so merge data
 * (a donor's name, a subject line) can never smuggle in a second header such
 * as a Bcc.
 */

export type MimeMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  /** HTML twin of text; sent as multipart/alternative when set. */
  html?: string;
  replyTo?: string;
  /** Extra headers such as List-Unsubscribe. Names are letters and hyphens only. */
  headers?: Record<string, string>;
};

const CRLF = "\r\n";

/** RFC 2047 for a header value that is not plain ASCII. */
export function headerText(value: string): string {
  const clean = value.replace(/[\r\n]+/g, " ").trim();
  return /^[\x20-\x7e]*$/.test(clean)
    ? clean
    : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function address(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error("An email address cannot contain a line break.");
  return value.trim();
}

/** `"Display Name" <addr>`, with a non-ASCII name RFC 2047 encoded and quotes
 *  or backslashes in an ASCII name escaped. */
export function formatAddress(name: string, email: string): string {
  const addr = address(email);
  const clean = name.replace(/[\r\n]+/g, " ").trim();
  if (!clean) return addr;
  const display = /^[\x20-\x7e]*$/.test(clean)
    ? `"${clean.replace(/(["\\])/g, "\\$1")}"`
    : headerText(clean);
  return `${display} <${addr}>`;
}

const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, (line) => `${line}${CRLF}`);

/** The message as the base64url `raw` string Gmail's users.messages.send expects. */
export function buildRawMessage(m: MimeMessage, boundary = `bloom_${Date.now().toString(36)}`): string {
  const headers = [
    `From: ${address(m.from)}`,
    `To: ${address(m.to)}`,
    ...(m.replyTo ? [`Reply-To: ${address(m.replyTo)}`] : []),
    `Subject: ${headerText(m.subject)}`,
    ...Object.entries(m.headers ?? {}).map(([name, value]) => {
      if (!/^[A-Za-z][A-Za-z-]*$/.test(name)) throw new Error("That header name is not allowed.");
      if (/[\r\n]/.test(value)) throw new Error("A header cannot contain a line break.");
      return `${name}: ${value.trim()}`;
    }),
    "MIME-Version: 1.0",
  ];
  const part = (type: string, content: string) =>
    [
      `Content-Type: ${type}; charset="UTF-8"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(Buffer.from(content, "utf8").toString("base64")),
    ].join(CRLF);

  const body = m.html
    ? [
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        part("text/plain", m.text),
        `--${boundary}`,
        part("text/html", m.html),
        `--${boundary}--`,
        "",
      ].join(CRLF)
    : part("text/plain", m.text);

  return Buffer.from([...headers, body].join(CRLF), "utf8").toString("base64url");
}
