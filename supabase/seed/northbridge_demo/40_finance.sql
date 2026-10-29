-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — Finance: chart of accounts (fin_categories), budgets (this FY and
--             last FY), bank-feed transactions (last FY in full + this FY
--             through yesterday), weekly/monthly CSV imports, categorization
--             rules, manual revenue commitments, the Reconcile inbox, finance
--             report artifacts (documents doc_type 'fin_report' + waivers + an
--             approved Reed report narrative), and this org's fin_config numbers.
--
-- How the headline numbers come out (computed by the app, not stored):
--   * cash on hand = cash_starting_balance + Σ(transactions after
--     cash_starting_date). The anchor is the FY opening balance (June 30), so
--     the dashboard's 12-month cash-flow line starts at the anchor and ends at
--     today's cash. The anchor is DERIVED below from the seeded rows so that
--     the cash runway tier = (cash − what's left of this month's baseline
--     spend) / baseline lands on 5.5 months against the 6-month target.
--   * burn = trailing 3 active FY months (the current month is partial).
--   * monthly_burn_baseline = $270K: the budgeted recurring run-rate
--     ($3.40M less the restricted, seasonal Summer Works wages ÷ 12).
--
-- Notes for the integrator:
--   * fin_categories.id is a GLOBAL text PK shared across tenants, so every id
--     is 'nb.' + the canonical id (nb.revenue.foundations, …).
--   * fin_imports.file_hash and the pending (source, source_ref) index on
--     fin_reconciliation_items are global too: both carry 'nb:' keys.
--   * Budget rows are expense-only: the dashboard sums every fin_budget row of
--     the year into "total budget", so revenue lines would double it. The
--     $3.55M revenue plan is fin_config.fundraising_goal.
--   * Grant / pledge / gift money owned by Sections 3a/3b is mirrored here as
--     bank deposits only (bible dates/amounts).
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ── Finance-local helpers (session-only, pg_temp) ──────────────────────────
create or replace function pg_temp.nbf_prev_bd(x date) returns date language sql immutable
  as $$ select case extract(isodow from x)::int when 6 then x - 1 when 7 then x - 2 else x end $$;
create or replace function pg_temp.nbf_next_bd(x date) returns date language sql immutable
  as $$ select case extract(isodow from x)::int when 6 then x + 2 when 7 then x + 1 else x end $$;
create or replace function pg_temp.nbf_eom(x date) returns date language sql immutable
  as $$ select (date_trunc('month', x) + interval '1 month - 1 day')::date $$;
-- base ± noise (fraction), deterministic by key, rounded to cents
create or replace function pg_temp.nbf_amt(base numeric, noise float8, k text) returns numeric language sql immutable
  as $$ select round((base * (1 + noise * (2 * pg_temp.rnd(k) - 1)))::numeric, 2) $$;
-- the app's dedup hash (lib/finance/dedup.ts): sha256 of
-- date|amountCents|UPPER(collapsed description)|occurrence
create or replace function pg_temp.nbf_hash(x date, amt numeric, descr text, occ int) returns text language sql immutable
  as $$ select encode(sha256(convert_to(
           x::text || '|' || round(amt * 100)::bigint::text || '|' ||
           btrim(regexp_replace(upper(descr), '\s+', ' ', 'g')) || '|' || occ::text, 'UTF8')), 'hex') $$;
-- first day of last FY, and the end of the current FY
create or replace function pg_temp.nbf_ly_start() returns date language sql stable
  as $$ select (pg_temp.fy_start() - interval '1 year')::date $$;
create or replace function pg_temp.nbf_fy_end() returns date language sql stable
  as $$ select (pg_temp.fy_start() + interval '1 year - 1 day')::date $$;
-- timestamp at a Pacific wall-clock time on a calendar date
create or replace function pg_temp.nbf_ts(x date, hhmi text) returns timestamptz language sql stable
  as $$ select pg_temp.ts(x - pg_temp.nb_anchor(), hhmi) $$;
-- Summer Works start (Monday on/after June 16) for a given year
create or replace function pg_temp.nbf_summer(y int) returns date language sql immutable
  as $$ select d + ((8 - extract(isodow from d)::int) % 7) from (select make_date(y, 6, 16) d) x $$;
-- School year start (Monday on/after Aug 18) for a given year
create or replace function pg_temp.nbf_sy(y int) returns date language sql immutable
  as $$ select d + ((8 - extract(isodow from d)::int) % 7) from (select make_date(y, 8, 18) d) x $$;
-- GivingTuesday (Tuesday after the 4th Thursday of November)
create or replace function pg_temp.nbf_gt(y int) returns date language sql immutable
  as $$ select d + ((11 - extract(isodow from d)::int) % 7) + 21 + 5 from (select make_date(y, 11, 1) d) x $$;
-- fiscal year (Jul–Jun, named by end year) that a date falls in
create or replace function pg_temp.nbf_fy_of(x date) returns int language sql immutable
  as $$ select extract(year from x)::int + case when extract(month from x) >= 7 then 1 else 0 end $$;
-- the most recent past December's year (bible: seasonal clusters)
create or replace function pg_temp.nbf_last_dec() returns int language sql stable
  as $$ select extract(year from pg_temp.d(0))::int - case when extract(month from pg_temp.d(0)) = 12 then 0 else 1 end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Chart of accounts
-- ════════════════════════════════════════════════════════════════════════════
insert into public.fin_categories
  (id, org_id, group_name, display_name, kind, functional_class, sort_order, enabled, notes, created_at, updated_at)
select c.id, pg_temp.nb_org(), c.grp, c.dn, c.kind, c.fc, c.o, true, c.notes,
       pg_temp.nbf_ts(pg_temp.nbf_ly_start() - 20, '10:15'), pg_temp.nbf_ts(pg_temp.nbf_ly_start() - 20, '10:15')
from (values
  -- revenue
  ('nb.revenue.foundations',   'Revenue',   'Foundation grants',                    'revenue',  null::text,    10, 'Private and community foundations, incl. multi-year general operating.'),
  ('nb.revenue.gov-grants',    'Revenue',   'Government grants & contracts',        'revenue',  null,          11, 'Eastshore WDB cost-reimbursement contract, state YOI award.'),
  ('nb.revenue.corporate',     'Revenue',   'Corporate grants & sponsorships',      'revenue',  null,          12, 'Employer partners, sponsorships, employee matching gifts.'),
  ('nb.revenue.individuals',   'Revenue',   'Individual & family giving',           'revenue',  null,          13, 'Online payouts, lockbox and mobile check deposits, DAF grants.'),
  ('nb.revenue.events',        'Revenue',   'Special events (gala)',                'revenue',  null,          14, 'Northbridge Rising Gala tickets, tables, paddle raise.'),
  ('nb.revenue.earned',        'Revenue',   'Earned revenue',                       'revenue',  null,          15, 'Summer Works host-employer wage share; Launchpad school site fees.'),
  ('nb.revenue.interest',      'Revenue',   'Interest income',                      'revenue',  null,          16, 'Reserve money-market sweep.'),
  ('nb.revenue.in-kind',       'Revenue',   'In-kind contributions',                'revenue',  null,          17, 'Booked by journal entry at month end; never in the bank feed.'),
  ('nb.revenue.other',         'Revenue',   'Other income & refunds',               'revenue',  null,          18, 'Vendor refunds, reimbursements, returned items.'),
  ('nb.transfer.internal',     'Transfers', 'Transfers between accounts',           'transfer', null,          19, 'Operating ↔ reserve sweep. Not income or expense.'),
  -- personnel
  ('nb.personnel.salaries-program', 'Personnel', 'Salaries — program staff',             'expense', 'program',     20, 'Launchpad, Pathways, Summer Works and Mentor Circles staff.'),
  ('nb.personnel.salaries-ops',     'Personnel', 'Salaries — management & operations',   'expense', 'admin',       21, 'ED (shared), COO, finance, data.'),
  ('nb.personnel.salaries-dev',     'Personnel', 'Salaries — development',               'expense', 'fundraising', 22, 'Development director, grants manager, events associate.'),
  ('nb.personnel.payroll-taxes',    'Personnel', 'Payroll taxes (employer)',             'expense', 'program',     23, 'Allocated with program salaries; split by FTE in the year-end 990 workpapers.'),
  ('nb.personnel.health-benefits',  'Personnel', 'Health, dental & vision',              'expense', 'program',     24, 'Allocated with program salaries; split by FTE in the year-end 990 workpapers.'),
  ('nb.personnel.retirement',       'Personnel', '403(b) employer match',                'expense', 'program',     25, '3% match, remitted each payroll.'),
  ('nb.personnel.workers-comp',     'Personnel', 'Workers'' compensation',               'expense', 'program',     26, 'Monthly installment; audited each spring.'),
  -- youth stipends & wages
  ('nb.stipends.summer-works',  'Youth Stipends & Wages', 'Summer Works intern wages',          'expense', 'program', 30, 'Intern payroll + employer taxes + completion bonus. Youth Stipend Fund (restricted).'),
  ('nb.stipends.pathways',      'Youth Stipends & Wages', 'Pathways fellow stipends',           'expense', 'program', 31, '$150/month per active fellow, paid on the 1st and 15th.'),
  ('nb.stipends.incentives',    'Youth Stipends & Wages', 'Launchpad attendance incentives',    'expense', 'program', 32, 'Gift cards for attendance streaks and milestone completions.'),
  -- program delivery
  ('nb.program.supplies',          'Program Delivery', 'Program supplies & curriculum',        'expense', 'program', 40, null),
  ('nb.program.meals',             'Program Delivery', 'Youth meals & snacks',                 'expense', 'program', 41, 'After-school snacks, Mentor Circles dinners.'),
  ('nb.program.certifications',    'Program Delivery', 'Certification training & exam fees',   'expense', 'program', 42, 'Pathways training partners and exam vouchers. Pathways Fellowship Fund.'),
  ('nb.program.youth-events',      'Program Delivery', 'Youth events & field trips',           'expense', 'program', 43, 'Career fair, graduations, Summer Works closing celebration.'),
  ('nb.program.consultants',       'Program Delivery', 'Evaluation & program consultants',     'expense', 'program', 44, 'External evaluator; youth wellness counseling.'),
  ('nb.program.background-checks', 'Program Delivery', 'Mentor & staff background checks',     'expense', 'program', 45, null),
  -- transportation
  ('nb.transport.transit-passes', 'Transportation', 'Youth transit passes',               'expense', 'program', 50, 'Monthly youth passes for Launchpad and Pathways participants.'),
  ('nb.transport.van',            'Transportation', 'Program van lease & fuel',           'expense', 'program', 51, null),
  ('nb.transport.mileage',        'Transportation', 'Staff mileage reimbursement',        'expense', 'program', 52, null),
  -- occupancy
  ('nb.occupancy.rent',        'Occupancy', 'Rent — 1450 Harbor Light Way',         'expense', 'program', 60, 'HQ and training rooms; ~80% program space by square footage.'),
  ('nb.occupancy.utilities',   'Occupancy', 'Utilities',                            'expense', 'program', 61, null),
  ('nb.occupancy.maintenance', 'Occupancy', 'Janitorial & maintenance',             'expense', 'program', 62, null),
  -- technology
  ('nb.tech.software',   'Technology', 'Software & subscriptions',             'expense', 'admin',   70, null),
  ('nb.tech.equipment',  'Technology', 'Computers & equipment',                'expense', 'program', 71, 'Fellow laptops are issued at cohort start.'),
  ('nb.tech.it-support', 'Technology', 'IT support (managed services)',        'expense', 'admin',   72, null),
  ('nb.tech.telecom',    'Technology', 'Phones & internet',                    'expense', 'admin',   73, null),
  -- professional fees
  ('nb.prof.audit',      'Professional Fees', 'Audit & 990 preparation',         'expense', 'admin', 80, 'Mendez Ostrowski LLP: fieldwork Oct–Dec, 990 in spring.'),
  ('nb.prof.legal',      'Professional Fees', 'Legal',                           'expense', 'admin', 81, null),
  ('nb.prof.hr-payroll', 'Professional Fees', 'HR advisory & payroll services',  'expense', 'admin', 82, null),
  -- insurance
  ('nb.insurance.package', 'Insurance', 'Liability, D&O, abuse & auto package', 'expense', 'admin', 90, 'Annual policy, paid in full at the September renewal.'),
  -- fundraising
  ('nb.fundraising.gala',        'Fundraising & Events', 'Gala production',                         'expense', 'fundraising', 100, 'Venue, catering, AV, auction platform.'),
  ('nb.fundraising.donor-comms', 'Fundraising & Events', 'Donor communications, printing & postage', 'expense', 'fundraising', 101, null),
  ('nb.fundraising.cultivation', 'Fundraising & Events', 'Donor cultivation & stewardship',          'expense', 'fundraising', 102, null),
  -- staff & board
  ('nb.staff.training', 'Staff & Board', 'Staff training & conferences', 'expense', 'program', 110, null),
  ('nb.staff.travel',   'Staff & Board', 'Local travel & parking',       'expense', 'program', 111, null),
  ('nb.admin.board',    'Staff & Board', 'Board & governance',           'expense', 'admin',   112, 'Board meeting meals, annual retreat.'),
  -- office & admin
  ('nb.admin.office',    'Office & Admin', 'Office supplies & printing',  'expense', 'admin', 120, null),
  ('nb.admin.bank-fees', 'Office & Admin', 'Bank fees',                   'expense', 'admin', 121, null),
  ('nb.admin.dues',      'Office & Admin', 'Dues, licenses & filings',    'expense', 'admin', 122, null)
) as c(id, grp, dn, kind, fc, o, notes)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Budgets — this FY ($3.40M expense) and last FY. Expense lines only.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.fin_budget
  (org_id, year, category_id, base_amount, contingency_t1, contingency_t2, activated_contingency, notes, created_at, updated_at)
