import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/admin/requirePermission";
import { ctxHasPermission } from "@/lib/admin/auth";
import { auditDomain, importPerm } from "@/lib/admin/imports/perm";
import { donorNameKey } from "@/lib/admin/imports/engine";
import { loadStewardshipRules, decideImportStatus, ageInDays } from "@/lib/fundraising/stewardship";
import { addToReconciliation, emptyReconciliation } from "@/lib/fundraising/import-gifts";

/**
 * POST /api/admin/imports/[id]/commit — write staged rows to the spine
 * (spec #5 §6c). Budgeted and re-entrant: each invocation processes up to
 * BUDGET valid rows and returns { done, remaining }; the wizard loops until
 * done. A crash mid-run resumes on the next call — committed rows carry
 * created_entity_id and are never re-processed.
 *
 * Per row: re-check the ledger (a stale stage or a prior crash between the
 * insert and its ledger write must skip, not duplicate), insert the record
 * (stamped with import_id, the batch, so Undo can find exactly what this run
 * created), insert its external_refs entry, stamp the row. On completion:
 * counts, status 'done', finished_at, and the raw payloads are nulled
 * (spec §10.3 — the ledger keeps ids, not PII).
 *
 * Gift rows (V4 Stage F) reuse the donor staging matched, or create the donor
 * once per batch (looked up by email or name among the donors this batch
 * already created), then insert the gift with the stewardship status the
 * old donor import used. They run one at a time so two rows for the same new
 * donor never race into two donors.
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const BUDGET = 200;
const CHUNK = 25;

type Normalized = {
  fingerprint: string;
  spine: Record<string, unknown>;
  custom: Record<string, unknown>;
  /** V4 Stage E: the cohort this row enrolls in (resolved at staging). */
  cohort_id?: string | null;
  /** V4 Stage F, gift rows: the existing donor staging matched, or null. */
  constituent_id?: string | null;
  /** V4 Stage F, gift rows: the new donor's in-batch key (email or name). */
  donor_key?: string | null;
};

type StagedRow = { id: string; row_num: number; normalized: Normalized | null };

/**
 * The insert shape per target entity. Participants take the spine verbatim;
 * constituents fold the single email/phone the file carries into their
 * array columns. Both stamp source/provenance, the validated custom map and
 * the batch id.
 */
function entityInsert(
  entity: "student" | "constituent",
  orgId: string,
  importId: string,
  spine: Record<string, unknown>,
  custom: Record<string, unknown>,
  fingerprint: string,
): { table: string; row: Record<string, unknown> } {
  if (entity === "student") {
    return {
      table: "students",
      row: {
        org_id: orgId, ...spine, custom_fields: custom,
        external_source: "import", external_id: fingerprint, import_id: importId,
      },
    };
  }
  return { table: "constituents", row: donorInsert(orgId, importId, spine, custom) };
}

function donorInsert(orgId: string, importId: string, spine: Record<string, unknown>, custom: Record<string, unknown>): Record<string, unknown> {
  const { email, phone, type, first_name, last_name, org_name } = spine;
  const isOrg = type === "organization" || (!first_name && !last_name && !!org_name);
  return {
    org_id: orgId,
    type: isOrg ? "organization" : "person",
    ...(first_name ? { first_name } : {}),
    ...(last_name ? { last_name } : {}),
    ...(org_name ? { org_name } : {}),
    ...(spine.street !== undefined ? { street: spine.street } : {}),
    ...(spine.city !== undefined ? { city: spine.city } : {}),
    ...(spine.state !== undefined ? { state: spine.state } : {}),
    ...(spine.postal_code !== undefined ? { postal_code: spine.postal_code } : {}),
    ...(spine.notes !== undefined && !("amount" in spine) ? { notes: spine.notes } : {}),
    emails: typeof email === "string" && email ? [email] : [],
    phones: typeof phone === "string" && phone ? [phone] : [],
    custom_fields: custom,
    source: "import",
    import_id: importId,
  };
}

