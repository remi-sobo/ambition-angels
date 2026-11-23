import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSiteSupabase } from "./supabase";

/**
 * The database behind the teen games, the career library and site analytics
 * (specs/bloomos-repo-split.md §5b, phase 2b).
 *
 *   SITE_DB=site      the Ambition Angels website database (SITE_SUPABASE_*)
 *   anything else     BloomOS, where these tables lived until the split
 *
 * One switch for every reader and writer of those 13 tables, including the
 * career curation screens, so an approval and the game that shows it always
 * hit the same database. Rollback is one env change. On split day the
 * BloomOS branch is deleted and this becomes getSiteSupabase().
 */
export function siteDbMode(): "site" | "bloomos" {
  return process.env.SITE_DB === "site" ? "site" : "bloomos";
}

export function websiteDb(): SupabaseClient {
  return siteDbMode() === "site" ? getSiteSupabase() : getSupabaseAdmin();
}