select pg_temp.nb_org(), y.fy, b.cat,
       case when y.cur then b.amt else round(b.amt * b.ly / 100) * 100 end,
       case when y.cur then b.t1 else 0 end,
       case when y.cur then b.t2 else 0 end,
       0,
       case when y.cur then b.notes else null end,
       pg_temp.nbf_ts(y.fs - 24, '16:30'), pg_temp.nbf_ts(y.fs - 24, '16:30')
from (values
  -- category                         base      T1      T2     last-FY factor  notes
  ('nb.personnel.salaries-program', 1110000,      0,  62000, 0.930, 'T2: San Leandro site coordinator (half year), only if Meridian awards.'),
  ('nb.personnel.salaries-ops',      345000,      0,      0, 0.940, null::text),
  ('nb.personnel.salaries-dev',      195000,      0,      0, 0.900, 'Events associate joined mid-year last FY.'),
  ('nb.personnel.payroll-taxes',     140250,      0,   5300, 0.930, null),
  ('nb.personnel.health-benefits',   260400,      0,      0, 0.920, 'Premiums up 6.5% at the July renewal.'),
  ('nb.personnel.retirement',         49500,      0,      0, 0.930, null),
  ('nb.personnel.workers-comp',       17400,      0,      0, 0.950, null),
  ('nb.stipends.summer-works',       190000,      0,      0, 0.920, '85 interns × ~$2.1K incl. completion bonus. Funded by the Youth Stipend Fund.'),
  ('nb.stipends.pathways',            58000,  10800,      0, 0.940, 'Ten and a half months of stipends (none between cohorts). T1: raise the stipend from $150 to $175/month.'),
  ('nb.stipends.incentives',          16800,      0,      0, 1.000, null),
  ('nb.program.supplies',             45000,      0,   8000, 0.920, 'T2: San Leandro start-up kits.'),
  ('nb.program.meals',                48000,      0,      0, 0.950, null),
  ('nb.program.certifications',       66000,  18000,      0, 0.900, 'T1: six more healthcare seats in Cohort 8 if Hollis renews at $150K.'),
  ('nb.program.youth-events',         24000,      0,      0, 0.950, 'Career fair, graduation, cohort retreat, Summer Works closing.'),
  ('nb.program.consultants',          42000,      0,      0, 0.900, 'Evaluation partner (quarterly) + youth wellness counselor.'),
  ('nb.program.background-checks',     6000,      0,      0, 1.000, null),
  ('nb.transport.transit-passes',     50400,      0,   6000, 0.950, null),
  ('nb.transport.van',                17400,      0,      0, 1.000, null),
  ('nb.transport.mileage',             8400,      0,      0, 1.000, null),
  ('nb.occupancy.rent',              234000,      0,      0, 0.970, 'Lease year 4 of 7; 3% escalator each July.'),
  ('nb.occupancy.utilities',          26400,      0,      0, 1.000, null),
  ('nb.occupancy.maintenance',        22000,      0,      0, 1.000, null),
  ('nb.tech.software',                26400,      0,      0, 0.900, null),
  ('nb.tech.equipment',               32000,      0,      0, 0.900, '36 fellow laptops for Cohort 7 + replacements.'),
  ('nb.tech.it-support',              23400,      0,      0, 1.000, null),
  ('nb.tech.telecom',                 21000,      0,      0, 1.000, null),
  ('nb.prof.audit',                   38500,      0,      0, 0.950, 'Audit fee per engagement letter; 990 prep included.'),
  ('nb.prof.legal',                    9000,      0,      0, 1.000, null),
  ('nb.prof.hr-payroll',              16800,      0,      0, 1.000, null),
  ('nb.insurance.package',            46800,      0,      0, 0.940, 'Annual premium, paid at the September renewal.'),
  ('nb.fundraising.gala',            108000,      0,      0, 0.950, 'Northbridge Rising Gala, spring.'),
  ('nb.fundraising.donor-comms',      38000,   6000,      0, 0.900, 'T1: second year-end mailing wave.'),
  ('nb.fundraising.cultivation',      10000,      0,      0, 1.000, null),
  ('nb.staff.training',               27000,      0,      0, 0.900, null),
  ('nb.staff.travel',                  6000,      0,      0, 1.000, null),
  ('nb.admin.board',                  10000,      0,      0, 1.000, 'Board meeting meals + annual retreat.'),
  ('nb.admin.office',                 14000,      0,      0, 1.000, null),
  ('nb.admin.bank-fees',               1800,      0,      0, 1.000, null),
  ('nb.admin.dues',                    8000,      0,      0, 1.000, null)
) as b(cat, amt, t1, t2, ly, notes)
cross join (values (pg_temp.fy(), pg_temp.fy_start(), true),
                   (pg_temp.fy() - 1, pg_temp.nbf_ly_start(), false)) as y(fy, fs, cur)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Bank-feed transactions — staged in a session table, then inserted.
--    Window: first day of last FY through yesterday. Negative = money out.
-- ════════════════════════════════════════════════════════════════════════════
create temp table nbf_txn (
  k             text primary key,
  txn_date      date not null,
  description   text not null,
  amount        numeric(12,2) not null,
  category_id   text,
  restricted_to text,
  exclude       boolean not null default false,
  manual        boolean not null default false,  -- categorized by hand, not by a rule
  notes         text
) on commit drop;

-- ── 3a. Payroll: 15th and last day of each month (prior business day) ─────
insert into nbf_txn (k, txn_date, description, amount, category_id)
select 'pay:' || p.dept || ':' || r.dt, r.dt,
       'PAYWELL PAYROLL PR' || to_char(r.dt, 'MMDD') || ' DEPT ' || upper(p.dept),
       -pg_temp.nbf_amt(case when r.dt >= pg_temp.fy_start() then p.ty else p.ly end, 0.006, 'pay:' || p.dept || r.dt),
       p.cat
from (select pg_temp.nbf_prev_bd(x) dt
      from generate_series(pg_temp.nbf_ly_start(), pg_temp.d(-1), interval '1 day') g(t),
           lateral (select g.t::date x) s
      where extract(day from x) = 15 or x = pg_temp.nbf_eom(x)) r,
     (values ('prog', 46250, 43000, 'nb.personnel.salaries-program'),
             ('ops',  14375, 13510, 'nb.personnel.salaries-ops'),
             ('dev',   8125,  7310, 'nb.personnel.salaries-dev')) p(dept, ty, ly, cat)
where r.dt between pg_temp.nbf_ly_start() and pg_temp.d(-1)
on conflict do nothing;

-- employer taxes (8.5%) and the 403(b) match (3%) on each run
insert into nbf_txn (k, txn_date, description, amount, category_id)
select 'ptx:' || x.kind || ':' || s.txn_date, s.txn_date,
       case x.kind when 'tax' then 'PAYWELL TAX IMPOUND PR' else 'HARBORLINE 403B CONTRIB PR' end || to_char(s.txn_date, 'MMDD'),
       round(s.gross * x.rate, 2),
       case x.kind when 'tax' then 'nb.personnel.payroll-taxes' else 'nb.personnel.retirement' end
from (select txn_date, sum(amount) gross from nbf_txn where k like 'pay:%' group by txn_date) s,
     (values ('tax', 0.085), ('ret', 0.030)) x(kind, rate)
on conflict do nothing;

-- ── 3b. Summer Works intern payroll (biweekly Fridays), restricted ────────
insert into nbf_txn (k, txn_date, description, amount, category_id, restricted_to, notes)
select 'sw:' || r.kind || ':' || r.dt, r.dt, r.descr, r.amt, 'nb.stipends.summer-works', 'Youth Stipend Fund', r.note
from (
  select s.y, s.ss + o.off as dt, o.kind,
         case o.kind
           when 'bonus' then 'PAYWELL PAYROLL SW' || to_char(s.ss + o.off, 'MMDD') || ' COMPLETION BONUS'
           when 'tax'   then 'PAYWELL TAX IMPOUND SW' || to_char(s.ss + o.off, 'MMDD')
           else 'PAYWELL PAYROLL SW' || to_char(s.ss + o.off, 'MMDD') || ' SUMMER WORKS INTERNS' end as descr,
         -round((case when s.cur then 1 else 0.92 end * o.base * (1 + 0.01 * (2 * pg_temp.rnd('sw' || s.y || o.kind || o.off) - 1)))::numeric, 2) as amt,
         case when o.kind = 'bonus' then '82 of 85 interns completed all seven weeks ($300 each).' end as note
  from (select y, pg_temp.nbf_summer(y) ss, y = extract(year from pg_temp.summer_start())::int cur
        from (values (extract(year from pg_temp.summer_start())::int),
                     (extract(year from pg_temp.summer_start())::int - 1)) v(y)) s,
       (values ('run', 11, 41580), ('tax', 11, 3534),
               ('run', 25, 47740), ('tax', 25, 4058),
               ('run', 39, 44660), ('tax', 39, 3796),
               ('run', 53, 20020), ('tax', 53, 1702),
               ('bonus', 53, 24600)) o(kind, off, base)
) r
where r.dt between pg_temp.nbf_ly_start() and pg_temp.d(-1)
on conflict do nothing;

-- ── 3c. Recurring monthly lines ────────────────────────────────────────────
-- adj: n = next business day, p = prior business day, e = last business day
-- months: null = every month, else the calendar months it runs in
insert into nbf_txn (k, txn_date, description, amount, category_id, restricted_to)
select r.k || ':' || to_char(m.m, 'YYYY-MM'), x.dt,
       replace(replace(replace(r.tpl,
         '{MMDD}', to_char(x.dt, 'MMDD')),
         '{MON}', upper(to_char(x.dt, 'FMMon'))),
         '{AUTH}', to_char(x.dt - 1 - floor(pg_temp.rnd('auth' || r.k || m.m) * 2)::int, 'MM/DD')),
       -pg_temp.nbf_amt(case when x.dt >= pg_temp.fy_start() then r.ty else r.ly end
                        * coalesce(r.season[extract(month from x.dt)::int], 1),
                        r.noise, r.k || m.m),
       r.cat, r.rtd
