import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getResidentOrgId } from "@/lib/admin/orgs";

/**
 * The booking host for an org — the identity the public /meet flow speaks as
 * (email subjects/signatures, calendar attendee, ICS organizer). Resolved
 * from the org itself (org name + the owner membership's profile/auth email)
 * instead of the historical hardcoded tenant-one operator.
 *
 * Transport (the Google Calendar event + Gmail sends) still runs on the
 * single env-configured Google account, which belongs to the resident org.
 * Until per-org Google connections cover calendar-create + send, only the
 * resident org is `configured` for booking — the book route refuses other
 * orgs rather than silently booking onto the resident org's calendar.
 */

export type BookingHost = {
  /** Full display name, e.g. "Remi Sobo" — calendar attendee / ICS CN. */
  name: string;
  /** First name for email copy ("with Remi", "— Remi"). */
  firstName: string;
  /** The host mailbox: internal notifications + ICS organizer. */
  email: string;
  /** Org display name for event titles. */
  orgName: string;
  /** Whether this org's booking transport is wired up (see above). */
  configured: boolean;
};

// Fallbacks if the owner lookup comes up empty for the resident org — same
// values the flow used when they were hardcoded.
const ENV_HOST_EMAIL = process.env.MEET_HOST_EMAIL || "remi@ambitionangels.org";

const cache = new Map<string, Promise<BookingHost>>();

export function getBookingHost(orgId: string): Promise<BookingHost> {
  let p = cache.get(orgId);
  if (!p) {
    p = resolveHost(orgId).catch((e) => {
      cache.delete(orgId); // don't cache failures
      throw e;
    });
    cache.set(orgId, p);
    // Module-level caches outlive a request on warm lambdas; keep it short so
    // owner/profile changes propagate without a deploy.
    setTimeout(() => cache.delete(orgId), 60_000).unref?.();
  }
  return p;
}

async function resolveHost(orgId: string): Promise<BookingHost> {
  const sb = getSupabaseAdmin();
  const [{ data: org }, { data: ownerMem }, residentOrgId] = await Promise.all([
    sb.from("orgs").select("name").eq("id", orgId).maybeSingle(),
    sb
      .from("memberships")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("role", "owner")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    getResidentOrgId(),
  ]);

  const orgName = (org?.name as string | undefined) || "the team";
  let name = "";
  let email = "";

  const ownerId = (ownerMem?.user_id as string | undefined) ?? null;
  if (ownerId) {
    const [{ data: profile }, userRes] = await Promise.all([
      sb.from("profiles").select("display_name").eq("user_id", ownerId).maybeSingle(),
      sb.auth.admin.getUserById(ownerId),
    ]);
    name = ((profile?.display_name as string | null) ?? "").trim();
    email = userRes.data?.user?.email ?? "";
  }

  const configured = orgId === residentOrgId;
  if (configured && !email) email = ENV_HOST_EMAIL;
  if (!name) {
    const local = email.split("@")[0] ?? "";
    name = local ? local.charAt(0).toUpperCase() + local.slice(1) : orgName;
  }

  return {
    name,
    firstName: name.trim().split(/\s+/)[0] || name,
    email,
    orgName,
    configured,
  };
}
