import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Browser Supabase client for client components. Reads the auth session from
 * cookies (the same session middleware refreshes), so Realtime subscriptions
 * are authenticated and RLS-authorized — a subscriber only receives rows it
 * could SELECT. Currently used by Messages for live delivery; mutations still
 * go through the API routes (service role), not this client.
 */
export function getSupabaseBrowser(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase browser client: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set"
    );
  }
  cached = createBrowserClient(url, key);
  return cached;
}
