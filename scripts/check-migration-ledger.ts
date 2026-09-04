/**
 * Migration-ledger drift guard (CI, every PR).
 *
 * Production records every migration applied through the Supabase tooling in
 * `supabase_migrations.schema_migrations`. The repo records every migration
 * that can be rebuilt in `supabase/migrations/`. Nothing compared the two, so
 * they drifted in both directions and CI stayed green through all of it:
 *
 *   - 50 `org_id` default drops were applied on 2026-07-16 and never landed
 *     as a file (`drop_product_table_org_id_defaults`), unreconciled for
 *     seven weeks — the finding that opened docs/schema-drift-audit.md.
 *   - Three committed migrations were never applied, and quietly broke the
 *     Volunteers page, student-leader assignment, and the HubSpot sync
 *     (docs/unapplied-migrations-triage.md).
 *
 * This check reads the ledger read-only and diffs it against the folder, in
 * both directions, on every PR. It names the specific entries, never a count.
 *
 * ── Conventions it honors ──────────────────────────────────────────────────
 * `*.MANUAL.sql` files are data seeds run by hand in the SQL editor, never
 * part of the migration chain (the same exclusion `scripts/test-rls.sh`
 * makes). They are skipped, and the run says so.
 *
 * A handful of migrations were applied under a ledger name that differs from
 * the committed filename. Those pairings are facts about the past, recorded
 * in ALIASES below; each was verified against the ledger's stored statement
 * text during the September 2026 audit.
 *
 * ── The baseline ──────────────────────────────────────────────────────────
 * The divergence that already existed when this guard was written is frozen
 * in BASELINE. Without it the check would fail on every PR until the
 * reconciliation lands, which would make it useless rather than strict. It is
 * a ratchet, not an exception list: an entry that stops being divergent must
 * be REMOVED from the baseline or the check fails. It can only shrink, and
 * reconciling the folder empties it.
 *
 * Usage:
 *   MIGRATION_LEDGER_DATABASE_URL=postgres://... node scripts/check-migration-ledger.ts
 */

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Ledger name → committed filename (no .sql), where the two differ.
 *  Verified 2026-09 against the ledger's stored statements. */
export const ALIASES: Record<string, string> = {
  add_meeting_location_options_and_rename_meet_url: "add_meeting_location_options",
  add_meeting_type_duration_options_and_other_type: "add_meeting_type_duration_options",
  fin_reconciliation_items: "create_fin_reconciliation_items",
  fr_prospect_promoted: "create_fr_prospect_promoted",
  fr_prospects_bench: "create_fr_prospects",
  rls_reed_phase1: "rls_reed_phase1_four_tables",
  tasks_tier1_priority_subtasks_status_category: "upgrade_ops_tasks_priority_subtasks_labels",
};

export type LedgerDiff = {
  /** Applied to production, no file in the folder. Someone applied DDL that
   *  cannot be rebuilt. */
  ledgerOnly: string[];
  /** Committed to the folder, never applied. The database is missing what the
   *  code assumes. */
  fileOnly: string[];
  /** Baseline entries that are no longer divergent — the ratchet closing. */
  staleBaseline: string[];
};

export function diffLedger(args: {
  ledgerNames: readonly string[];
  fileNames: readonly string[];
  aliases?: Record<string, string>;
  baseline?: { ledgerOnly: readonly string[]; fileOnly: readonly string[] };
}): LedgerDiff {
  const aliases = args.aliases ?? ALIASES;
  const baseline = args.baseline ?? { ledgerOnly: [], fileOnly: [] };

  // `.MANUAL.sql` files are not part of the migration chain (repo convention,
  // mirrored from scripts/test-rls.sh).
  const files = new Set(args.fileNames.filter((f) => !f.endsWith(".MANUAL")));
  // A ledger entry matches a file under its own name or its recorded alias.
  const ledgerToFile = (name: string) => aliases[name] ?? name;
  const claimedByLedger = new Set(args.ledgerNames.map(ledgerToFile));

  const ledgerOnly = args.ledgerNames.filter((n) => !files.has(ledgerToFile(n))).sort();
  const fileOnly = Array.from(files).filter((f) => !claimedByLedger.has(f)).sort();

  const inLedgerOnly = new Set(ledgerOnly);
  const inFileOnly = new Set(fileOnly);
  const staleBaseline = [
    ...baseline.ledgerOnly.filter((n) => !inLedgerOnly.has(n)).map((n) => `ledger:${n}`),
    ...baseline.fileOnly.filter((n) => !inFileOnly.has(n)).map((n) => `file:${n}`),
  ].sort();

  return {
    ledgerOnly: ledgerOnly.filter((n) => !baseline.ledgerOnly.includes(n)),
    fileOnly: fileOnly.filter((n) => !baseline.fileOnly.includes(n)),
    staleBaseline,
  };
}

export function readMigrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.slice(0, -".sql".length));
}

