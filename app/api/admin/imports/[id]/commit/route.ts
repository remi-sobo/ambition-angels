import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/imports/[id]/commit — write staged rows to the spine
 * (spec #5 §6c). Budgeted and re-entrant: each invocation processes up to
 * BUDGET valid rows and returns { done, remaining }; the wizard loops until
 * done. A crash mid-run resumes on the next call — committed rows carry
 * created_entity_id and are never re-processed.
 *
 * Per row: re-check the ledger (a stale stage or a prior crash between the
 * student insert and its ledger write must skip, not duplicate), insert the
 * student, insert its external_refs entry, stamp the row. On completion:
 * counts, status 'done', finished_at, and the raw payloads are nulled
 * (spec §10.3 — the ledger keeps ids, not PII).
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const BUDGET = 200;
const CHUNK = 25;

type StagedRow = {
  id: string;
  row_num: number;
  normalized: { fingerprint: string; spine: Record<string, unknown>; custom: Record<string, unknown> } | null;
};

/**
 * The insert shape per target entity. Participants take the spine verbatim;
 * constituents fold the single email/phone the file carries into their
 * array columns. Both stamp source/provenance and the validated custom map.
 */
function entityInsert(
  entity: "student" | "constituent",
  orgId: string,
  spine: Record<string, unknown>,
  custom: Record<string, unknown>,
  fingerprint: string,
): { table: string; row: Record<string, unknown> } {
  if (entity === "student") {
    return {
      table: "students",
      row: {
        org_id: orgId, ...spine, custom_fields: custom,
        external_source: "import", external_id: fingerprint,
      },
    };
  }
  const { email, phone, ...rest } = spine;
  return {
    table: "constituents",
    row: {
      org_id: orgId,
      type: rest.type ?? "person",
      ...rest,
      emails: typeof email === "string" && email ? [email] : [],
      phones: typeof phone === "string" && phone ? [phone] : [],
      custom_fields: custom,
      source: "import",
    },
  };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: run } = await supabase.from("imports").select("*").eq("id", params.id).maybeSingle();
  if (!run || run.org_id !== ctx.orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (run.status !== "staged" && run.status !== "committing") {
    return NextResponse.json({ error: `Cannot commit a ${run.status} import` }, { status: 409 });
  }
  if (run.status !== "committing") {
    await supabase.from("imports").update({ status: "committing" }).eq("id", params.id);
  }

  const { data: batchData } = await supabase
    .from("import_rows")
    .select("id, row_num, normalized")
    .eq("import_id", params.id)
    .eq("status", "valid")
    .order("row_num")
    .limit(BUDGET);
  const batch = (batchData ?? []) as StagedRow[];

  let created = 0, newlySkipped = 0, failed = 0;
  for (let i = 0; i < batch.length; i += CHUNK) {
    const chunk = batch.slice(i, i + CHUNK);

    // Ledger re-check for the whole chunk in one query.
    const fps = chunk.map((r) => r.normalized?.fingerprint).filter((f): f is string => !!f);
    const { data: refData } = await supabase
      .from("external_refs")
      .select("external_id")
      .eq("org_id", ctx.orgId)
      .eq("entity_type", run.entity_type)
      .eq("source", "csv")
      .in("external_id", fps);
    const alreadyImported = new Set((refData ?? []).map((r) => r.external_id));

    await Promise.all(
      chunk.map(async (row) => {
        if (!row.normalized) {
          failed++;
          await supabase.from("import_rows")
            .update({ status: "invalid", error: "Row was not staged — re-run staging" })
            .eq("id", row.id);
          return;
        }
        const { fingerprint, spine, custom } = row.normalized;
        if (alreadyImported.has(fingerprint)) {
          newlySkipped++;
          await supabase.from("import_rows")
            .update({ status: "skipped", verdict: "skip", error: "Already imported (identical row)" })
            .eq("id", row.id);
          return;
        }
        // org from the run — never a column default.
        const target = entityInsert(
          run.entity_type as "student" | "constituent",
          ctx.orgId, spine, custom, fingerprint,
        );
        const { data: entityRow, error: insErr } = await supabase
          .from(target.table)
          .insert(target.row)
          .select("id")
          .single();
        if (insErr || !entityRow) {
          failed++;
          await supabase.from("import_rows")
            .update({ status: "invalid", error: `Create failed: ${insErr?.message ?? "unknown"}` })
            .eq("id", row.id);
          return;
        }
        const { error: refErr } = await supabase.from("external_refs").insert({
          org_id: ctx.orgId,
          entity_type: run.entity_type,
          entity_id: entityRow.id,
          source: "csv",
          external_id: fingerprint,
        });
        if (refErr) console.error("external_refs insert failed:", refErr.message);
        await supabase.from("import_rows")
          .update({ status: "committed", created_entity_id: entityRow.id, error: null })
          .eq("id", row.id);
        created++;
      }),
    );
  }

  const { count: remaining } = await supabase
    .from("import_rows")
    .select("id", { count: "exact", head: true })
    .eq("import_id", params.id)
    .eq("status", "valid");

  const done = (remaining ?? 0) === 0;
  if (done) {
    const tally = async (status: string) => {
      const { count } = await supabase
        .from("import_rows")
        .select("id", { count: "exact", head: true })
        .eq("import_id", params.id)
        .eq("status", status);
      return count ?? 0;
    };
    const [committed, skipped, invalid] = await Promise.all([
      tally("committed"), tally("skipped"), tally("invalid"),
    ]);
    const counts = { ...(run.counts ?? {}), created: committed, skipped, invalid };
    await supabase.from("imports")
      .update({ status: "done", counts, finished_at: new Date().toISOString() })
      .eq("id", params.id);
    // PII retention (spec §10.3): the raw file rows served their purpose.
    await supabase.from("import_rows")
      .update({ raw: [] })
      .eq("import_id", params.id);
    await audit(req, {
      action: `${run.entity_type === "constituent" ? "fundraising" : "program"}.import.commit`,
      entityType: "import",
      entityId: params.id,
      after: counts,
    });
  }

  return NextResponse.json({
    ok: true, done,
    created, newly_skipped: newlySkipped, failed,
    remaining: remaining ?? 0,
  });
}
