import { isPlanName, type PlanName } from "./plans";
import { EIN_RE, isValidTimezone, normalizeEin, type OrgAddress } from "@/lib/admin/orgIdentity";

/**
 * V4 Stage F: the operator's answers file for scripts/setup-org.ts, and the
 * generic starter defaults used where the file is silent. PURE (no I/O): the
 * script reads the file, this module turns it into a checked SetupAnswers or
 * a list of plain problems, and tests drive it directly.
 *
 * Format (JSON, or YAML with the same keys): scripts/setup-org.example.json.
 */

export const TERM_KEYS = ["student", "cohort", "program", "session", "stage", "staff", "volunteer", "partner", "board"] as const;
export type TermKey = (typeof TERM_KEYS)[number];

export type StageType = "open" | "won" | "lost" | "on_hold";
export type PipelineStageAnswer = { key: string; label: string; type: StageType; probability: number | null; counts_as_pledged: boolean };
export type ParticipantStageAnswer = { key: string; label: string; engaged: boolean; terminal: boolean; description: string | null };
export type ThankYouAnswer = { name: string; subject: string; body: string };

export type SetupAnswers = {
  org: {
    name: string;
    slug: string;
    legal_name: string;
    ein: string;
    address: OrgAddress;
    timezone: string;
    fiscal_year_start_month: number;
    email_domain: string | null;
    support_email: string | null;
  };
  plan: PlanName;
  owner: { email: string };
  terms: Partial<Record<TermKey, string>>;
  /** null: the plan has no Programs and the file gave none, so none are written. */
  participant_stages: ParticipantStageAnswer[] | null;
  pipeline: { key: string; label: string; stages: PipelineStageAnswer[] };
  finance: { starter_categories: boolean };
  thank_you_template: ThankYouAnswer;
};

// ── Generic starter defaults (no Ambition Angels vocabulary) ───────────────

export const DEFAULT_PIPELINE: SetupAnswers["pipeline"] = {
  key: "default",
  label: "Donor pipeline",
  stages: [
    { key: "researching", label: "Researching", type: "open", probability: 10, counts_as_pledged: false },
    { key: "cultivating", label: "Cultivating", type: "open", probability: 30, counts_as_pledged: false },
    { key: "ask_made", label: "Ask made", type: "open", probability: 60, counts_as_pledged: false },
    { key: "verbal_yes", label: "Verbal yes", type: "open", probability: 90, counts_as_pledged: true },
    { key: "closed_won", label: "Gift received", type: "won", probability: 100, counts_as_pledged: false },
    { key: "closed_lost", label: "Not this time", type: "lost", probability: 0, counts_as_pledged: false },
  ],
};

export const DEFAULT_PARTICIPANT_STAGES: ParticipantStageAnswer[] = [
  { key: "new", label: "New", engaged: false, terminal: false, description: "Just joined and getting started." },
  { key: "active", label: "Active", engaged: true, terminal: false, description: "Taking part regularly." },
  { key: "completed", label: "Completed", engaged: false, terminal: true, description: "Finished the program." },
  { key: "inactive", label: "Inactive", engaged: false, terminal: true, description: "No longer taking part." },
];

export const DEFAULT_THANK_YOU: ThankYouAnswer = {
  name: "Thank you and receipt",
  subject: "Thank you, {{first_name}}",
  body:
    "Dear {{first_name}},\n\n" +
    "Thank you for your gift. It goes straight to the work, and we are grateful you are part of it.\n\n" +
    "Your receipt is below. Please keep it for your tax records.\n\n" +
    "With thanks,",
};

// ── Validation ─────────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/;
/** Slugs no new org may take: AA's (its identity defaults key off it) and reserved words. */
const RESERVED_SLUGS = new Set(["ambition-angels", "admin", "api", "bloomos", "demo"]);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export type AnswersResult = { ok: true; answers: SetupAnswers } | { ok: false; problems: string[] };