from (values
  -- key            dom adj template                                                               this FY  last FY  noise  category                         months                         restricted_to      seasonal multipliers by calendar month (Jan..Dec)
  ('health',        1, 'n', 'BAYSHORE HEALTH ALLIANCE PREMIUM {MON}',                              19800,   18590,  0.00, 'nb.personnel.health-benefits', null::int[],                    null::text,          null::numeric[]),
  ('dental',        1, 'n', 'COASTAL DENTAL VISION PREMIUM {MON}',                                  1900,    1785,  0.00, 'nb.personnel.health-benefits', null,                           null,                null),
  ('wcomp',         5, 'n', 'ANCHORPOINT WORKERS COMP INSTALLMENT',                                 1450,    1380,  0.00, 'nb.personnel.workers-comp',    null,                           null,                null),
  ('rent',          1, 'n', '1450 HARBOR LIGHT LLC RENT {MON}',                                    19500,   18930,  0.00, 'nb.occupancy.rent',            null,                           null,                null),
  ('power',        12, 'n', 'EASTSHORE POWER & GAS AUTOPAY',                                        2150,    2080,  0.08, 'nb.occupancy.utilities',       null,                           null,                '{1.25,1.2,1.05,0.9,0.85,0.9,0.95,1.0,1.0,0.9,1.05,1.25}'),
  ('water',        18, 'n', 'EASTSHORE WATER DIST AUTOPAY',                                          420,     395,  0.10, 'nb.occupancy.utilities',       '{1,3,5,7,9,11}',               null,                null),
  ('janitor',       5, 'n', 'SPARKLE BAY JANITORIAL INV {MMDD}',                                    1450,    1450,  0.00, 'nb.occupancy.maintenance',     null,                           null,                null),
  ('hardware',     21, 'n', 'PURCHASE AUTHORIZED ON {AUTH} HARBORSIDE HARDWARE OAKLAND CA CARD 4417', 310,     290,  0.55, 'nb.occupancy.maintenance',     null,                           null,                null),
  ('internet',      8, 'n', 'BAYNET FIBER BUSINESS 1GB',                                             489,     489,  0.00, 'nb.tech.telecom',              null,                           null,                null),
  ('phones',       22, 'n', 'CELLWAVE WIRELESS AUTOPAY',                                            1265,    1190,  0.04, 'nb.tech.telecom',              null,                           null,                null),
  ('insurance',     5, 'n', 'KEYSTONE ARC INSURANCE ANNUAL PREMIUM',                               46800,   44000,  0.00, 'nb.insurance.package',         '{9}',                          null,                null),
  ('itsupport',     1, 'n', 'CIRRUS IT PARTNERS MANAGED SVC',                                       1950,    1950,  0.00, 'nb.tech.it-support',           null,                           null,                null),
  ('clouddesk',     2, 'n', 'CLOUDDESK WORKSPACE 24 SEATS',                                          528,     462,  0.00, 'nb.tech.software',             null,                           null,                null),
  ('tallybook',     4, 'n', 'TALLYBOOK ACCOUNTING SUBSCRIPTION',                                     215,     215,  0.00, 'nb.tech.software',             null,                           null,                null),
  ('learnhub',      7, 'n', 'LEARNHUB LMS PATHWAYS',                                                 612,     560,  0.00, 'nb.tech.software',             null,                           null,                null),
  ('meetspace',     9, 'n', 'MEETSPACE VIDEO PRO',                                                   180,     180,  0.00, 'nb.tech.software',             null,                           null,                null),
  ('mapwise',      11, 'n', 'MAPWISE DATA STUDIO',                                                   340,       0,  0.00, 'nb.tech.software',             null,                           null,                null),
  ('formwell',     14, 'n', 'FORMWELL FORMS TEAM',                                                    99,      99,  0.00, 'nb.tech.software',             null,                           null,                null),
  ('designloom',   19, 'n', 'DESIGNLOOM TEAM PLAN',                                                   60,      60,  0.00, 'nb.tech.software',             null,                           null,                null),
  ('signflow',     23, 'n', 'SIGNFLOW ESIGNATURE',                                                    45,      45,  0.00, 'nb.tech.software',             null,                           null,                null),
  ('sendly',       16, 'n', 'SENDLY EMAIL MARKETING',                                                189,     149,  0.00, 'nb.fundraising.donor-comms',   null,                           null,                null),
  ('transit',       1, 'n', 'EASTSHORE TRANSIT YOUTH PASS PROGRAM',                                 4200,    3990,  0.03, 'nb.transport.transit-passes',  null,                           null,                '{1,1,1,1,1,1.3,1.35,0.8,1,1,1,1}'),
  ('vanlease',      1, 'n', 'BAYFLEET VAN LEASE',                                                   1180,    1180,  0.00, 'nb.transport.van',             null,                           null,                null),
  ('fuel1',         9, 'n', 'PURCHASE AUTHORIZED ON {AUTH} HARBOR FUEL #12 OAKLAND CA CARD 4417',    138,     131,  0.30, 'nb.transport.van',             null,                           null,                null),
  ('fuel2',        24, 'n', 'PURCHASE AUTHORIZED ON {AUTH} HARBOR FUEL #12 OAKLAND CA CARD 4417',    126,     120,  0.30, 'nb.transport.van',             null,                           null,                null),
  ('mileage',      28, 'p', 'PAYWELL REIMB STAFF MILEAGE {MON}',                                     700,     650,  0.25, 'nb.transport.mileage',         null,                           null,                null),
  ('pwstip1',       1, 'n', 'PAYWELL STIPEND PATHWAYS FELLOWS {MMDD}',                              2700,    2550,  0.02, 'nb.stipends.pathways',         '{1,2,3,4,5,6,9,10,11,12}',     'Pathways Fellowship Fund', null),
  ('pwstip15',     15, 'p', 'PAYWELL STIPEND PATHWAYS FELLOWS {MMDD}',                              2700,    2550,  0.02, 'nb.stipends.pathways',         '{1,2,3,4,5,6,8,9,10,11,12}',   'Pathways Fellowship Fund', null),
  ('prizepath',    20, 'n', 'PURCHASE AUTHORIZED ON {AUTH} PRIZEPATH GIFT CARDS ONLINE CARD 4417',  1750,    1700,  0.20, 'nb.stipends.incentives',       '{1,2,3,4,5,9,10,11,12}',       null,                null),
  ('craftworks',   10, 'n', 'PURCHASE AUTHORIZED ON {AUTH} CRAFTWORKS EDU SUPPLY ONLINE CARD 4417', 2400,    2200,  0.35, 'nb.program.supplies',          null,                           null,                '{1,1,1,1,0.8,0.6,0.5,1.5,3.2,1,1,0.8}'),
  ('snack1',        6, 'n', 'PURCHASE AUTHORIZED ON {AUTH} ORCHARD SNACK SUPPLY OAKLAND CA CARD 4417', 1250, 1180,  0.20, 'nb.program.meals',             '{1,2,3,4,5,9,10,11,12}',       null,                null),
  ('snack2',       20, 'n', 'PURCHASE AUTHORIZED ON {AUTH} ORCHARD SNACK SUPPLY OAKLAND CA CARD 4417', 1250, 1180,  0.20, 'nb.program.meals',             '{1,2,3,4,5,9,10,11,12}',       null,                null),
  ('mesaverde',    14, 'n', 'MESA VERDE CATERING INV {MMDD}',                                       1650,    1560,  0.25, 'nb.program.meals',             null,                           null,                '{1,1,1,1,1,1.6,1.8,0.7,1,1,1,1}'),
  ('mindful',      12, 'n', 'MINDFUL MOVES COUNSELING INV {MMDD}',                                  2000,    1800,  0.00, 'nb.program.consultants',       '{1,2,3,4,5,9,10,11,12}',       null,                null),
  ('insight',      15, 'n', 'INSIGHT LOOP EVALUATION Q INV {MMDD}',                                 6500,    5900,  0.00, 'nb.program.consultants',       '{1,4,7,10}',                   null,                null),
  ('clearcheck',   17, 'n', 'CLEARCHECK SCREENING BATCH {MMDD}',                                     330,     310,  0.30, 'nb.program.background-checks', null,                           null,                '{1,1.5,1,1,1,1.4,1,1.2,8,1.2,1,1}'),
  ('peoplefirst',   3, 'n', 'PEOPLEFIRST HR ADVISORS RETAINER',                                     1200,    1200,  0.00, 'nb.prof.hr-payroll',           null,                           null,                null),
  ('paywellfee',    3, 'n', 'PAYWELL FEES {MON} SERVICE',                                            214,     198,  0.03, 'nb.prof.hr-payroll',           null,                           null,                null),
  ('bankfee',      28, 'e', 'BAY COMMONS BANK SERVICE FEE',                                           95,      95,  0.00, 'nb.admin.bank-fees',           null,                           null,                null),
  ('achfee',       28, 'e', 'BAY COMMONS ACH ORIGINATION FEE',                                        38,      34,  0.20, 'nb.admin.bank-fees',           null,                           null,                null),
  ('bayline',      13, 'n', 'PURCHASE AUTHORIZED ON {AUTH} BAYLINE OFFICE SUPPLY OAKLAND CA CARD 4417', 950,   900,  0.35, 'nb.admin.office',              null,                           null,                null),
  ('cafe',         17, 'n', 'PURCHASE AUTHORIZED ON {AUTH} LAKESIDE CAFE OAKLAND CA CARD 4417',      260,     240,  0.40, 'nb.fundraising.cultivation',   null,                           null,                null),
  ('parking',      26, 'n', 'PURCHASE AUTHORIZED ON {AUTH} HARBOR PARKING GARAGE OAKLAND CA CARD 4417', 220,   200,  0.35, 'nb.staff.travel',              null,                           null,                null),
  -- seasonal program costs that recur every year in the same months
  ('techpath',     10, 'n', 'TECHPATH TRAINING INSTITUTE TERM INV {MMDD}',                         10800,   10000,  0.00, 'nb.program.certifications',    '{2,9}',                        'Pathways Fellowship Fund', null),
  ('allcare',      11, 'n', 'ALLCARE NURSING ACADEMY CNA COHORT INV {MMDD}',                        9600,    8800,  0.00, 'nb.program.certifications',    '{2,9}',                        'Pathways Fellowship Fund', null),
  ('buildright',   16, 'n', 'BUILDRIGHT PRE-APPRENTICESHIP INV {MMDD}',                             6300,    5800,  0.00, 'nb.program.certifications',    '{2,9}',                        'Pathways Fellowship Fund', null),
  ('testpoint',    14, 'n', 'TESTPOINT EXAM VOUCHERS ORDER {MMDD}',                                 2530,    2300,  0.12, 'nb.program.certifications',    '{3,5,10,12}',                  'Pathways Fellowship Fund', null),
  ('audit',         9, 'n', 'MENDEZ OSTROWSKI LLP INV {MMDD}',                                     19000,   18000,  0.00, 'nb.prof.audit',                '{10}',                         null,                null),
  ('auditfinal',    8, 'n', 'MENDEZ OSTROWSKI LLP INV {MMDD}',                                     14000,   13500,  0.00, 'nb.prof.audit',                '{12}',                         null,                null),
  ('audit990',     12, 'n', 'MENDEZ OSTROWSKI LLP INV {MMDD} FORM 990',                             5500,    5200,  0.00, 'nb.prof.audit',                '{3}',                          null,                null),
  ('legal',        18, 'n', 'HALVERSON LEGAL GROUP INV {MMDD}',                                     2250,    2100,  0.30, 'nb.prof.legal',                '{8,11,3,5}',                     null,                null),
  ('youthwork',    10, 'n', 'YOUTHWORK INSTITUTE TRAINING REG',                                     3600,    3200,  0.00, 'nb.staff.training',            '{9}',                          null,                null),
  ('nll',          20, 'n', 'NONPROFIT LEADERSHIP LAB CONF REG',                                    2400,    2150,  0.00, 'nb.staff.training',            '{3}',                          null,                null),
  ('training',     24, 'n', 'PURCHASE AUTHORIZED ON {AUTH} BAYAREA YOUTH DEV NETWORK CARD 4417',    450,     420,  0.30, 'nb.staff.training',            '{1,2,4,5,6,7,8,10,11,12}',     null,                null),
  ('ywn',          12, 'n', 'YOUTH WORKFORCE NETWORK MEMBERSHIP',                                   2500,    2500,  0.00, 'nb.admin.dues',                '{9}',                          null,                null),
  ('ena',          15, 'n', 'EASTSHORE NONPROFIT ALLIANCE DUES',                                    1200,    1200,  0.00, 'nb.admin.dues',                '{1}',                          null,                null),
  ('charityreg',   14, 'n', 'ANNUAL CHARITY REGISTRATION RENEWAL',                                   250,     250,  0.00, 'nb.admin.dues',                '{5}',                          null,                null),
  ('printcraft',    6, 'n', 'PRINTCRAFT OAKLAND INV {MMDD}',                                        6200,    5600,  0.10, 'nb.fundraising.donor-comms',   '{11}',                         null,                null),
  ('printcraft2',  22, 'n', 'PRINTCRAFT OAKLAND INV {MMDD}',                                        2800,    2600,  0.15, 'nb.fundraising.donor-comms',   '{4}',                          null,                null),
  ('baymail',      12, 'n', 'BAYMAIL PRESORT POSTAGE ACCT',                                         4800,    4300,  0.10, 'nb.fundraising.donor-comms',   '{11}',                         null,                null),
  ('baymail2',     10, 'n', 'BAYMAIL PRESORT POSTAGE ACCT',                                         3100,    2900,  0.10, 'nb.fundraising.donor-comms',   '{3}',                          null,                null),
  ('baymail3',     23, 'n', 'BAYMAIL PRESORT POSTAGE ACCT',                                         2600,    2300,  0.10, 'nb.fundraising.donor-comms',   '{12}',                         null,                null),
  ('careerfair',   18, 'n', 'PURCHASE AUTHORIZED ON {AUTH} EASTSHORE EVENT RENTALS CARD 4417',      3400,    3100,  0.10, 'nb.program.youth-events',      '{3}',                          null,                null),
  ('graduation',   12, 'n', 'MESA VERDE CATERING EVENT {MMDD} GRADUATION',                   6500,    5900,  0.05, 'nb.program.youth-events',      '{6}',                          null,                null),
  ('seniors',      20, 'n', 'PURCHASE AUTHORIZED ON {AUTH} EASTSHORE EVENT RENTALS CARD 4417',      2900,    2600,  0.10, 'nb.program.youth-events',      '{5}',                          null,                null),
  ('fieldtrip',    14, 'n', 'PURCHASE AUTHORIZED ON {AUTH} BAYCITY CHARTER COACH CARD 4417',        1200,    1150,  0.20, 'nb.program.youth-events',      '{2,10,11}',                    null,                null),
  ('swclose',       8, 'n', 'PURCHASE AUTHORIZED ON {AUTH} FRUITVALE HUB EVENT SPACE CARD 4417',    3800,    3500,  0.05, 'nb.program.youth-events',      '{8}',                          null,                null),
  ('workwear',     19, 'n', 'SCRUBS & STEEL WORKWEAR INV {MMDD}',                                   8900,    8200,  0.05, 'nb.program.supplies',          '{8}',                          'Pathways Fellowship Fund', null),
  ('laptopfix',    22, 'n', 'TECHBARN BUSINESS ORDER {MMDD} REPLACEMENTS',                          2400,    2100,  0.10, 'nb.tech.equipment',            '{2,4}',                        null,                null),
  ('peaklead',      6, 'n', 'PEAKLEAD COACHING SUPERVISOR PROGRAM',                                  650,     600,  0.00, 'nb.staff.training',            null,                           null,                null),
  ('youthwork2',   13, 'n', 'YOUTHWORK INSTITUTE TRAUMA-INFORMED CERT',                             4200,    3900,  0.00, 'nb.staff.training',            '{1}',                          null,                null),
  ('rideshare',    16, 'n', 'PURCHASE AUTHORIZED ON {AUTH} BAYCITY RIDESHARE CARD 4417',             180,     170,  0.40, 'nb.staff.travel',              null,                           null,                null),
  ('impactrpt',    17, 'n', 'PRINTCRAFT OAKLAND INV {MMDD} IMPACT REPORT',                          3400,    3100,  0.08, 'nb.fundraising.donor-comms',   '{9}',                          null,                null),
  ('newsletter',   24, 'n', 'PRINTCRAFT OAKLAND INV {MMDD} NEWSLETTER',                             1400,    1300,  0.10, 'nb.fundraising.donor-comms',   '{2,5,8,11}',                   null,                null),
  ('springprint',  25, 'n', 'PRINTCRAFT OAKLAND INV {MMDD} SPRING APPEAL',                          3600,    3300,  0.08, 'nb.fundraising.donor-comms',   '{3}',                          null,                null),
  ('breakfast',    15, 'n', 'MESA VERDE CATERING EVENT {MMDD} DONOR BREAKFAST',                     2400,    2200,  0.10, 'nb.fundraising.cultivation',   '{10,4}',                       null,                null),
  ('sitevisit',    11, 'n', 'MESA VERDE CATERING EVENT {MMDD} SITE VISIT LUNCH',                     900,     850,  0.15, 'nb.fundraising.cultivation',   '{6,2}',                        null,                null),
  ('bizcert',      20, 'n', 'CITY BUSINESS TAX CERTIFICATE RENEWAL',                                 650,     620,  0.00, 'nb.admin.dues',                '{3}',                          null,                null),
  ('ydn',           9, 'n', 'YOUTH DEV NETWORK ANNUAL MEMBERSHIP',                                  1500,    1500,  0.00, 'nb.admin.dues',                '{7}',                          null,                null),
  ('orientation',  21, 'n', 'REDWOOD RIDGE OUTDOOR CENTER COHORT RETREAT',                          7200,    6800,  0.00, 'nb.program.youth-events',      '{8}',                          'Pathways Fellowship Fund', null),
  ('recruit',      13, 'n', 'PURCHASE AUTHORIZED ON {AUTH} SOCIALREACH ADS CARD 4417',               950,     900,  0.20, 'nb.program.supplies',          '{10,11,4,5}',                  null,                null)
) as r(k, dom, adj, tpl, ty, ly, noise, cat, months, rtd, season)
cross join lateral (
  select m::date as m from generate_series(date_trunc('month', pg_temp.nbf_ly_start()), date_trunc('month', pg_temp.d(-1)), interval '1 month') m
) m
cross join lateral (
  select case r.adj
           when 'e' then pg_temp.nbf_prev_bd(pg_temp.nbf_eom(m.m))
           when 'p' then pg_temp.nbf_prev_bd(m.m + least(r.dom, extract(day from pg_temp.nbf_eom(m.m))::int) - 1)
           else pg_temp.nbf_next_bd(m.m + least(r.dom, extract(day from pg_temp.nbf_eom(m.m))::int) - 1) end as dt
) x
where (r.months is null or extract(month from m.m)::int = any(r.months))
  and (case when x.dt >= pg_temp.fy_start() then r.ty else r.ly end) > 0
  and x.dt between pg_temp.nbf_ly_start() and pg_temp.d(-1)
