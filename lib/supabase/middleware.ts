import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session in middleware and reports whether the
 * request carries a signed-in user. Middleware is a coarse gate only —
 * membership/permission checks live in route handlers + RLS (see
 * docs/bloomos/03-architecture.md §2).
 */
export async function updateSession(req: NextRequest): Promise<{
  response: NextResponse;
  hasUser: boolean;
  /** The signed-in user's id and their SESSION client (RLS applies), for the
   *  few gates cheap enough to check membership/entitlement at the edge. */
  userId: string | null;
  supabase: SupabaseClient | null;
}> {
  let response = NextResponse.next({ request: req });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { response, hasUser: false, userId: null, supabase: null };

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        response = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, hasUser: !!user, userId: user?.id ?? null, supabase: supabase as unknown as SupabaseClient };
}
