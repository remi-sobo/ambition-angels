import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Service-role Supabase client. Bypasses RLS — only use from server-side
 * routes that have already checked auth. Lazily constructed so missing env
 * vars surface at first call rather than at module load (matters for build).
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin client: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next patches global fetch and will happily persist supabase GET
      // responses in its data cache, which served a stale daily/pool read
      // from a route handler. Service-role reads must always be live —
      // an admin approving a career or scheduling a daily takes effect
      // now, not at the next deploy.
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return cached;
}