on conflict do nothing;

-- ── 3d. Cohort-start equipment (every August: counts toward burn) ────────
insert into nbf_txn (k, txn_date, description, amount, category_id, exclude, manual, notes)
select 'laptops:' || y, pg_temp.nbf_next_bd(pg_temp.nbf_sy(y) - 10),
       'TECHBARN BUSINESS ORDER ' || (88000 + (y % 100) * 37) || ' 36 LAPTOPS',
       case when pg_temp.nbf_sy(y) >= pg_temp.fy_start() then -26640.00 else -24480.00 end,
       'nb.tech.equipment', false, true,
       'Laptops issued to the incoming Pathways cohort.'
from (values (extract(year from pg_temp.sy_start())::int), (extract(year from pg_temp.sy_start())::int - 1)) v(y)
where pg_temp.nbf_next_bd(pg_temp.nbf_sy(y) - 10) between pg_temp.nbf_ly_start() and pg_temp.d(-1)
on conflict do nothing;

-- ── 3e. Gala (the most recent one at d(-165), plus the one a year before) ─
insert into nbf_txn (k, txn_date, description, amount, category_id, manual, notes)
select 'gala:' || g.n || ':' || e.k, e.dt, e.descr, round(e.amt * g.f, 2), e.cat, e.manual, e.note
from (values (0, pg_temp.d(-165), 1.0::numeric), (1, pg_temp.d(-165) - 364, 0.91)) g(n, gd, f)
cross join lateral (values
  ('venue1',  pg_temp.nbf_next_bd(g.gd - 120), 'THE FOUNDRY AT JACK LONDON DEPOSIT',                         -6000.00, 'nb.fundraising.gala', true,  null::text),
  ('cater1',  pg_temp.nbf_next_bd(g.gd - 60),  'MESA VERDE CATERING INV GALA DEPOSIT',                      -12000.00, 'nb.fundraising.gala', true,  'Gala catering deposit (not youth meals).'),
  ('invite',  pg_temp.nbf_next_bd(g.gd - 45),  'PRINTCRAFT OAKLAND INV GALA INVITATIONS',                    -4200.00, 'nb.fundraising.gala', true,  null),
  ('floral',  pg_temp.nbf_prev_bd(g.gd - 1),   'PURCHASE AUTHORIZED ON ' || to_char(g.gd - 3, 'MM/DD') || ' BLOOMHOUSE FLORAL OAKLAND CA CARD 4417', -5600.00, 'nb.fundraising.gala', true, null),
  ('av',      pg_temp.nbf_prev_bd(g.gd - 2),   'STAGEWELL AV PRODUCTION INV',                                -9800.00, 'nb.fundraising.gala', true,  null),
  ('rental',  pg_temp.nbf_prev_bd(g.gd - 1),   'EASTSHORE EVENT RENTALS INV TABLEWARE',                      -4800.00, 'nb.fundraising.gala', true,  null),
  ('venue2',  pg_temp.nbf_prev_bd(g.gd - 3),   'THE FOUNDRY AT JACK LONDON BALANCE',                        -18000.00, 'nb.fundraising.gala', true,  null),
  ('cater2',  pg_temp.nbf_next_bd(g.gd + 5),   'MESA VERDE CATERING INV GALA BALANCE',                      -28400.00, 'nb.fundraising.gala', true,  'Gala catering balance (not youth meals).'),
  ('photo',   pg_temp.nbf_next_bd(g.gd + 7),   'LENSWORK PHOTO STUDIO INV',                                  -2200.00, 'nb.fundraising.gala', true,  null),
  ('staff',   pg_temp.nbf_next_bd(g.gd + 4),   'BAYSIDE EVENT STAFFING INV',                                 -3200.00, 'nb.fundraising.gala', true,  null),
  ('bidfee',  pg_temp.nbf_next_bd(g.gd + 10),  'BIDNEST AUCTION PLATFORM FEES',                              -3900.00, 'nb.fundraising.gala', true,  null),
  -- revenue: sponsorship checks, ticket payouts, table check, paddle raise
  ('spons1',  pg_temp.nbf_next_bd(g.gd - 88),  'LOCKBOX DEPOSIT 4 ITEMS',                                    40000.00, 'nb.revenue.events',   true,  'Gala sponsorships: four corporate table sponsors.'),
  ('spons2',  pg_temp.nbf_next_bd(g.gd - 61),  'LOCKBOX DEPOSIT 3 ITEMS',                                    32500.00, 'nb.revenue.events',   true,  'Gala sponsorships.'),
  ('spons3',  pg_temp.nbf_next_bd(g.gd - 34),  'LOCKBOX DEPOSIT 3 ITEMS',                                    22500.00, 'nb.revenue.events',   true,  'Gala sponsorships.'),
  ('tix1',    pg_temp.nbf_next_bd(g.gd - 42),  'TIXHALL PAYOUT',                                             18450.00, 'nb.revenue.events',   false, null),
  ('tix2',    pg_temp.nbf_next_bd(g.gd - 28),  'TIXHALL PAYOUT',                                             31275.00, 'nb.revenue.events',   false, null),
  ('tix3',    pg_temp.nbf_next_bd(g.gd - 14),  'TIXHALL PAYOUT',                                             38900.00, 'nb.revenue.events',   false, null),
  ('tix4',    pg_temp.nbf_next_bd(g.gd - 3),   'TIXHALL PAYOUT',                                             22125.00, 'nb.revenue.events',   false, null),
  ('table',   g.gd,                            'MOBILE DEPOSIT 1 ITEM',                                      15000.00, 'nb.revenue.events',   true,  'Alvarez family gala table.'),
  ('paddle1', pg_temp.nbf_next_bd(g.gd + 3),   'BIDNEST AUCTION PAYOUT',                                     36800.00, 'nb.revenue.events',   false, 'Paddle raise + silent auction.'),
  ('paddle2', pg_temp.nbf_next_bd(g.gd + 12),  'BIDNEST AUCTION PAYOUT',                                     18200.00, 'nb.revenue.events',   false, 'Paddle raise pledges paid after the night.'),
  ('paddle3', pg_temp.nbf_next_bd(g.gd + 18),  'LOCKBOX DEPOSIT 11 ITEMS',                                    9400.00, 'nb.revenue.events',   true,  'Paddle-raise pledges paid by check.')
) as e(k, dt, descr, amt, cat, manual, note)
where e.dt between pg_temp.nbf_ly_start() and pg_temp.d(-1)
on conflict do nothing;

-- ── 3f. Weekly giving deposits: online payouts (Tue), lockbox checks (Thu) ─
insert into nbf_txn (k, txn_date, description, amount, category_id)
select 'giv:' || w.kind || ':' || w.dt, w.dt,
       case w.kind when 'payout' then 'GIVEFLOW PAYOUT'
                   else 'LOCKBOX DEPOSIT ' || greatest(1, round(w.amt / 420))::int || ' ITEMS' end,
       w.amt,
       'nb.revenue.individuals'
from (
  select g::date as dt, k.kind,
         round((k.base
               * (array[0.9,0.85,1.05,1.3,1.1,1.15,0.8,0.7,0.85,1.0,1.35,2.6])[extract(month from g)::int]
               * case when g::date >= pg_temp.fy_start() then 1.0 else 0.98 end
               * (1 + 0.32 * (2 * pg_temp.rnd('giv' || k.kind || g::date) - 1)))::numeric, 2) as amt
  from generate_series(pg_temp.nbf_ly_start(), pg_temp.d(-1), interval '1 day') g
  join (values ('payout', 2, 3100), ('lockbox', 4, 7400)) k(kind, dow, base)
    on extract(isodow from g)::int = k.dow
) w
on conflict do nothing;