/** Donors this batch already created, keyed like staging's donor_key. */
async function batchDonors(supabase: SupabaseClient, orgId: string, importId: string): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("constituents")
    .select("id, type, first_name, last_name, org_name, emails")
    .eq("org_id", orgId)
    .eq("import_id", importId);
  const m = new Map<string, string>();
  for (const c of (data ?? []) as { id: string; type: string | null; first_name: string | null; last_name: string | null; org_name: string | null; emails: string[] | null }[]) {
    for (const e of c.emails ?? []) m.set(`email:${e.toLowerCase()}`, c.id);
    const k = donorNameKey(c);
    if (k && !m.has(k)) m.set(k, c.id);
  }
  return m;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission(["program.write", "fundraising.write"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const ctx = guard.ctx;
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  // Org fence: service-role client bypasses RLS — scope to the caller's org.
  const { data: run } = await supabase.from("imports").select("*").eq("org_id", ctx.orgId).eq("id", params.id).maybeSingle();
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await ctxHasPermission(ctx, importPerm(run.entity_type, "write")))) {
    return NextResponse.json({ error: "You don't have permission to import that." }, { status: 403 });
  }
  // Connector runs (source 'hubspot', E6) have no staged rows — a commit here
  // would find zero valid rows and wrongly close a LIVE sync as 'done'.
  if (run.source !== "csv") {
    return NextResponse.json({ error: "Only file imports can be committed here" }, { status: 409 });
  }
  if (run.status !== "staged" && run.status !== "committing") {
    return NextResponse.json({ error: `Cannot commit a ${run.status} import` }, { status: 409 });
  }
  if (run.status !== "committing") {
    await supabase.from("imports").update({ status: "committing" }).eq("org_id", ctx.orgId).eq("id", params.id);
  }
  const entity = run.entity_type as "student" | "constituent" | "gift";

  const { data: batchData } = await supabase
    .from("import_rows")
    .select("id, row_num, normalized")
    .eq("org_id", ctx.orgId)
    .eq("import_id", params.id)
    .eq("status", "valid")
    .order("row_num")
    .limit(BUDGET);
  const batch = (batchData ?? []) as StagedRow[];

  // V4 Stage E: enrollments ride the same run. Re-read the org's open
  // cohorts so a cohort archived or moved since staging is never written to.
  const openCohorts = new Set<string>();
  if (entity === "student") {
    const { data: cohortRows } = await supabase
      .from("cohorts").select("id").eq("org_id", ctx.orgId).in("status", ["planning", "active"]);
    for (const c of (cohortRows ?? []) as { id: string }[]) openCohorts.add(c.id);
  }
  const enroll = async (studentId: string, cohortId: string | null | undefined) => {
    if (!cohortId || !openCohorts.has(cohortId)) return false;
    const { error } = await supabase.from("cohort_members").upsert(
      { org_id: ctx.orgId, cohort_id: cohortId, student_id: studentId, status: "enrolled" },
      { onConflict: "cohort_id,student_id", ignoreDuplicates: true },
    );
    if (error) console.error("Import enroll failed:", error.message);
    return !error;
  };

  const rules = entity === "gift" ? await loadStewardshipRules(supabase, ctx.orgId) : [];
  const donorsByKey = entity === "gift" ? await batchDonors(supabase, ctx.orgId, params.id) : new Map<string, string>();

  const markInvalid = (row: StagedRow, error: string) =>
    supabase.from("import_rows").update({ status: "invalid", error }).eq("org_id", ctx.orgId).eq("id", row.id);

  /** One gift row: the donor (reused or created once), then the gift. */
  const commitGift = async (row: StagedRow, n: Normalized): Promise<"created" | "failed"> => {
    let constituentId = n.constituent_id ?? null;
    if (!constituentId && n.donor_key) constituentId = donorsByKey.get(n.donor_key) ?? null;
    if (!constituentId) {
      const { data: c, error } = await supabase.from("constituents").insert(donorInsert(ctx.orgId, params.id, n.spine, {})).select("id").single();
      if (error || !c) {
        await markInvalid(row, `Create donor failed: ${error?.message ?? "unknown"}`);
        return "failed";
      }
      constituentId = c.id as string;
      if (n.donor_key) donorsByKey.set(n.donor_key, constituentId);
    }
    const amount = n.spine.amount as number;
    const giftDate = n.spine.gift_date as string;
    const method = (n.spine.method as string | undefined) ?? "other";
    const ack = decideImportStatus(
      { amount, method, gift_date: giftDate, external_source: "import", recurring: false, ageDays: ageInDays(giftDate) },
      rules,
    );
    const { data: gift, error: gErr } = await supabase
      .from("gifts")
      .insert({
        org_id: ctx.orgId,
        constituent_id: constituentId,
        amount,
        gift_date: giftDate,
        method,
        ...(typeof n.spine.notes === "string" ? { notes: n.spine.notes } : {}),
        external_source: "import",
        acknowledgment_status: ack,
        import_id: params.id,
      })
      .select("id")
      .single();
    if (gErr || !gift) {
      await markInvalid(row, `Create gift failed: ${gErr?.message ?? "unknown"}`);
      return "failed";
    }
    const { error: refErr } = await supabase.from("external_refs").insert({
      org_id: ctx.orgId, entity_type: "gift", entity_id: gift.id, source: "csv", external_id: n.fingerprint,
    });
    if (refErr) console.error("external_refs insert failed:", refErr.message);
    await supabase.from("import_rows")
      .update({ status: "committed", created_entity_id: gift.id, matched_entity_id: constituentId, error: null })
      .eq("org_id", ctx.orgId)
      .eq("id", row.id);
    return "created";
  };

  let created = 0, newlySkipped = 0, failed = 0, enrolled = 0;
  for (let i = 0; i < batch.length; i += CHUNK) {
    const chunk = batch.slice(i, i + CHUNK);

    // Ledger re-check for the whole chunk in one query.
    const fps = chunk.map((r) => r.normalized?.fingerprint).filter((f): f is string => !!f);
    const { data: refData } = await supabase
      .from("external_refs")
      .select("external_id")
      .eq("org_id", ctx.orgId)
      .eq("entity_type", entity)
      .eq("source", "csv")
      .in("external_id", fps);
    const alreadyImported = new Set((refData ?? []).map((r) => r.external_id));

    const one = async (row: StagedRow) => {
      if (!row.normalized) {
        failed++;
        await markInvalid(row, "Row was not staged — re-run staging");
        return;
      }
      const n = row.normalized;
      if (alreadyImported.has(n.fingerprint)) {
        newlySkipped++;
        await supabase.from("import_rows")
          .update({ status: "skipped", verdict: "skip", error: "Already imported (identical row)" })
          .eq("org_id", ctx.orgId)
          .eq("id", row.id);
        return;
      }
      if (entity === "gift") {
        if ((await commitGift(row, n)) === "created") created++;
        else failed++;
        return;
      }
      // org from the run — never a column default.
      const target = entityInsert(entity, ctx.orgId, params.id, n.spine, n.custom, n.fingerprint);
      const { data: entityRow, error: insErr } = await supabase
        .from(target.table)
        .insert(target.row)
        .select("id")
        .single();
      if (insErr || !entityRow) {
        failed++;
        await markInvalid(row, `Create failed: ${insErr?.message ?? "unknown"}`);
        return;
      }
      const { error: refErr } = await supabase.from("external_refs").insert({
        org_id: ctx.orgId,
        entity_type: entity,
        entity_id: entityRow.id,
        source: "csv",
        external_id: n.fingerprint,
      });
      if (refErr) console.error("external_refs insert failed:", refErr.message);
      if (await enroll(entityRow.id as string, n.cohort_id)) enrolled++;
      await supabase.from("import_rows")
        .update({ status: "committed", created_entity_id: entityRow.id, error: null })
        .eq("org_id", ctx.orgId)
        .eq("id", row.id);
      created++;
    };

    if (entity === "gift") {
      for (const row of chunk) await one(row);
    } else {
      await Promise.all(chunk.map(one));
    }
  }

  const { count: remaining } = await supabase
    .from("import_rows")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
    .eq("import_id", params.id)
    .eq("status", "valid");

  const done = (remaining ?? 0) === 0;
  if (!done && enrolled > 0) {
    // Keep the running enrollment count on the run between budgeted calls.
    await supabase.from("imports")
      .update({ counts: { ...(run.counts ?? {}), enrolled: ((run.counts as { enrolled?: number } | null)?.enrolled ?? 0) + enrolled } })
      .eq("org_id", ctx.orgId)
      .eq("id", params.id);
  }
  if (done) {
    const tally = async (status: string) => {
      const { count } = await supabase
        .from("import_rows")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.orgId)
        .eq("import_id", params.id)
        .eq("status", status);
      return count ?? 0;
    };
    const [committed, skipped, invalid] = await Promise.all([
      tally("committed"), tally("skipped"), tally("invalid"),
    ]);
    // A row skipped because it matched someone already on the roster (by
    // email) still joins the cohort the file asked for.
    if (entity === "student" && openCohorts.size > 0) {
      const { data: matched } = await supabase
        .from("import_rows")
        .select("matched_entity_id, normalized")
        .eq("org_id", ctx.orgId)
        .eq("import_id", params.id)
        .eq("status", "skipped")
        .not("matched_entity_id", "is", null);
      for (const m of (matched ?? []) as { matched_entity_id: string; normalized: Normalized | null }[]) {
        if (await enroll(m.matched_entity_id, m.normalized?.cohort_id)) enrolled++;
      }
    }
    // Gift runs: how many donors were created, and the per-year
    // reconciliation report (imported vs skipped as already recorded) to
    // check against the old system's totals.
    let giftExtras: Record<string, unknown> = {};
    if (entity === "gift") {
      const { count: donorsCreated } = await supabase
        .from("constituents")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.orgId)
        .eq("import_id", params.id);
      const { data: giftRows } = await supabase
        .from("import_rows")
        .select("status, normalized, error")
        .eq("org_id", ctx.orgId)
        .eq("import_id", params.id)
        .in("status", ["committed", "skipped"]);
      const recon = emptyReconciliation();
      for (const g of (giftRows ?? []) as { status: string; normalized: Normalized | null; error: string | null }[]) {
        const s = g.normalized?.spine;
        if (!s || typeof s.amount !== "number" || typeof s.gift_date !== "string") continue;
        if (g.status === "committed") addToReconciliation(recon, s.gift_date, s.amount, "inserted");
        else addToReconciliation(recon, s.gift_date, s.amount, "duplicate");
      }
      giftExtras = { donors_created: donorsCreated ?? 0, reconciliation: recon };
    }
    const counts = {
      ...(run.counts ?? {}),
      created: committed, skipped, invalid,
      enrolled: ((run.counts as { enrolled?: number } | null)?.enrolled ?? 0) + enrolled,
      ...giftExtras,
    };
    await supabase.from("imports")
      .update({ status: "done", counts, finished_at: new Date().toISOString() })
      .eq("org_id", ctx.orgId)
      .eq("id", params.id);
    // PII retention (spec §10.3): the raw file rows served their purpose.
    await supabase.from("import_rows")
      .update({ raw: [] })
      .eq("org_id", ctx.orgId)
      .eq("import_id", params.id);
    await audit(req, {
      action: `${auditDomain(entity)}.import.commit`,
      entityType: "import",
      entityId: params.id,
      after: { ...counts, reconciliation: undefined },
    });
  }

  return NextResponse.json({
    ok: true, done,
    created, newly_skipped: newlySkipped, failed, enrolled,
    remaining: remaining ?? 0,
  });
}
