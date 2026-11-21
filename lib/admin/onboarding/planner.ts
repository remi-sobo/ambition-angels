import { PLANS } from "./plans";
import type { SetupAnswers, TermKey } from "./answers";
import { formatAddress, type Settings } from "@/lib/admin/orgIdentity";

/**
 * V4 Stage F: the setup planner behind scripts/setup-org.ts.
 *
 * Two halves, both free of any concrete database:
 *  - planSetup(answers, reader) reads what already exists and returns the
 *    ordered steps, each "create", "update" or "skip" with a plain detail
 *    line. The dry run prints exactly this. Nothing is written.
 *  - applySetup(plan, answers, writer) carries out the non-skip steps in
 *    order. Every write is an insert-if-missing or an upsert, so running
 *    --apply twice is a no-op the second time, and a run cut off half way is
 *    finished by running it again (the planner sees what landed and skips it).
 *
 * The concrete reader/writer (lib/admin/onboarding/supabase-io.ts) uses the
 * service role from the operator's machine. Tests use an in-memory fake
 * (tests/setup-org-planner.test.ts); the script is never run by CI.
 */

export type StepKey =
  | "org"
  | "entitlements"
  | "terminology"
  | "participant_stages"
  | "pipeline"
  | "pipeline_stages"
  | "finance_categories"
  | "fiscal_year"
  | "thank_you_template"
  | "owner";

export type SetupStep = { key: StepKey; action: "create" | "update" | "skip"; detail: string };

export type SetupPlan = {
  orgId: string | null;
  orgExists: boolean;
  steps: SetupStep[];
  /** Missing entitlement keys to add (the plan minus what is on). */
  missingFeatures: string[];
  missingTerms: [TermKey, string][];
  missingParticipantStages: string[];
  missingPipelineStages: string[];
};

export type ExistingOrg = { id: string; name: string; settings: Settings | null };

export interface SetupReader {
  findOrgBySlug(slug: string): Promise<ExistingOrg | null>;
  entitlements(orgId: string): Promise<string[]>;
  terminology(orgId: string): Promise<Record<string, string>>;
  participantStageKeys(orgId: string): Promise<string[]>;
  pipelineKeys(orgId: string): Promise<string[]>;
  pipelineStageKeys(orgId: string, pipeline: string): Promise<string[]>;
  financeCategoryCount(orgId: string): Promise<number>;
  fiscalYearStartMonth(orgId: string): Promise<number | null>;
  hasDefaultGiftTemplate(orgId: string): Promise<boolean>;
  ownerMembership(orgId: string, email: string): Promise<"owner" | "other-role" | "none">;
}

export interface SetupWriter {
  createOrg(row: { name: string; slug: string; settings: Settings }): Promise<string>;
  updateOrg(orgId: string, row: { name: string; settings: Settings }): Promise<void>;
  enableEntitlements(orgId: string, keys: string[], source: string): Promise<void>;
  upsertTerminology(orgId: string, rows: { term_key: string; label: string }[]): Promise<void>;
  insertParticipantStages(orgId: string, rows: Record<string, unknown>[]): Promise<void>;
  insertPipeline(orgId: string, row: { key: string; label: string; is_default: boolean }): Promise<void>;
  insertPipelineStages(orgId: string, rows: Record<string, unknown>[]): Promise<void>;
  seedFinanceCategories(orgId: string): Promise<number>;
  setFiscalYearStart(orgId: string, month: number): Promise<void>;
  insertThankYouTemplate(orgId: string, row: { name: string; subject: string; body: string }): Promise<void>;
  /** Invite through the same path as Settings → People and roles. */
  inviteOwner(orgId: string, email: string): Promise<{ emailed: boolean; existing: boolean }>;
}