-- ── 3g. Named receipts, seasonal clusters, earned revenue, one-offs ───────
insert into nbf_txn (k, txn_date, description, amount, category_id, restricted_to, manual, notes, exclude)
select e.k, e.dt, e.descr, e.amt, e.cat, e.rtd, e.manual, e.note, e.k = 'misc:security'
from (values
  -- this FY (bible dates and amounts)
  ('rcv:hollis1',      pg_temp.d(-95),  'WIRE TRF IN HOLLIS FAMILY FOUNDATION PATHWAYS GRANT INST 1',  75000.00, 'nb.revenue.foundations', 'Pathways Fellowship Fund', false, 'Hollis installment 1 of 2.'),
  ('rcv:harrington',   pg_temp.d(-100), 'MOBILE DEPOSIT 1 ITEM',                                       20000.00, 'nb.revenue.individuals', null::text, true,  'Celeste Harrington, first half of her annual gift.'),
  ('rcv:redline',      pg_temp.d(-75),  'ACH CREDIT REDLINE BUILDERS INC DONATION',                    25000.00, 'nb.revenue.corporate',   null, false, null::text),
  ('rcv:bayview',      pg_temp.d(-60),  'WIRE TRF IN BAYVIEW COMMUNITY FOUNDATION GOS YR2',          250000.00, 'nb.revenue.foundations', null, false, 'General operating, year 2 of 3.'),
  ('rcv:harbor',       pg_temp.d(-40),  'ACH CREDIT HARBOR HEALTH PARTNERS COMMUNITY BENEFIT',         40000.00, 'nb.revenue.corporate',   'Pathways Fellowship Fund', false, 'Healthcare track.'),
  ('rcv:kinetic1',     pg_temp.d(-30),  'ACH CREDIT KINETIC LABS PLEDGE 1 OF 3',                       25000.00, 'nb.revenue.corporate',   null, false, null),
  ('rcv:goldberg',     pg_temp.d(-9),   'ACH CREDIT BAY LEGACY GIVING FUND GRANT',                     20000.00, 'nb.revenue.individuals', null, false, 'DAF grant recommended by Aaron Goldberg.'),
  ('rcv:psmatch',      pg_temp.nbf_next_bd(pg_temp.d(-35)), 'ACH CREDIT PACIFIC SUMMIT BANK EMPLOYEE MATCH', 5920.00, 'nb.revenue.corporate', null, false, 'Employee matching gifts, Q2.'),
  -- board gifts this FY (7 of 9 have given; Harrington above)
  ('rcv:bd_osei',      pg_temp.nbf_next_bd(pg_temp.d(-88)), 'MOBILE DEPOSIT 1 ITEM',                   10000.00, 'nb.revenue.individuals', null, false, 'Board gift.'),
  ('rcv:bd_lim',       pg_temp.nbf_next_bd(pg_temp.d(-70)), 'MOBILE DEPOSIT 1 ITEM',                    5000.00, 'nb.revenue.individuals', null, false, 'Board gift.'),
  ('rcv:bd_nakamura',  pg_temp.nbf_next_bd(pg_temp.d(-52)), 'ACH CREDIT BAY LEGACY GIVING FUND GRANT', 25000.00, 'nb.revenue.individuals', null, false, 'Board gift via DAF.'),
  ('rcv:bd_jackson',   pg_temp.nbf_next_bd(pg_temp.d(-47)), 'MOBILE DEPOSIT 1 ITEM',                    7500.00, 'nb.revenue.individuals', null, false, 'Board gift.'),
  ('rcv:bd_freeman',   pg_temp.nbf_next_bd(pg_temp.d(-25)), 'MOBILE DEPOSIT 1 ITEM',                    2500.00, 'nb.revenue.individuals', null, false, 'Board gift.'),
  -- last FY (bible-named receipts)
  ('rcv:pacific',      pg_temp.d(-140), 'ACH CREDIT PACIFIC SUMMIT BANK SPONSORSHIP',                   50000.00, 'nb.revenue.corporate',   null, false, 'Summer Works presenting sponsor.'),
  ('rcv:okafor',       pg_temp.d(-300), 'WIRE TRF IN N OKAFOR',                                         25000.00, 'nb.revenue.individuals', null, false, null),
  ('rcv:chen_ly',      pg_temp.d(-320), 'MOBILE DEPOSIT 1 ITEM',                                        50000.00, 'nb.revenue.individuals', null, true,  'Chen pledge, year 1 of 3.'),
  ('rcv:bayview_ly',   pg_temp.d(-425), 'WIRE TRF IN BAYVIEW COMMUNITY FOUNDATION GOS YR1',            250000.00, 'nb.revenue.foundations', null, false, 'General operating, year 1 of 3.'),
  ('rcv:harrington_ly',pg_temp.d(-465), 'MOBILE DEPOSIT 1 ITEM',                                        20000.00, 'nb.revenue.individuals', null, true,  'Celeste Harrington.'),
  ('rcv:hollis_ly1',   pg_temp.nbf_ly_start() + 16,  'WIRE TRF IN HOLLIS FAMILY FOUNDATION',             60000.00, 'nb.revenue.foundations', 'Pathways Fellowship Fund', false, null),
  ('rcv:hollis_ly2',   pg_temp.nbf_ly_start() + 237, 'WIRE TRF IN HOLLIS FAMILY FOUNDATION',             60000.00, 'nb.revenue.foundations', 'Pathways Fellowship Fund', false, null),
  ('rcv:cypress_ly',   pg_temp.nbf_next_bd(pg_temp.nbf_ly_start() + 145), 'ACH CREDIT THE CYPRESS FUND GRANT', 75000.00, 'nb.revenue.foundations', null, false, 'Launchpad.'),
  ('rcv:yoi_ly',       pg_temp.nbf_next_bd(pg_temp.nbf_ly_start() + 225), 'ACH CREDIT CA YOUTH OPPORTUNITY INIT AWARD YR1', 175000.00, 'nb.revenue.gov-grants', null, false, 'State YOI, year 1 of 2.'),
  ('rcv:eastbay_ly',   pg_temp.nbf_next_bd(pg_temp.nbf_ly_start() + 275), 'ACH CREDIT EAST BAY WORKFORCE FUND',      120000.00, 'nb.revenue.foundations', 'Youth Stipend Fund', false, 'Summer Works stipends.'),
  ('rcv:kinetic_ly',   pg_temp.nbf_next_bd(pg_temp.d(-180)), 'ACH CREDIT KINETIC LABS SPONSORSHIP',          30000.00, 'nb.revenue.corporate', null, false, 'Summer Works sponsor.'),
  ('rcv:harbor_ly',    pg_temp.nbf_next_bd(pg_temp.d(-170)), 'ACH CREDIT HARBOR HEALTH PARTNERS SPONSORSHIP', 20000.00, 'nb.revenue.corporate', null, false, 'Summer Works sponsor.'),
  ('rcv:redline_ly',   pg_temp.nbf_next_bd(pg_temp.d(-155)), 'ACH CREDIT REDLINE BUILDERS INC SPONSORSHIP',  15000.00, 'nb.revenue.corporate', null, false, 'Summer Works sponsor.'),
  ('rcv:swspons_ly',   pg_temp.nbf_next_bd(pg_temp.d(-160)), 'LOCKBOX DEPOSIT 6 ITEMS',                      52000.00, 'nb.revenue.corporate', null, true,  'Summer Works employer sponsorships (six checks).'),
  ('rcv:psmatch_ly1',  pg_temp.nbf_next_bd(pg_temp.d(-35) - 91 * 2), 'ACH CREDIT PACIFIC SUMMIT BANK EMPLOYEE MATCH', 4880.00, 'nb.revenue.corporate', null, false, null),
  ('rcv:psmatch_ly2',  pg_temp.nbf_next_bd(pg_temp.d(-35) - 91 * 3), 'ACH CREDIT PACIFIC SUMMIT BANK EMPLOYEE MATCH', 6150.00, 'nb.revenue.corporate', null, false, null),
  ('rcv:psmatch_ly3',  pg_temp.nbf_next_bd(pg_temp.d(-35) - 91),     'ACH CREDIT PACIFIC SUMMIT BANK EMPLOYEE MATCH', 5240.00, 'nb.revenue.corporate', null, false, null),
  -- last December: GivingTuesday + year-end clusters (most recent past December)
  ('dec:bell',         pg_temp.nbf_next_bd(make_date(pg_temp.nbf_last_dec(), 12, 15)), 'MOBILE DEPOSIT 1 ITEM',  10000.00, 'nb.revenue.individuals', null, true, 'Sarah Bell, annual December gift.'),
  ('dec:harrington',   pg_temp.nbf_next_bd(make_date(pg_temp.nbf_last_dec(), 12, 11)), 'MOBILE DEPOSIT 1 ITEM',  20000.00, 'nb.revenue.individuals', null, true, 'Celeste Harrington, second half.'),
  ('dec:gt',           pg_temp.nbf_gt(pg_temp.nbf_last_dec()) + 2,      'GIVEFLOW PAYOUT',                            21460.00, 'nb.revenue.individuals', null, false, 'GivingTuesday.'),
  ('dec:gt2',          pg_temp.nbf_gt(pg_temp.nbf_last_dec()) + 9,      'GIVEFLOW PAYOUT',                             8735.00, 'nb.revenue.individuals', null, false, null),
  ('dec:ye1',          pg_temp.nbf_prev_bd(make_date(pg_temp.nbf_last_dec(), 12, 22)), 'LOCKBOX DEPOSIT 48 ITEMS', 23180.00, 'nb.revenue.individuals', null, false, 'Year-end letter checks.'),
  ('dec:ye2',          pg_temp.nbf_prev_bd(make_date(pg_temp.nbf_last_dec(), 12, 30)), 'GIVEFLOW PAYOUT',          31940.00, 'nb.revenue.individuals', null, false, 'Year-end online.'),
  ('dec:ye3',          pg_temp.nbf_next_bd(make_date(pg_temp.nbf_last_dec() + 1, 1, 2)), 'GIVEFLOW PAYOUT',        18620.00, 'nb.revenue.individuals', null, false, 'Dec 31 gifts.'),
  ('dec:ye4',          pg_temp.nbf_next_bd(make_date(pg_temp.nbf_last_dec() + 1, 1, 6)), 'LOCKBOX DEPOSIT 71 ITEMS', 36450.00, 'nb.revenue.individuals', null, false, 'Year-end checks dated December.'),
  ('dec:dafs',         pg_temp.nbf_prev_bd(make_date(pg_temp.nbf_last_dec(), 12, 18)), 'ACH CREDIT BAY LEGACY GIVING FUND GRANT', 15000.00, 'nb.revenue.individuals', null, false, 'Three DAF grants.'),
  -- spring appeal (last April)
  ('spr:1',            pg_temp.nbf_next_bd(make_date(pg_temp.nbf_last_dec() + 1, 4, 22)), 'LOCKBOX DEPOSIT 39 ITEMS', 19840.00, 'nb.revenue.individuals', null, false, 'Spring appeal.'),
  ('spr:2',            pg_temp.nbf_next_bd(make_date(pg_temp.nbf_last_dec() + 1, 5, 6)),  'LOCKBOX DEPOSIT 22 ITEMS', 11260.00, 'nb.revenue.individuals', null, false, 'Spring appeal.'),
  -- Summer Works sponsorship checks through the lockbox (split by hand)
  ('lbx:sw_ly2',       pg_temp.nbf_next_bd(pg_temp.d(-150)), 'LOCKBOX DEPOSIT 5 ITEMS',                   46000.00, 'nb.revenue.corporate',   null, true, 'Summer Works employer sponsorships.'),
  ('lbx:sw_ly3',       pg_temp.nbf_next_bd(pg_temp.d(-128)), 'LOCKBOX DEPOSIT 4 ITEMS',                   34000.00, 'nb.revenue.corporate',   null, true, 'Summer Works employer sponsorships.'),
  ('rcv:eastshore_ly1',pg_temp.nbf_next_bd(pg_temp.nbf_ly_start() + 252), 'ACH CREDIT EASTSHORE WORKFORCE DEV BD REIMB', 85000.00, 'nb.revenue.gov-grants', 'Pathways Fellowship Fund', false, 'Pilot contract, Q3 reimbursement.'),
  ('rcv:eastshore_ly2',pg_temp.nbf_next_bd(pg_temp.nbf_ly_start() + 344), 'ACH CREDIT EASTSHORE WORKFORCE DEV BD REIMB', 95000.00, 'nb.revenue.gov-grants', 'Pathways Fellowship Fund', false, 'Pilot contract, Q4 reimbursement.'),
  -- vendor refund + misc (realism)
  ('misc:refund',      pg_temp.nbf_next_bd(pg_temp.d(-212)), 'PURCHASE RETURN CRAFTWORKS EDU SUPPLY',      418.22, 'nb.revenue.other', null, false, null),
  ('misc:security',    pg_temp.nbf_next_bd(pg_temp.fy_start() + 8), 'ALARMSAFE SYSTEMS INV HQ UPGRADE',  -7850.00, 'nb.occupancy.maintenance', null, true, 'Fire alarm panel + door access upgrade. One-time: excluded from runway burn.'),
  ('misc:retreatdep',  pg_temp.nbf_next_bd(pg_temp.d(-20)), 'HILLSIDE CONFERENCE CTR DEPOSIT',           -2500.00, 'nb.admin.board', null, true, 'Board retreat venue deposit.'),
  ('misc:bdmeal1',     pg_temp.nbf_next_bd(pg_temp.d(-43)), 'PURCHASE AUTHORIZED ON ' || to_char(pg_temp.d(-44), 'MM/DD') || ' MESA VERDE CATERING CARD 4417', -486.50, 'nb.admin.board', null, true, 'Board meeting dinner.'),
  ('misc:bdmeal2',     pg_temp.nbf_next_bd(pg_temp.d(-134)),'PURCHASE AUTHORIZED ON ' || to_char(pg_temp.d(-135), 'MM/DD') || ' MESA VERDE CATERING CARD 4417', -452.25, 'nb.admin.board', null, true, 'Board meeting dinner.'),
  ('misc:retreat_ly',  pg_temp.nbf_next_bd(pg_temp.d(-299)), 'HILLSIDE CONFERENCE CTR INV RETREAT',      -5850.00, 'nb.admin.board', null, true, 'Annual board retreat.'),
  ('misc:dupe',        pg_temp.nbf_next_bd(pg_temp.d(-26)), 'PURCHASE AUTHORIZED ON ' || to_char(pg_temp.d(-27), 'MM/DD') || ' BAYLINE OFFICE SUPPLY OAKLAND CA CARD 4417', -212.40, 'nb.admin.office', null, false, 'Duplicate charge; refund requested.'),
  ('misc:dupe_ref',    pg_temp.nbf_next_bd(pg_temp.d(-19)), 'PURCHASE RETURN BAYLINE OFFICE SUPPLY',        212.40, 'nb.revenue.other', null, false, 'Refund of the duplicate charge.'),
  -- uncategorized: the newest import's items that no rule explains yet
  ('unc:rentals',      pg_temp.nbf_next_bd(pg_temp.d(-6)),  'PURCHASE AUTHORIZED ON ' || to_char(pg_temp.d(-7), 'MM/DD') || ' HILLTOP PARTY RENTALS SAN LEANDRO CA CARD 4417', -642.18, null, null, false, null),
  ('unc:zelle',        pg_temp.nbf_next_bd(pg_temp.d(-12)), 'ZELLE TO DELGADO R REIMB',                      -86.40, null, null, false, null),
  ('unc:branch',       pg_temp.nbf_next_bd(pg_temp.d(-4)),  'BRANCH DEPOSIT 3 ITEMS',                       1840.00, null, null, false, null),
  ('unc:copy',         pg_temp.nbf_next_bd(pg_temp.d(-10)), 'PURCHASE AUTHORIZED ON ' || to_char(pg_temp.d(-11), 'MM/DD') || ' CORNER COPY & PRINT OAKLAND CA CARD 4417', -312.75, null, null, false, null),
  ('unc:citation',     pg_temp.nbf_next_bd(pg_temp.d(-15)), 'ACH DEBIT EASTSHORE PARKING CITATION',           -73.00, null, null, false, null),
  ('unc:lumen',        pg_temp.nbf_next_bd(pg_temp.d(-3)),  'PURCHASE AUTHORIZED ON ' || to_char(pg_temp.d(-4), 'MM/DD') || ' LUMEN STREAM SUBSCRIPTION CARD 4417', -29.99, null, null, false, null),
  ('unc:cnaapp',       pg_temp.nbf_next_bd(pg_temp.d(-8)),  'ONLINE PMT STATE NURSE AIDE REGISTRY FEES',     -540.00, null, null, false, null)
) as e(k, dt, descr, amt, cat, rtd, manual, note)
where e.dt between pg_temp.nbf_ly_start() and pg_temp.d(-1)
on conflict do nothing;

