/**
 * A loggable one-line summary of an error from a Google API call.
 *
 * Never log a whole gaxios error: it carries `config` (the request, including
 * the token-refresh body with the plaintext refresh_token and client_secret)
 * and `response` (headers, the full body). Vercel runtime logs printed those
 * in Nov 2026. This keeps only the HTTP status, Google's error code and the
 * message, and scrubs anything token-shaped from the message as a backstop.
 */

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // form-encoded: refresh_token=...&client_secret=...
  [/\b(refresh_token|access_token|client_secret|id_token|code)=[^&\s"']+/gi, "$1=[redacted]"],
  // JSON: "refresh_token": "..."
  [/("(?:refresh_token|access_token|client_secret|id_token)"\s*:\s*)"[^"]*"/gi, '$1"[redacted]"'],
  // bare Google token shapes
  [/\b1\/\/[0-9A-Za-z_-]{20,}/g, "[redacted]"],
  [/\bya29\.[0-9A-Za-z._-]{20,}/g, "[redacted]"],
];

export function scrubSecrets(s: string): string {
  return SECRET_PATTERNS.reduce((out, [re, rep]) => out.replace(re, rep), s);
}

type MaybeGoogleError = {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  response?: { status?: unknown; data?: { error?: unknown; error_description?: unknown } };
};

/** "status 400 invalid_grant: Token has been expired or revoked." */
export function googleErrorSummary(err: unknown): string {
  if (err == null) return String(err);
  if (typeof err !== "object") return scrubSecrets(String(err));
  const e = err as MaybeGoogleError;
  const parts: string[] = [];

  const status = e.response?.status ?? e.status ?? (typeof e.code === "number" ? e.code : undefined);
  if (typeof status === "number" || (typeof status === "string" && /^\d+$/.test(status))) {
    parts.push(`status ${status}`);
  }
  const data = e.response?.data;
  const apiError =
    typeof data?.error === "string"
      ? data.error
      : typeof e.code === "string"
        ? e.code
        : null;
  if (apiError) parts.push(apiError);

  const rawMessage = typeof e.message === "string" ? e.message : "";
  const message = rawMessage === apiError ? "" : rawMessage;
  const head = parts.join(" ");
  const line = message ? (head ? `${head}: ${message}` : message) : head || "unknown error";
  return scrubSecrets(line);
}

/** True when Google refused the refresh token itself (revoked, expired,
 *  password changed): reconnecting is the only fix. */
export function isInvalidGrant(err: unknown): boolean {
  return /invalid_grant/i.test(googleErrorSummary(err));
}
