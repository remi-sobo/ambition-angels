import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";

/**
 * User display names (profiles.display_name), with a graceful fallback.
 *
 * There is no name on the Supabase session itself, so a profile row is the
 * source of truth. When a user hasn't set a name yet, we fall back to a
 * capitalized email local-part so the UI never renders a blank or a raw uuid.
 */

/** Capitalized email local-part, e.g. "remi@…" -> "Remi". */
export function nameFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "").trim();
  if (!local) return "there";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/** First token of a display name, for greetings ("Remi Sobo" -> "Remi"). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/**
 * Display names for a set of user ids (agenda owner chips, two-lane labels).
 * Reads through the session client — RLS returns only co-members' profiles.
 */
export async function getDisplayNames(userIds: string[]): Promise<Record<string, string>> {
  if (!userIds.length) return {};
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", userIds);
  const out: Record<string, string> = {};
  for (const r of data ?? []) {
    const name = (r.display_name as string | null)?.trim();
    if (name) out[r.user_id as string] = name;
  }
  return out;
}

/**
 * The signed-in user's display name: profiles.display_name if set, else a
 * capitalized email local-part. Null when unauthenticated/unprovisioned.
 * Reads through the session client, so RLS applies.
 */
export async function getMyDisplayName(): Promise<string | null> {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const name = (data?.display_name as string | null | undefined)?.trim();
  return name && name.length ? name : nameFromEmail(ctx.email);
}
