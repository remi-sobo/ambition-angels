import { describe, expect, test } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ALIASES,
  BASELINE,
  diffLedger,
  readMigrationFiles,
} from "../scripts/check-migration-ledger";

/**
 * The migration-ledger drift guard (scripts/check-migration-ledger.ts).
 *
 * Production's applied-migration ledger and supabase/migrations/ drifted in
 * both directions for weeks while CI stayed green, because nothing compared
 * them. These tests cover the comparison itself; the workflow runs it against
 * production on every PR.
 */

const FOLDER = join(__dirname, "..", "supabase", "migrations");

describe("ledger ↔ folder diff", () => {
  test("a migration applied with no committed file is named", () => {
    const d = diffLedger({
      ledgerNames: ["create_thing", "drop_product_table_org_id_defaults"],
      fileNames: ["create_thing"],
      aliases: {},
    });
    expect(d.ledgerOnly).toEqual(["drop_product_table_org_id_defaults"]);
    expect(d.fileOnly).toEqual([]);
  });

  test("a committed file that was never applied is named", () => {
    const d = diffLedger({
      ledgerNames: ["create_thing"],
      fileNames: ["create_thing", "hs_sync_jobs_add_totals"],
      aliases: {},
    });
    expect(d.fileOnly).toEqual(["hs_sync_jobs_add_totals"]);
    expect(d.ledgerOnly).toEqual([]);
  });

  test("both directions are reported from one run", () => {
    const d = diffLedger({
      ledgerNames: ["applied_only"],
      fileNames: ["committed_only"],
      aliases: {},
    });
    expect(d.ledgerOnly).toEqual(["applied_only"]);
    expect(d.fileOnly).toEqual(["committed_only"]);
  });

  test("an aligned pair is silent", () => {
    const d = diffLedger({ ledgerNames: ["a", "b"], fileNames: ["b", "a"], aliases: {} });
    expect(d).toEqual({ ledgerOnly: [], fileOnly: [], staleBaseline: [] });
  });

  test("*.MANUAL.sql is excluded, matching scripts/test-rls.sh", () => {
    const d = diffLedger({
      ledgerNames: [],
      fileNames: ["2026_ogsm_reseed.MANUAL", "real_migration"],
      aliases: {},
    });
    expect(d.fileOnly).toEqual(["real_migration"]);
  });

  test("a recorded alias pairs a ledger name with its differing filename", () => {
    const d = diffLedger({
      ledgerNames: ["rls_reed_phase1"],
      fileNames: ["rls_reed_phase1_four_tables"],
      aliases: { rls_reed_phase1: "rls_reed_phase1_four_tables" },
    });
    expect(d).toEqual({ ledgerOnly: [], fileOnly: [], staleBaseline: [] });
  });
});

describe("the baseline is a ratchet, not an exception list", () => {
  const baseline = { ledgerOnly: ["known_applied"], fileOnly: ["known_committed"] };

  test("known divergence is suppressed", () => {
    const d = diffLedger({
      ledgerNames: ["known_applied"],
      fileNames: ["known_committed"],
      aliases: {},
      baseline,
    });
    expect(d.ledgerOnly).toEqual([]);
    expect(d.fileOnly).toEqual([]);
    expect(d.staleBaseline).toEqual([]);
  });

  test("NEW drift still fails even while the baseline is non-empty", () => {
    const d = diffLedger({
      ledgerNames: ["known_applied", "applied_today_by_hand"],
      fileNames: ["known_committed", "committed_today_unapplied"],
      aliases: {},
      baseline,
    });
    expect(d.ledgerOnly).toEqual(["applied_today_by_hand"]);
    expect(d.fileOnly).toEqual(["committed_today_unapplied"]);
  });

  test("a reconciled entry left in the baseline fails, so it can only shrink", () => {
    const d = diffLedger({
      // Both sides now agree on the two formerly-divergent names.
      ledgerNames: ["known_applied", "known_committed"],
      fileNames: ["known_applied", "known_committed"],
      aliases: {},
      baseline,
    });
    expect(d.staleBaseline).toEqual(["file:known_committed", "ledger:known_applied"]);
  });
});

describe("the committed baseline and aliases stay honest", () => {
  test("every baselined file, and every alias target, still exists on disk", () => {
    const onDisk = new Set(readMigrationFiles(FOLDER));
    const missing = [
      ...BASELINE.fileOnly.filter((f) => !onDisk.has(f)).map((f) => `baseline fileOnly: ${f}`),
      ...Object.entries(ALIASES)
        .filter(([, file]) => !onDisk.has(file))
        .map(([ledger, file]) => `alias ${ledger} → ${file}`),
    ];
    expect(missing).toEqual([]);
  });

  test("no name is baselined in both directions at once", () => {
    const both = BASELINE.ledgerOnly.filter((n) => BASELINE.fileOnly.includes(n));
    expect(both).toEqual([]);
  });

  test("readMigrationFiles reads the real folder and strips .sql", () => {
    const files = readMigrationFiles(FOLDER);
    const rawSql = readdirSync(FOLDER).filter((f) => f.endsWith(".sql"));
    expect(files).toHaveLength(rawSql.length);
    expect(files.every((f) => !f.endsWith(".sql"))).toBe(true);
  });
});
