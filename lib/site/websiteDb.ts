import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSiteSupabase } from "./supabase";

/**
 * The database behind the teen games, the career library and site analytics:
 * the Ambition Angels website database (SITE_SUPABASE_*). Before the repo
 * split this could point at BloomOS (SITE_DB); now it is always the site's own.
 */
export function websiteDb(): SupabaseClient {
  return getSiteSupabase();
}
