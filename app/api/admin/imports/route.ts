import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getFieldDefs } from "@/lib/admin/customFields";
import { parseCsvText, suggestMapping, SPINE_FIELDS } from "@/lib/admin/imports/engine";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/admin/requirePermission";
import { ctxHasPermission } from "@/lib/admin/auth";
import { auditDomain, importPerm, isImportEntity } from "@/lib/admin/imports/perm";

/**
 * POST /api/admin/imports — start an import run (spec #5 E3).
 *
 * Body: { entity_type: 'student' | 'constituent' | 'gift', filename?, csv_text }. Parses the file,
 * stores the raw rows in import_rows (status 'pending'), and returns the
 * header + an auto-suggested mapping for the wizard's mapping step. Nothing
 * touches a spine table until /commit.
 */

// v1 caps (spec §9): AA is 27 students, Safespace is dozens — 2,000 rows and
// ~2 MB of text are generous, and both fail loudly rather than truncating.
const MAX_ROWS = 2_000;
const MAX_TEXT = 2_000_000;
const STAGE_CHUNK = 500;

export async function POST(req: NextRequest) {
  const guard = await requirePermission(["program.write", "fundraising.write"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const ctx = guard.ctx;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const entityType = body.entity_type as keyof typeof SPINE_FIELDS;
  if (!isImportEntity(entityType)) {
    return NextResponse.json({ error: "entity_type must be 'student', 'constituent' or 'gift'" }, { status: 400 });
  }
  if (!(await ctxHasPermission(ctx, importPerm(entityType, "write")))) {
    return NextResponse.json({ error: "You don't have permission to import that." }, { status: 403 });
  }
  const csvText = typeof body.csv_text === "string" ? body.csv_text : "";
  if (!csvText.trim()) return NextResponse.json({ error: "csv_text is required" }, { status: 400 });
  if (csvText.length > MAX_TEXT) {
    return NextResponse.json({ error: "File too large (2 MB max)" }, { status: 400 });
  }
  const filename =
    typeof body.filename === "string" ? body.filename.trim().slice(0, 200) : null;

  const { header, rows, errors } = parseCsvText(csvText);
  if (header.length === 0 || rows.length === 0) {
    return NextResponse.json(
      { error: errors[0] ?? "No data rows found (is the first line a header?)" },
      { status: 400 },
    );
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows (${rows.length}; ${MAX_ROWS} max per import)` },
      { status: 400 },
    );
  }

  // Gift rows map onto the donor and gift columns only (no custom fields).
  const defs = entityType === "gift" ? [] : await getFieldDefs(ctx.orgId, entityType);
  const suggested = suggestMapping(header, entityType, defs);

  const supabase = getSupabaseAdmin();
  const { data: run, error } = await supabase
    .from("imports")
    .insert({
      org_id: ctx.orgId, // session org, never a default
      entity_type: entityType,
      source: "csv",
      filename,
      status: "mapping",
      mapping: { header, map: suggested },
      counts: { total: rows.length },
    })
    .select("id")
    .single();
  if (error || !run) {
    console.error("Create import failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }

  for (let i = 0; i < rows.length; i += STAGE_CHUNK) {
    const chunk = rows.slice(i, i + STAGE_CHUNK).map((raw, j) => ({
      org_id: ctx.orgId,
      import_id: run.id,
      row_num: i + j + 1,
      raw,
    }));
    const { error: rowErr } = await supabase.from("import_rows").insert(chunk);
    if (rowErr) {
      console.error("Import row insert failed:", rowErr.message);
      // Org fence: service-role client bypasses RLS — scope to the caller's org.
      await supabase.from("imports").update({ status: "failed" }).eq("org_id", ctx.orgId).eq("id", run.id);
      return NextResponse.json({ error: "Could not store rows" }, { status: 500 });
    }
  }

  await audit(req, {
    action: `${auditDomain(entityType)}.import.create`,
    entityType: "import",
    entityId: run.id,
    after: { filename, entity_type: entityType, rows: rows.length },
  });
  return NextResponse.json({
    id: run.id,
    header,
    mapping: suggested,
    total: rows.length,
    parse_errors: errors,
    fields: {
      spine: SPINE_FIELDS[entityType].map(({ key, label, required }) => ({ key, label, required: !!required })),
      custom: defs.map((d) => ({ key: d.key, label: d.label, required: d.required })),
    },
  });
}
