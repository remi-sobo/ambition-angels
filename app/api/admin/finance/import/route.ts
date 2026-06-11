import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { parseCsv } from "@/lib/finance/parsers";
import { batchDedupHashes, fileHash } from "@/lib/finance/dedup";
import { loadRules, matchRule, bumpHitCounts } from "@/lib/finance/categorize";
import type {
  BankFormat,
  ImportPreview,
  ParsedTxn,
  StagedTxn,
} from "@/lib/finance/types";

const ALLOWED_FORMATS: BankFormat[] = [
  "wells-fargo",
  "chase",
  "mercury",
  "quickbooks",
  "generic",
];

// Two-phase upload:
//   mode=preview → parse, dedup, categorize, return summary + first 50 rows
//   mode=commit  → same parse pipeline, then INSERT new rows + record import
// Preview is free; commit writes. The client always previews first, then
// submits the same file with the user's confirmation.
export async function POST(req: NextRequest) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getAdminUser();
  if (!user) {
    return NextResponse.json({ error: "Unknown admin user" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart form" }, { status: 400 });
  }

  const file = form.get("file");
  const formatRaw = form.get("format");
  const mode = form.get("mode") === "commit" ? "commit" : "preview";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (typeof formatRaw !== "string" || !ALLOWED_FORMATS.includes(formatRaw as BankFormat)) {
    return NextResponse.json(
      { error: `format must be one of: ${ALLOWED_FORMATS.join(", ")}` },
      { status: 400 }
    );
  }
  const format = formatRaw as BankFormat;

  const text = await file.text();
  const fHash = fileHash(text);

  const supabase = getSupabaseAdmin();

  // Short-circuit if the same file was already imported. We still return
  // the parsed rows so the UI can show what was in it, but flag the import
  // as already-applied so we don't double-write.
  const { data: priorImport } = await supabase
    .from("fin_imports")
    .select("*")
    .eq("file_hash", fHash)
    .maybeSingle();

  let parsed: ParsedTxn[];
  try {
    parsed = parseCsv(text, format);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to parse CSV";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (parsed.length === 0) {
    // Return a sample of the file so the user can see what we're seeing.
    // This is the single most useful diagnostic for "why didn't it parse?"
    // — usually the bank format selection is wrong, or there's a header
    // row the user needs to know about.
    const sample = text
      .replace(/^﻿/, "")
      .split(/\r?\n/)
      .filter((l) => l.length > 0)
      .slice(0, 6);
    return NextResponse.json(
      {
        error:
          "No transactions parsed. Either the bank format is wrong, or the file isn't shaped the way we expect.",
        sample,
        hint:
          format === "wells-fargo"
            ? "Wells Fargo expects a CSV with a date in the first column. If your export looks different, try the Generic option (it auto-detects from headers like 'date' / 'description' / 'amount')."
            : "Generic mode expects a header row with at least 'date' and 'description' columns plus 'amount' (or 'debit' + 'credit').",
      },
      { status: 400 }
    );
  }

  // Stage rows: compute hashes, look up existing rows to mark duplicates,
  // apply category rules.
  // Occurrence-aware hashes — identical (date, amount, description) rows
  // within a single batch get unique hashes so the DB unique constraint
  // doesn't collapse two legitimate same-day same-merchant charges into
  // one row. See lib/finance/dedup.ts for the full reasoning.
  const hashes = batchDedupHashes(parsed);
  const { data: existing } = await supabase
    .from("fin_transactions")
    .select("dedup_hash")
    .in("dedup_hash", hashes);
  const existingSet = new Set((existing ?? []).map((r) => r.dedup_hash));

  const rules = await loadRules(supabase);
  const ruleHits = new Map<string, number>();

  const staged: StagedTxn[] = parsed.map((p, i) => {
    const rule = matchRule(p.description, rules);
    if (rule) ruleHits.set(rule.id, (ruleHits.get(rule.id) ?? 0) + 1);
    return {
      ...p,
      dedup_hash: hashes[i],
      category_id: rule?.category_id ?? null,
      matched_rule_id: rule?.id ?? null,
      is_duplicate: existingSet.has(hashes[i]),
    };
  });

  const newRows = staged.filter((r) => !r.is_duplicate);
  const dupCount = staged.length - newRows.length;
  const categorizedCount = staged.filter((r) => r.category_id !== null).length;

  const inflow = parsed.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const outflow = parsed.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);
  const dates = parsed.map((r) => r.txn_date).sort();
  const periodStart = dates[0] ?? null;
  const periodEnd = dates[dates.length - 1] ?? null;

  const preview: ImportPreview = {
    bank_format: format,
    filename: file.name,
    file_hash: fHash,
    file_already_imported: !!priorImport,
    row_count: parsed.length,
    new_count: newRows.length,
    duplicate_count: dupCount,
    categorized_count: categorizedCount,
    inflow_total: inflow,
    outflow_total: outflow,
    period_start: periodStart,
    period_end: periodEnd,
    rows: staged.slice(0, 50),
  };

  if (mode === "preview") {
    return NextResponse.json({ ok: true, preview });
  }

  // mode === "commit". Refuse to re-apply an identical file.
  if (priorImport) {
    return NextResponse.json(
      {
        ok: false,
        error: `This exact file was already imported on ${new Date(priorImport.uploaded_at).toLocaleDateString()}. ${priorImport.inserted_count} transactions were inserted at that time.`,
      },
      { status: 409 }
    );
  }
  if (newRows.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "Every transaction in this file already exists. Nothing to import.",
      },
      { status: 409 }
    );
  }

  const insertRows = newRows.map((r) => ({
    txn_date: r.txn_date,
    description: r.description,
    amount: r.amount,
    category_id: r.category_id,
    dedup_hash: r.dedup_hash,
    source_file: file.name,
    uploaded_by: user,
  }));

  const { error: insErr, count: insCount } = await supabase
    .from("fin_transactions")
    .insert(insertRows, { count: "exact" });
  if (insErr) {
    console.error("[finance import] insert failed:", insErr);
    return NextResponse.json(
      { error: `Insert failed: ${insErr.message}` },
      { status: 500 }
    );
  }

  const { error: impErr } = await supabase.from("fin_imports").insert({
    filename: file.name,
    file_hash: fHash,
    bank_format: format,
    row_count: parsed.length,
    inserted_count: insCount ?? insertRows.length,
    duplicate_count: dupCount,
    period_start: periodStart,
    period_end: periodEnd,
    uploaded_by: user,
  });
  if (impErr) {
    // Insertion already happened — log but don't fail the response.
    console.error("[finance import] audit row insert failed:", impErr.message);
  }

  await bumpHitCounts(supabase, ruleHits);

  await audit(req, {
    action: "finance.transactions.import",
    entityType: "fin_transactions",
    after: {
      filename: file.name,
      inserted: insCount ?? insertRows.length,
      duplicates_skipped: dupCount,
    },
  });
  return NextResponse.json({
    ok: true,
    inserted: insCount ?? insertRows.length,
    duplicates_skipped: dupCount,
    categorized: categorizedCount,
    period_start: periodStart,
    period_end: periodEnd,
  });
}
