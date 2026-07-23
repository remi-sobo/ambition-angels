import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { getResidentOrgId } from "@/lib/admin/orgs";

/**
 * Delegation-aware agenda assembler (BloomOS Agenda Phase 3).
 *
 * Reads through the SESSION client: calendar_events RLS handles delegation — a
 * viewer sees their own events plus any owner delegated to them — no owner
 * resolution needed here. But RLS spans every org the viewer belongs to, so
 * both reads also filter to the active org explicitly (falling back to the
 * resident org for sessionless callers: briefing cron, pre-warm). /meet
 * bookings are merged in, deduped against events already synced from Google
 * (so a booked meeting shows once, not twice).
 *
 * One function feeds the cockpit Today component, the ops two-lane view, and the
 * briefing builder.
 */

export type AgendaItem = {
  id: string;
  ownerUserId: string | null;
  title: string;
  start: string; // ISO 8601 UTC
  end: string | null;
  allDay: boolean;
  location: string | null;
  isExternal: boolean;
  source: "google" | "booking";
};

export type Agenda = {
  items: AgendaItem[];
  timeZone: string;
  syncedAt: string | null; // newest synced_at across visible rows
  ownerIds: string[]; // distinct calendar owners present (for chips / lanes)
};

// AA's zone. Multi-tenant: derive from orgs.settings later. Times are stored
// tz-aware (timestamptz) and formatted with this zone at render.
const ORG_TZ = "America/Los_Angeles";

/**
 * The calendars a viewer can see, self first: their own user id plus any owner
 * who has delegated to them (agenda_delegations grantor where viewer is grantee).
 * Used to define the columns of the two-lane ops view. Reads via the session
 * client; RLS lets a grantee read the delegation rows they're party to.
 */
export async function getVisibleOwners(): Promise<string[]> {
  const sb = createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return [];
  const { data } = await sb
    .from("agenda_delegations")
    .select("grantor_user_id")
    .eq("grantee_user_id", user.id);
  const grantors = (data ?? []).map((r) => r.grantor_user_id as string).filter((g) => g !== user.id);
  return [user.id, ...grantors];
}

export async function getAgenda(range: { start: Date; end: Date }): Promise<Agenda> {
  const sb = createServerSupabase();
  // Active org, or the resident org for sessionless callers (cron/briefing) —
  // same pattern as the finance snapshot and briefing gather.
  const orgId = (await getOrgContext().catch(() => null))?.orgId ?? (await getResidentOrgId());

  const { data, error } = await sb
    .from("calendar_events")
    .select(
      "id, owner_user_id, title, location, start_time, end_time, all_day, is_external, source, google_event_id, synced_at, status"
    )
    .eq("org_id", orgId)
    .gte("start_time", range.start.toISOString())
    .lt("start_time", range.end.toISOString())
    .neq("status", "cancelled")
    .order("start_time", { ascending: true });
  if (error) throw new Error(`agenda read failed: ${error.message}`);

  const rows = data ?? [];
  const syncedGoogleIds = new Set(
    rows.filter((r) => r.google_event_id).map((r) => r.google_event_id as string)
  );
  let syncedAt: string | null = null;

  const items: AgendaItem[] = rows.map((r) => {
    const s = r.synced_at as string | null;
    if (s && (!syncedAt || s > syncedAt)) syncedAt = s;
    return {
      id: r.id as string,
      ownerUserId: (r.owner_user_id as string) ?? null,
      title: (r.title as string) ?? "(busy)",
      start: r.start_time as string,
      end: (r.end_time as string) ?? null,
      allDay: !!r.all_day,
      location: (r.location as string) ?? null,
      isExternal: !!r.is_external,
      source: ((r.source as string) ?? "google") as "google" | "booking",
    };
  });

  // Merge /meet bookings not already represented by a synced Google event.
  const { data: bookings } = await sb
    .from("bookings")
    .select("id, start_time, end_time, attendee_name, attendee_company, location_details, google_event_id, status")
    .eq("org_id", orgId)
    .gte("start_time", range.start.toISOString())
    .lt("start_time", range.end.toISOString())
    .neq("status", "cancelled");
  for (const b of bookings ?? []) {
    const gid = b.google_event_id as string | null;
    if (gid && syncedGoogleIds.has(gid)) continue; // already on the calendar
    const company = b.attendee_company as string | null;
    items.push({
      id: `booking:${b.id}`,
      ownerUserId: null,
      title: `${b.attendee_name as string}${company ? ` · ${company}` : ""}`,
      start: b.start_time as string,
      end: (b.end_time as string) ?? null,
      allDay: false,
      location: (b.location_details as string) ?? null,
      isExternal: true,
      source: "booking",
    });
  }

  items.sort((a, b) => a.start.localeCompare(b.start));
  const ownerIds = Array.from(
    new Set(items.map((i) => i.ownerUserId).filter((x): x is string => !!x))
  );
  return { items, timeZone: ORG_TZ, syncedAt, ownerIds };
}
