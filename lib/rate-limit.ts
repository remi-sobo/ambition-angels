/**
 * Per-key in-memory rate limiter. Lives in the Node.js process and persists
 * across requests on the same Fluid Compute instance. Cold starts reset it,
 * and it does NOT coordinate across multiple instances — sufficient
 * deterrent for casual abuse, not a defense against a distributed attacker.
 * If we ever need real protection, swap to Upstash without changing
 * call sites.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export function rateLimit(
  key: string,
  options: { limit: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    const resetAt = now + options.windowMs;
    buckets.set(key, { count: 1, resetAt });
    maybeGc(now);
    return { allowed: true, remaining: options.limit - 1, resetAt };
  }

  if (existing.count >= options.limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count++;
  return {
    allowed: true,
    remaining: options.limit - existing.count,
    resetAt: existing.resetAt,
  };
}

// Best-effort cleanup of expired buckets once the map grows. Avoids
// unbounded memory growth without a background timer (which doesn't fit
// the serverless model).
function maybeGc(now: number) {
  if (buckets.size < 1000) return;
  buckets.forEach((v, k) => {
    if (now >= v.resetAt) buckets.delete(k);
  });
}

/**
 * Extracts a best-effort client IP from a request. Vercel sets
 * x-forwarded-for; the leftmost entry is the original client.
 */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
