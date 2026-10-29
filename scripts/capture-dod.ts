/**
 * Capture V1 matcher bar (specs/bloomos-capture.md, Definition of done):
 * 20 real recorded notes, the right record or a correct hold on at least 18,
 * a wrong record on zero. Not wired into CI.
 *
 *   npx tsx scripts/capture-dod.ts --key <answer-key.json> --captures <export.json>
 *   npx tsx scripts/capture-dod.ts --sql <since ISO time>     # prints the export query
 *
 * The answer key and the export name real donors, so neither belongs in git.
 * Keep them in tests/fixtures/capture/private/ (gitignored) or anywhere
 * outside the repo. The export is a read-only query over captures and
 * capture_cards (run it in the Supabase SQL editor or through the connector)
 * that returns one JSON array; save it as the --captures file.
 *
 * Scoring rules live in lib/capture/evalScore.ts and are unit-tested with
 * fictional data (tests/capture-eval-score.test.ts).
 */

import { readFileSync } from "node:fs";
import { DOD_MAX_WRONG, DOD_MIN_CORRECT, DOD_TOTAL, scoreDod, type AnswerKey, type ExportCapture } from "@/lib/capture/evalScore";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

export function exportSql(sinceIso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}([T ][0-9:.+Z-]*)?$/.test(sinceIso)) throw new Error("--sql needs an ISO date or timestamp");
  return `select coalesce(json_agg(x order by x.created_at), '[]'::json) from (
  select c.id, c.created_at, c.source_surface, c.context_id, c.transcript,
         coalesce((select json_agg(json_build_object(
                    'dest', k.dest, 'status', k.status, 'entity_type', k.entity_type,
                    'entity_id', k.entity_id, 'heard_name', k.heard_name,
                    'match_candidates', k.match_candidates) order by k.position)
                   from public.capture_cards k where k.capture_id = c.id), '[]'::json) as cards
  from public.captures c
  where c.created_at >= '${sinceIso}'
    and c.status in ('ready', 'done')
) x;`;
}

function main() {
  const since = arg("sql");
  if (since) {
    console.log(exportSql(since));
    return;
  }
  const keyPath = arg("key");
  const capPath = arg("captures");
  if (!keyPath || !capPath) {
    console.log("usage: npx tsx scripts/capture-dod.ts --key <answer-key.json> --captures <export.json>");
    console.log("       npx tsx scripts/capture-dod.ts --sql <since ISO time>");
    process.exitCode = 2;
    return;
  }
  const key = JSON.parse(readFileSync(keyPath, "utf8")) as AnswerKey;
  const captures = JSON.parse(readFileSync(capPath, "utf8")) as ExportCapture[];
  const report = scoreDod(key, captures);

  const table = report.results.flatMap((r) =>
    r.rows.map((row, i) => ({
      note: i === 0 ? r.n : "",
      note_result: i === 0 ? r.outcome.toUpperCase() : "",
      expected: row.label,
      got: `${row.outcome}: ${row.detail}`,
      dest: row.destOk === null ? "" : row.destOk ? "ok" : "MISSING",
      match: i === 0 ? (r.captureId ? r.similarity.toFixed(2) : "not recorded") : "",
      wrong_filing: i === 0 && r.wrongFilings.length ? r.wrongFilings.join(", ") : "",
    })),
  );
  console.table(table);
  console.log(
    `\nCorrect ${report.correct} of ${report.results.length} (need ${DOD_MIN_CORRECT} of ${DOD_TOTAL}). ` +
      `Wrong ${report.wrong} (need ${DOD_MAX_WRONG}). Missed ${report.miss}${report.unrecorded ? `, ${report.unrecorded} not recorded` : ""}.`,
  );
  console.log(report.pass ? "PASS: the V1 matcher bar is met." : "NOT MET.");
  process.exitCode = report.pass ? 0 : 1;
}

// Run only as a script, so the test can import exportSql without the CLI.
if (/capture-dod\.ts$/.test(process.argv[1] ?? "")) main();