const SOURCE = "setup-org";
const MONTH = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The org settings the answers describe, merged over what is there. */
export function settingsFromAnswers(a: SetupAnswers, existing: Settings | null): Settings {
  const out: Settings = {
    ...(existing ?? {}),
    legal_name: a.org.legal_name,
    ein: a.org.ein,
    address: { ...a.org.address },
    mailing_address: formatAddress(a.org.address),
    timezone: a.org.timezone,
  };
  if (a.org.email_domain) out.email_domain = a.org.email_domain;
  if (a.org.support_email) out.support_email = a.org.support_email;
  return out;
}

const IDENTITY_KEYS = ["legal_name", "ein", "mailing_address", "timezone", "email_domain", "support_email"];

function identityDiffers(org: ExistingOrg, a: SetupAnswers): string[] {
  const want = settingsFromAnswers(a, org.settings);
  const have = org.settings ?? {};
  const diff = IDENTITY_KEYS.filter((k) => want[k] !== undefined && want[k] !== have[k]);
  if (org.name !== a.org.name) diff.unshift("name");
  return diff;
}

export async function planSetup(a: SetupAnswers, db: SetupReader): Promise<SetupPlan> {
  const org = await db.findOrgBySlug(a.org.slug);
  const id = org?.id ?? null;
  const steps: SetupStep[] = [];
  const plan = PLANS[a.plan];

  // 1. The org row and its identity.
  if (!org) {
    steps.push({
      key: "org",
      action: "create",
      detail: `Create "${a.org.name}" (${a.org.slug}), legal name ${a.org.legal_name}, EIN ${a.org.ein}, ${formatAddress(a.org.address)}, ${a.org.timezone}.`,
    });
  } else {
    const diff = identityDiffers(org, a);
    steps.push(
      diff.length
        ? { key: "org", action: "update", detail: `"${a.org.slug}" exists. Update ${diff.join(", ")}.` }
        : { key: "org", action: "skip", detail: `"${a.org.slug}" exists with this identity.` },
    );
  }

  // 2. Entitlements from the plan (add missing only).
  const have = id ? new Set(await db.entitlements(id)) : new Set<string>();
  const missingFeatures = plan.features.filter((k) => !have.has(k));
  const extra = Array.from(have).filter((k) => !plan.features.includes(k as never));
  steps.push(
    missingFeatures.length
      ? {
          key: "entitlements",
          action: "create",
          detail: `Turn on ${missingFeatures.length} of the ${plan.label} plan: ${missingFeatures.join(", ")}.${extra.length ? ` Left as is: ${extra.join(", ")}.` : ""}`,
        }
      : { key: "entitlements", action: "skip", detail: `Every ${plan.label} plan module is already on.` },
  );

  // 3. Terminology (only labels that differ).
  const terms = id ? await db.terminology(id) : {};
  const missingTerms = (Object.entries(a.terms) as [TermKey, string][]).filter(([k, v]) => terms[k] !== v);
  steps.push(
    missingTerms.length
      ? { key: "terminology", action: org ? "update" : "create", detail: `Set terms: ${missingTerms.map(([k, v]) => `${k} → "${v}"`).join(", ")}.` }
      : { key: "terminology", action: "skip", detail: Object.keys(a.terms).length ? "Terms already set." : "No terms in the file; BloomOS words stay." },
  );

  // 4. Participant stages (insert missing keys; an org's own stages are never rewritten).
  let missingParticipantStages: string[] = [];
  if (a.participant_stages) {
    const keys = id ? new Set(await db.participantStageKeys(id)) : new Set<string>();
    missingParticipantStages = keys.size ? [] : a.participant_stages.map((s) => s.key);
    steps.push(
      missingParticipantStages.length
        ? { key: "participant_stages", action: "create", detail: `Add participant stages: ${a.participant_stages.map((s) => s.label).join(", ")}.` }
        : { key: "participant_stages", action: "skip", detail: "Participant stages already set; left as they are." },
    );
  } else {
    steps.push({ key: "participant_stages", action: "skip", detail: "Programs is off in this plan; no participant stages." });
  }

  // 5. Default pipeline row, then its stages.
  const pipelines = id ? await db.pipelineKeys(id) : [];
  const hasPipeline = pipelines.includes(a.pipeline.key);
  steps.push(
    hasPipeline
      ? { key: "pipeline", action: "skip", detail: `Pipeline "${a.pipeline.key}" already exists.` }
      : { key: "pipeline", action: "create", detail: `Create the default pipeline "${a.pipeline.label}".` },
  );
  const stageKeys = id && hasPipeline ? new Set(await db.pipelineStageKeys(id, a.pipeline.key)) : new Set<string>();
  // An org that already has stages keeps them (they may hold asks); only an empty pipeline is seeded.
  const missingPipelineStages = stageKeys.size ? [] : a.pipeline.stages.map((s) => s.key);
  steps.push(
    missingPipelineStages.length
      ? { key: "pipeline_stages", action: "create", detail: `Add stages: ${a.pipeline.stages.map((s) => s.label).join(", ")}.` }
      : { key: "pipeline_stages", action: "skip", detail: "The pipeline already has stages; left as they are." },
  );

  // 6. Starter finance categories (the existing operator RPC, #590).
  if (!a.finance.starter_categories) {
    steps.push({ key: "finance_categories", action: "skip", detail: "Starter finance categories turned off in the file." });
  } else {
    const n = id ? await db.financeCategoryCount(id) : 0;
    steps.push(
      n > 0
        ? { key: "finance_categories", action: "skip", detail: `${n} finance categories already exist.` }
        : { key: "finance_categories", action: "create", detail: "Add the starter finance categories (fin_seed_starter_categories)." },
    );
  }

  // 7. Fiscal year start (fin_config, the one place Finance reads it).
  const fy = id ? await db.fiscalYearStartMonth(id) : null;
  steps.push(
    fy === a.org.fiscal_year_start_month
      ? { key: "fiscal_year", action: "skip", detail: `Fiscal year already starts in ${MONTH[fy]}.` }
      : { key: "fiscal_year", action: fy === null ? "create" : "update", detail: `Fiscal year starts in ${MONTH[a.org.fiscal_year_start_month]}.` },
  );

  // 8. One default thank-you template.
  const hasTpl = id ? await db.hasDefaultGiftTemplate(id) : false;
  steps.push(
    hasTpl
      ? { key: "thank_you_template", action: "skip", detail: "A default thank-you template already exists." }
      : { key: "thank_you_template", action: "create", detail: `Add the thank-you template "${a.thank_you_template.name}".` },
  );

  // 9. The owner's access, last, so everything they land in is ready.
  const owner = id ? await db.ownerMembership(id, a.owner.email) : "none";
  steps.push(
    owner === "owner"
      ? { key: "owner", action: "skip", detail: `${a.owner.email} is already an owner.` }
      : owner === "other-role"
        ? { key: "owner", action: "update", detail: `${a.owner.email} is a member; make them an owner.` }
        : { key: "owner", action: "create", detail: `Invite ${a.owner.email} as owner (Supabase sends the sign-in email).` },
  );

  return { orgId: id, orgExists: !!org, steps, missingFeatures, missingTerms, missingParticipantStages, missingPipelineStages };
}

