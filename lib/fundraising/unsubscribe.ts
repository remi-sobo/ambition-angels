import crypto from "crypto";

// Signed unsubscribe tokens so the public /api/unsubscribe link can opt a
// constituent out without exposing a guessable id-only URL.

function secret(): string {
  return process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-unsubscribe-secret";
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

export function unsubscribeUrl(constituentId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://ambitionangels.org";
  return `${base}/api/unsubscribe?c=${constituentId}&t=${unsubscribeToken(constituentId)}`;
}
