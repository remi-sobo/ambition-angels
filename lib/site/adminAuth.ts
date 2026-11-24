import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Website admin sign-in (specs/bloomos-repo-split.md §6d).
 *
 * Supabase magic link on the Ambition Angels website database, not BloomOS.
 * Access is one list: SITE_ADMIN_EMAILS (comma separated). On the list means
 * full access; there are no roles in v1. Checked in the site-admin layout and
 * again in every /api/site-admin route.
 *
 * Supabase names its auth cookies by project ref, so this session and a
 * BloomOS session on the same browser never collide.
 */

export function siteAdminEmails(): string[] {
  return (process.env.SITE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

export function isSiteAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return siteAdminEmails().includes(email.trim().toLowerCase());
}

/** Session-aware client for the website database (anon key + auth cookies). */
export function createSiteAuthClient(): SupabaseClient {
  const url = process.env.SITE_SUPABASE_URL;
  const key = process.env.SITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("SITE_SUPABASE_URL and SITE_SUPABASE_ANON_KEY must be set");
  const store = cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(toSet) {
        // Server Components can't write cookies; route handlers can. The
        // middleware refreshes the session on every /admin page view.
        try {
          toSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* read-only context */
        }
      },
    },
  });
}

export type SiteAdmin = { email: string };

/** The signed-in website admin, or null. Never throws. */
export async function getSiteAdmin(): Promise<SiteAdmin | null> {
  try {
    const { data } = await createSiteAuthClient().auth.getUser();
    const email = data.user?.email ?? null;
    return email && isSiteAdminEmail(email) ? { email: email.toLowerCase() } : null;
  } catch {
    return null;
  }
}

/** Route guard for /api/site-admin/*: the admin, or a 401 to return as is. */
export async function requireSiteAdmin(): Promise<
  { ok: true; admin: SiteAdmin } | { ok: false; response: NextResponse }
> {
  const admin = await getSiteAdmin();
  if (!admin) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { ok: true, admin };
}
