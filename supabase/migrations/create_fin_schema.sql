-- Migration: fin_* — finance domain schema for the /admin/finance hub.
--
-- Seven tables, all prefixed fin_:
--   fin_categories          taxonomy of expense / revenue line items
--   fin_budget              per-year budget per category (base + contingency)
--   fin_revenue_commitments pledges / grants — secured | projected | received
--   fin_transactions        actual bank-statement rows (CSV-imported)
--   fin_imports             audit log of CSV uploads
--   fin_category_rules      pattern → category for auto-categorization
--   fin_config              singleton settings (fiscal year, starting balance,
--                           fundraising goal)
--
-- Sign convention: fin_transactions.amount is positive for money in, negative
-- for money out. This matches Wells Fargo CSV exports natively (deposits are
-- positive, debits are negative). Functional splits (program / admin /
-- fundraising) come from fin_categories.functional_class, the same taxonomy a
-- Form 990 expects.
--
-- Idempotent end-to-end: CREATE TABLE / INDEX use IF NOT EXISTS; the seed at
-- the bottom uses ON CONFLICT DO NOTHING so re-running won't clobber any
-- categories the team has renamed in-place.
--
-- RLS: not enabled (project convention — see create_ops_projects_and_tasks).

-- Reuse the shared set_updated_at() trigger function created in
-- create_ops_projects_and_tasks.sql. Define it here too with CREATE OR REPLACE
-- so this migration is self-sufficient if applied to a fresh database.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── fin_categories ─────────────────────────────────────────────────────────
-- Stable string IDs (e.g. 'admin.bank-fees') so seeds, rules, and budget rows
-- survive renames. group_name mirrors the section headers in the team's
-- existing budget workbook (ADMINISTRATION, PAYROLL, PROGRAM, ...).
-- functional_class is the 990 split: program / admin / fundraising. Null for
-- revenue and transfer categories.
create table if not exists fin_categories (
  id                text primary key,
  group_name        text not null,
  display_name      text not null,
  kind              text not null
                      check (kind in ('expense', 'revenue', 'transfer')),
  functional_class  text
                      check (
                        functional_class is null
                        or functional_class in ('program', 'admin', 'fundraising')
                      ),
  sort_order        int  not null default 0,
  enabled           boolean not null default true,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists fin_categories_group_idx
  on fin_categories (group_name, sort_order);

drop trigger if exists fin_categories_set_updated_at on fin_categories;
create trigger fin_categories_set_updated_at
  before update on fin_categories
  for each row execute function set_updated_at();

-- ── fin_budget ─────────────────────────────────────────────────────────────
-- One row per (year, category). Mirrors the team's "Budget-2026" tab:
-- base + Tier 1 + Tier 2 contingency + activated. Activated contingency is
-- the portion the team has decided to spend once fundraising crossed the
-- unlock threshold.
create table if not exists fin_budget (
  year                   int  not null,
  category_id            text not null references fin_categories(id) on delete restrict,
  base_amount            numeric(12,2) not null default 0,
  contingency_t1         numeric(12,2) not null default 0,
  contingency_t2         numeric(12,2) not null default 0,
  activated_contingency  numeric(12,2) not null default 0,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  primary key (year, category_id)
);

drop trigger if exists fin_budget_set_updated_at on fin_budget;
create trigger fin_budget_set_updated_at
  before update on fin_budget
  for each row execute function set_updated_at();

-- ── fin_revenue_commitments ────────────────────────────────────────────────
-- Pledges, grants in progress, and received gifts. status:
--   secured   = signed / committed but not yet in the bank
--   projected = pipeline, weighted by probability
--   received  = money has hit the account (also recorded in fin_transactions
--               — kept here too for the pledge-tracker view)
-- probability is 0..1, used to weight projected pipeline. Null = treat as 1.0.
create table if not exists fin_revenue_commitments (
  id              uuid primary key default gen_random_uuid(),
  year            int  not null,
  source_type     text not null
                    check (source_type in (
                      'foundation', 'individual', 'corporate',
                      'government', 'accelerator', 'earned', 'other'
                    )),
  source_name     text not null,
  amount          numeric(12,2) not null,
  status          text not null
                    check (status in ('secured', 'projected', 'received')),
  expected_date   date,
  probability     numeric(4,3)
                    check (probability is null or (probability >= 0 and probability <= 1)),
  restricted      boolean not null default false,
  restricted_to   text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      text
);

create index if not exists fin_revenue_commitments_year_idx
  on fin_revenue_commitments (year, status);

drop trigger if exists fin_revenue_commitments_set_updated_at on fin_revenue_commitments;
create trigger fin_revenue_commitments_set_updated_at
  before update on fin_revenue_commitments
  for each row execute function set_updated_at();

-- ── fin_transactions ───────────────────────────────────────────────────────
-- One row per bank-statement line item. amount > 0 = inflow, amount < 0 =
-- outflow. category_id is nullable until the user (or a rule) categorizes it
-- — the dashboard surfaces uncategorized count as a CTA.
--
-- dedup_hash prevents the same transaction being imported twice if statement
-- ranges overlap. Formula (applied in the upload route, not by the DB):
--   sha256(txn_date | normalized_amount_cents | normalized_description)
create table if not exists fin_transactions (
  id              uuid primary key default gen_random_uuid(),
  txn_date        date not null,
  description     text not null,
  amount          numeric(12,2) not null,
  category_id     text references fin_categories(id) on delete set null,
  restricted      boolean not null default false,
  restricted_to   text,
  source_file     text,
  dedup_hash      text not null unique,
  notes           text,
  uploaded_at     timestamptz not null default now(),
  uploaded_by     text,
  updated_at      timestamptz not null default now()
);

create index if not exists fin_transactions_date_idx
  on fin_transactions (txn_date desc);
create index if not exists fin_transactions_category_idx
  on fin_transactions (category_id);
create index if not exists fin_transactions_uncategorized_idx
  on fin_transactions (uploaded_at desc) where category_id is null;

drop trigger if exists fin_transactions_set_updated_at on fin_transactions;
create trigger fin_transactions_set_updated_at
  before update on fin_transactions
  for each row execute function set_updated_at();

-- ── fin_imports ────────────────────────────────────────────────────────────
-- One row per uploaded CSV. file_hash is unique so re-uploading the same file
-- is a no-op rather than a duplicate. starting/ending balance and period
-- bounds are pulled from the file when available — Wells Fargo CSVs don't
-- include balance, so those columns are nullable.
create table if not exists fin_imports (
  id                uuid primary key default gen_random_uuid(),
  filename          text not null,
  file_hash         text not null unique,
  bank_format       text not null
                      check (bank_format in (
                        'wells-fargo', 'chase', 'mercury',
                        'quickbooks', 'generic'
                      )),
  row_count         int  not null,
  inserted_count    int  not null,
  duplicate_count   int  not null,
  starting_balance  numeric(12,2),
  ending_balance    numeric(12,2),
  period_start      date,
  period_end        date,
  uploaded_at       timestamptz not null default now(),
  uploaded_by       text
);

create index if not exists fin_imports_uploaded_idx
  on fin_imports (uploaded_at desc);

-- ── fin_category_rules ─────────────────────────────────────────────────────
-- Pattern-based auto-categorization. Applied during upload AND on-demand via
-- a "re-apply rules to uncategorized" action. priority sorts rule evaluation;
-- first match wins. hit_count is bumped each time the rule matches a row, so
-- the rules page can show which rules are pulling weight.
create table if not exists fin_category_rules (
  id            uuid primary key default gen_random_uuid(),
  pattern       text not null,
  pattern_type  text not null default 'contains'
                  check (pattern_type in ('contains', 'starts_with', 'regex')),
  category_id   text not null references fin_categories(id) on delete cascade,
  restricted    boolean not null default false,
  priority      int  not null default 0,
  enabled       boolean not null default true,
  hit_count     int  not null default 0,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists fin_category_rules_priority_idx
  on fin_category_rules (enabled, priority desc);

drop trigger if exists fin_category_rules_set_updated_at on fin_category_rules;
create trigger fin_category_rules_set_updated_at
  before update on fin_category_rules
  for each row execute function set_updated_at();

-- ── fin_config ─────────────────────────────────────────────────────────────
-- Singleton: one and only one row, enforced via a CHECK on id=1. Holds global
-- settings the dashboard needs but that don't belong on individual rows:
-- starting cash position (the "before this date, trust this number" anchor),
-- fundraising goal, contingency unlock threshold, fiscal-year start month.
create table if not exists fin_config (
  id                              int primary key default 1,
  fiscal_year_start_month         int not null default 1
                                    check (fiscal_year_start_month between 1 and 12),
  current_year                    int not null default 2026,
  fundraising_goal                numeric(12,2),
  contingency_unlock_threshold    numeric(4,3) default 1.0,
  cash_starting_balance           numeric(12,2) default 0,
  cash_starting_date              date,
  updated_at                      timestamptz not null default now(),
  constraint fin_config_singleton check (id = 1)
);

drop trigger if exists fin_config_set_updated_at on fin_config;
create trigger fin_config_set_updated_at
  before update on fin_config
  for each row execute function set_updated_at();

insert into fin_config (id, current_year, fundraising_goal, contingency_unlock_threshold)
  values (1, 2026, 1247982, 1.09)
  on conflict (id) do nothing;

-- ── Category seed ──────────────────────────────────────────────────────────
-- Sourced from the 2026 Budget workbook (Budget-2026 tab) plus the Revenue
-- tab of the Financial Model. Functional class assignment follows standard
-- nonprofit accounting:
--   program       = PROGRAM, REWARDS (direct mission delivery)
--   admin         = ADMINISTRATION, OCCUPANCY, PROFESSIONAL SERVICES, PAYROLL
--                   (default for leadership — reclassify per-txn for program
--                   staff time), TRAVEL, OTHER VEHICLE, MISC
--   fundraising   = FUNDRAISING, MARKETING (donor acquisition counts as
--                   fundraising in 990 reporting)
--
-- ON CONFLICT DO NOTHING so re-running this migration won't overwrite any
-- in-place renames the team has done since.
insert into fin_categories
  (id, group_name, display_name, kind, functional_class, sort_order)
values
  -- PAYROLL (from Cash Flow tab; not separately broken out in budget)
  ('payroll.ceo',                'PAYROLL', 'CEO',                                'expense', 'admin',       100),
  ('payroll.admin',              'PAYROLL', 'Admin',                              'expense', 'admin',       101),
  ('payroll.cos',                'PAYROLL', 'Chief of Staff',                     'expense', 'admin',       102),
  ('payroll.taxes',              'PAYROLL', 'Payroll taxes',                      'expense', 'admin',       103),
  ('payroll.benefits',           'PAYROLL', 'Benefits',                           'expense', 'admin',       104),
  ('payroll.salaries-wages',     'PAYROLL', 'Salaries & wages',                   'expense', 'admin',       105),
  ('payroll.misc-fringe',        'PAYROLL', 'Misc fringe benefits',               'expense', 'admin',       106),

  -- ADMINISTRATION
  ('admin.bank-fees',            'ADMINISTRATION', 'Bank fees & service charges', 'expense', 'admin',       200),
  ('admin.contract-prof',        'ADMINISTRATION', 'Contract & professional fees','expense', 'admin',       201),
  ('admin.insurance-general',    'ADMINISTRATION', 'Insurance',                   'expense', 'admin',       202),
  ('admin.insurance-do',         'ADMINISTRATION', 'Directors & officers insurance','expense', 'admin',     203),
  ('admin.insurance-liability',  'ADMINISTRATION', 'Liability insurance',         'expense', 'admin',       204),
  ('admin.insurance-property',   'ADMINISTRATION', 'Property insurance',          'expense', 'admin',       205),
  ('admin.licenses-permits',     'ADMINISTRATION', 'License, permits, taxes, fees','expense', 'admin',      206),
  ('admin.memberships-subs',     'ADMINISTRATION', 'Memberships, subscriptions & apps','expense', 'admin',  207),
  ('admin.payroll-subscription', 'ADMINISTRATION', 'Payroll subscription',        'expense', 'admin',       208),
  ('admin.401k',                 'ADMINISTRATION', '401k',                        'expense', 'admin',       209),
  ('admin.health-reimbursement', 'ADMINISTRATION', 'Health reimbursement',        'expense', 'admin',       210),
  ('admin.office-equipment',     'ADMINISTRATION', 'Office equipment',            'expense', 'admin',       211),
  ('admin.office-supplies',      'ADMINISTRATION', 'Office supplies',             'expense', 'admin',       212),
  ('admin.printing',             'ADMINISTRATION', 'Printing & photocopying',     'expense', 'admin',       213),
  ('admin.shipping',             'ADMINISTRATION', 'Shipping & postage',          'expense', 'admin',       214),

  -- OCCUPANCY
  ('occupancy.rent',             'OCCUPANCY',  'Rent',                            'expense', 'admin',       300),
  ('occupancy.furniture',        'OCCUPANCY',  'Office furniture',                'expense', 'admin',       301),
  ('occupancy.utilities',        'OCCUPANCY',  'Utilities',                       'expense', 'admin',       302),

  -- PERSONNEL (people-related expenses outside of base payroll)
  ('personnel.employer-liability','PERSONNEL', 'Employer''s liabilities',         'expense', 'admin',       400),
  ('personnel.state-compliance', 'PERSONNEL',  'Employer state compliance',       'expense', 'admin',       401),
  ('personnel.entertainment',    'PERSONNEL',  'Entertainment meals',             'expense', 'admin',       402),
  ('personnel.health-insurance', 'PERSONNEL',  'Health insurance & accident plans','expense', 'admin',      403),
  ('personnel.hsa',              'PERSONNEL',  'Health Insurance Savings Plan (pretax)','expense', 'admin', 404),
  ('personnel.prof-development', 'PERSONNEL',  'Professional development',        'expense', 'admin',       405),
  ('personnel.contract-prof',    'PERSONNEL',  'Contract & professional fees',    'expense', 'admin',       406),
  ('personnel.team-building',    'PERSONNEL',  'Team building',                   'expense', 'admin',       407),
  ('personnel.recognition',      'PERSONNEL',  'Recognition',                     'expense', 'admin',       408),
  ('personnel.recruitment',      'PERSONNEL',  'Recruitment',                     'expense', 'admin',       409),
  ('personnel.workers-comp',     'PERSONNEL',  'Workers'' compensation insurance','expense', 'admin',       410),

  -- PROFESSIONAL SERVICES
  ('prof.accounting',            'PROFESSIONAL SERVICES', 'Accounting fees',      'expense', 'admin',       500),
  ('prof.legal',                 'PROFESSIONAL SERVICES', 'Legal fees',           'expense', 'admin',       501),

  -- CHARITABLE CONTRIBUTIONS
  ('charitable.contributions',   'CHARITABLE CONTRIBUTIONS', 'Charitable contributions','expense', 'admin', 600),

  -- FUNDRAISING
  ('fundraising.contract-prof',  'FUNDRAISING','Contract & professional services','expense', 'fundraising', 700),
  ('fundraising.donor-platform', 'FUNDRAISING','Donor platform fees',             'expense', 'fundraising', 701),
  ('fundraising.donor-steward',  'FUNDRAISING','Donor stewardship',               'expense', 'fundraising', 702),
  ('fundraising.donor-gift',     'FUNDRAISING','Donor gift',                      'expense', 'fundraising', 703),
  ('fundraising.printing',       'FUNDRAISING','Printing',                        'expense', 'fundraising', 704),
  ('fundraising.shipping',       'FUNDRAISING','Shipping, freight & delivery',    'expense', 'fundraising', 705),
  ('fundraising.supplies',       'FUNDRAISING','Supplies',                        'expense', 'fundraising', 706),
  ('fundraising.events',         'FUNDRAISING','Events',                          'expense', 'fundraising', 707),
  ('fundraising.grant-writing',  'FUNDRAISING','Grant writing services',          'expense', 'fundraising', 708),

  -- MARKETING (donor acquisition → fundraising functional class)
  ('marketing.listing-fees',     'MARKETING',  'Listing fees',                    'expense', 'fundraising', 800),
  ('marketing.social-media',     'MARKETING',  'Social media',                    'expense', 'fundraising', 801),
  ('marketing.social-contract',  'MARKETING',  'Social media — contract & prof',  'expense', 'fundraising', 802),
  ('marketing.website',          'MARKETING',  'Website',                         'expense', 'fundraising', 803),
  ('marketing.website-sub',      'MARKETING',  'Website subscription',            'expense', 'fundraising', 804),
  ('marketing.website-redesign', 'MARKETING',  'Website redesign',                'expense', 'fundraising', 805),

  -- MISC BUSINESS
  ('misc.business',              'MISC. BUSINESS EXPENSE', 'Misc. business expense','expense','admin',       900),
  ('misc.interest',              'MISC. BUSINESS EXPENSE', 'Interest',            'expense', 'admin',       901),
  ('misc.unapplied-cash',        'MISC. BUSINESS EXPENSE', 'Unapplied cash bill payment','expense','admin', 902),

  -- PROGRAM (direct mission)
  ('program.course-development', 'PROGRAM',    'Course development',              'expense', 'program',     1000),
  ('program.course-contract',    'PROGRAM',    'Course development — contract & prof','expense', 'program', 1001),
  ('program.course-equipment',   'PROGRAM',    'Course development — equipment',  'expense', 'program',     1002),
  ('program.video-creation',     'PROGRAM',    'Video creation',                  'expense', 'program',     1003),
  ('program.video-contract',     'PROGRAM',    'Video creation — contract & prof','expense', 'program',     1004),
  ('program.engagement',         'PROGRAM',    'Engagement',                      'expense', 'program',     1005),
  ('program.engagement-contract','PROGRAM',    'Engagement — contract & prof',    'expense', 'program',     1006),
  ('program.engagement-awards',  'PROGRAM',    'Engagement — awards',             'expense', 'program',     1007),
  ('program.recruitment',        'PROGRAM',    'Program recruitment',             'expense', 'program',     1008),
  ('program.impact-assessment',  'PROGRAM',    'Impact assessment',               'expense', 'program',     1009),
  ('program.beta-testers',       'PROGRAM',    'Beta testers',                    'expense', 'program',     1010),
  ('program.partnership-dev',    'PROGRAM',    'Partnership development',         'expense', 'program',     1011),
  ('program.partnership-events', 'PROGRAM',    'Partnership development — events','expense', 'program',     1012),
  ('program.partnership-display','PROGRAM',    'Partnership development — display','expense','program',     1013),
  ('program.tech-app',           'PROGRAM',    'App creation & maintenance',      'expense', 'program',     1014),
  ('program.tech-design',        'PROGRAM',    'Tech — design',                   'expense', 'program',     1015),
  ('program.tech-implementation','PROGRAM',    'Tech — implementation',           'expense', 'program',     1016),
  ('program.tech-product-mgmt',  'PROGRAM',    'Tech — product management',       'expense', 'program',     1017),
  ('program.tech-software-dev',  'PROGRAM',    'Tech — software development',     'expense', 'program',     1018),

  -- REWARDS (program — direct to beneficiaries)
  ('rewards.payouts',            'REWARDS',    'Student rewards & payouts',       'expense', 'program',     1100),

  -- TRAVEL
  ('travel.airfare',             'TRAVEL',     'Airfare',                         'expense', 'admin',       1200),
  ('travel.internet',            'TRAVEL',     'Internet / WiFi',                 'expense', 'admin',       1201),
  ('travel.hotels',              'TRAVEL',     'Hotels',                          'expense', 'admin',       1202),
  ('travel.meals',               'TRAVEL',     'Meals',                           'expense', 'admin',       1203),
  ('travel.parking',             'TRAVEL',     'Parking',                         'expense', 'admin',       1204),
  ('travel.taxis',               'TRAVEL',     'Taxis or shared rides',           'expense', 'admin',       1205),
  ('travel.vehicle-rental',      'TRAVEL',     'Vehicle rental',                  'expense', 'admin',       1206),
  ('travel.fuel',                'TRAVEL',     'Fuel',                            'expense', 'admin',       1207),

  -- OTHER VEHICLE
  ('vehicle.parking-tolls',      'OTHER VEHICLE EXPENSE', 'Parking & tolls',      'expense', 'admin',       1300),
  ('vehicle.fines',              'OTHER VEHICLE EXPENSE', 'Vehicle fines & penalties','expense','admin',    1301),
  ('vehicle.gas-fuel',           'OTHER VEHICLE EXPENSE', 'Vehicle gas & fuel',   'expense', 'admin',       1302),

  -- REVENUE (mirrored from Financial Model > Revenue tab)
  ('revenue.gov-grants',         'REVENUE',    'Government grants',               'revenue', null,          2000),
  ('revenue.foundations',        'REVENUE',    'Foundation grants',               'revenue', null,          2001),
  ('revenue.corporate',          'REVENUE',    'Corporate grants',                'revenue', null,          2002),
  ('revenue.individuals',        'REVENUE',    'Individual donations',            'revenue', null,          2003),
  ('revenue.accelerator',        'REVENUE',    'Accelerator',                     'revenue', null,          2004),
  ('revenue.earned',             'REVENUE',    'Earned income (paid contracts)',  'revenue', null,          2005),
  ('revenue.interest',           'REVENUE',    'Interest income',                 'revenue', null,          2006),
  ('revenue.other',              'REVENUE',    'Other revenue',                   'revenue', null,          2007),

  -- TRANSFER (not counted as revenue or expense)
  ('transfer.internal',          'TRANSFER',   'Internal transfer',               'transfer', null,         3000),
  ('transfer.reimbursement',     'TRANSFER',   'Reimbursement',                   'transfer', null,         3001)

on conflict (id) do nothing;

-- ── 2026 budget seed (Base column from Budget-2026) ────────────────────────
-- Activated contingency starts at 0; the team flips this on once the
-- fundraising threshold is crossed. Tier 1 / Tier 2 left at 0 here; the
-- "MARKETING.social-contract" $90k and "MARKETING.website-redesign" $20k
-- contingency amounts visible in the workbook are seeded as tier 1.
insert into fin_budget (year, category_id, base_amount, contingency_t1) values
  (2026, 'admin.bank-fees',             352,   0),
  (2026, 'admin.insurance-do',          1770,  0),
  (2026, 'admin.insurance-liability',   9300,  0),
  (2026, 'admin.licenses-permits',      600,   0),
  (2026, 'admin.memberships-subs',      22200, 0),
  (2026, 'admin.payroll-subscription',  1860,  0),
  (2026, 'admin.401k',                  2000,  0),
  (2026, 'admin.health-reimbursement',  1500,  0),
  (2026, 'admin.office-equipment',      1000,  0),
  (2026, 'admin.office-supplies',       1000,  0),
  (2026, 'admin.printing',              100,   0),
  (2026, 'admin.shipping',              500,   0),
  (2026, 'occupancy.rent',              7000,  0),
  (2026, 'occupancy.furniture',         1000,  0),
  (2026, 'personnel.employer-liability',28000, 0),
  (2026, 'personnel.state-compliance',  500,   0),
  (2026, 'personnel.entertainment',     300,   0),
  (2026, 'personnel.hsa',               30000, 0),
  (2026, 'personnel.prof-development',  1400,  0),
  (2026, 'personnel.contract-prof',     24000, 0),
  (2026, 'personnel.team-building',     2500,  0),
  (2026, 'personnel.recognition',       2000,  0),
  (2026, 'payroll.salaries-wages',      336000,0),
  (2026, 'payroll.misc-fringe',         3000,  0),
  (2026, 'personnel.workers-comp',      1200,  0),
  (2026, 'prof.accounting',             2000,  0),
  (2026, 'fundraising.donor-platform',  500,   0),
  (2026, 'fundraising.donor-steward',   1000,  0),
  (2026, 'fundraising.donor-gift',      5000,  0),
  (2026, 'fundraising.printing',        100,   0),
  (2026, 'fundraising.shipping',        1000,  0),
  (2026, 'fundraising.supplies',        300,   0),
  (2026, 'fundraising.events',          10000, 0),
  (2026, 'marketing.social-contract',   0,     90000),
  (2026, 'marketing.website-redesign',  0,     20000),
  (2026, 'program.course-contract',     78000, 0),
  (2026, 'program.engagement-contract', 90000, 0),
  (2026, 'program.impact-assessment',   5000,  0),
  (2026, 'program.partnership-dev',     10000, 0),
  (2026, 'program.partnership-events',  5000,  0),
  (2026, 'program.partnership-display', 1000,  0),
  (2026, 'program.tech-app',            400000,0),
  (2026, 'program.video-contract',      50000, 0),
  (2026, 'rewards.payouts',             100000,0),
  (2026, 'travel.airfare',              2000,  0),
  (2026, 'travel.internet',             300,   0),
  (2026, 'travel.hotels',               3000,  0),
  (2026, 'travel.meals',                2000,  0),
  (2026, 'travel.parking',              500,   0),
  (2026, 'travel.taxis',                700,   0),
  (2026, 'travel.vehicle-rental',       1000,  0),
  (2026, 'travel.fuel',                 300,   0)
on conflict (year, category_id) do nothing;
