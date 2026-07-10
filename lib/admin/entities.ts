import "server-only";
import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { constituentName } from "@/lib/fundraising/display";

/**
 * Operating Spine — entity resolution (spec #1, Phase 1).
 *
 * One resolver from a polymorphic (entity_type, entity_id) reference to a
 * display label, deep link, module, and icon. Reads the entity_types registry
 * (global config, seeded by supabase/migrations/spine_entity_registry.sql) and
 * overlays org_terminology so a "Donor" in one org can read as a "Supporter"
 * in another. Every read goes through the SESSION client, so RLS keeps record
 * titles org-scoped — a reference into another tenant resolves to the type
 * label with no link, never to the other tenant's data.
 *
 * Label precedence per reference:
 *   1. a caller-supplied label (the linked_label / subject_label the source
 *      row already carries),
 *   2. the live record's own title (batched per-type lookup below),
 *   3. the registry display name (org_terminology-overlaid) as the fallback.
 *
 * Unknown types (used in a linking column but never seeded — the registry-
 * drift failure mode) resolve to a plain label with url:null and log a
 * warning, so the UI shows an unlinked chip instead of a dead link.
 */

export type EntityTypeRow = {
  entity_type: string;
  display_name: string;
  module: string;
  route_pattern: string;
  icon: string | null;
};

export type EntityRef = {
  type: string;
  id: string | null;
  /** Label the source row already carries (linked_label, subject_label). */
  label?: string | null;
};

export type ResolvedEntity = {
  entityType: string;
  /** Best available display label for the specific record. */
  label: string;
  /** The type's name in this org's vocabulary ("Donor" / "Supporter"). */
  typeLabel: string;
  /** Deep link to the record (or its module list page); null for unknown types. */
  url: string | null;
  module: string | null;
  icon: string | null;
};

/** Registry, keyed by entity_type. Cached per request. */
export const getEntityTypes = cache(async (): Promise<Map<string, EntityTypeRow>> => {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("entity_types")
    .select("entity_type, display_name, module, route_pattern, icon");
  return new Map(((data ?? []) as EntityTypeRow[]).map((r) => [r.entity_type, r]));
});

/** Per-org label overrides (term_key → label). Cached per request. */
export const getTerminology = cache(async (): Promise<Map<string, string>> => {
  const ctx = await getOrgContext();
  if (!ctx) return new Map();
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("org_terminology")
    .select("term_key, label")
    .eq("org_id", ctx.orgId);
  return new Map(
    ((data ?? []) as { term_key: string; label: string }[]).map((r) => [r.term_key, r.label]),
  );
});

// Per-type record-title lookups. Descriptive registry + typed lookups here:
// the database stays declarative, the SQL-free mapping lives in one place.
// Types absent from this map (pledge, milestone, message_thread …) fall back
// to their type label — correct, just less specific.
type RecordLookup = {
  table: string;
  select: string;
  toLabel: (row: Record<string, unknown>) => string;
};

const title = (row: Record<string, unknown>) => (row.title as string) || "";
const name = (row: Record<string, unknown>) => (row.name as string) || "";

const RECORD_LOOKUPS: Record<string, RecordLookup> = {
  constituent: {
    table: "constituents",
    select: "id, type, first_name, last_name, org_name",
    toLabel: (r) =>
      constituentName(r as { type: string; first_name: string | null; last_name: string | null; org_name: string | null }),
  },
  // Volunteers are constituents wearing a different hat (ack_v2 vocabulary).
  volunteer: {
    table: "constituents",
    select: "id, type, first_name, last_name, org_name",
    toLabel: (r) =>
      constituentName(r as { type: string; first_name: string | null; last_name: string | null; org_name: string | null }),
  },
  partner: { table: "partners", select: "id, name", toLabel: name },
  grant: { table: "grants", select: "id, name", toLabel: name },
  opportunity: { table: "opportunities", select: "id, name", toLabel: name },
  campaign: { table: "campaigns", select: "id, name", toLabel: name },
  fr_prospects: {
    table: "fr_prospects",
    select: "id, name, org_name",
    toLabel: (r) => (r.name as string) || (r.org_name as string) || "",
  },
  gift: {
    table: "gifts",
    select: "id, amount, gift_date",
    toLabel: (r) => {
      const amount = Number(r.amount);
      const usd = Number.isFinite(amount)
        ? amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
        : null;
      return [usd, r.gift_date as string | null].filter(Boolean).join(" · ");
    },
  },
  document: {
    table: "documents",
    select: "id, title, filename",
    toLabel: (r) => (r.title as string) || (r.filename as string) || "",
  },
  ops_task: { table: "ops_tasks", select: "id, title", toLabel: title },
  ops_project: { table: "ops_projects", select: "id, title", toLabel: title },
  compliance_item: { table: "compliance_items", select: "id, title", toLabel: title },
  board_meeting: { table: "board_meetings", select: "id, title", toLabel: title },
};

const warned = new Set<string>();
function warnUnknownType(type: string) {
  if (warned.has(type)) return;
  warned.add(type);
  console.warn(`[entities] entity_type "${type}" has no entity_types registry row — rendering unlinked`);
}

function buildUrl(pattern: string, id: string | null): string {
  // A pattern without {id} is a list page and needs no id.
  return id ? pattern.replace("{id}", id) : pattern.replace(/\/\{id\}$/, "");
}

/**
 * Resolve many references in one pass: one registry read, one terminology
 * read, and at most one query per distinct entity type. Order-preserving.
 */
export async function resolveEntities(refs: EntityRef[]): Promise<ResolvedEntity[]> {
  const [registry, terminology] = await Promise.all([getEntityTypes(), getTerminology()]);
  const supabase = createServerSupabase();

  // Batch record-title lookups per type for refs that still need a label.
  const needLookup = new Map<string, Set<string>>();
  for (const ref of refs) {
    if (ref.label || !ref.id) continue;
    if (!registry.has(ref.type) || !RECORD_LOOKUPS[ref.type]) continue;
    if (!needLookup.has(ref.type)) needLookup.set(ref.type, new Set());
    needLookup.get(ref.type)!.add(ref.id);
  }

  const titles = new Map<string, string>(); // `${type}:${id}` → record label
  await Promise.all(
    Array.from(needLookup.entries()).map(async ([type, ids]) => {
      const lookup = RECORD_LOOKUPS[type];
      const { data } = await supabase.from(lookup.table).select(lookup.select).in("id", Array.from(ids));
      for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
        const label = lookup.toLabel(row);
        if (label) titles.set(`${type}:${row.id as string}`, label);
      }
    }),
  );

  return refs.map((ref) => {
    const reg = registry.get(ref.type);
    if (!reg) {
      warnUnknownType(ref.type);
      return {
        entityType: ref.type,
        label: ref.label || ref.type,
        typeLabel: ref.type,
        url: null,
        module: null,
        icon: null,
      };
    }
    const typeLabel = terminology.get(ref.type) ?? reg.display_name;
    const label = ref.label || (ref.id && titles.get(`${ref.type}:${ref.id}`)) || typeLabel;
    return {
      entityType: ref.type,
      label,
      typeLabel,
      url: buildUrl(reg.route_pattern, ref.id),
      module: reg.module,
      icon: reg.icon,
    };
  });
}

/** Single-reference convenience over resolveEntities(). */
export async function resolveEntity(
  type: string,
  id: string | null,
  label?: string | null,
): Promise<ResolvedEntity> {
  const [resolved] = await resolveEntities([{ type, id, label }]);
  return resolved;
}
