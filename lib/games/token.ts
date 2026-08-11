/**
 * Signed pair tokens (specs/teen-games-v1.md, Higher Wage flow).
 *
 * The whole trust story of Higher Wage is that the pay figures are not in
 * the browser until after the tap ("Pay leaks to the client before the
 * tap" is a named failure mode — it manifests as a DevTools screenshot).
 * So the pair route returns titles and reveal lines plus this token, and
 * the guess route only resolves a token it signed itself. The client
 * carries the token opaquely; tampering with the SOC codes inside it
 * breaks the MAC.
 *
 * Keyed off SUPABASE_SERVICE_ROLE_KEY by default — already required in
 * every deploy, server-only by definition — so the games add no new
 * environment variable. GAMES_TOKEN_SECRET overrides if we ever want to
 * rotate independently. Tokens live minutes, so a key rotation stranding
 * in-flight rounds costs one "round expired, deal again".
 */

import { createHmac, timingSafeEqual } from "crypto";

export type PairClaims = {
  /** SOC codes of the two dealt cards, in display order. */
  a: string;
  b: string;
  /** Unix ms expiry. */
  exp: number;
};

export const PAIR_TOKEN_TTL_MS = 10 * 60 * 1000;

function signingSecret(): string {
  const s = process.env.GAMES_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("GAMES_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set to sign game tokens");
  return s;
}

const mac = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(payload).digest();

export function signPairToken(claims: PairClaims, secret = signingSecret()): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${mac(payload, secret).toString("base64url")}`;
}

export function verifyPairToken(
  token: string,
  now = Date.now(),
  secret = signingSecret()
): PairClaims | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = mac(payload, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof claims !== "object" || claims === null) return null;
  const { a, b, exp } = claims as Record<string, unknown>;
  if (typeof a !== "string" || typeof b !== "string" || typeof exp !== "number") return null;
  if (exp <= now) return null;
  return { a, b, exp };
}
