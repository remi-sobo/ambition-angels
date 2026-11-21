import { NextRequest, NextResponse } from "next/server";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getFieldDefs } from "@/lib/admin/customFields";
import { getParticipantStages } from "@/lib/admin/program/stages";
import {
  validateMapping,
  normalizeRow,
  buildRow,
  rowFingerprint,
  dedupeEmails,
  verdictFor,
  cohortLookup,
  buildDonorIndex,
  matchDonor,
  donorNameKey,
  type DonorIndexRow,
  type Mapping,
} from "@/lib/admin/imports/engine";
import { giftDedupeKey } from "@/lib/fundraising/import-gifts";
import { requirePermission } from "@/lib/admin/requirePermission";
import { ctxHasPermission } from "@/lib/admin/auth";
import { importPerm } from "@/lib/admin/imports/perm";

/**
 * POST /api/admin/imports/[id]/stage — validate every pending row against the
 * mapping and compute duplicate verdicts (spec #5 §6c). Re-runnable: staging
 * again (after remapping) recomputes every non-committed row from raw.
 *
 * Row outcomes: valid (verdict create) | skipped (ledger hit, in-file
 * duplicate, or a match) | invalid (validation error). Nothing touches a
 * spine table here — that's /commit.
 *
 * Duplicate check (V4 Stage F), always against the ACTIVE org's rows:
 *  - participants: own email or guardian email;
 *  - donors: email, then full name (lib/admin/imports/engine.ts matchDonor:
 *    a name match counts only when one side has no email);
 *  - gifts: the donor is matched the same way (an existing donor is reused,
 *    never duplicated; a new one is created at commit), and a gift with the
 *    same donor, date and amount as one already on file is skipped.
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const CHUNK = 500;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission(["program.write", "fundraising.write"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const ctx = guard.ctx;
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  // Org fence: service-role client bypasses RLS — scope to the caller's org.
  const { data: run } = await supabase.from("imports").select("*").eq("org_id", ctx.orgId).eq("id", params.id).maybeSingle();
  if (!run || run.org_id !== ctx.orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await ctxHasPermission(ctx, importPerm(run.entity_type, "write")))) {
    return NextResponse.json({ error: "You don't have permission to import that." }, { status: 403 });
  }
  if (run.source !== "csv") {
    return NextResponse.json({ error: "Only file imports can be staged" }, { status: 409 });
  }
  if (run.status !== "mapping" && run.status !== "staged") {
    return NextResponse.json({ error: `Cannot stage a ${run.status} import` }, { status: 409 });
  }

  const entity = run.entity_type as "student" | "constituent" | "gift";
  const mapping = (run.mapping ?? {}) as { header?: string[]; map?: Mapping; cohort_id?: string | null };
  const header = mapping.header ?? [];
  const map = mapping.map ?? {};
  const defs = entity === "gift" ? [] : await getFieldDefs(ctx.orgId, entity);
  const mapCheck = validateMapping(map, header, entity, defs);
  if (!mapCheck.ok) return NextResponse.json({ error: mapCheck.error }, { status: 400 });

  const stageKeys = entity === "student"
    ? new Set((await getParticipantStages()).map((s) => s.stage_key))
    : new Set<string>();

  // V4 Stage E: the cohort column and "put everyone in this cohort" resolve
  // against the org's open cohorts only (org-pinned read). A default cohort
  // that is no longer open fails the whole stage rather than half-enrolling.
  let cohortsByName: Map<string, string> | undefined;
  let defaultCohortId: string | null = null;
  if (entity === "student") {
    const { data: cohortRows } = await supabase
      .from("cohorts")
      .select("id, name, status")
      .eq("org_id", ctx.orgId)
      .in("status", ["planning", "active"]);
    cohortsByName = cohortLookup((cohortRows ?? []) as { id: string; name: string }[]);
    if (mapping.cohort_id) {
      defaultCohortId = cohortsByName.get(String(mapping.cohort_id).toLowerCase()) ?? null;
      if (!defaultCohortId) {
        return NextResponse.json({ error: "The cohort chosen for everyone is not open in this organization." }, { status: 400 });
      }
    }
  }

  const { data: rowData } = await supabase
    .from("import_rows")
    .select("id, row_num, raw, status")
    .eq("org_id", ctx.orgId)
    .eq("import_id", params.id)
    .order("row_num");
  const rows = (rowData ?? []) as { id: string; row_num: number; raw: string[]; status: string }[];
  const workable = rows.filter((r) => r.status !== "committed");

  // The org's dedupe surface: existing ledger entries for this file's
  // fingerprints, plus an index over the org's rows.
  const fingerprints = workable.map((r) => rowFingerprint(r.raw));
  const refHits = new Set<string>();
  for (let i = 0; i < fingerprints.length; i += CHUNK) {
    const { data: refs } = await supabase
      .from("external_refs")
      .select("external_id")
      .eq("org_id", ctx.orgId)
      .eq("entity_type", entity)
      .eq("source", "csv")
      .in("external_id", fingerprints.slice(i, i + CHUNK));
    for (const r of refs ?? []) refHits.add(r.external_id);
  }

  const emailIndex = new Map<string, string>();
  let donorIndex = buildDonorIndex([]);
  const existingGifts = new Set<string>();
  if (entity === "student") {
    // Paged: a `.limit` above 1,000 is still capped by PostgREST, which hid
    // existing rows from dedupe. Null data (error) leaves the index empty, as before.
    const { data } = await fetchAll<{ id: string; email: string | null; custom_fields: Record<string, unknown> | null }>(
      () => supabase.from("students").select("id, email, custom_fields").eq("org_id", ctx.orgId),
      { order: ["id"], hardCap: 200_000 }
    );
    for (const s of data ?? []) {
      if (typeof s.email === "string" && s.email) emailIndex.set(s.email.toLowerCase(), s.id);
      const g = (s.custom_fields as Record<string, unknown> | null)?.guardian_email;
      if (typeof g === "string" && g) emailIndex.set(g.toLowerCase(), s.id);
    }
  } else {
    const donors = await fetchAll<DonorIndexRow>(
      () => supabase.from("constituents").select("id, type, first_name, last_name, org_name, emails").eq("org_id", ctx.orgId),
      { order: ["id"], hardCap: 200_000 }
    );
    const gifts = entity === "gift"
      ? await fetchAll<{ constituent_id: string | null; gift_date: string; amount: number }>(
          () => supabase.from("gifts").select("constituent_id, gift_date, amount").eq("org_id", ctx.orgId),
          { order: ["id"], hardCap: 200_000 }
        )
      : { data: [], error: null, truncated: false };
    // A dedupe surface that could not be read in full must not stage: it would
    // let duplicates through as "create".
    if (donors.error || donors.truncated || gifts.error || gifts.truncated) {
      return NextResponse.json({ error: "Could not load existing records to check for duplicates. Nothing was staged." }, { status: 500 });
    }
    donorIndex = buildDonorIndex(donors.data ?? []);
    for (const g of gifts.data ?? []) {
      if (g.constituent_id) existingGifts.add(giftDedupeKey(g.constituent_id, g.gift_date, Number(g.amount)));
    }
  }

  const seenInFile = new Set<string>();
  const seenGiftInFile = new Set<string>();
  let valid = 0, invalid = 0, skipped = 0, newDonors = 0;
  const matchedDonorIds = new Set<string>();
  const newDonorKeys = new Set<string>();
  const updates = workable.map((r, i) => {
    const fp = fingerprints[i];
    const base = { id: r.id, org_id: ctx.orgId, import_id: params.id, row_num: r.row_num, raw: r.raw };
    const built = buildRow(normalizeRow(header, r.raw, map), { entity, defs, stageKeys, cohortsByName, defaultCohortId });
    if (!built.ok) {
      invalid++;
      return { ...base, status: "invalid", verdict: null, matched_entity_id: null, normalized: null, error: built.error };
    }
    const inFileDup = seenInFile.has(fp);
    seenInFile.add(fp);

    if (entity === "gift") {
      const donor = matchDonor(built.spine, donorIndex);
      const amount = built.spine.amount as number;
      const date = built.spine.gift_date as string;
      // A new donor's in-file key: email, else name, so two rows for the same
      // new person create one donor and catch a repeated gift.
      const newKey = donor ? null : (typeof built.spine.email === "string" ? `email:${built.spine.email}` : donorNameKey(built.spine)) ?? `row:${r.row_num}`;
      const giftId = donor ? giftDedupeKey(donor.id, date, amount) : `${newKey}|${date}|${amount.toFixed(2)}`;
      const normalized = {
        fingerprint: fp, spine: built.spine, custom: {},
        constituent_id: donor?.id ?? null,
        donor: donor ? (donor.by === "email" ? "Existing donor (same email)" : "Existing donor (same name)") : "New donor",
        donor_key: newKey,
      };
      if (refHits.has(fp) || inFileDup) {
        skipped++;
        return { ...base, status: "skipped", verdict: "skip", matched_entity_id: donor?.id ?? null, normalized, error: "Already imported (identical row)" };
      }
      if ((donor && existingGifts.has(giftId)) || seenGiftInFile.has(giftId)) {
        skipped++;
        return { ...base, status: "skipped", verdict: "skip", matched_entity_id: donor?.id ?? null, normalized, error: "This gift is already recorded (same donor, date and amount)" };
      }
      seenGiftInFile.add(giftId);
      if (donor) matchedDonorIds.add(donor.id);
      else if (newKey && !newDonorKeys.has(newKey)) {
        newDonorKeys.add(newKey);
        newDonors++;
      }
      valid++;
      return { ...base, status: "valid", verdict: "create", matched_entity_id: donor?.id ?? null, normalized, error: null };
    }

    let emailMatch: string | null = null;
    let nameMatch: string | null = null;
    if (entity === "student") {
      emailMatch = dedupeEmails(entity, built).map((e) => emailIndex.get(e)).find(Boolean) ?? null;
    } else {
      const m = matchDonor(built.spine, donorIndex);
      if (m?.by === "email") emailMatch = m.id;
      if (m?.by === "name") nameMatch = m.id;
    }
    const v = verdictFor(refHits.has(fp) || inFileDup, emailMatch, nameMatch);
    const normalized = { fingerprint: fp, spine: built.spine, custom: built.custom, cohort_id: built.cohortId ?? null };
    if (v.verdict === "skip") {
      skipped++;
      return {
        ...base, status: "skipped", verdict: "skip", normalized,
        matched_entity_id: v.matchedEntityId,
        error:
          v.reason === "already_imported"
            ? "Already imported (identical row)"
            : v.reason === "matches_name"
              ? "Matches an existing record by name"
              : "Matches an existing record by email",
      };
    }
    valid++;
    return { ...base, status: "valid", verdict: "create", matched_entity_id: null, normalized, error: null };
  });

  for (let i = 0; i < updates.length; i += CHUNK) {
    const { error } = await supabase
      .from("import_rows")
      .upsert(updates.slice(i, i + CHUNK), { onConflict: "import_id,row_num" });
    if (error) {
      console.error("Stage rows failed:", error.message);
      return NextResponse.json({ error: "Staging failed" }, { status: 500 });
    }
  }

  const counts = {
    ...(run.counts ?? {}), total: rows.length, valid, invalid, skipped,
    ...(entity === "gift" ? { new_donors: newDonors, matched_donors: matchedDonorIds.size } : {}),
  };
  await supabase.from("imports").update({ status: "staged", counts }).eq("org_id", ctx.orgId).eq("id", params.id);
  return NextResponse.json({ ok: true, counts });
}