export type ApplyResult = { orgId: string; done: StepKey[]; notes: string[] };

export async function applySetup(plan: SetupPlan, a: SetupAnswers, w: SetupWriter, existing: ExistingOrg | null): Promise<ApplyResult> {
  const todo = new Map(plan.steps.map((s) => [s.key, s.action]));
  const run = (k: StepKey) => todo.get(k) !== "skip";
  const done: StepKey[] = [];
  const notes: string[] = [];

  let orgId = plan.orgId;
  if (!orgId) {
    orgId = await w.createOrg({ name: a.org.name, slug: a.org.slug, settings: settingsFromAnswers(a, null) });
    done.push("org");
  } else if (run("org")) {
    await w.updateOrg(orgId, { name: a.org.name, settings: settingsFromAnswers(a, existing?.settings ?? null) });
    done.push("org");
  }

  if (run("entitlements")) {
    await w.enableEntitlements(orgId, plan.missingFeatures, SOURCE);
    done.push("entitlements");
  }
  if (run("terminology")) {
    await w.upsertTerminology(orgId, plan.missingTerms.map(([term_key, label]) => ({ term_key, label })));
    done.push("terminology");
  }
  if (run("participant_stages") && a.participant_stages) {
    await w.insertParticipantStages(
      orgId,
      a.participant_stages.map((s, i) => ({
        stage_key: s.key, label: s.label, sort_order: i + 1, engaged: s.engaged, terminal: s.terminal, description: s.description,
      })),
    );
    done.push("participant_stages");
  }
  if (run("pipeline")) {
    await w.insertPipeline(orgId, { key: a.pipeline.key, label: a.pipeline.label, is_default: true });
    done.push("pipeline");
  }
  if (run("pipeline_stages")) {
    await w.insertPipelineStages(
      orgId,
      a.pipeline.stages.map((s, i) => ({
        pipeline: a.pipeline.key, key: s.key, label: s.label, sort_order: i + 1, stage_type: s.type,
        probability_default: s.probability, counts_as_pledged: s.counts_as_pledged,
      })),
    );
    done.push("pipeline_stages");
  }
  if (run("finance_categories")) {
    const n = await w.seedFinanceCategories(orgId);
    notes.push(`${n} finance categories added.`);
    done.push("finance_categories");
  }
  if (run("fiscal_year")) {
    await w.setFiscalYearStart(orgId, a.org.fiscal_year_start_month);
    done.push("fiscal_year");
  }
  if (run("thank_you_template")) {
    await w.insertThankYouTemplate(orgId, a.thank_you_template);
    done.push("thank_you_template");
  }
  if (run("owner")) {
    const r = await w.inviteOwner(orgId, a.owner.email);
    notes.push(r.emailed ? `Invite emailed to ${a.owner.email}.` : `${a.owner.email} already had an account; added as owner.`);
    done.push("owner");
  }
  return { orgId, done, notes };
}

