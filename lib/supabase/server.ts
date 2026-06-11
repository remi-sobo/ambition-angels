import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * User-scoped Supabase client for Server Components, Route Handlers, and
 * Server Actions. Reads the session from request cookies; RLS applies to
 * every query (unlike lib/supabase/admin.ts, which bypasses it).
 *
 * In Server Components, cookie writes are unavailable — token refresh is
 * handled by middleware.ts, so the setAll failure there is safely ignored.
 */
export function createServerSupabase(): SupabaseClient {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase server client: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set"
    );
  }
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component context — middleware refreshes sessions.
        }
      },
    },
  });
}
