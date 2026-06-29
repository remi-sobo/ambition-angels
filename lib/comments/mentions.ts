import { createServerSupabase } from "@/lib/supabase/server";
import { getDisplayNames } from "@/lib/admin/profile";

/**
 * @mention plumbing for anchored comments.
 *
 * The mention LIST a comment carries is never trusted from the client — it's
 * resolved server-side by parsing @tokens out of the body and matching them
 * against the org's actual members. That closes the spoof hole (a client
 * can't notify someone outside the org or fake a mention).
 *
 * v1 sources mentionables from memberships ⋈ profiles.display_name; a member
 * without a display_name isn't @mentionable by name yet (documented gap).
 */

export type Mentionable = { userId: string; displayName: string };

/** Org members that can be @mentioned (have a display_name), via the session client (RLS-scoped). */
export async function getOrgMentionables(orgId: string): Promise<Mentionable[]> {
  const sb = createServerSupabase();
  const { data: mems } = await sb.from("memberships").select("user_id").eq("org_id", orgId);
  const ids = (mems ?? []).map((m) => (m as { user_id: string }).user_id);
  if (ids.length === 0) return [];
  const names = await getDisplayNames(ids);
  return ids.filter((id) => names[id]).map((id) => ({ userId: id, displayName: names[id] }));
}

/**
 * Resolve @display_name tokens in `body` to user ids, matching only the
 * supplied (org-scoped) members. Case-insensitive. An @token must follow the
 * start or whitespace and end on a non-word char, so "user@host.com" and a
 * longer name ("@Samuel" for member "Sam") don't false-match.
 */
export function resolveMentions(body: string, members: Mentionable[]): string[] {
  const out = new Set<string>();
  for (const m of members) {
    if (!m.displayName) continue;
    const esc = m.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|\\s)@${esc}(?![\\w])`, "i");
    if (re.test(body)) out.add(m.userId);
  }
  return Array.from(out);
}