// ── Production guard ───────────────────────────────────────────────────────

/**
 * Any Supabase URL that is not a local stack or a host the operator listed
 * in SETUP_NON_PRODUCTION_HOSTS counts as production. Unknown is production.
 */
export function isProductionTarget(supabaseUrl: string, nonProductionHosts: string): boolean {
  let host = "";
  try {
    host = new URL(supabaseUrl).hostname.toLowerCase();
  } catch {
    return true;
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
  const allowed = nonProductionHosts.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return !allowed.includes(host);
}

export type GuardResult = { ok: true } | { ok: false; reason: string };

/** Against production: only with --i-mean-production, and only for a new slug. */
export function productionGuard(opts: { production: boolean; iMeanProduction: boolean; orgExists: boolean; slug: string }): GuardResult {
  if (!opts.production) return { ok: true };
  if (!opts.iMeanProduction) {
    return { ok: false, reason: "This points at production. Re-run with --i-mean-production if that is what you want." };
  }
  if (opts.orgExists) {
    return { ok: false, reason: `"${opts.slug}" already exists in production. The script only creates new orgs there; change it in the app instead.` };
  }
  return { ok: true };
}

export function formatPlan(plan: SetupPlan, apply: boolean): string {
  const mark = { create: "+", update: "~", skip: "=" } as const;
  const lines = plan.steps.map((s) => `  ${mark[s.action]} ${s.key.padEnd(20)} ${s.detail}`);
  const changes = plan.steps.filter((s) => s.action !== "skip").length;
  const head = apply ? "Applying:" : "Dry run (nothing written). Would do:";
  const tail = changes === 0 ? "Nothing to do: this org is already set up." : `${changes} step(s) to ${apply ? "apply" : "apply with --apply"}.`;
  return [head, ...lines, tail].join("\n");
}
