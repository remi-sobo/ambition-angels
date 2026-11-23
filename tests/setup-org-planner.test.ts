import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateAnswers, type SetupAnswers } from "@/lib/admin/onboarding/answers";
import { PLANS } from "@/lib/admin/onboarding/plans";
import {
  applySetup,
  formatPlan,
  isProductionTarget,
  planSetup,
  productionGuard,
  type ExistingOrg,
  type SetupReader,
  type SetupWriter,
} from "@/lib/admin/onboarding/planner";

// V4 Stage F: the operator setup planner, driven against an in-memory fake.
// The real script (scripts/setup-org.ts) is never executed here.

type Row = Record<string, unknown>;

class FakeDb implements SetupReader, SetupWriter {
  orgs: (ExistingOrg & { slug: string })[] = [];
  ents: Row[] = [];
  terms: Row[] = [];
  pstages: Row[] = [];
  pipelines: Row[] = [];
  stages: Row[] = [];
  cats: Row[] = [];
  finConfig: Row[] = [];
  templates: Row[] = [];
  members: Row[] = [];
  writes = 0;
  invites: string[] = [];

  async findOrgBySlug(slug: string) {
    const o = this.orgs.find((x) => x.slug === slug);
    return o ? { id: o.id, name: o.name, settings: o.settings } : null;
  }
  async entitlements(orgId: string) {
    return this.ents.filter((e) => e.org_id === orgId && e.enabled).map((e) => e.feature_key as string);
  }
  async terminology(orgId: string) {
    return Object.fromEntries(this.terms.filter((t) => t.org_id === orgId).map((t) => [t.term_key, t.label])) as Record<string, string>;
  }
  async participantStageKeys(orgId: string) {
    return this.pstages.filter((s) => s.org_id === orgId).map((s) => s.stage_key as string);
  }
  async pipelineKeys(orgId: string) {
    return this.pipelines.filter((p) => p.org_id === orgId).map((p) => p.key as string);
  }
  async pipelineStageKeys(orgId: string, pipeline: string) {
    return this.stages.filter((s) => s.org_id === orgId && s.pipeline === pipeline).map((s) => s.key as string);
  }
  async financeCategoryCount(orgId: string) {
    return this.cats.filter((c) => c.org_id === orgId).length;
  }
  async fiscalYearStartMonth(orgId: string) {
    return (this.finConfig.find((f) => f.org_id === orgId)?.fiscal_year_start_month as number | undefined) ?? null;
  }
  async hasDefaultGiftTemplate(orgId: string) {
    return this.templates.some((t) => t.org_id === orgId && t.is_default);
  }
  async ownerMembership(orgId: string, email: string) {
    const m = this.members.find((x) => x.org_id === orgId && x.email === email);
    return !m ? "none" : m.role === "owner" ? "owner" : "other-role";
  }

  async createOrg(row: { name: string; slug: string; settings: Row }) {
    this.writes++;
    const id = `org-${this.orgs.length + 1}`;
    this.orgs.push({ id, ...row });
    return id;
  }
  async updateOrg(orgId: string, row: { name: string; settings: Row }) {
    this.writes++;
    const o = this.orgs.find((x) => x.id === orgId)!;
    o.name = row.name;
    o.settings = row.settings;
  }
  async enableEntitlements(orgId: string, keys: string[]) {
    this.writes++;
    for (const k of keys) this.ents.push({ org_id: orgId, feature_key: k, enabled: true });
  }
  async upsertTerminology(orgId: string, rows: { term_key: string; label: string }[]) {
    this.writes++;
    for (const r of rows) {
      this.terms = this.terms.filter((t) => !(t.org_id === orgId && t.term_key === r.term_key));
      this.terms.push({ org_id: orgId, ...r });
    }
  }
  async insertParticipantStages(orgId: string, rows: Row[]) {
    this.writes++;
    this.pstages.push(...rows.map((r) => ({ org_id: orgId, ...r })));
  }
  async insertPipeline(orgId: string, row: Row) {
    this.writes++;
    this.pipelines.push({ org_id: orgId, ...row });
  }
  async insertPipelineStages(orgId: string, rows: Row[]) {
    this.writes++;
    this.stages.push(...rows.map((r) => ({ org_id: orgId, ...r })));
  }
  async seedFinanceCategories(orgId: string) {
    this.writes++;
    for (let i = 0; i < 28; i++) this.cats.push({ org_id: orgId, id: `c${i}` });
    return 28;
  }
  async setFiscalYearStart(orgId: string, month: number) {
    this.writes++;
    this.finConfig = this.finConfig.filter((f) => f.org_id !== orgId);
    this.finConfig.push({ org_id: orgId, fiscal_year_start_month: month });
  }
  async insertThankYouTemplate(orgId: string, row: Row) {
    this.writes++;
    this.templates.push({ org_id: orgId, is_default: true, ...row });
  }
  async inviteOwner(orgId: string, email: string) {
    this.writes++;
    this.invites.push(email);
    this.members = this.members.filter((m) => !(m.org_id === orgId && m.email === email));
    this.members.push({ org_id: orgId, email, role: "owner" });
    return { emailed: true, existing: false };
  }
}

