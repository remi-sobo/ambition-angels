import { createHash, randomBytes } from "crypto";

/**
 * Org API keys (org_api_keys). The raw key is shown once and never stored:
 * the table holds its sha256 and an 8-character display prefix.
 *
 * Format: "bos_live_" + 40 base64url chars (30 random bytes). The prefix makes
 * a leaked key easy to spot in logs and secret scanners.
 */

export const KEY_PREFIX = "bos_live_";
const KEY_RE = /^bos_live_[A-Za-z0-9_-]{40}$/;

export function generateApiKey(): { raw: string; hash: string; displayPrefix: string } {
  const raw = KEY_PREFIX + randomBytes(30).toString("base64url");
  return { raw, hash: hashApiKey(raw), displayPrefix: raw.slice(0, KEY_PREFIX.length + 8) };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** The raw key from an Authorization header, or null when it isn't a well-formed bearer key. */
export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!m) return null;
  return KEY_RE.test(m[1]) ? m[1] : null;
}
