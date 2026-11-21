/**
 * BloomOS operator setup (V4 Stage F, specs/bloomos-v4-product-readiness.md §11).
 *
 * One answers file in, one org out: the org (name, slug, legal name,
 * address, EIN, time zone), entitlements from a named plan, terminology,
 * participant stages, the default pipeline and its stages, starter finance
 * categories (fin_seed_starter_categories), the fiscal year, a default
 * thank-you template, and the owner's invite (the same path as Settings →
 * People and roles). Two operator actions per org: fill the file, run this.
 *
 *   npx tsx scripts/setup-org.ts answers.json                 # dry run (default)
 *   npx tsx scripts/setup-org.ts answers.json --apply         # write
 *   npx tsx scripts/setup-org.ts answers.yaml --apply --i-mean-production
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_ORIGIN (the
 * admin host, for the invite link). SETUP_NON_PRODUCTION_HOSTS: a
 * comma-separated list of Supabase hosts that are NOT production (staging,
 * a throwaway project). Any other non-local host counts as production, and
 * the script refuses it unless --i-mean-production is passed AND the slug
 * does not exist there yet.
 *
 * Idempotent: every step checks what exists first, so a second --apply is a
 * no-op and a run cut off half way is finished by running it again. There is
 * no cross-table transaction through the Supabase API; the planner validates
 * the whole file and reads the current state before anything is written.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import { validateAnswers } from "../lib/admin/onboarding/answers";
import { applySetup, formatPlan, isProductionTarget, planSetup, productionGuard } from "../lib/admin/onboarding/planner";
import { supabaseSetupReader, supabaseSetupWriter } from "../lib/admin/onboarding/supabase-io";

function parseAnswersFile(path: string): unknown {
  const text = readFileSync(path, "utf8");
  if (/\.ya?ml$/i.test(path)) {
    let yaml: { load: (s: string) => unknown };
    try {
      yaml = createRequire(import.meta.url)("js-yaml");
    } catch {
      throw new Error("Reading YAML needs the js-yaml package, which is not installed here. Use the JSON format instead.");
    }
    return yaml.load(text);
  }
  return JSON.parse(text);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const apply = args.includes("--apply");
  const iMeanProduction = args.includes("--i-mean-production");
  if (!file) {
    console.error("Usage: npx tsx scripts/setup-org.ts <answers.json|yaml> [--apply] [--i-mean-production]");
    return 2;
  }

  const checked = validateAnswers(parseAnswersFile(file));
  if (!checked.ok) {
    console.error("The answers file needs fixing:\n" + checked.problems.map((p) => `  - ${p}`).join("\n"));
    return 1;
  }
  const answers = checked.answers;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    return 2;
  }
  const origin = (process.env.APP_ORIGIN ?? "").replace(/\/+$/, "");
  if (apply && !origin) {
    console.error("Set APP_ORIGIN (the admin host) so the owner's invite link lands in the right place.");
    return 2;
  }
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const reader = supabaseSetupReader(sb);

  const existing = await reader.findOrgBySlug(answers.org.slug);
  const guard = productionGuard({
    production: isProductionTarget(url, process.env.SETUP_NON_PRODUCTION_HOSTS ?? ""),
    iMeanProduction,
    orgExists: !!existing,
    slug: answers.org.slug,
  });
  if (!guard.ok) {
    console.error(guard.reason);
    return 3;
  }

  const plan = await planSetup(answers, reader);
  console.log(formatPlan(plan, apply));
  if (!apply) return 0;

  const writer = supabaseSetupWriter(sb, `${origin}/auth/callback?next=/admin/reset-password`);
  const result = await applySetup(plan, answers, writer, existing);
  console.log(`Done. Org id ${result.orgId}. Steps applied: ${result.done.join(", ") || "none"}.`);
  for (const n of result.notes) console.log(`  ${n}`);
  console.log("Next: add the owner as a Google OAuth test user until the app is verified (runbook O9).");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`Stopped: ${e instanceof Error ? e.message : String(e)}. Re-run to finish; finished steps are skipped.`);
    process.exit(1);
  },
);
