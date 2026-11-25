import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { HUBSPOT_STAGE_PREFIX, planTagWrites, type TagRow } from "@/lib/comms/tags";

/**
 * HubSpot lifecycle stages as tags on people ("HubSpot: Lead",
 * "HubSpot: Customer"), so a list can be built from them.
 *
 * Runs at the end of every HubSpot sync. Each person linked to a HubSpot
 * contact carries exactly one stage tag, the stage HubSpot holds now: when
 * the stage changes in HubSpot the old tag comes off and the new one goes on.
 * Every other tag on the person is left exactly as it is. People with no
 * HubSpot link are never touched.
 *
 * These are system tags (lib/comms/tags.ts isSystemTag): the Tags page won't
 * rename or delete them, because the next sync would put them straight back.
 */

/** HubSpot's own names for its default stages. A custom stage keeps the
 *  value HubSpot stores for it. */
const STAGE_LABELS: Record<string, string> = {
  subscriber: "Subscriber",
  lead: "Lead",
  marketingqualifiedlead: "Marketing Qualified Lead",
  salesqualifiedlead: "Sales Qualified Lead",
  opportunity: "Opportunity",
  customer: "Customer",
  evangelist: "Evangelist",
  other: "Other",
};

/** The tag for a HubSpot lifecycle stage, or null when the contact has none. */
export function lifecycleTag(stage: string | null | undefined): string | null {
  const raw = (stage ?? "").trim();
  if (!raw) return null;
  const label = STAGE_LABELS[raw.toLowerCase()] ?? raw.replace(/[,\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
  return label ? `${HUBSPOT_STAGE_PREFIX}${label}`.slice(0, 40) : null;
}

const isStageTag = (t: string) => t.toLowerCase().startsWith(HUBSPOT_STAGE_PREFIX.toLowerCase());

/** A person's tags with their one current stage tag. PURE. Other tags keep
 *  their place and spelling; a stale stage tag is dropped. */
export function withLifecycleTag(tags: readonly string[] | null, stage: string | null | undefined): string[] {
  const want = lifecycleTag(stage);
  const kept = (tags ?? []).filter((t) => t && !isStageTag(t));
  const had = (tags ?? []).find((t) => t && want && t.toLowerCase() === want.toLowerCase());
  // Unchanged when the right tag is already there, so nothing is rewritten.
  if (want && had && (tags ?? []).filter((t) => t && isStageTag(t)).length === 1) return [...(tags ?? [])];
  return want ? [...kept, want] : kept;
}

const PAGE = 1000;
const ID_CHUNK = 100;

type LinkedRow = TagRow & { external_ids: Record<string, unknown> | null };

/**
 * Bring every linked person's stage tag up to date for one org. Service role
 * (it runs inside the sync job), so every read and write carries the org id.
 * Best effort: returns the error text and never throws.
 */
export async function syncLifecycleTags(orgId: string): Promise<{ changed: number; error: string | null }> {
  const admin = getSupabaseAdmin();

  const stageByContact = new Map<string, string | null>();
  for (let from = 0; from < 200_000; from += PAGE) {
    const { data, error } = await admin
      .from("hs_contacts")
      .select("hubspot_id, lifecycle_stage")
      .eq("org_id", orgId)
      .order("hubspot_id")
      .range(from, from + PAGE - 1);
    if (error) return { changed: 0, error: error.message };
    const page = (data ?? []) as Array<{ hubspot_id: string; lifecycle_stage: string | null }>;
    for (const c of page) stageByContact.set(String(c.hubspot_id), c.lifecycle_stage);
    if (page.length < PAGE) break;
  }
  if (stageByContact.size === 0) return { changed: 0, error: null };

  const people: LinkedRow[] = [];
  for (let from = 0; from < 200_000; from += PAGE) {
    const { data, error } = await admin
      .from("constituents")
      .select("id, tags, external_ids")
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return { changed: 0, error: error.message };
    const page = (data ?? []) as LinkedRow[];
    people.push(...page);
    if (page.length < PAGE) break;
  }

  // Only people linked to a HubSpot contact the mirror still holds.
  const contactOf = (r: LinkedRow) => {
    const id = r.external_ids && typeof r.external_ids === "object" ? r.external_ids.hubspot : null;
    return typeof id === "string" || typeof id === "number" ? String(id) : null;
  };
  const linked = people.filter((r) => {
    const id = contactOf(r);
    return !!id && stageByContact.has(id);
  });
  const stageOf = new Map(linked.map((r) => [r.id, stageByContact.get(contactOf(r)!) ?? null]));
  const plan = planTagWrites(linked, (tags, row) => withLifecycleTag(tags, stageOf.get(row.id)));

  let changed = 0;
  for (const group of plan) {
    for (let i = 0; i < group.ids.length; i += ID_CHUNK) {
      const { data, error } = await admin
        .from("constituents")
        .update({ tags: group.tags })
        .eq("org_id", orgId)
        .in("id", group.ids.slice(i, i + ID_CHUNK))
        .select("id");
      if (error) return { changed, error: error.message };
      changed += data?.length ?? 0;
    }
  }
  return { changed, error: null };
}
