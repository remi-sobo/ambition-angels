/**
 * Capture matcher eval (specs/bloomos-capture.md, C2 step 10). Not wired into CI.
 *
 *   npm run capture:eval
 *
 * Reads tests/fixtures/capture/*.json (transcript + the dest and entity name
 * expected per card) and runs the parse pipeline's functions directly:
 * spans -> candidates (the capture_match_candidates RPC, as the signed-in
 * user) -> prompt -> one structured model call -> validator. Prints a
 * pass/fail table. A fixture passes when every expected card has a produced
 * card with the same dest whose matched record or heard name contains the
 * expected entity (or no entity was expected).
 *
 * It needs a SESSION, not the service role: the RPC is SECURITY INVOKER and
 * RLS decides what the user can match. Provide:
 *
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY   (as in .env.local)
 *   CAPTURE_EVAL_ACCESS_TOKEN   a user access token (JWT) for the operator.
 *                               In the browser, signed in to /admin, run
 *                               `(await supabase.auth.getSession()).data.session.access_token`
 *                               in the console, or copy it from the sb-*-auth-token cookie.
 *   CAPTURE_EVAL_ORG_ID         the org uuid to match within (the active org).
 *   ANTHROPIC_API_KEY           for the model call.
 *
 * Without a token or org id, it prints the spans and the exact prompt each
 * fixture would send (with an empty candidate list) and exits 0, so the prompt
 * can be reviewed without a database.
 *
 * Never writes: no captures row, no cards, no ledger row. That is the route's job.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { generateStructured } from "@/lib/ai/gateway";
import { CAPTURE_DEFAULT_TZ, CAPTURE_MAX_OUTPUT_TOKENS } from "@/lib/capture/constants";
import { findCandidates } from "@/lib/capture/match";
import { CAPTURE_TOOL, buildCapturePrompt, buildCaptureSystem } from "@/lib/capture/prompt";
import { extractNameSpans } from "@/lib/capture/spans";
import { loadStaff } from "@/lib/capture/staff";
import type { Candidate, StaffMember, ValidatedCard } from "@/lib/capture/types";
import { parseCaptureCards } from "@/lib/capture/validate";

type Fixture = {
  name: string;
  transcript: string;
  context: null | { type: string; id: string };
  expected: { dest: string; entity: string | null }[];
  expected_youth_skipped_min?: number;
};

const DIR = join(process.cwd(), "tests", "fixtures", "capture");

function loadFixtures(): { file: string; fx: Fixture }[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => ({ file, fx: JSON.parse(readFileSync(join(DIR, file), "utf8")) as Fixture }));
}

function todayIso(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function cardLabel(c: ValidatedCard, candidates: Candidate[]): string {
  const match = c.entity_id ? candidates.find((k) => k.id === c.entity_id)?.name : null;
  return match ?? c.heard_name ?? "";
}

function judge(fx: Fixture, cards: ValidatedCard[], candidates: Candidate[], youthSkipped: number) {
  const used = new Set<number>();
  const rows = fx.expected.map((e) => {
    const idx = cards.findIndex((c, i) => {
      if (used.has(i) || c.dest !== e.dest) return false;
      if (!e.entity) return true;
      return cardLabel(c, candidates).toLowerCase().includes(e.entity.toLowerCase());
    });
    if (idx >= 0) used.add(idx);
    const got = idx >= 0 ? cards[idx] : null;
    return {
      expected: `${e.dest}${e.entity ? ` · ${e.entity}` : ""}`,
      got: got ? `${got.dest} · ${cardLabel(got, candidates) || "(no entity)"} · ${got.status}` : "(none)",
      pass: idx >= 0,
    };
  });
  const youthOk = fx.expected_youth_skipped_min === undefined || youthSkipped >= fx.expected_youth_skipped_min;
  if (fx.expected_youth_skipped_min !== undefined) {
    rows.push({ expected: `youth_skipped >= ${fx.expected_youth_skipped_min}`, got: String(youthSkipped), pass: youthOk });
  }
  return rows;
}

async function main() {
  const fixtures = loadFixtures();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = process.env.CAPTURE_EVAL_ACCESS_TOKEN;
  const orgId = process.env.CAPTURE_EVAL_ORG_ID;
  const tz = CAPTURE_DEFAULT_TZ;
  const today = todayIso(tz);

  if (!url || !anon || !token || !orgId) {
    console.log("No session (set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, CAPTURE_EVAL_ACCESS_TOKEN, CAPTURE_EVAL_ORG_ID).");
    console.log("Printing spans and the prompt each fixture would send, with no candidates.\n");
    for (const { file, fx } of fixtures) {
      const spans = extractNameSpans(fx.transcript);
      console.log(`=== ${file}: ${fx.name}`);
      console.log(`spans: ${JSON.stringify(spans)}`);
      console.log("--- system ---");
      console.log(buildCaptureSystem());
      console.log("--- prompt ---");
      console.log(buildCapturePrompt({ transcript: fx.transcript, todayIso: today, tz, userName: "the operator", staff: [], context: null, candidates: [] }));
      console.log("");
    }
    return;
  }

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const staff: StaffMember[] = await loadStaff(supabase, orgId);
  let failures = 0;
  const table: { fixture: string; expected: string; got: string; pass: string }[] = [];

  for (const { file, fx } of fixtures) {
    const spans = extractNameSpans(fx.transcript);
    const { candidates } = await findCandidates(supabase, orgId, spans, null);
    const result = await generateStructured({
      system: buildCaptureSystem(),
      prompt: buildCapturePrompt({ transcript: fx.transcript, todayIso: today, tz, userName: "the operator", staff, context: null, candidates }),
      tier: "fast",
      maxTokens: CAPTURE_MAX_OUTPUT_TOKENS,
      tool: CAPTURE_TOOL,
    });
    const parsed = parseCaptureCards(result.input, { candidates, staff, todayIso: today });
    for (const row of judge(fx, parsed.cards, candidates, parsed.youthSkipped)) {
      if (!row.pass) failures += 1;
      table.push({ fixture: file, expected: row.expected, got: row.got, pass: row.pass ? "PASS" : "FAIL" });
    }
    table.push({ fixture: file, expected: "(cost)", got: `$${result.costUsd.toFixed(4)} · ${parsed.cards.length} cards · ${parsed.dropped.length} dropped`, pass: "" });
  }

  console.table(table);
  console.log(failures === 0 ? "All fixtures passed." : `${failures} expectation(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