-- Foundation and corporate grant checks that arrive through the lockbox
-- (unnamed in the bank feed; Kwame splits them by hand). Same rhythm both FYs.
insert into nbf_txn (k, txn_date, description, amount, category_id, manual, notes)
select 'lbx:' || y.tag || ':' || c.k, pg_temp.nbf_next_bd(y.fs + c.off), c.descr, round(c.amt * y.f, 2), c.cat, true, c.note
from (values ('ly', pg_temp.nbf_ly_start(), 1.00), ('ty', pg_temp.fy_start(), 1.05)) y(tag, fs, f)
cross join (values
  ('fdn01',  20, 'LOCKBOX DEPOSIT 1 ITEM',  40000.00, 'nb.revenue.foundations', 'Foundation grant check.'),
  ('fdn02',  38, 'LOCKBOX DEPOSIT 2 ITEMS', 45000.00, 'nb.revenue.foundations', 'Two family-foundation grant checks.'),
  ('corp01', 58, 'LOCKBOX DEPOSIT 1 ITEM',  15000.00, 'nb.revenue.corporate',   'Corporate grant check.'),
  ('fdn03',  74, 'LOCKBOX DEPOSIT 2 ITEMS', 62500.00, 'nb.revenue.foundations', 'Two foundation grant checks.'),
  ('fdn04', 101, 'LOCKBOX DEPOSIT 1 ITEM',  30000.00, 'nb.revenue.foundations', 'Foundation grant check.'),
  ('fdn05', 129, 'LOCKBOX DEPOSIT 2 ITEMS', 75000.00, 'nb.revenue.foundations', 'Two foundation grant checks.'),
  ('corp02',152, 'LOCKBOX DEPOSIT 1 ITEM',  25000.00, 'nb.revenue.corporate',   'Corporate grant check.'),
  ('fdn06', 163, 'LOCKBOX DEPOSIT 1 ITEM',  50000.00, 'nb.revenue.foundations', 'Foundation grant check.'),
  ('fdn07', 190, 'LOCKBOX DEPOSIT 2 ITEMS', 40000.00, 'nb.revenue.foundations', 'Two foundation grant checks.'),
  ('fdn08', 214, 'LOCKBOX DEPOSIT 3 ITEMS', 85000.00, 'nb.revenue.foundations', 'Three foundation grant checks.'),
  ('fdn09', 248, 'LOCKBOX DEPOSIT 1 ITEM',  35000.00, 'nb.revenue.foundations', 'Foundation grant check.'),
  ('fdn10', 270, 'LOCKBOX DEPOSIT 2 ITEMS', 55000.00, 'nb.revenue.foundations', 'Two foundation grant checks.'),
  ('fdn11', 289, 'LOCKBOX DEPOSIT 2 ITEMS', 72500.00, 'nb.revenue.foundations', 'Two foundation grant checks.'),
  ('corp03',300, 'LOCKBOX DEPOSIT 1 ITEM',  20000.00, 'nb.revenue.corporate',   'Corporate grant check.'),
  ('fdn12', 331, 'LOCKBOX DEPOSIT 2 ITEMS', 65000.00, 'nb.revenue.foundations', 'Two foundation grant checks.')
) c(k, off, descr, amt, cat, note)
where pg_temp.nbf_next_bd(y.fs + c.off) between pg_temp.nbf_ly_start() and pg_temp.d(-1)
on conflict do nothing;

-- Summer Works host-employer wage share (invoiced after each summer)
insert into nbf_txn (k, txn_date, description, amount, category_id)
select 'wage:' || s.y || ':' || w.k, pg_temp.nbf_next_bd(s.ss + w.off), w.descr,
       round(w.amt * case when s.cur then 1 else 0.9 end, 2), 'nb.revenue.earned'
from (select y, pg_temp.nbf_summer(y) ss, y = extract(year from pg_temp.summer_start())::int cur
      from (values (extract(year from pg_temp.summer_start())::int),
                   (extract(year from pg_temp.summer_start())::int - 1)) v(y)) s
cross join (values
  ('ps',      62, 'ACH CREDIT PACIFIC SUMMIT BANK WAGE SHARE',        14000.00),
  ('harbor',  69, 'ACH CREDIT HARBOR HEALTH PARTNERS WAGE SHARE',     11200.00),
  ('kinetic', 76, 'ACH CREDIT KINETIC LABS WAGE SHARE',                9800.00),
  ('redline', 83, 'ACH CREDIT REDLINE BUILDERS INC WAGE SHARE',        7000.00),
  ('lockbox1',90, 'LOCKBOX DEPOSIT 9 ITEMS WAGE SHARE',               18650.00),
  ('lockbox2',104,'LOCKBOX DEPOSIT 6 ITEMS WAGE SHARE',               12750.00)
) w(k, off, descr, amt)
where pg_temp.nbf_next_bd(s.ss + w.off) between pg_temp.nbf_ly_start() and pg_temp.d(-1)
on conflict do nothing;

-- Launchpad school site fees (fall + spring semesters, per school year)
insert into nbf_txn (k, txn_date, description, amount, category_id)
select 'fee:' || s.y || ':' || t.term || ':' || f.k, pg_temp.nbf_next_bd(s.sy + t.off + f.lag), 'ACH CREDIT ' || f.n || ' PARTNERSHIP SITE FEE',
       case when s.cur then 9000.00 else 8000.00 end, 'nb.revenue.earned'
from (select y, pg_temp.nbf_sy(y) sy, pg_temp.nbf_sy(y) = pg_temp.sy_start() cur
      from (values (pg_temp.sy_year()), (pg_temp.sy_year() - 1)) v(y)) s
cross join (values ('fall', 80), ('spring', 178)) t(term, off)
cross join (values ('eastlake', 'EASTLAKE HS', 0), ('laurel', 'LAUREL RIDGE HS', 3), ('bayshore', 'BAYSHORE ACADEMY', 6)) f(k, n, lag)
where pg_temp.nbf_next_bd(s.sy + t.off + f.lag) between pg_temp.nbf_ly_start() and pg_temp.d(-1)
on conflict do nothing;

-- Interest on the reserve sweep (last business day of each month)
insert into nbf_txn (k, txn_date, description, amount, category_id)
select 'int:' || to_char(m, 'YYYY-MM'), pg_temp.nbf_prev_bd(pg_temp.nbf_eom(m::date)), 'INTEREST PAYMENT RESERVE SWEEP',
       pg_temp.nbf_amt(case when m::date >= pg_temp.fy_start() then 3650 else 3480 end, 0.08, 'int' || m::date),
       'nb.revenue.interest'
from generate_series(date_trunc('month', pg_temp.nbf_ly_start()), date_trunc('month', pg_temp.d(-1)), interval '1 month') m
where pg_temp.nbf_prev_bd(pg_temp.nbf_eom(m::date)) <= pg_temp.d(-1)
on conflict do nothing;

-- ── 3h. Imports: weekly CSVs this FY (Mon–Sun), monthly statements last FY ─
create temp table nbf_imp (
  ik text primary key, filename text, period_start date, period_end date, uploaded_at timestamptz, dup int
) on commit drop;

insert into nbf_imp (ik, filename, period_start, period_end, uploaded_at, dup)
select 'w:' || ps, 'baycommons_checking_' || to_char(ps, 'YYYYMMDD') || '-' || to_char(pe, 'YYYYMMDD') || '.csv',
       ps, pe, pg_temp.nbf_ts(pe + 1, case when pe = pg_temp.d(-1) then '08:05' else '08:40' end),
       floor(pg_temp.rnd('dup' || ps) * 3)::int
from (select greatest(w::date, pg_temp.fy_start()) ps, least(w::date + 6, pg_temp.d(-1)) pe
      from generate_series(date_trunc('week', pg_temp.fy_start()), pg_temp.d(-1), interval '1 week') w) x
where ps <= pe
union all
select 'm:' || to_char(m, 'YYYY-MM'), 'baycommons_statement_' || to_char(m, 'YYYY-MM') || '.csv',
       m::date, pg_temp.nbf_eom(m::date),
       pg_temp.nbf_ts(pg_temp.nbf_next_bd(pg_temp.nbf_eom(m::date) + 3), '09:30'), 0
from generate_series(pg_temp.nbf_ly_start(), pg_temp.fy_start() - 1, interval '1 month') m
where pg_temp.nbf_eom(m::date) <= pg_temp.d(-1)
on conflict do nothing;

insert into public.fin_imports
  (id, org_id, filename, file_hash, bank_format, row_count, inserted_count, duplicate_count,
   period_start, period_end, uploaded_at, uploaded_by)
select pg_temp.nb_id('fin_import:' || i.ik), pg_temp.nb_org(), i.filename,
       encode(sha256(convert_to('nb:fin_import:' || i.ik || ':' || i.filename, 'UTF8')), 'hex'),
       'generic', c.n + i.dup, c.n, i.dup, i.period_start, i.period_end, i.uploaded_at, 'kwame'
from nbf_imp i
join lateral (select count(*)::int n from nbf_txn t where t.txn_date between i.period_start and i.period_end) c on true
where c.n > 0
on conflict do nothing;

-- ── 3i. Transactions ───────────────────────────────────────────────────────
insert into public.fin_transactions
  (id, org_id, txn_date, description, amount, category_id, restricted, restricted_to,
   source_file, dedup_hash, notes, uploaded_at, uploaded_by, updated_at, exclude_from_runway)
select pg_temp.nb_id('fin_txn:' || t.k), pg_temp.nb_org(), t.txn_date, t.description, t.amount, t.category_id,
       t.restricted_to is not null, t.restricted_to, i.filename,
       pg_temp.nbf_hash(t.txn_date, t.amount, t.description,
         (row_number() over (partition by t.txn_date, round(t.amount * 100), btrim(regexp_replace(upper(t.description), '\s+', ' ', 'g')) order by t.k) - 1)::int),
       t.notes, i.uploaded_at, 'kwame',
       case when t.manual or t.restricted_to is not null or t.exclude then i.uploaded_at + interval '26 hours' else i.uploaded_at end,
       t.exclude
from nbf_txn t
join nbf_imp i on t.txn_date between i.period_start and i.period_end
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Categorization rules (hit counts = transactions each rule decided first)
-- ════════════════════════════════════════════════════════════════════════════
create temp table nbf_rule (
  k text primary key, pattern text, ptype text, cat text, restricted boolean, priority int,
  enabled boolean, notes text, created int
) on commit drop;

