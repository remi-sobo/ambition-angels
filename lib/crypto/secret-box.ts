import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * App-layer AES-256-GCM encryption for provider secrets stored in
 * connections.{access_token_enc,refresh_token_enc} (bytea). This is the scheme
 * documented in docs/bloomos/03-architecture.md §5 and 04-security-compliance.md
 * (pgsodium/TCE deprecated — do not use); this module is its first implementation.
 *
 * Stored layout (one bytea blob): iv(12) || authTag(16) || ciphertext.
 * Key: BLOOMOS_TOKEN_ENC_KEY — base64 of exactly 32 random bytes
 *   (generate with: openssl rand -base64 32).
 */

const IV_LEN = 12;
const TAG_LEN = 16;

function key(): Buffer {
  const b64 = process.env.BLOOMOS_TOKEN_ENC_KEY;
  if (!b64) throw new Error("BLOOMOS_TOKEN_ENC_KEY is not set");
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) {
    throw new Error("BLOOMOS_TOKEN_ENC_KEY must decode to 32 bytes (base64 of `openssl rand -base64 32`)");
  }
  return k;
}

/** True when a valid encryption key is configured — lets callers fail soft. */
export function isTokenEncConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

export function decryptSecret(blob: Buffer): string {
  if (blob.length <= IV_LEN + TAG_LEN) throw new Error("ciphertext too short");
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/**
 * bytea round-trip helpers for supabase-js / PostgREST. We write the hex escape
 * form (`\x…`) which Postgres parses as bytea on INSERT; on read PostgREST may
 * return either hex (`\x…`) or base64, so the parser handles both.
 */
export function toByteaHex(blob: Buffer): string {
  return "\\x" + blob.toString("hex");
}

export function fromBytea(value: unknown): Buffer {
  if (typeof value !== "string") throw new Error("expected bytea string from PostgREST");
  if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
  return Buffer.from(value, "base64");
}