const ENT_SRC = readFileSync(join(__dirname, "../lib/admin/entitlements.ts"), "utf8");
const example = JSON.parse(readFileSync(join(__dirname, "../scripts/setup-org.example.json"), "utf8"));

function answers(over: Record<string, unknown> = {}): SetupAnswers {
  const r = validateAnswers({ ...example, ...over });
  if (!r.ok) throw new Error(r.problems.join("; "));
  return r.answers;
}

describe("answers file", () => {
  test("the example file is valid and uses invented example.org values", () => {
    const r = validateAnswers(example);
    expect(r.ok).toBe(true);
    expect(JSON.stringify(example)).toMatch(/example\.org/);
    expect(JSON.stringify(example)).not.toMatch(/ambition|remi|shannon/i);
  });

  test("problems are listed in plain words, all at once", () => {
    const r = validateAnswers({ org: { name: "", slug: "Bad Slug", ein: "123" }, plan: "gold", owner: {} });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems.join("\n")).toMatch(/org.name/);
    expect(r.problems.join("\n")).toMatch(/org.slug/);
    expect(r.problems.join("\n")).toMatch(/org.ein/);
    expect(r.problems.join("\n")).toMatch(/plan:/);
    expect(r.problems.join("\n")).toMatch(/owner.email/);
    expect(r.problems.join("\n")).toMatch(/org.timezone/);
  });

  test("AA's slug is reserved and unknown term keys are refused", () => {
    const r = validateAnswers({ ...example, org: { ...example.org, slug: "ambition-angels" }, terms: { widget: "X" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems.some((p) => /reserved/.test(p))).toBe(true);
    expect(r.problems.some((p) => /terms.widget/.test(p))).toBe(true);
  });

  test("defaults fill a minimal file: starter pipeline, template, finance on; no stages without Programs", () => {
    const { org, plan, owner } = example;
    const r = validateAnswers({ org, plan, owner });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.answers.pipeline.stages.map((s) => s.label)).toContain("Verbal yes");
    expect(r.answers.thank_you_template.body).toMatch(/\{\{first_name\}\}/);
    expect(r.answers.finance.starter_categories).toBe(true);
    expect(r.answers.participant_stages).toBeNull();
    const withPrograms = validateAnswers({ org, plan: "programs", owner });
    expect(withPrograms.ok && withPrograms.answers.participant_stages?.length).toBe(4);
  });

  test("no plan seeds an aa.* key, and every key is a real feature key", () => {
    for (const p of Object.values(PLANS)) {
      for (const k of p.features) {
        expect(k.startsWith("aa.")).toBe(false);
        expect(ENT_SRC).toContain(`"${k}"`);
      }
    }
  });
});

describe("planner: dry run", () => {
  test("a new org: every step is a create, and nothing is written", async () => {
    const db = new FakeDb();
    const plan = await planSetup(answers(), db);
    expect(plan.orgExists).toBe(false);
    expect(plan.steps.map((s) => s.key)).toEqual([
      "org", "entitlements", "terminology", "participant_stages", "pipeline", "pipeline_stages",
      "finance_categories", "fiscal_year", "thank_you_template", "owner",
    ]);
    expect(plan.steps.filter((s) => s.action === "create").length).toBe(10);
    expect(db.writes).toBe(0);
    const out = formatPlan(plan, false);
    expect(out).toMatch(/^Dry run \(nothing written\)/);
    expect(out).toMatch(/Create "Harbor Youth Collective" \(harbor-youth\)/);
    expect(out).toMatch(/Invite maya@harboryouth.example.org as owner/);
    expect(out).toMatch(/Fiscal year starts in July/);
  });
});

