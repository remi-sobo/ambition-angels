/**
 * Assignable staff for Capture task cards (ruling 8): org members whose role
 * holds ops.write, read through the SESSION client. There was no existing
 * helper for "members holding a permission" (lib/admin/assignees-server.ts
 * excludes board_viewer by name rather than by permission), so this is the
 * smallest readable query: memberships + role_permissions + profiles, all
 * tables the session client can read for its own org.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { assigneeSlug } from "@/lib/admin/assignees";
import type { StaffMember } from "./types";

export async function loadStaff(supabase: SupabaseClient, orgId: string): Promise<StaffMember[]> {
  const [{ data: perms }, { data: mems }] = await Promise.all([
    supabase.from("role_permissions").select("role").eq("permission", "ops.write"),
    supabase.from("memberships").select("user_id, role").eq("org_id", orgId),
  ]);
  const writerRoles = new Set(((perms ?? []) as { role: string }[]).map((r) => r.role));
  const members = ((mems ?? []) as { user_id: string; role: string }[]).filter((m) => writerRoles.has(m.role));
  if (members.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .in(
      "user_id",
      members.map((m) => m.user_id),
    );
  const names = new Map<string, string>();
  for (const p of (profiles ?? []) as { user_id: string; display_name: string | null }[]) {
    const n = p.display_name?.trim();
    if (n) names.set(p.user_id, n);
  }

  const out: StaffMember[] = [];
  const seen = new Set<string>();
  for (const m of members) {
    const name = names.get(m.user_id);
    if (!name) continue;
    const handle = assigneeSlug(name);
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    out.push({ ref: `s${out.length + 1}`, name, handle, userId: m.user_id });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name)).map((s, i) => ({ ...s, ref: `s${i + 1}` }));
}
