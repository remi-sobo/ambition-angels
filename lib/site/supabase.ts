import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The Ambition Angels website database (specs/bloomos-repo-split.md §5b):
 * games, the career library, site analytics, and the intake outbox. A
 * separate Supabase project from BloomOS, on its own env vars, so the website
 * never needs a BloomOS database key.
 *
 * Service role, server only. Every table there is RLS-on with no policies.
 */

let cached: SupabaseClient | null = null;

export function isSiteDbConfigured(): boolean {
  return !!(process.env.SITE_SUPABASE_URL && process.env.SITE_SUPABASE_SERVICE_ROLE_KEY);
}

export function getSiteSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SITE_SUPABASE_URL;
  const key = process.env.SITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Site Supabase client: SITE_SUPABASE_URL and SITE_SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Same reason as lib/supabase/admin.ts: never let Next cache a service-role read.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  return cached;
}