describe("planner: apply and idempotency", () => {
  test("apply writes everything once; a second plan is all skips and a second apply writes nothing", async () => {
    const db = new FakeDb();
    const a = answers();
    const r = await applySetup(await planSetup(a, db), a, db, null);
    expect(r.orgId).toBe("org-1");
    const org = db.orgs[0];
    expect(org.settings).toMatchObject({
      legal_name: "Harbor Youth Collective, Inc.",
      ein: "12-3456789",
      mailing_address: "88 Wharf Street, Portland, ME 04101",
      timezone: "America/New_York",
    });
    expect(db.ents.map((e) => e.feature_key).sort()).toEqual([...PLANS.pilot.features].sort());
    expect(db.terms).toHaveLength(2);
    expect(db.pipelines).toEqual([expect.objectContaining({ key: "default", is_default: true })]);
    expect(db.stages).toHaveLength(6);
    expect(db.cats).toHaveLength(28);
    expect(db.finConfig[0].fiscal_year_start_month).toBe(7);
    expect(db.templates).toHaveLength(1);
    expect(db.invites).toEqual(["maya@harboryouth.example.org"]);

    const writes = db.writes;
    const again = await planSetup(a, db);
    expect(again.steps.every((s) => s.action === "skip")).toBe(true);
    expect(formatPlan(again, false)).toMatch(/Nothing to do/);
    await applySetup(again, a, db, await db.findOrgBySlug(a.org.slug));
    expect(db.writes).toBe(writes);
    expect(db.invites).toHaveLength(1);
  });

  test("a half-finished run is completed, not duplicated", async () => {
    const db = new FakeDb();
    const a = answers();
    const id = await db.createOrg({ name: a.org.name, slug: a.org.slug, settings: {} });
    await db.enableEntitlements(id, ["modules.fundraising", "aa.ygb"]);
    await db.insertPipeline(id, { key: "default", label: "Old", is_default: true });
    await db.insertPipelineStages(id, [{ pipeline: "default", key: "kept" }]);
    const plan = await planSetup(a, db);
    const byKey = Object.fromEntries(plan.steps.map((s) => [s.key, s]));
    expect(byKey.org.action).toBe("update");
    expect(byKey.entitlements.detail).toMatch(/Left as is: aa.ygb/);
    expect(plan.missingFeatures).not.toContain("modules.fundraising");
    expect(byKey.pipeline.action).toBe("skip");
    expect(byKey.pipeline_stages.action).toBe("skip");
    await applySetup(plan, a, db, await db.findOrgBySlug(a.org.slug));
    expect(db.orgs).toHaveLength(1);
    expect(db.ents.filter((e) => e.feature_key === "modules.fundraising")).toHaveLength(1);
    expect(db.stages.map((s) => s.key)).toEqual(["kept"]);
  });

  test("an existing member who is not an owner is promoted, not re-invited as new", async () => {
    const db = new FakeDb();
    const a = answers();
    await applySetup(await planSetup(a, db), a, db, null);
    db.members[0].role = "staff";
    const plan = await planSetup(a, db);
    expect(plan.steps.find((s) => s.key === "owner")!.action).toBe("update");
  });
});

describe("production refusal", () => {
  test("any non-local host is production unless listed", () => {
    expect(isProductionTarget("http://127.0.0.1:54321", "")).toBe(false);
    expect(isProductionTarget("https://abcd.supabase.co", "")).toBe(true);
    expect(isProductionTarget("https://abcd.supabase.co", "abcd.supabase.co")).toBe(false);
    expect(isProductionTarget("not a url", "")).toBe(true);
  });

  test("production needs --i-mean-production and a slug that does not exist yet", () => {
    expect(productionGuard({ production: false, iMeanProduction: false, orgExists: true, slug: "x" }).ok).toBe(true);
    const noFlag = productionGuard({ production: true, iMeanProduction: false, orgExists: false, slug: "x" });
    expect(noFlag.ok).toBe(false);
    expect(!noFlag.ok && noFlag.reason).toMatch(/--i-mean-production/);
    const exists = productionGuard({ production: true, iMeanProduction: true, orgExists: true, slug: "harbor-youth" });
    expect(exists.ok).toBe(false);
    expect(!exists.ok && exists.reason).toMatch(/already exists in production/);
    expect(productionGuard({ production: true, iMeanProduction: true, orgExists: false, slug: "x" }).ok).toBe(true);
  });

  test("the script checks the guard before planning or writing", () => {
    const src = readFileSync(join(__dirname, "../scripts/setup-org.ts"), "utf8");
    const guardAt = src.indexOf("productionGuard(");
    expect(guardAt).toBeGreaterThan(0);
    expect(guardAt).toBeLessThan(src.indexOf("planSetup(answers"));
    expect(guardAt).toBeLessThan(src.indexOf("applySetup("));
    expect(src).toMatch(/if \(!apply\) return 0;/);
  });
});
