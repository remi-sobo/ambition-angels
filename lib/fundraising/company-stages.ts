// Company stages (specs/bloomos-companies.md, Stage 1).
//
// A company is an organization constituent with a `company_stage`. Null means
// the organization is not tracked as a company. The stage describes the
// relationship, not one ask: opportunity stages stay on opportunities. A
// person sets it; nothing in code advances it.

export const COMPANY_STAGES = [
  "identified",
  "engaged",
  "qualified",
  "opportunity",
  "committed",
  "active_partner",
  "renewal",
] as const;

export type CompanyStage = (typeof COMPANY_STAGES)[number];

export const COMPANY_STAGE_LABELS: Record<CompanyStage, string> = {
  identified: "Identified",
  engaged: "Engaged",
  qualified: "Qualified",
  opportunity: "Opportunity",
  committed: "Committed",
  active_partner: "Active Partner",
  renewal: "Renewal",
};

export const COMPANY_STAGE_HELP: Record<CompanyStage, string> = {
  identified: "We know who they are. No real conversation yet.",
  engaged: "We are talking with someone there.",
  qualified: "There is a fit and someone who can say yes.",
  opportunity: "A specific ask or partnership is on the table.",
  committed: "They said yes. The work or the money is not in yet.",
  active_partner: "Working together now.",
  renewal: "Time to ask them to do it again.",
};

export const isCompanyStage = (v: unknown): v is CompanyStage =>
  typeof v === "string" && (COMPANY_STAGES as readonly string[]).includes(v);

/** Ask statuses that are still open (not decided). */
export const OPEN_ASK_STATUSES = ["draft", "submitted", "pending"] as const;

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * One typed domain, email or URL to a bare lowercase domain, or null when it
 * is not a domain. "https://www.Example.com/about" and "jo@example.com" both
 * give "example.com".
 */
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("@")) s = s.slice(s.lastIndexOf("@") + 1);
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split(/[/?#:]/)[0];
  s = s.replace(/^www\./, "").replace(/\.$/, "");
  return DOMAIN_RE.test(s) ? s : null;
}

/** Normalize a list of domains: drop blanks and invalid entries, dedupe, keep order. */
export function normalizeDomains(inputs: readonly string[]): { domains: string[]; invalid: string[] } {
  const domains: string[] = [];
  const invalid: string[] = [];
  for (const raw of inputs) {
    if (!raw.trim()) continue;
    const d = normalizeDomain(raw);
    if (!d) invalid.push(raw.trim());
    else if (!domains.includes(d)) domains.push(d);
  }
  return { domains, invalid };
}
