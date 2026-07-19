import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { getFieldDefs } from "@/lib/admin/customFields";
import { getParticipantStages } from "@/lib/admin/program/stages";
import {
  validateMapping,
  normalizeRow,
  buildRow,
  rowFingerprint,
  dedupeEmails,
  verdictFor,
  type Mapping,
} from "@/lib/admin/imports/engine";

/**
 * POST /api/admin/imports/[id]/stage — validate every pending row against the
 * mapping and compute duplicate verdicts (spec #5 §6c). Re-runnable: staging
 * again (after remapping) recomputes every non-committed row from raw.
 *
 * Row outcomes: valid (verdict create) | skipped (ledger hit, in-file
 * duplicate, or email match) | invalid (validation error). Nothing touches a
 * spine table here — that's /commit.
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const CHUNK = 500;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  // Org fence: service-role client bypasses RLS — scope to the caller's org.
  const { data: run } = await supabase.from("imports").select("*").eq("org_id", ctx.orgId).eq("id", params.id).maybeSingle();
  if (!run || run.org_id !== ctx.orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (run.source !== "csv") {
    return NextResponse.json({ error: "Only file imports can be staged" }, { status: 409 });
  }
  if (run.status !== "mapping" && run.status !== "staged") {
    return NextResponse.json({ error: `Cannot stage a ${run.status} import` }, { status: 409 });
  }

  const entity = run.entity_type as "student" | "constituent";
  const mapping = (run.mapping ?? {}) as { header?: string[]; map?: Mapping };
  const header = mapping.header ?? [];
  const map = mapping.map ?? {};
  const defs = await getFieldDefs(ctx.orgId, entity);
  const mapCheck = validateMapping(map, header, entity, defs);
  if (!mapCheck.ok) return NextResponse.json({ error: mapCheck.error }, { status: 400 });

  const stageKeys = entity === "student"
    ? new Set((await getParticipantStages()).map((s) => s.stage_key))
    : new Set<string>();

  const { data: rowData } = await supabase
    .from("import_rows")
    .select("id, row_num, raw, status")
    .eq("org_id", ctx.orgId)
    .eq("import_id", params.id)
    .order("row_num");
  const rows = (rowData ?? []) as { id: string; row_num: number; raw: string[]; status: string }[];
  const workable = rows.filter((r) => r.status !== "committed");

  // The org's dedupe surface: existing ledger entries for this file's
  // fingerprints, and an email index over the org's rows — participants match
  // on own email + the guardian_email custom field (the intake-accept rule),
  // constituents on any address in their emails array.
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
  if (entity === "student") {
    const { data } = await supabase
      .from("students")
      .select("id, email, custom_fields")
      .eq("org_id", ctx.orgId)
      .limit(5000);
    for (const s of data ?? []) {
      if (typeof s.email === "string" && s.email) emailIndex.set(s.email.toLowerCase(), s.id);
      const g = (s.custom_fields as Record<string, unknown> | null)?.guardian_email;
      if (typeof g === "string" && g) emailIndex.set(g.toLowerCase(), s.id);
    }
  } else {
    const { data } = await supabase
      .from("constituents")
      .select("id, emails")
      .eq("org_id", ctx.orgId)
      .limit(20000);
    for (const c of data ?? []) {
      for (const e of (c.emails as string[] | null) ?? []) {
        if (typeof e === "string" && e) emailIndex.set(e.toLowerCase(), c.id);
      }
    }
  }

  const seenInFile = new Set<string>();
  let valid = 0, invalid = 0, skipped = 0;
  const updates = workable.map((r, i) => {
    const fp = fingerprints[i];
    const base = { id: r.id, org_id: ctx.orgId, import_id: params.id, row_num: r.row_num, raw: r.raw };
    const built = buildRow(normalizeRow(header, r.raw, map), { entity, defs, stageKeys });
    if (!built.ok) {
      invalid++;
      return { ...base, status: "invalid", verdict: null, matched_entity_id: null, normalized: null, error: built.error };
    }
    const inFileDup = seenInFile.has(fp);
    seenInFile.add(fp);
    const emailMatch = dedupeEmails(entity, built).map((e) => emailIndex.get(e)).find(Boolean) ?? null;
    const v = verdictFor(refHits.has(fp) || inFileDup, emailMatch);
    const normalized = { fingerprint: fp, spine: built.spine, custom: built.custom };
    if (v.verdict === "skip") {
      skipped++;
      return {
        ...base, status: "skipped", verdict: "skip", normalized,
        matched_entity_id: v.matchedEntityId,
        error: v.reason === "already_imported" ? "Already imported (identical row)" : "Matches an existing record by email",
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
  };
  await supabase.from("imports").update({ status: "staged", counts }).eq("org_id", ctx.orgId).eq("id", params.id);
  return NextResponse.json({ ok: true, counts });
}
