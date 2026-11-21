import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { getGmailConnectionStatus } from "@/lib/comms/gmail-connection";
import { hasFeature, type Entitlements } from "./entitlements";
import { checklistDismissed, formatAddress, identityComplete, readOrgIdentity } from "./orgIdentity";
import { loadOrgRow } from "./orgSettings-server";
import type { SetupFacts } from "./setupChecklist";
import { supportEmail } from "./support";

/**
 * V4 Stage F: the facts behind the Home setup checklist, read from real
 * data. Callers MUST have checked org.manage (Today does, with
 * ctxHasPermission) — the list is only for owners and admins.
 *
 * Everything reads through the SESSION client with the active org pinned
 * (owner and admin hold every module's read permission, so RLS shows the
 * rows); only the Gmail status uses the service role, through the existing
 * read-only helper that never returns a token. Counts are head-only.
 */
export async function loadSetupFacts(orgId: string, ents: Entitlements): Promise<SetupFacts> {
  const supabase = createServerSupabase();
  const commsOn = hasFeature(ents, "modules.comms");
  const fundraisingOn = hasFeature(ents, "modules.fundraising");
  const captureOn = hasFeature(ents, "ai.capture");
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

  const [org, members, imports, donors, gifts, captures, gmail] = await Promise.all([
    loadOrgRow(orgId),
    count(supabase.from("memberships").select("user_id", { count: "exact", head: true }).eq("org_id", orgId)),
    fundraisingOn
      ? supabase.from("imports").select("counts").eq("org_id", orgId).in("entity_type", ["constituent", "gift"]).eq("status", "done").limit(50)
      : Promise.resolve({ data: [] as { counts: Record<string, unknown> | null }[] }),
    fundraisingOn ? count(supabase.from("constituents").select("id", { count: "exact", head: true }).eq("org_id", orgId)) : Promise.resolve(0),
    fundraisingOn ? count(supabase.from("gifts").select("id", { count: "exact", head: true }).eq("org_id", orgId)) : Promise.resolve(0),
    captureOn
      ? count(supabase.from("captures").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "done"))
      : Promise.resolve(0),
    commsOn ? getGmailConnectionStatus(orgId) : Promise.resolve({ state: "none" as const }),
  ]);

  const id = readOrgIdentity({ name: org?.name ?? "", settings: org?.settings ?? null });
  const complete = identityComplete(id);
  const createdByImports = ((imports.data ?? []) as { counts: Record<string, unknown> | null }[]).filter(
    (r) => Number(r.counts?.created ?? 0) + Number(r.counts?.gifts_created ?? 0) > 0,
  ).length;

  return {
    identityComplete: complete,
    identityLine: complete ? [id.legalName || id.name, formatAddress(id.address), `EIN ${id.ein}`].join(" · ") : null,
    memberCount: members,
    commsOn,
    gmail: gmail.state,
    gmailAccount: gmail.state === "none" ? null : gmail.accountEmail || null,
    fundraisingOn,
    captureOn,
    donorImportsDone: createdByImports,
    donorCount: donors,
    giftCount: gifts,
    capturesDone: captures,
    dismissed: checklistDismissed(org?.settings ?? null),
    supportEmail: supportEmail(org?.settings ?? null),
  };
}
