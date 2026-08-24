import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  editionCompleteness,
  SEED_FORMATS,
  type Cadence,
  type Completeness,
  type FilledSlot,
  type Slot,
} from "./formats";

/**
 * Formats and editions: server reads and the two writes with real invariants
 * (seeding, and creating an edition from a format).
 *
 * Everything here runs on the SESSION client. comms.manage RLS is the
 * authority; nothing in this module needs to see past it.
 */

export type FormatRow = {
  id: string;
  name: string;
  cadence: Cadence;
  slots: Slot[];
  is_archived: boolean;
  created_at: string;
};

export type EditionRow = {
  id: string;
  format_id: string;
  title: string;
  subject: string | null;
  status: string;
  target_date: string | null;
  email_campaign_id: string | null;
  sent_at: string | null;
  created_at: string;
};

export type EditionWithProgress = EditionRow & {
  format_name: string;
  completeness: Completeness;
};

const FORMAT_COLS = "id, name, cadence, slots, is_archived, created_at";
const EDITION_COLS =
  "id, format_id, title, subject, status, target_date, email_campaign_id, sent_at, created_at";
const SLOT_COLS = "id, edition_id, slot_key, slot_def, story_id, metric_ids, content, position";

/**
 * The org's formats, seeding the four starters on first visit.
 *
 * Seeding here rather than at provisioning is spec §11 decision 5: a tenant
 * that never opens Comms carries zero rows. The insert is guarded by a fresh
 * count rather than a flag, so two tabs opening Comms at once can't double up
 * badly — and if they somehow race, the org gets duplicates it can archive,
 * not a crash.
 */
export async function loadFormats(
  supabase: SupabaseClient,
  orgId: string,
  opts: { seed?: boolean } = {},
): Promise<FormatRow[]> {
  const read = async () => {
    const { data } = await supabase
      .from("comms_formats")
      .select(FORMAT_COLS)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });
    return (data ?? []) as unknown as FormatRow[];
  };

  const rows = await read();
  if (rows.length > 0 || !opts.seed) return rows;

  // The insert RETURNS the rows rather than being followed by a second read.
  //
  // That is not just tidier: React memoizes identical fetches within one
  // render pass, so a re-read at the same URL as the first (empty) one is
  // served from that memo and comes back empty — the seed lands in the
  // database and the page still renders "no formats" until you reload. Every
  // read-after-write in a Server Component has this shape of trap.
  const { data: inserted, error } = await supabase
    .from("comms_formats")
    .insert(
      SEED_FORMATS.map((f) => ({
        org_id: orgId,
        name: f.name,
        cadence: f.cadence,
        slots: f.slots,
      })),
    )
    .select(FORMAT_COLS);

  if (error) {
    // A caller without comms.manage hits RLS here. That is not an error worth
    // surfacing — they simply see no formats.
    console.error("[comms] format seed failed:", error.message);
    return [];
  }
  return (inserted ?? []) as unknown as FormatRow[];
}

/** Editions with their format name and a filled-slot count. */
export async function loadEditions(
  supabase: SupabaseClient,
  orgId: string,
): Promise<EditionWithProgress[]> {
  const [{ data: eds }, { data: formats }] = await Promise.all([
    supabase
      .from("comms_editions")
      .select(EDITION_COLS)
      .eq("org_id", orgId)
      .neq("status", "archived")
      .order("target_date", { ascending: true, nullsFirst: false })
      .limit(200),
    supabase.from("comms_formats").select("id, name").eq("org_id", orgId),
  ]);

  const editions = (eds ?? []) as unknown as EditionRow[];
  if (editions.length === 0) return [];

  const { data: slotRows } = await supabase
    .from("comms_edition_slots")
    .select(SLOT_COLS)
    .eq("org_id", orgId)
    .in(
      "edition_id",
      editions.map((e) => e.id),
    );

  const byEdition = new Map<string, FilledSlot[]>();
  for (const s of (slotRows ?? []) as unknown as Array<FilledSlot & { edition_id: string }>) {
    byEdition.set(s.edition_id, [...(byEdition.get(s.edition_id) ?? []), s]);
  }
  const nameById = new Map(
    ((formats ?? []) as Array<{ id: string; name: string }>).map((f) => [f.id, f.name]),
  );

  return editions.map((e) => ({
    ...e,
    format_name: nameById.get(e.format_id) ?? "Format",
    completeness: editionCompleteness(byEdition.get(e.id) ?? []),
  }));
}

export type EditionDetail = {
  edition: EditionRow;
  format: { id: string; name: string; cadence: Cadence } | null;
  slots: FilledSlot[];
  completeness: Completeness;
};

export async function loadEdition(
  supabase: SupabaseClient,
  orgId: string,
  editionId: string,
): Promise<EditionDetail | null> {
  const { data: ed } = await supabase
    .from("comms_editions")
    .select(EDITION_COLS)
    .eq("id", editionId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!ed) return null;
  const edition = ed as unknown as EditionRow;

  const [{ data: slotRows }, { data: fmt }] = await Promise.all([
    supabase
      .from("comms_edition_slots")
      .select(SLOT_COLS)
      .eq("org_id", orgId)
      .eq("edition_id", editionId)
      .order("position", { ascending: true }),
    supabase
      .from("comms_formats")
      .select("id, name, cadence")
      .eq("id", edition.format_id)
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);

  const slots = (slotRows ?? []) as unknown as FilledSlot[];
  return {
    edition,
    format: (fmt as { id: string; name: string; cadence: Cadence } | null) ?? null,
    slots,
    completeness: editionCompleteness(slots),
  };
}

/**
 * Create an edition and SNAPSHOT the format's slots onto it.
 *
 * The snapshot is the whole point (spec §7.4a): a later rename, reorder, or
 * kind change on the format must not reach backwards into an edition already
 * being written, let alone one already sent.
 */
export async function createEdition(
  supabase: SupabaseClient,
  orgId: string,
  input: { formatId: string; title: string; targetDate: string | null; subject?: string | null },
): Promise<{ id: string } | { error: string }> {
  const { data: format } = await supabase
    .from("comms_formats")
    .select("id, name, slots")
    .eq("id", input.formatId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!format) return { error: "Format not found" };

  const slots = ((format as { slots: Slot[] }).slots ?? []) as Slot[];
  if (slots.length === 0) return { error: "That format has no slots yet." };

  const { data: created, error } = await supabase
    .from("comms_editions")
    .insert({
      org_id: orgId,
      format_id: input.formatId,
      title: input.title,
      subject: input.subject ?? null,
      target_date: input.targetDate,
      status: "planning",
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("[comms] edition create failed:", error?.message);
    return { error: "Could not create that edition." };
  }

  const { error: slotErr } = await supabase.from("comms_edition_slots").insert(
    slots.map((s, i) => ({
      org_id: orgId,
      edition_id: created.id as string,
      slot_key: s.key,
      slot_def: s,
      position: i,
    })),
  );
  if (slotErr) {
    // An edition with no slots is useless and confusing; roll it back rather
    // than leaving a shell someone has to work out how to delete.
    await supabase.from("comms_editions").delete().eq("id", created.id).eq("org_id", orgId);
    console.error("[comms] edition slot snapshot failed:", slotErr.message);
    return { error: "Could not set up that edition." };
  }

  return { id: created.id as string };
}