insert into nbf_rule values
  ('sw_pay',      'PAYWELL PAYROLL SW',         'contains',    'nb.stipends.summer-works',       true,  110, true, 'Summer Works intern runs. Youth Stipend Fund.', -470),
  ('sw_tax',      'TAX IMPOUND SW',             'contains',    'nb.stipends.summer-works',       true,  110, true, 'Employer taxes on intern wages.', -470),
  ('dept_prog',   'DEPT PROG',                  'contains',    'nb.personnel.salaries-program',  false, 100, true, null, -470),
  ('dept_ops',    'DEPT OPS',                   'contains',    'nb.personnel.salaries-ops',      false, 100, true, null, -470),
  ('dept_dev',    'DEPT DEV',                   'contains',    'nb.personnel.salaries-dev',      false, 100, true, null, -470),
  ('pay_tax',     'PAYWELL TAX IMPOUND PR',     'contains',    'nb.personnel.payroll-taxes',     false, 100, true, null, -470),
  ('pw_stipend',  'PAYWELL STIPEND',            'contains',    'nb.stipends.pathways',           true,  100, true, 'Pathways Fellowship Fund.', -470),
  ('pw_reimb',    'PAYWELL REIMB',              'contains',    'nb.transport.mileage',           false, 95,  true, null, -470),
  ('pw_fees',     'PAYWELL FEES',               'contains',    'nb.prof.hr-payroll',             false, 95,  true, null, -470),
  ('k403b',       'HARBORLINE 403B',            'contains',    'nb.personnel.retirement',        false, 90,  true, null, -470),
  ('health',      'BAYSHORE HEALTH ALLIANCE',   'contains',    'nb.personnel.health-benefits',   false, 90,  true, null, -470),
  ('dental',      'COASTAL DENTAL',             'contains',    'nb.personnel.health-benefits',   false, 90,  true, null, -470),
  ('wcomp',       'ANCHORPOINT',                'contains',    'nb.personnel.workers-comp',      false, 90,  true, null, -470),
  ('rent',        '1450 HARBOR LIGHT',          'contains',    'nb.occupancy.rent',              false, 90,  true, null, -470),
  ('utilities',   '^EASTSHORE (POWER|WATER)',   'regex',       'nb.occupancy.utilities',         false, 85,  true, 'Power & gas + water district autopays.', -470),
  ('janitor',     'SPARKLE BAY',                'contains',    'nb.occupancy.maintenance',       false, 85,  true, null, -470),
  ('hardware',    'HARBORSIDE HARDWARE',        'contains',    'nb.occupancy.maintenance',       false, 70,  true, null, -380),
  ('telecom',     '(BAYNET FIBER|CELLWAVE)',    'regex',       'nb.tech.telecom',                false, 85,  true, null, -470),
  ('insurance',   'KEYSTONE ARC',               'contains',    'nb.insurance.package',           false, 90,  true, null, -470),
  ('cirrus',      'CIRRUS IT',                  'contains',    'nb.tech.it-support',             false, 85,  true, null, -470),
  ('software',    '(CLOUDDESK|TALLYBOOK|LEARNHUB|MEETSPACE|MAPWISE|FORMWELL|DESIGNLOOM|SIGNFLOW)', 'regex', 'nb.tech.software', false, 80, true, 'Monthly SaaS. Add new tools to this list.', -470),
  ('techbarn',    'TECHBARN BUSINESS',          'contains',    'nb.tech.equipment',              false, 80,  true, null, -380),
  ('transit',     'EASTSHORE TRANSIT',          'contains',    'nb.transport.transit-passes',    false, 85,  true, null, -470),
  ('van',         'BAYFLEET',                   'contains',    'nb.transport.van',               false, 85,  true, null, -470),
  ('fuel',        'HARBOR FUEL',                'contains',    'nb.transport.van',               false, 75,  true, null, -470),
  ('prizepath',   'PRIZEPATH',                  'contains',    'nb.stipends.incentives',         false, 75,  true, null, -470),
  ('craftworks',  'CRAFTWORKS EDU',             'contains',    'nb.program.supplies',            false, 75,  true, null, -470),
  ('workwear',    'SCRUBS & STEEL',             'contains',    'nb.program.supplies',            false, 75,  true, null, -150),
  ('snacks',      'ORCHARD SNACK',              'contains',    'nb.program.meals',               false, 75,  true, null, -470),
  ('mesaverde',   'MESA VERDE CATERING INV',    'starts_with', 'nb.program.meals',               false, 70,  true, 'Gala catering invoices get recategorized by hand.', -470),
  ('certs',       '(TECHPATH|ALLCARE NURSING|BUILDRIGHT|TESTPOINT)', 'regex', 'nb.program.certifications', true, 85, true, 'Pathways training partners. Pathways Fellowship Fund.', -470),
  ('mindful',     'MINDFUL MOVES',              'contains',    'nb.program.consultants',         false, 80,  true, null, -470),
  ('insight',     'INSIGHT LOOP',               'contains',    'nb.program.consultants',         false, 80,  true, null, -470),
  ('clearcheck',  'CLEARCHECK',                 'contains',    'nb.program.background-checks',   false, 80,  true, null, -470),
  ('rentals',     'EASTSHORE EVENT RENTALS',    'contains',    'nb.program.youth-events',        false, 60,  true, 'Gala rentals get recategorized by hand.', -380),
  ('charter',     'BAYCITY CHARTER',            'contains',    'nb.program.youth-events',        false, 70,  true, null, -380),
  ('fruitvale',   'FRUITVALE HUB EVENT',        'contains',    'nb.program.youth-events',        false, 70,  true, null, -380),
  ('audit',       'MENDEZ OSTROWSKI',           'contains',    'nb.prof.audit',                  false, 90,  true, null, -470),
  ('legal',       'HALVERSON LEGAL',            'contains',    'nb.prof.legal',                  false, 85,  true, null, -470),
  ('peoplefirst', 'PEOPLEFIRST HR',             'contains',    'nb.prof.hr-payroll',             false, 85,  true, null, -470),
  ('bankfees',    'BAY COMMONS BANK SERVICE FEE','contains',   'nb.admin.bank-fees',             false, 90,  true, null, -470),
  ('achfee',      'BAY COMMONS ACH',            'contains',    'nb.admin.bank-fees',             false, 90,  true, null, -470),
  ('bayline',     'BAYLINE OFFICE',             'contains',    'nb.admin.office',                false, 70,  true, null, -470),
  ('cafe',        'LAKESIDE CAFE',              'contains',    'nb.fundraising.cultivation',     false, 65,  true, null, -380),
  ('parking',     'HARBOR PARKING',             'contains',    'nb.staff.travel',                false, 65,  true, null, -380),
  ('training',    '(YOUTHWORK INSTITUTE|NONPROFIT LEADERSHIP LAB|BAYAREA YOUTH DEV)', 'regex', 'nb.staff.training', false, 70, true, null, -380),
  ('dues',        '(MEMBERSHIP|ALLIANCE DUES|CHARITY REGISTRATION)', 'regex', 'nb.admin.dues', false, 60,  true, null, -380),
  ('donorcomms',  '(PRINTCRAFT|BAYMAIL PRESORT|SENDLY)', 'regex', 'nb.fundraising.donor-comms',  false, 70,  true, 'Gala invitations get recategorized by hand.', -380),
  ('rideshare',   'BAYCITY RIDESHARE',          'contains',    'nb.staff.travel',                false, 65,  true, null, -200),
  ('peaklead',    'PEAKLEAD COACHING',          'contains',    'nb.staff.training',              false, 70,  true, 'Supervisor coaching cohort (Tasha''s pilot).', -200),
  ('socialreach', 'SOCIALREACH ADS',            'contains',    'nb.program.supplies',            false, 65,  true, 'Cohort recruitment ads.', -200),
  -- revenue
  ('wageshare',   'WAGE SHARE',                 'contains',    'nb.revenue.earned',              false, 98,  true, 'Before the employer-name rules: wage share is earned, not a gift.', -470),
  ('sitefee',     'SITE FEE',                   'contains',    'nb.revenue.earned',              false, 98,  true, null, -470),
  ('match',       'EMPLOYEE MATCH',             'contains',    'nb.revenue.corporate',           false, 96,  true, null, -380),
  ('foundations', '(BAYVIEW COMMUNITY|HOLLIS FAMILY|EAST BAY WORKFORCE|CYPRESS FUND|MERIDIAN FOUNDATION|SEQUOIA TRUST)', 'regex', 'nb.revenue.foundations', false, 92, true, null, -470),
  ('gov',         '(CA YOUTH OPPORTUNITY|EASTSHORE WORKFORCE DEV)', 'regex', 'nb.revenue.gov-grants', false, 92, true, null, -470),
  ('corporate',   '(PACIFIC SUMMIT BANK|KINETIC LABS|HARBOR HEALTH|REDLINE BUILDERS)', 'regex', 'nb.revenue.corporate', false, 80, true, null, -470),
  ('daf',         'BAY LEGACY GIVING',          'contains',    'nb.revenue.individuals',         false, 90,  true, 'DAF grants are individual giving; soft-credit the advisor.', -470),
  ('giveflow',    'GIVEFLOW PAYOUT',            'contains',    'nb.revenue.individuals',         false, 90,  true, null, -470),
  ('events',      '^(TIXHALL|BIDNEST AUCTION) PAYOUT', 'regex','nb.revenue.events',              false, 90,  true, null, -470),
  ('bidfees',     'BIDNEST AUCTION PLATFORM',   'contains',    'nb.fundraising.gala',            false, 91,  true, null, -380),
  ('interest',    'INTEREST PAYMENT',           'contains',    'nb.revenue.interest',            false, 90,  true, null, -470),
  ('returns',     'PURCHASE RETURN',            'starts_with', 'nb.revenue.other',               false, 99,  true, 'Refunds net against nothing; booked as other income.', -470),
  ('lockbox',     'LOCKBOX DEPOSIT',            'starts_with', 'nb.revenue.individuals',         false, 50,  true, 'Default for lockbox batches; split sponsor or grant checks by hand.', -470),
  ('mobile',      'MOBILE DEPOSIT',             'starts_with', 'nb.revenue.individuals',         false, 40,  true, null, -470),
  ('wire',        'WIRE TRF IN',                'starts_with', 'nb.revenue.individuals',         false, 30,  true, 'Catch-all for wires; named funders above win first.', -470),
  -- retired
  ('officehub',   'OFFICEHUB',                  'contains',    'nb.admin.office',                false, 70,  false, 'Vendor retired when we moved to Bayline.', -470),
  ('zelle_reimb', '^ZELLE TO .* REIMB',         'regex',       'nb.transport.mileage',           false, 60,  false, 'Paused: staff reimbursements now go through payroll. Categorize stray Zelles by hand.', -200);

insert into public.fin_category_rules
  (id, org_id, pattern, pattern_type, category_id, restricted, priority, enabled, hit_count, notes, created_at, updated_at)
select pg_temp.nb_id('fin_rule:' || r.k), pg_temp.nb_org(), r.pattern, r.ptype, r.cat, r.restricted, r.priority, r.enabled,
       coalesce(h.n, 0)
         + case when not r.enabled and r.k = 'officehub' then 14 else 0 end,
       r.notes, pg_temp.ts(r.created, '11:20'), pg_temp.ts(greatest(r.created, -40), '11:20')
from nbf_rule r
left join (
  select fm.rk, count(*)::int n
  from nbf_txn t
  cross join lateral (
    select r2.k as rk
    from nbf_rule r2
    where r2.enabled
      and case r2.ptype
            when 'contains'    then strpos(upper(t.description), upper(r2.pattern)) > 0
            when 'starts_with' then upper(t.description) like upper(r2.pattern) || '%'
            else t.description ~* r2.pattern end
    order by r2.priority desc, r2.created desc, r2.k
    limit 1
  ) fm
  group by fm.rk
) h on h.rk = r.k
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Revenue commitments (manual): money the fundraising ledger does not hold.
--    Pledges, grants and pipeline come in through v_revenue_schedule on their
--    own; these are earned revenue, appeals, the gala, and reconcile history.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.fin_revenue_commitments
  (id, org_id, year, source_type, source_name, amount, status, expected_date, probability,
   restricted, restricted_to, notes, created_by, created_at, updated_at)
select pg_temp.nb_id('fin_commit:' || c.k), pg_temp.nb_org(), pg_temp.nbf_fy_of(c.dt), c.st, c.name, c.amt,
       case when c.status in ('secured', 'projected') and c.dt < pg_temp.d(0) then 'received' else c.status end,
       c.dt, case when c.status = 'projected' then c.p end,
       c.rtd is not null, c.rtd, c.notes, c.by, pg_temp.ts(c.made, '14:10'), pg_temp.ts(c.touched, '09:30')
from (values
  -- secured (committed, not yet in the bank)
  ('fees_fall',   'earned',     'Launchpad school site fees — fall semester (3 schools)',               27000.00, 'secured',   pg_temp.sy_start() + 76,  null::numeric, null::text, 'Invoices accepted by Eastlake, Laurel Ridge and Bayshore; net-30.', 'kwame', -27, -27),
  ('fees_spring', 'earned',     'Launchpad school site fees — spring semester (3 schools)',             27000.00, 'secured',   pg_temp.sy_start() + 175, null, null, 'Per the site MOUs; invoiced in January.', 'kwame', -27, -27),
  ('library',     'earned',     'Eastshore Public Library — Summer Works wage share (library aides)',     9600.00, 'secured',   pg_temp.d(8),             null, null, 'Invoice confirmed by email; their AP runs on the 25th.', 'kwame', -13, -13),
  -- projected (weighted by probability in the schedule)
  ('yearend',     'individual', 'Year-End appeal — broad-based giving (major asks are in the pipeline)', 240000.00, 'projected', make_date(extract(year from pg_temp.d(60))::int, 12, 31), 0.85, null, 'Letter drops two weeks after launch; last year''s broad-based total was $214K.', 'priya', -34, -6),
  ('gt',          'individual', 'GivingTuesday — online',                                              42000.00, 'projected', pg_temp.nbf_gt(extract(year from pg_temp.d(60))::int), 0.90, null, 'Board match of $10K committed by Harrington and Nakamura.', 'jordan', -30, -9),
  ('spring',      'individual', 'Spring Appeal',                                                       85000.00, 'projected', make_date(extract(year from pg_temp.d(60))::int + 1, 4, 30), 0.80, null, null, 'priya', -34, -34),
  ('gala',        'other',      'Northbridge Rising Gala — tickets, tables & paddle raise',            230000.00, 'projected', pg_temp.d(200),           0.85, null, 'Sponsorships are tracked as opportunities, not here.', 'jordan', -60, -15),
  ('monthly',     'individual', 'Monthly Giving Circle — recurring gifts through June',
                    3150.00 * greatest(1, (extract(year from age(pg_temp.nbf_fy_end(), pg_temp.mon(1))) * 12 + extract(month from age(pg_temp.nbf_fy_end(), pg_temp.mon(1))))::int + 1),
                                                                                                                 'projected', pg_temp.nbf_fy_end(),     0.95, null, '~45 active plans averaging $70/month; two cards failing.', 'jordan', -50, -12),
  ('sw_sponsors', 'corporate',  'Summer Works employer sponsorships — renewals beyond Pacific Summit',  120000.00, 'projected', pg_temp.d(165),           0.60, 'Youth Stipend Fund', 'Twelve host employers; renewal letters go out in January.', 'priya', -20, -20),
  ('ps_match_q3', 'corporate',  'Pacific Summit Bank — employee matching gifts (Q3)',                     6400.00, 'projected', pg_temp.d(56),            0.90, null, null, 'kwame', -35, -35),
  ('interest',    'other',      'Interest — reserve money-market sweep (rest of FY)',                    28000.00, 'projected', pg_temp.nbf_fy_end(),     0.95, null, 'At the current sweep rate.', 'kwame', -100, -40),
  -- received (reconcile history; the gifts ledger is the record of landed money)
  ('ps_match_q2', 'corporate',  'Pacific Summit Bank — employee matching gifts (Q2)',                     5920.00, 'received',  pg_temp.nbf_next_bd(pg_temp.d(-35)), null, null, 'Accepted from the Reconcile inbox.', 'kwame', -41, -35),
  ('wage_share',  'earned',     'Summer Works host-employer wage share — this summer',                   73400.00, 'received',  pg_temp.nbf_next_bd(pg_temp.summer_start() + 104), null, null, 'Twenty-one of twenty-two employers paid; library invoice still open.', 'kwame', -70, -16)
) as c(k, st, name, amt, status, dt, p, rtd, notes, by, made, touched)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Reconcile inbox: four pending proposals + recent resolved history
-- ════════════════════════════════════════════════════════════════════════════
insert into public.fin_reconciliation_items
  (id, org_id, kind, source, source_ref, status, title, detail, amount, payload, evidence_url, confidence,
   created_by, created_at, resolved_by, resolved_at, applied_id)
select pg_temp.nb_id('fin_recon:' || r.k), pg_temp.nb_org(), r.kind, r.src, 'nb:' || r.src || ':' || r.k, r.status,
       r.title, r.detail, r.amt, r.payload, null, r.conf, 'agent', pg_temp.ts(r.made, r.hhmi),
       r.res_by, case when r.res is not null then pg_temp.ts(r.res, '15:40') end,
       case when r.applied is not null then pg_temp.nb_id('fin_commit:' || r.applied) end
