import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { getResidentOrgId } from "@/lib/admin/orgs";

/**
 * The org identity the AI agents speak for. The fundraising agents were
 * written for tenant one — prompts hardcoded "Ambition Angels" and Remi's
 * voice/story bank. This resolver gives each agent the active org's name and
 * operator so prompts can be built per-tenant: the resident org keeps its
 * hand-tuned prompt verbatim (byte-stable for prompt caching), every other
 * org gets a neutral prompt built from these fields.
 *
 * Resolved from the session's active org, falling back to the resident org in
 * sessionless contexts (cron pre-warms) — the same convention the finance
 * snapshot and briefing use.
 */

export type AgentOrgProfile = {
  /** True for the resident (tenant-one) org, which keeps its bespoke prompts. */
  isResident: boolean;
  orgName: string;
  /** The org owner's display name, e.g. "Remi Sobomehin". */
  operatorName: string;
  /** First name, for signatures and voice instructions. */
  operatorFirstName: string;
};

const cache = new Map<string, { value: AgentOrgProfile; at: number }>();
const TTL_MS = 60_000;

export async function getAgentOrgProfile(orgId?: string): Promise<AgentOrgProfile> {
  const resident = await getResidentOrgId();
  const id = orgId ?? (await getOrgContext().catch(() => null))?.orgId ?? resident;

  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const sb = getSupabaseAdmin();
  const [{ data: org }, { data: ownerMem }] = await Promise.all([
    sb.from("orgs").select("name").eq("id", id).maybeSingle(),
    sb
      .from("memberships")
      .select("user_id")
      .eq("org_id", id)
      .eq("role", "owner")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  let operatorName = "";
  const ownerId = (ownerMem?.user_id as string | undefined) ?? null;
  if (ownerId) {
    const { data: profile } = await sb
      .from("profiles")
      .select("display_name")
      .eq("user_id", ownerId)
      .maybeSingle();
    operatorName = ((profile?.display_name as string | null) ?? "").trim();
  }
  if (!operatorName) operatorName = "the executive director";

  const value: AgentOrgProfile = {
    isResident: id === resident,
    orgName: (org?.name as string | undefined) || "this nonprofit",
    operatorName,
    operatorFirstName: operatorName.split(/\s+/)[0] || operatorName,
  };
  cache.set(id, { value, at: Date.now() });
  return value;
}