export function validateAnswers(input: unknown): AnswersResult {
  const p: string[] = [];
  if (!isObj(input)) return { ok: false, problems: ["The answers file must be an object with org, plan and owner."] };

  const org = isObj(input.org) ? input.org : {};
  if (!isObj(input.org)) p.push("org: missing.");
  const name = str(org.name);
  if (!name || name.length > 120) p.push("org.name: required, up to 120 characters.");
  const slug = str(org.slug);
  if (!SLUG_RE.test(slug)) p.push("org.slug: 3 to 50 lowercase letters, digits or dashes, like harbor-youth.");
  else if (RESERVED_SLUGS.has(slug)) p.push(`org.slug: "${slug}" is reserved.`);
  const legal_name = str(org.legal_name);
  if (!legal_name) p.push("org.legal_name: required (it prints on tax receipts).");
  const ein = normalizeEin(str(org.ein));
  if (!EIN_RE.test(ein)) p.push("org.ein: nine digits, like 12-3456789.");
  const a = isObj(org.address) ? org.address : {};
  const address: OrgAddress = { street: str(a.street), city: str(a.city), state: str(a.state), postal_code: str(a.postal_code) };
  if (!address.street || !address.city || !address.state || !address.postal_code) {
    p.push("org.address: street, city, state and postal_code are all required.");
  }
  const timezone = str(org.timezone);
  if (!isValidTimezone(timezone)) p.push("org.timezone: an IANA time zone, like America/New_York.");
  const fy = org.fiscal_year_start_month ?? 1;
  if (typeof fy !== "number" || !Number.isInteger(fy) || fy < 1 || fy > 12) {
    p.push("org.fiscal_year_start_month: a month number from 1 to 12 (7 = July).");
  }
  const email_domain = str(org.email_domain).toLowerCase() || null;
  if (email_domain && !DOMAIN_RE.test(email_domain)) p.push("org.email_domain: a domain like example.org, or leave it out.");
  const support_email = str(org.support_email).toLowerCase() || null;
  if (support_email && !EMAIL_RE.test(support_email)) p.push("org.support_email: an email address, or leave it out.");

  const plan = input.plan;
  if (!isPlanName(plan)) p.push('plan: one of "essentials", "pilot", "programs".');

  const owner = isObj(input.owner) ? input.owner : {};
  const ownerEmail = str(owner.email).toLowerCase();
  if (!EMAIL_RE.test(ownerEmail)) p.push("owner.email: the first owner's email address.");

  const terms: Partial<Record<TermKey, string>> = {};
  if (input.terms !== undefined) {
    if (!isObj(input.terms)) p.push("terms: an object like { \"student\": \"Youth\" }.");
    else {
      for (const [k, v] of Object.entries(input.terms)) {
        if (!(TERM_KEYS as readonly string[]).includes(k)) {
          p.push(`terms.${k}: not a term BloomOS uses (${TERM_KEYS.join(", ")}).`);
          continue;
        }
        const label = str(v);
        if (!label || label.length > 40) p.push(`terms.${k}: a singular word or two, up to 40 characters.`);
        else terms[k as TermKey] = label;
      }
    }
  }

  let participant_stages: ParticipantStageAnswer[] | null = null;
  if (input.participant_stages !== undefined && input.participant_stages !== "starter") {
    if (!Array.isArray(input.participant_stages) || input.participant_stages.length === 0) {
      p.push('participant_stages: "starter", or a list of { key, label, engaged, terminal }.');
    } else {
      const seen = new Set<string>();
      participant_stages = input.participant_stages.map((raw, i) => {
        const r = isObj(raw) ? raw : {};
        const key = str(r.key);
        if (!KEY_RE.test(key)) p.push(`participant_stages[${i}].key: lowercase letters, digits, underscores.`);
        if (seen.has(key)) p.push(`participant_stages[${i}].key: "${key}" appears twice.`);
        seen.add(key);
        const label = str(r.label);
        if (!label) p.push(`participant_stages[${i}].label: required.`);
        return { key, label, engaged: r.engaged === true, terminal: r.terminal === true, description: str(r.description) || null };
      });
    }
  } else if (input.participant_stages === "starter" || plan === "programs") {
    participant_stages = DEFAULT_PARTICIPANT_STAGES;
  }

  let pipeline = DEFAULT_PIPELINE;
  if (input.pipeline !== undefined) {
    const pr = isObj(input.pipeline) ? input.pipeline : null;
    if (!pr) p.push("pipeline: an object with label and stages, or leave it out for the starter pipeline.");
    else {
      const label = str(pr.label) || DEFAULT_PIPELINE.label;
      let stages = DEFAULT_PIPELINE.stages;
      if (pr.stages !== undefined) {
        if (!Array.isArray(pr.stages) || pr.stages.length < 2) p.push("pipeline.stages: at least two stages.");
        else {
          const seen = new Set<string>();
          stages = pr.stages.map((raw, i) => {
            const r = isObj(raw) ? raw : {};
            const key = str(r.key);
            if (!KEY_RE.test(key)) p.push(`pipeline.stages[${i}].key: lowercase letters, digits, underscores.`);
            if (seen.has(key)) p.push(`pipeline.stages[${i}].key: "${key}" appears twice.`);
            seen.add(key);
            const lab = str(r.label);
            if (!lab) p.push(`pipeline.stages[${i}].label: required.`);
            const type = str(r.type) as StageType;
            if (!["open", "won", "lost", "on_hold"].includes(type)) p.push(`pipeline.stages[${i}].type: open, won, lost or on_hold.`);
            const prob = r.probability === undefined || r.probability === null ? null : r.probability;
            if (prob !== null && (typeof prob !== "number" || prob < 0 || prob > 100)) {
              p.push(`pipeline.stages[${i}].probability: 0 to 100.`);
            }
            return { key, label: lab, type, probability: prob as number | null, counts_as_pledged: r.counts_as_pledged === true };
          });
          if (!stages.some((x) => x.type === "open")) p.push("pipeline.stages: needs at least one open stage.");
          if (!stages.some((x) => x.type === "won")) p.push("pipeline.stages: needs a won stage.");
        }
      }
      pipeline = { key: "default", label, stages };
    }
  }

  const fin = isObj(input.finance) ? input.finance : {};
  const starter_categories = fin.starter_categories !== false;

  let thank_you_template = DEFAULT_THANK_YOU;
  if (input.thank_you_template !== undefined) {
    const t = isObj(input.thank_you_template) ? input.thank_you_template : null;
    if (!t) p.push("thank_you_template: { name, subject, body }, or leave it out.");
    else {
      thank_you_template = {
        name: str(t.name) || DEFAULT_THANK_YOU.name,
        subject: str(t.subject) || DEFAULT_THANK_YOU.subject,
        body: str(t.body) || DEFAULT_THANK_YOU.body,
      };
    }
  }

  if (p.length) return { ok: false, problems: p };
  return {
    ok: true,
    answers: {
      org: {
        name, slug, legal_name, ein, address, timezone,
        fiscal_year_start_month: fy as number, email_domain, support_email,
      },
      plan: plan as PlanName,
      owner: { email: ownerEmail },
      terms,
      participant_stages,
      pipeline,
      finance: { starter_categories },
      thank_you_template,
    },
  };
}
