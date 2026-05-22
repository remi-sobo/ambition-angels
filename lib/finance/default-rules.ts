// Default categorization rules derived from real Wells Fargo descriptions
// seen on Ambition Angels' Checking.csv (Jan–May 2026). These cover ~85% of
// the team's recurring transactions; the rest get categorized by hand on
// /admin/finance/transactions.
//
// Tone:
//   - Patterns are "contains" by default, case-insensitive at match time.
//   - "starts_with" is used where it disambiguates two GUSTO sub-types that
//     would otherwise both match a generic "GUSTO" rule (NET vs TAX vs FEE
//     vs REM).
//   - Priority: higher = evaluated first. Specific patterns get higher
//     priority so generic catch-alls don't shadow them. Within a band,
//     order doesn't matter (first match wins per categorize.ts).
//
// To extend: add a row here, re-run "Seed default rules" on
// /admin/finance/rules. Idempotent — re-seeding skips existing patterns.

export type SeedRule = {
  pattern: string;
  pattern_type: "contains" | "starts_with" | "regex";
  category_id: string;
  priority: number;
};

export const DEFAULT_RULES: SeedRule[] = [
  // ── Payroll ────────────────────────────────────────────────────────────
  // GUSTO sends multiple distinct ACH lines per pay run (NET = salaries,
  // TAX = payroll taxes, REM = remittance for benefits, FEE = platform).
  // The NET line is by far the biggest; we route the rest accordingly.
  { pattern: "GUSTO            NET", pattern_type: "contains", category_id: "payroll.salaries-wages",   priority: 100 },
  { pattern: "GUSTO            TAX", pattern_type: "contains", category_id: "payroll.taxes",            priority: 100 },
  { pattern: "GUSTO            REM", pattern_type: "contains", category_id: "personnel.health-insurance", priority: 100 },
  { pattern: "GUSTO            FEE", pattern_type: "contains", category_id: "admin.payroll-subscription", priority: 100 },

  { pattern: "PAYCHEX-HRS      401(K)",  pattern_type: "contains", category_id: "admin.401k",            priority: 100 },
  { pattern: "PAYCHEX-HRS      HRS PMT", pattern_type: "contains", category_id: "personnel.workers-comp", priority: 100 },

  // ── Software / SaaS used to build the program (PROGRAM functional class)
  { pattern: "ANTHROPIC",   pattern_type: "contains", category_id: "program.tech-app", priority: 80 },
  { pattern: "CLAUDE.AI",   pattern_type: "contains", category_id: "program.tech-app", priority: 80 },
  { pattern: "OPENAI",      pattern_type: "contains", category_id: "program.tech-app", priority: 80 },
  { pattern: "CURSOR",      pattern_type: "contains", category_id: "program.tech-app", priority: 80 },
  { pattern: "VERCEL",      pattern_type: "contains", category_id: "program.tech-app", priority: 80 },
  { pattern: "SUPABASE",    pattern_type: "contains", category_id: "program.tech-app", priority: 80 },
  { pattern: "NETLIFY",     pattern_type: "contains", category_id: "program.tech-app", priority: 80 },
  { pattern: "CLOUDFLARE",  pattern_type: "contains", category_id: "program.tech-app", priority: 80 },
  { pattern: "FAL.AI",      pattern_type: "contains", category_id: "program.tech-app", priority: 80 },
  { pattern: "FAL FEATURES",pattern_type: "contains", category_id: "program.tech-app", priority: 80 },
  { pattern: "ELEVENLABS",  pattern_type: "contains", category_id: "program.tech-app", priority: 80 },
  { pattern: "ZAPIER",      pattern_type: "contains", category_id: "program.tech-app", priority: 80 },
  { pattern: "RESEND",      pattern_type: "contains", category_id: "program.tech-app", priority: 80 },
  { pattern: "RIVERSIDEFM", pattern_type: "contains", category_id: "program.video-contract", priority: 80 },
  { pattern: "WISPR",       pattern_type: "contains", category_id: "program.tech-app", priority: 80 },
  { pattern: "READ - MEETING", pattern_type: "contains", category_id: "program.tech-app", priority: 80 },

  // ── Software / admin tooling (ADMIN functional class) ─────────────────
  { pattern: "HUBSPOT",     pattern_type: "contains", category_id: "admin.memberships-subs", priority: 70 },
  { pattern: "BACKSTAGE",   pattern_type: "contains", category_id: "admin.memberships-subs", priority: 70 },
  { pattern: "PITCHHUB",    pattern_type: "contains", category_id: "admin.memberships-subs", priority: 70 },
  { pattern: "ROCKETREACH", pattern_type: "contains", category_id: "admin.memberships-subs", priority: 70 },
  { pattern: "SLACK",       pattern_type: "contains", category_id: "admin.memberships-subs", priority: 70 },
  { pattern: "ADOBE",       pattern_type: "contains", category_id: "admin.memberships-subs", priority: 70 },
  { pattern: "GOOGLE *Workspace", pattern_type: "contains", category_id: "admin.memberships-subs", priority: 70 },
  { pattern: "MAILMETEOR",  pattern_type: "contains", category_id: "admin.memberships-subs", priority: 70 },
  { pattern: "MAILCHIMP",   pattern_type: "contains", category_id: "admin.memberships-subs", priority: 70 },
  { pattern: "ZOOM.COM",    pattern_type: "contains", category_id: "admin.memberships-subs", priority: 70 },
  { pattern: "MASTERCLASS", pattern_type: "contains", category_id: "personnel.prof-development", priority: 70 },
  { pattern: "NYTIMES",     pattern_type: "contains", category_id: "admin.memberships-subs", priority: 70 },

  // ── Insurance & compliance ─────────────────────────────────────────────
  { pattern: "TMNAServices", pattern_type: "contains", category_id: "admin.insurance-liability", priority: 90 },
  { pattern: "AMTRUST NA",   pattern_type: "contains", category_id: "personnel.workers-comp",    priority: 90 },
  { pattern: "HRA PLATFORM FEE",     pattern_type: "contains", category_id: "admin.health-reimbursement", priority: 90 },
  { pattern: "TAKECOMMANDHE",         pattern_type: "contains", category_id: "admin.health-reimbursement", priority: 90 },
  { pattern: "OR SEC STATE",          pattern_type: "contains", category_id: "admin.licenses-permits",     priority: 90 },

  // ── Rent / occupancy ───────────────────────────────────────────────────
  { pattern: "Playground Globa Bill.com", pattern_type: "contains", category_id: "occupancy.rent", priority: 100 },

  // ── Contract & professional services ───────────────────────────────────
  { pattern: "BILL PAY Sozo Consulting", pattern_type: "contains", category_id: "personnel.contract-prof", priority: 90 },
  { pattern: "WF Direct Pay-Payment- course development", pattern_type: "contains", category_id: "program.course-contract", priority: 90 },
  { pattern: "DYNASTY MOVEMENTS", pattern_type: "contains", category_id: "personnel.contract-prof", priority: 80 },
  { pattern: "UPWORK",            pattern_type: "contains", category_id: "personnel.contract-prof", priority: 80 },
  { pattern: "Peer Circle",       pattern_type: "contains", category_id: "personnel.prof-development", priority: 80 },

  // ── Fundraising stewardship ────────────────────────────────────────────
  { pattern: "BILL PAY AA Empathy", pattern_type: "contains", category_id: "fundraising.donor-steward", priority: 90 },
  { pattern: "PAYPAL           INST XFER", pattern_type: "contains", category_id: "fundraising.donor-steward", priority: 80 },

  // ── Travel ─────────────────────────────────────────────────────────────
  { pattern: "UNITED",          pattern_type: "contains", category_id: "travel.airfare",       priority: 70 },
  { pattern: "EXPEDIA",         pattern_type: "contains", category_id: "travel.airfare",       priority: 70 },
  { pattern: "HOTEL CAZA",      pattern_type: "contains", category_id: "travel.hotels",        priority: 70 },
  { pattern: "RESIDENCE INN",   pattern_type: "contains", category_id: "travel.hotels",        priority: 70 },
  { pattern: "UBER",            pattern_type: "contains", category_id: "travel.taxis",         priority: 70 },
  { pattern: "FASTRAK",         pattern_type: "contains", category_id: "vehicle.parking-tolls", priority: 70 },
  { pattern: "WIFIONBOARD",     pattern_type: "contains", category_id: "travel.internet",      priority: 70 },

  // ── Bank fees ──────────────────────────────────────────────────────────
  { pattern: "DIRECT PAY MONTHLY BASE",   pattern_type: "contains", category_id: "admin.bank-fees", priority: 90 },
  { pattern: "DIRECT PAY INDIVIDUAL PYMT",pattern_type: "contains", category_id: "admin.bank-fees", priority: 90 },

  // ── Shipping / postage ────────────────────────────────────────────────
  { pattern: "PIRATE SHIP",  pattern_type: "contains", category_id: "fundraising.shipping", priority: 70 },
  { pattern: "USPS PO",      pattern_type: "contains", category_id: "fundraising.shipping", priority: 70 },

  // ── Revenue (positive amounts) ─────────────────────────────────────────
  // amount sign is enforced upstream (revenue txns have amount > 0), so a
  // "contains GIVEBUTTER" rule won't accidentally tag a Givebutter platform
  // fee as revenue — but be defensive about it anyway.
  { pattern: "GIVEBUTTER",      pattern_type: "contains", category_id: "revenue.individuals", priority: 90 },
  { pattern: "A16Z CAPITAL",    pattern_type: "contains", category_id: "revenue.accelerator", priority: 90 },
  { pattern: "FFWD ACCEL",      pattern_type: "contains", category_id: "revenue.accelerator", priority: 90 },
  { pattern: "SVCF",            pattern_type: "contains", category_id: "revenue.foundations", priority: 90 },
  { pattern: "AMER ONLINE GIV", pattern_type: "contains", category_id: "revenue.individuals", priority: 90 },
  { pattern: "AOGFcauses",      pattern_type: "contains", category_id: "revenue.individuals", priority: 90 },
  { pattern: "MOBILE DEPOSIT",  pattern_type: "contains", category_id: "revenue.individuals", priority: 60 },
  { pattern: "eDeposit in Branch", pattern_type: "contains", category_id: "revenue.individuals", priority: 60 },
  { pattern: "PNC JOINT JUICE", pattern_type: "contains", category_id: "revenue.corporate",    priority: 90 },
  { pattern: "AMBITION PLATFOR", pattern_type: "contains", category_id: "revenue.earned",      priority: 90 },
  { pattern: "GUSTO            TAX 803451", pattern_type: "contains", category_id: "revenue.other", priority: 95 },
  { pattern: "Provisional Credit", pattern_type: "contains", category_id: "revenue.other",     priority: 80 },
  { pattern: "RECURRING PAYMENT REVERSAL", pattern_type: "contains", category_id: "revenue.other", priority: 80 },
  { pattern: "PURCHASE RETURN",  pattern_type: "contains", category_id: "revenue.other",       priority: 80 },
  { pattern: "BILL PAY PAYMENT RETURN", pattern_type: "contains", category_id: "revenue.other", priority: 80 },

  // ── Credit-card payoffs (TRANSFER — not an expense in functional terms)
  { pattern: "CHASE CREDIT CRD EPAY", pattern_type: "contains", category_id: "transfer.internal", priority: 95 },
];
