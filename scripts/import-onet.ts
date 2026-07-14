/**
 * O*NET + BLS OEWS import → ms_occupations (specs/ms-career-library-v2.md).
 *
 * A CSV download and a script. It runs once, then annually. It is not a
 * service, and it must never become one.
 *
 * What it does:
 *   1. Reads the O*NET database text files (tab-delimited):
 *        Occupation Data.txt   → title, description
 *        Interests.txt         → RIASEC profile (OI scale, elements 1.B.1.a–f)
 *        Job Zones.txt         → job_zone 1..5
 *        Alternate Titles.txt  → title_variants (optional file)
 *        Task Statements.txt   → top task statements (optional file)
 *   2. Reads the BLS OEWS national file as CSV (export national_M2024_dl.xlsx
 *      to CSV) → pay_median (A_MEDIAN), pay_p90 (A_PCT90) per SOC.
 *   3. Joins on the 6-digit SOC code and upserts ms_occupations.
 *   4. Re-renders clue_6 / clue_7 on every existing card from the fresh
 *      data (lib/ms/render.ts is the single source of those sentences), so
 *      an annual re-import updates pay without touching reviewed prose.
 *
 * Only base occupations (O*NET-SOC ending in .00) are imported: they map
 * 1:1 onto BLS SOC codes, which is the dedup key
 * (specs/ms-career-library-addendum.md "The dedup key is the SOC code").
 *
 * Usage (from the repo root, with NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in the environment):
 *
 *   npx tsx scripts/import-onet.ts \
 *     --onet-dir ~/Downloads/db_30_3_text \
 *     --oews-csv ~/Downloads/national_M2024_dl.csv \
 *     --pay-as-of "May 2024" \
 *     [--dry-run]
 *
 * --oews-csv is optional: without it the occupations import with null pay
 * and pay_as_of 'pending' (cards fail the pay gate until a pay pass runs —
 * on purpose; a card never ships a made-up number).
 *
 * Handles both O*NET file layouts: 30.x ("Career Interest Types.txt",
 * "Sample of Reported Titles.txt") and the older 29.x ("Interests.txt",
 * "Alternate Titles.txt").
 *
 * Where to get the files:
 *   O*NET:  onetcenter.org → Database → "text" bulk download (public domain,
 *           attribution required — the /ms surfaces carry it).
 *   OEWS:   bls.gov/oes → special requests → oesm24nat.zip → open the
 *           national xlsx and save as CSV. (Note: bls.gov blocks datacenter
 *           IPs — download in a normal browser. supabase/functions/
 *           ms-refresh-oews is the server-side variant and hits the same
 *           wall; a browser download is the reliable path.)
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { renderClue6, renderClue7, NATIONAL_MEDIAN } from "../lib/ms/render";

type Args = { onetDir: string; oewsCsv: string | null; payAsOf: string; dryRun: boolean };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const onetDir = get("--onet-dir");
  if (!onetDir) {
    console.error(
      "Usage: npx tsx scripts/import-onet.ts --onet-dir <dir> [--oews-csv <file>] [--pay-as-of 'May 2024'] [--dry-run]"
    );
    process.exit(1);
  }
  return {
    onetDir,
    oewsCsv: get("--oews-csv") ?? null,
    payAsOf: get("--pay-as-of") ?? "May 2024",
    dryRun: argv.includes("--dry-run"),
  };
}

/** First file in dir that exists, across O*NET 29.x/30.x layouts. */
function firstExisting(dir: string, names: string[]): string | null {
  for (const name of names) {
    const path = join(dir, name);
    if (existsSync(path)) return path;
  }
  return null;
}

// ── Parsers ────────────────────────────────────────────────────────────────

/** O*NET text files are tab-delimited with a header row. */
function readTsv(path: string): Record<string, string>[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  const header = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h.trim()] = (cells[i] ?? "").trim()));
    return row;
  });
}

/** Minimal RFC-4180 CSV parser (quoted fields, embedded commas/quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

/** OEWS wage cells: "62,830", "*" (no estimate), "#" (≥ the top code). */
function parseWage(cell: string | undefined): number | null {
  if (!cell) return null;
  const cleaned = cell.replace(/[,$\s]/g, "");
  if (!/^\d+$/.test(cleaned)) return null; // "*", "#", blanks → null
  return parseInt(cleaned, 10);
}

// O*NET Interests element ids → RIASEC keys.
const ELEMENT_TO_KEY: Record<string, string> = {
  "1.B.1.a": "R",
  "1.B.1.b": "I",
  "1.B.1.c": "A",
  "1.B.1.d": "S",
  "1.B.1.e": "E",
  "1.B.1.f": "C",
};

