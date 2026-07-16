import crypto from "crypto";
import { marketingOrigin } from "@/lib/origins";

// Signed unsubscribe tokens so the public /api/unsubscribe link can opt a
// constituent out without exposing a guessable id-only URL.
//
// UNSUBSCRIBE_SECRET is required — there is deliberately no fallback. The old
// chain (service-role key, then a public dev string) failed open: a missing
// env produced forgeable tokens. Now a missing secret crashes production at
// module load and throws on first use everywhere else (fail closed).

const SECRET = process.env.UNSUBSCRIBE_SECRET;
if (!SECRET && process.env.NODE_ENV === "production") {
  throw new Error("UNSUBSCRIBE_SECRET must be set — refusing to sign unsubscribe links without it");
}

function secret(): string {
  if (!SECRET) throw new Error("UNSUBSCRIBE_SECRET is not set");
  return SECRET;
}

export function unsubscribeToken(constituentId: string): string {
  return crypto.createHmac("sha256", secret()).update(constituentId).digest("hex").slice(0, 32);
}

export function verifyUnsubscribe(constituentId: string, token: string): boolean {
  const expected = unsubscribeToken(constituentId);
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// campaignId (the optional c= param) attributes the unsubscribe to the
// campaign that triggered it; it is not part of the signed token, so links
// delivered before Phase 1 keep verifying.
export function unsubscribeUrl(constituentId: string, campaignId?: string | null): string {
  const c = campaignId ? `&c=${campaignId}` : "";
  return `${marketingOrigin()}/api/unsubscribe?c_id=${constituentId}&t=${unsubscribeToken(constituentId)}${c}`;
}