from (values
  -- pending (block the close until resolved or waived)
  ('chen_y2', 'commitment', 'gmail', 'pending',
   'Pledge payment: Margaret & David Chen, year 2 of 3 (check mailed)',
   'Margaret wrote on Friday that the second-year check went out early so it counts in this calendar year. It is not in the bank feed yet. The pledge already has this installment scheduled for ' || to_char(pg_temp.d(45), 'FMMon FMDD') || '; accept to log it as received, then mark that installment paid when the check clears.',
   50000.00, jsonb_build_object('year', pg_temp.fy(), 'source_type', 'individual', 'source_name', 'Margaret & David Chen — pledge year 2 of 3', 'amount', 50000, 'status', 'received', 'expected_date', to_char(pg_temp.d(3), 'YYYY-MM-DD'), 'notes', 'Check in the mail per Margaret''s email.'),
   'high', -1, '21:14', null::text, null::int, null::text),
  ('lakeshore', 'commitment', 'gmail', 'pending',
   'Lakeshore Service Club: $7,500 for Launchpad transit passes',
   'Award email from the club treasurer after Rosa''s presentation. Restricted to youth transit passes for the spring semester; check to follow by the end of the month.',
   7500.00, jsonb_build_object('year', pg_temp.fy(), 'source_type', 'other', 'source_name', 'Lakeshore Service Club — Launchpad transit passes', 'amount', 7500, 'status', 'secured', 'expected_date', to_char(pg_temp.d(21), 'YYYY-MM-DD'), 'restricted', true, 'restricted_to', 'Launchpad transit passes'),
   'medium', -1, '21:16', null, null, null),
  ('branch_dep', 'flag', 'gmail', 'pending',
   'Unmatched deposit: $1,840 branch deposit has no gift record',
   'Branch deposit of three checks on ' || to_char(pg_temp.nbf_next_bd(pg_temp.d(-4)), 'FMMon FMDD') || ' doesn''t match any gift in the ledger. Simone mentioned the Fruitvale Hub family night raised about that much; confirm with her and log the gifts so they get thanked.',
   1840.00, '{}'::jsonb,
   'medium', 0, '06:52', null, null, null),
  ('eastshore_q1', 'flag', 'gmail', 'pending',
   'Eastshore WDB approved the Q1 invoice ($105,000)',
   'Denise Holloway confirmed the Q1 cost-reimbursement invoice is approved for payment; remittance usually follows in about two weeks, earlier than the ' || to_char(pg_temp.d(30), 'FMMon FMDD') || ' date on the grant schedule. Move the payment date up if you want the runway to count it this month.',
   105000.00, '{}'::jsonb,
   'high', 0, '06:55', null, null, null),
  -- resolved (most recent eight show under the inbox)
  ('ps_match_q2', 'commitment', 'gmail', 'accepted',
   'Pacific Summit Bank employee matching gifts, Q2 payout',
   'Matching-gift statement from the bank''s giving platform: 23 employee gifts matched 1:1.',
   5920.00, jsonb_build_object('year', pg_temp.fy(), 'source_type', 'corporate', 'source_name', 'Pacific Summit Bank — employee matching gifts (Q2)', 'amount', 5920, 'status', 'received'),
   'high', -42, '21:10', 'kwame', -41, 'ps_match_q2'),
  ('fees_fall', 'commitment', 'gmail', 'accepted',
   'Launchpad fall site fees: all three schools accepted invoices',
   'Eastlake, Laurel Ridge and Bayshore confirmed the fall partnership invoices ($9,000 each), net-30.',
   27000.00, jsonb_build_object('year', pg_temp.fy(), 'source_type', 'earned', 'source_name', 'Launchpad school site fees — fall semester (3 schools)', 'amount', 27000, 'status', 'secured'),
   'high', -28, '21:10', 'kwame', -27, 'fees_fall'),
  ('nakamura_van', 'commitment', 'gmail', 'dismissed',
   'Possible pledge: Ken Nakamura offered to "help with the van"',
   'Email thread about replacing the program van. No amount or timing. Dismissed: not a commitment yet; Remi logged it as a note on Ken''s record.',
   null::numeric, '{}'::jsonb,
   'low', -24, '21:12', 'remi', -21, null),
  ('bayview_wire', 'flag', 'gmail', 'accepted',
   'Bayview wire posted: $250,000',
   'Wire confirmation from Bayview Community Foundation for year 2 of the general operating grant.',
   250000.00, '{}'::jsonb,
   'high', -59, '21:08', 'kwame', -55, null),
  ('harbor_dup', 'commitment', 'gmail', 'dismissed',
   'Harbor Health Partners: $40,000 community-benefit grant',
   'Award letter attached to an email from Monique Jackson. Dismissed: already in Grants (paid ' || to_char(pg_temp.d(-40), 'FMMon FMDD') || ').',
   40000.00, jsonb_build_object('year', pg_temp.fy(), 'source_type', 'corporate', 'source_name', 'Harbor Health Partners', 'amount', 40000, 'status', 'received'),
   'medium', -38, '21:09', 'kwame', -34, null),
  ('library', 'commitment', 'gmail', 'accepted',
   'Eastshore Public Library: Summer Works wage-share invoice confirmed',
   'Library business office confirmed the $9,600 wage-share invoice for the summer library aides.',
   9600.00, jsonb_build_object('year', pg_temp.fy(), 'source_type', 'earned', 'source_name', 'Eastshore Public Library — Summer Works wage share (library aides)', 'amount', 9600, 'status', 'secured'),
   'high', -14, '21:11', 'kwame', -13, 'library'),
  ('bayline_dupe', 'flag', 'manual', 'accepted',
   'Duplicate card charge: Bayline Office Supply $212.40',
   'Same order charged twice. Refund requested; it posted the following week.',
   212.40, '{}'::jsonb,
   'medium', -24, '10:02', 'kwame', -18, null),
  ('goldberg_daf', 'commitment', 'gmail', 'dismissed',
   'Bay Legacy Giving Fund grant letter: $20,000 (Aaron Goldberg)',
   'DAF grant notification naming Aaron Goldberg as the recommending advisor. Dismissed: Jordan booked it as a gift with the soft credit.',
   20000.00, jsonb_build_object('year', pg_temp.fy(), 'source_type', 'individual', 'source_name', 'Aaron Goldberg via Bay Legacy Giving Fund', 'amount', 20000, 'status', 'received'),
   'high', -8, '21:13', 'kwame', -6, null)
) as r(k, kind, src, status, title, detail, amt, payload, conf, made, hhmi, res_by, res, applied)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Report artifacts: exported financial reports (documents, doc_type
--    'fin_report'), their waivers, last month's close waiver, and the approved
--    Reed narrative the Reports builder renders.
--    The HTML files themselves are not in storage (no storage API in the seed
--    path), so Download on these rows 404s.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.documents
  (id, org_id, storage_path, filename, mime, size_bytes, title, doc_type, status, visibility, version,
   uploaded_by, created_at, updated_at, issued_at, notes)
select pg_temp.nb_id('doc:' || d.k), pg_temp.nb_org(),
       pg_temp.nb_org()::text || '/' || pg_temp.nb_id('doc:' || d.k)::text || '/' || d.slug || '-' || to_char(pg_temp.nbf_prev_bd(pg_temp.d(d.made)), 'YYYY-MM-DD') || '.html',
       d.slug || '-' || to_char(pg_temp.nbf_prev_bd(pg_temp.d(d.made)), 'YYYY-MM-DD') || '.html',
       'text/html', d.sz, d.title, 'fin_report', 'active', 'org', 1,
       pg_temp.nb_user('kwame'), pg_temp.nbf_ts(pg_temp.nbf_prev_bd(pg_temp.d(d.made)), d.hhmi), pg_temp.nbf_ts(pg_temp.nbf_prev_bd(pg_temp.d(d.made)), d.hhmi),
       pg_temp.nbf_prev_bd(pg_temp.d(d.made)), d.notes
from (values
  ('fin_report_fy_prev',
   'FY' || (pg_temp.fy() - 1) || ' year-end financial summary (unaudited)',
   'fy' || (pg_temp.fy() - 1) || '-year-end-financial-summary-unaudited', -95, '11:05', 21384::bigint,
   'Pre-audit close for the Finance & Audit Committee. Fieldwork opens in October.'),
  ('fin_report_board_prev',
   'Board financial report — through ' || to_char(date_trunc('month', pg_temp.d(-46)) - interval '1 day', 'FMMonth YYYY'),
   'board-financial-report-through-' || lower(to_char(date_trunc('month', pg_temp.d(-46)) - interval '1 day', 'FMMonth-YYYY')), -46, '15:20', 18972,
   'Packet for the ' || to_char(pg_temp.d(-44), 'FMMonth FMDD') || ' board meeting.'),
  ('fin_report_fac',
   'Financial report through ' || to_char(date_trunc('month', pg_temp.d(-8)) - interval '1 day', 'FMMonth YYYY') || ' — Finance & Audit Committee',
   'financial-report-through-' || lower(to_char(date_trunc('month', pg_temp.d(-8)) - interval '1 day', 'FMMonth-YYYY')) || '-finance-audit-committee', -8, '10:40', 19655,
   'Grace Lim reviewed before it went to the committee. One waiver on the record.')
) as d(k, title, slug, made, hhmi, sz, notes)
on conflict do nothing;

insert into public.export_waivers (id, org_id, artifact_type, artifact_id, metric_key, waived_by, waived_at, reason, created_at)
select pg_temp.nb_id('waiver:' || w.k), pg_temp.nb_org(), w.atype, w.aid, w.mkey, pg_temp.nb_user('tasha'),
       w.at, w.reason, w.at
from (values
  ('fac_retention', 'fin_report', pg_temp.nb_id('doc:fin_report_fac')::text, 'donor_retention', pg_temp.nbf_ts(pg_temp.nbf_prev_bd(pg_temp.d(-8)), '10:31'),
   'Retention snapshot predates the September data cleanup; Ben is re-running it. Sending the committee packet on time with the figure flagged.'),
  ('close_prev', 'period_close', to_char(pg_temp.mon(-1), 'YYYY-MM'), null::text,
   pg_temp.nbf_ts(pg_temp.nbf_prev_bd(pg_temp.mon(0) - 1), '17:05'),
   'One flag was waiting on the online processor''s refund report (a $250 gift refunded at the donor''s request). Closing the month on time; Kwame clears it next week.')
) as w(k, atype, aid, mkey, at, reason)
on conflict do nothing;

insert into public.reed_drafts (id, org_id, kind, title, body, context_ref, status, created_by, model_used, created_at, updated_at)
values (
  pg_temp.nb_id('reed_draft:fin_report_narrative'), pg_temp.nb_org(), 'report_narrative',
  'Narrative — financial report through ' || to_char(date_trunc('month', pg_temp.d(-8)) - interval '1 day', 'FMMonth YYYY'),
  'The first quarter went the way it always does for us: Summer Works wages and the Pathways Cohort 7 launch landed in July and August, and the big government reimbursements arrive later in the year. Spending is on budget overall, with program delivery a little ahead of plan because the fall certification terms were paid up front.' || chr(10) || chr(10) ||
  'Revenue to date is led by Bayview''s second general-operating installment and the first Hollis installment for Pathways. The Eastshore Workforce Development Board contract is now invoicing quarterly, and the state Youth Opportunity award is expected in December.' || chr(10) || chr(10) ||
  'Cash runway sits just under the board''s six-month reserve target. Year-end giving, the Eastshore reimbursements and the Chen and Kinetic pledge installments are what close that gap, and all of them are on the schedule. The one open decision is Meridian, which would fund the San Leandro expansion if it comes through.',
  jsonb_build_object('surface', 'finance.reports', 'document_id', pg_temp.nb_id('doc:fin_report_fac')),
  'approved', 'kwame', 'claude-sonnet-4-6',
  pg_temp.nbf_ts(pg_temp.nbf_prev_bd(pg_temp.nbf_prev_bd(pg_temp.d(-8)) - 1), '16:10'),
  pg_temp.nbf_ts(pg_temp.nbf_prev_bd(pg_temp.d(-8)), '09:55'))
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. fin_config numbers for this org (Section 1 created the row).
--    Cash anchor = the FY opening balance (the day before FY start), derived
--    so the app's cash runway tier is 5.5 months at the $270K baseline:
--      cash  = 5.5 × baseline + (baseline − month-to-date spend)
--      start = cash − Σ(this FY's transactions)
-- ════════════════════════════════════════════════════════════════════════════
update public.fin_config c set
  fiscal_year_start_month      = 7,
  current_year                 = pg_temp.fy(),
  fundraising_goal             = 3550000,
  contingency_unlock_threshold = 0.95,
  monthly_burn_baseline        = 270000,
  forward_horizon_months       = 3,
  runway_target_months         = 6,
  cash_starting_date           = pg_temp.fy_start() - 1,
  cash_starting_balance        = round(5.5 * 270000 + greatest(0, 270000 - s.mtd) - s.fy_net, 2) + 0.38,
  cash_reconciled_at           = pg_temp.nbf_ts(pg_temp.nbf_prev_bd(pg_temp.d(-1)), '16:40'),
  last_reconciled_at           = pg_temp.nbf_ts(pg_temp.d(-1) - ((extract(isodow from pg_temp.d(-1))::int + 2) % 7), '16:30'),
  updated_at                   = pg_temp.nbf_ts(pg_temp.nbf_prev_bd(pg_temp.d(-1)), '16:40')
from (
  select coalesce(sum(t.amount), 0) as fy_net,
         coalesce(sum(-t.amount) filter (where t.amount < 0 and not t.exclude_from_runway
                                          and t.txn_date >= date_trunc('month', pg_temp.d(0))::date), 0) as mtd
  from public.fin_transactions t
  where t.org_id = pg_temp.nb_org()
    and t.txn_date between pg_temp.fy_start() and pg_temp.d(-1)
) s
where c.org_id = pg_temp.nb_org();

commit;