type OccRow = {
  soc_code: string;
  onet_soc_code: string;
  title: string;
  title_variants: string[];
  description: string | null;
  tasks: string[];
  riasec: Record<string, number>;
  job_zone: number;
  pay_median: number | null;
  pay_p90: number | null;
  pay_source_url: string;
  pay_as_of: string;
};

async function main() {
  const args = parseArgs();

  // ── O*NET (30.x names first, 29.x fallbacks) ─────────────────────────────
  const occFile = firstExisting(args.onetDir, ["Occupation Data.txt"]);
  const interestsFile = firstExisting(args.onetDir, ["Career Interest Types.txt", "Interests.txt"]);
  const zonesFile = firstExisting(args.onetDir, ["Job Zones.txt"]);
  if (!occFile || !interestsFile || !zonesFile) {
    console.error(
      `Missing required O*NET file(s) in ${args.onetDir}: need Occupation Data.txt, ` +
        `Career Interest Types.txt (or Interests.txt), Job Zones.txt`
    );
    process.exit(1);
  }

  const occupations = readTsv(occFile); // O*NET-SOC Code, Title, Description
  const interests = readTsv(interestsFile); // O*NET-SOC Code, Element ID, Scale ID, Data Value
  const zones = readTsv(zonesFile); // O*NET-SOC Code, Job Zone

  const riasecByOnet = new Map<string, Record<string, number>>();
  for (const row of interests) {
    const key = ELEMENT_TO_KEY[row["Element ID"]];
    if (!key) continue;
    if ((row["Scale ID"] ?? "OI") !== "OI") continue; // interest level, not high-point
    const onetCode = row["O*NET-SOC Code"];
    const value = parseFloat(row["Data Value"]);
    if (!onetCode || !Number.isFinite(value)) continue;
    const profile = riasecByOnet.get(onetCode) ?? {};
    profile[key] = value;
    riasecByOnet.set(onetCode, profile);
  }

  const zoneByOnet = new Map<string, number>();
  for (const row of zones) {
    const z = parseInt(row["Job Zone"], 10);
    if (row["O*NET-SOC Code"] && z >= 1 && z <= 5) zoneByOnet.set(row["O*NET-SOC Code"], z);
  }

  const variantsByOnet = new Map<string, string[]>();
  const altFile = firstExisting(args.onetDir, ["Sample of Reported Titles.txt", "Alternate Titles.txt"]);
  if (altFile) {
    for (const row of readTsv(altFile)) {
      const code = row["O*NET-SOC Code"];
      const alt = row["Reported Job Title"] || row["Alternate Title"];
      if (!code || !alt) continue;
      const list = variantsByOnet.get(code) ?? [];
      if (list.length < 20 && !list.includes(alt)) list.push(alt);
      variantsByOnet.set(code, list);
    }
  } else {
    console.warn("No titles file found — title_variants will be empty (gates get weaker).");
  }

  const tasksByOnet = new Map<string, string[]>();
  const tasksFile = firstExisting(args.onetDir, ["Task Statements.txt"]);
  if (tasksFile) {
    for (const row of readTsv(tasksFile)) {
      const code = row["O*NET-SOC Code"];
      const task = row["Task"];
      if (!code || !task) continue;
      // Prefer Core tasks when the column exists (30.x); accept all in 29.x.
      if (row["Task Type"] && row["Task Type"] !== "Core") continue;
      const list = tasksByOnet.get(code) ?? [];
      if (list.length < 8) list.push(task);
      tasksByOnet.set(code, list);
    }
  } else {
    console.warn("Task Statements.txt not found — generator grounding will rely on descriptions only.");
  }

  // ── OEWS (optional; without it pay stays null and pay_as_of 'pending') ───
  const payBySoc = new Map<string, { median: number | null; p90: number | null }>();
  if (args.oewsCsv) {
    const oewsRows = parseCsv(readFileSync(args.oewsCsv, "utf8"));
    const header = oewsRows[0].map((h) => h.trim().toUpperCase());
    const col = (name: string) => header.indexOf(name);
    const iOcc = col("OCC_CODE");
    const iGroup = col("O_GROUP");
    const iMedian = col("A_MEDIAN");
    const iP90 = col("A_PCT90");
    if (iOcc === -1 || iMedian === -1) {
      console.error(`OEWS CSV missing OCC_CODE/A_MEDIAN columns. Found: ${header.join(", ")}`);
      process.exit(1);
    }
    for (const row of oewsRows.slice(1)) {
      if (iGroup !== -1 && row[iGroup]?.trim() !== "detailed") continue;
      const soc = row[iOcc]?.trim();
      if (!soc) continue;
      payBySoc.set(soc, { median: parseWage(row[iMedian]), p90: iP90 === -1 ? null : parseWage(row[iP90]) });
    }
  } else {
    console.warn("--oews-csv not given: importing without pay. Cards fail the pay gate until a pay pass runs.");
  }

  if (args.payAsOf !== NATIONAL_MEDIAN.asOf) {
    console.warn(
      `--pay-as-of "${args.payAsOf}" differs from the national anchor vintage "${NATIONAL_MEDIAN.asOf}" ` +
        `(lib/ms/render.ts NATIONAL_MEDIAN). Update the anchor in the same change or clue 7 will mix vintages.`
    );
  }

  // ── Join: base occupations (.00) only ────────────────────────────────────
  const rows: OccRow[] = [];
  let skippedNoRiasec = 0;
  let skippedNoZone = 0;
  let noPay = 0;
  for (const occ of occupations) {
    const onetCode = occ["O*NET-SOC Code"];
    if (!onetCode || !onetCode.endsWith(".00")) continue;
    const socCode = onetCode.slice(0, -3); // '29-2055.00' → '29-2055'
    const riasec = riasecByOnet.get(onetCode);
    if (!riasec || Object.keys(riasec).length !== 6) {
      skippedNoRiasec++;
      continue;
    }
    const jobZone = zoneByOnet.get(onetCode);
    if (!jobZone) {
      skippedNoZone++;
      continue;
    }
    const pay = payBySoc.get(socCode) ?? { median: null, p90: null };
    if (pay.median == null) noPay++;
    rows.push({
      soc_code: socCode,
      onet_soc_code: onetCode,
      title: occ["Title"],
      title_variants: variantsByOnet.get(onetCode) ?? [],
      description: occ["Description"] || null,
      tasks: tasksByOnet.get(onetCode) ?? [],
      riasec,
      job_zone: jobZone,
      pay_median: pay.median,
      pay_p90: pay.p90,
      pay_source_url: `https://www.bls.gov/oes/current/oes${socCode.replace("-", "")}.htm`,
      pay_as_of: args.oewsCsv ? args.payAsOf : "pending",
    });
  }

  const zoneSpread = [1, 2, 3, 4, 5].map((z) => `JZ${z}: ${rows.filter((r) => r.job_zone === z).length}`);
  console.log(
    `Prepared ${rows.length} occupations (${zoneSpread.join(", ")}). ` +
      `Skipped: ${skippedNoRiasec} without RIASEC, ${skippedNoZone} without Job Zone. ` +
      `${noPay} rows have no OEWS median (they import, but cards for them fail the pay gate until fixed).`
  );

  if (args.dryRun) {
    console.log("--dry-run: nothing written.");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const importedAt = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200).map((r) => ({ ...r, imported_at: importedAt }));
    const { error } = await supabase.from("ms_occupations").upsert(batch, { onConflict: "soc_code" });
    if (error) {
      console.error(`Upsert failed at batch ${i / 200}:`, error.message);
      process.exit(1);
    }
    console.log(`Upserted ${Math.min(i + 200, rows.length)}/${rows.length}`);
  }

  // ── Re-render clues 6–7 on existing cards from the fresh data ────────────
  // Annual re-import keeps reviewed prose intact but never lets pay go stale.
  const { data: cards, error: cardsErr } = await supabase
    .from("ms_cards")
    .select("soc_code, status")
    .neq("status", "retired");
  if (cardsErr) {
    console.error("Could not list cards for re-render:", cardsErr.message);
    process.exit(1);
  }
  // education_typical is not part of this import (it comes from BLS OOH when
  // someone wires that source); read whatever the DB already has so a
  // hand-loaded value survives the re-render.
  const { data: eduRows } = await supabase.from("ms_occupations").select("soc_code, education_typical");
  const eduBySoc = new Map((eduRows ?? []).map((r) => [r.soc_code, r.education_typical as string | null]));

  let rerendered = 0;
  for (const card of cards ?? []) {
    const occ = rows.find((r) => r.soc_code === card.soc_code);
    if (!occ) continue;
    const facts = {
      payMedian: occ.pay_median,
      payP90: occ.pay_p90,
      payAsOf: occ.pay_as_of,
      educationTypical: eduBySoc.get(card.soc_code) ?? null,
      jobZone: occ.job_zone,
    };
    const { error } = await supabase
      .from("ms_cards")
      .update({ clue_6: renderClue6(facts), clue_7: renderClue7(facts) })
      .eq("soc_code", card.soc_code);
    if (error) {
      console.error(`Re-render failed for ${card.soc_code}:`, error.message);
      process.exit(1);
    }
    rerendered++;
  }
  console.log(`Done. ${rows.length} occupations upserted; clues 6–7 re-rendered on ${rerendered} cards.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