function readLedger(databaseUrl: string): string[] {
  const out = execFileSync(
    "psql",
    [
      databaseUrl,
      "--no-psqlrc",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "select name from supabase_migrations.schema_migrations order by version",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

function main(): void {
  const url = process.env.MIGRATION_LEDGER_DATABASE_URL;
  if (!url) {
    console.error(
      "MIGRATION_LEDGER_DATABASE_URL is not set.\n\n" +
        "This check reads production's migration ledger read-only. Create the\n" +
        "scoped role in supabase/roles/migration_ledger_reader.sql, then store its\n" +
        "connection string as the MIGRATION_LEDGER_DATABASE_URL repository secret.\n" +
        "It needs USAGE on supabase_migrations and SELECT on schema_migrations —\n" +
        "nothing else. Do not point this at SUPABASE_DB_URL."
    );
    process.exit(1);
  }

  const repoRoot = process.cwd();
  const fileNames = readMigrationFiles(join(repoRoot, "supabase", "migrations"));
  const ledgerNames = readLedger(url);
  const manual = fileNames.filter((f) => f.endsWith(".MANUAL"));
  const diff = diffLedger({ ledgerNames, fileNames, baseline: BASELINE });

  console.log(
    `Ledger entries: ${ledgerNames.length}\n` +
      `Migration files: ${fileNames.length} (${manual.length} *.MANUAL.sql skipped by repo convention)\n` +
      `Recorded aliases: ${Object.keys(ALIASES).length}\n` +
      `Baseline: ${BASELINE.ledgerOnly.length} ledger-only, ${BASELINE.fileOnly.length} file-only`
  );

  let failed = false;

  if (diff.ledgerOnly.length > 0) {
    failed = true;
    console.error(
      `\n✖ Applied to production, NOT in supabase/migrations/ (${diff.ledgerOnly.length}):\n` +
        diff.ledgerOnly.map((n) => `    ${n}`).join("\n") +
        `\n\n  DDL was applied that the folder cannot rebuild. Recover the statement\n` +
        `  text from the ledger and commit it as a file:\n` +
        `    select statements from supabase_migrations.schema_migrations where name = '<name>';\n` +
        `  Then register the file in the ordered list in scripts/test-rls.sh.\n` +
        `  If it was applied under a different filename, add the pairing to ALIASES.`
    );
  }

  if (diff.fileOnly.length > 0) {
    failed = true;
    console.error(
      `\n✖ In supabase/migrations/, NEVER applied to production (${diff.fileOnly.length}):\n` +
        diff.fileOnly.map((n) => `    ${n}`).join("\n") +
        `\n\n  Production is missing what this code assumes. Apply each one before\n` +
        `  merging (Actions → "Apply DB migration"), then re-run this check.\n` +
        `  A migration that ships unapplied breaks the feature that reads it.`
    );
  }

  if (diff.staleBaseline.length > 0) {
    failed = true;
    console.error(
      `\n✖ Baseline entries that are no longer divergent (${diff.staleBaseline.length}):\n` +
        diff.staleBaseline.map((n) => `    ${n}`).join("\n") +
        `\n\n  These are reconciled. Remove them from BASELINE in this script — the\n` +
        `  baseline is a ratchet and may only shrink.`
    );
  }

  const remaining = BASELINE.ledgerOnly.length + BASELINE.fileOnly.length;
  if (!failed) {
    console.log(
      `\n✓ No new drift between the ledger and the folder.` +
        (remaining > 0
          ? `\n  ${remaining} known divergence(s) remain in the baseline, pending the` +
            `\n  folder reconciliation. See docs/schema-drift-audit.md.`
          : "")
    );
  }

  process.exit(failed ? 1 : 0);
}

/**
 * Divergence that already existed on 2026-09-03, generated by running this
 * check against production. Every entry is classified in
 * docs/unapplied-migrations-triage.md. Reconciling the folder empties this.
 */
export const BASELINE: { ledgerOnly: string[]; fileOnly: string[] } = {
  // Applied to production, no file. Classified in
  // docs/unapplied-migrations-triage.md §4.1 — the comms module, the Step 13
  // default drops, fin_config's per-org restructure, and the rest.
  ledgerOnly: [
    "bloomos_briefing_narrative",
    "bloomos_staff_phase2b_shim_and_seed",
    "bv_showcase_submissions",
    "comms_phase1_story_schema",
    "comms_phase2_storage",
    "comms_phase2_views",
    "comms_phase3_outputs",
    "comms_phase4_editions",
    "comms_phase6_loop",
    "create_bv_newsletter_subscribers",
    "drop_product_table_org_id_defaults",
    "enable_rls_exposed_tables",
    "fin_config_org_scoped_restructure",
    "funder_angles_prospect_link",
    "harden_ygb_rls_and_indexes",
    "hubspot_bench_candidates",
    "partner_interactions_external_idx_full",
    "prospect_scores_briefs_by_prospect_id",
    "reed_has_permission_revoke_anon",
    "spec_a_v_obligations",
    "strategy_objective_soft_delete",
  ],
  // In the folder, never applied. Classified in
  // docs/unapplied-migrations-triage.md §3 and §4: mostly reconstructions of
  // pre-ledger tables and SQL-editor applications, plus the three
  // never-applied-BREAKING files (add_constituents_is_volunteer,
  // add_students_leader_id, hs_sync_jobs_add_totals) that production is
  // genuinely missing.
  fileOnly: [
    "add_constituents_is_volunteer",
    "add_planned_week_to_ops_tasks",
    "add_students_leader_id",
    "archive_migrated_partnership_opportunities",
    "close_projects_of_terminal_grants",
    "consolidate_partnership_pipeline_into_partners",
    "create_bloomos_briefing_state",
    "create_donations",
    "create_fin_schema",
    "create_fr_agent_schema",
    "create_hs_mirror_and_fr_scores",
    "create_hs_sync_jobs",
    "create_ops_projects_and_tasks",
    "create_partner_waitlist",
    "create_quiz_submissions",
    "create_ygb_schema",
    "dedup_commitments_against_gifts",
    "drop_households_org_id_default",
    "fix_due_tier_overdue_commitments_and_stale_grants",
    "fr_sync_exclude_partnership_pipeline",
    "hs_sync_jobs_add_totals",
    "seed_aa_ai_prospect_research",
    "seed_aa_hubspot_mirror_entitlement",
    "seed_partners_2026",
    "update_donations_schema",
  ],
};

// Run only when invoked directly; importing this module (vitest) must not
// touch the network or exit the process.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
