import { createServerClient } from "@supabase/ssr";
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
}> {
  let response = NextResponse.next({ request: req });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { response, hasUser: false };

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

  return { response, hasUser: !!user };
}
