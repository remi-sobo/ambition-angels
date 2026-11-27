import { createHash, timingSafeEqual } from "crypto";

/**
 * Constant-time string comparison for shared secrets (cron bearer tokens,
 * gate passwords). Hashes both sides to a fixed length first so neither the
 * content nor the length leaks through timing. Node runtime only.
 */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length === 0 || b.length === 0) return false;
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}
