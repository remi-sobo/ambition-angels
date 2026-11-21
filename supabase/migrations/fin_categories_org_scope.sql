-- Finance categories become per-org (V4 Phase 0 audit, P0 finding 5).
--
-- fin_categories.id was a GLOBAL text primary key, so a second org could not
-- own 'payroll.ceo' (or any id Ambition Angels already used), and every
-- category-keyed row (fin_budget, fin_transactions, fin_category_rules) was
-- checked only against the global id: org B could point its rows at AA's
-- categories, and fin_budget's (year, category_id) key meant two orgs could
-- not budget the same category in the same year (an upsert from one org
-- would overwrite the other's row).
--
-- Design (specs/fin-categories-per-org.md): keep the text ids, scope them by
-- org.
--   fin_categories  primary key (id)                → (org_id, id)
--   fin_budget      primary key (year, category_id) → (org_id, year, category_id)
--   category FKs    (category_id) → fin_categories(id)
--                 → (org_id, category_id) → fin_categories(org_id, id)
--     so a row can only reference a category in its OWN org. on-delete
--     behaviour is unchanged: budget restrict, rules cascade, transactions set
--     the category (only) back to null (column-list SET NULL, Postgres 15+).
--   org_id defaults dropped on fin_categories, fin_budget, fin_category_rules
--     (every app writer passes org_id explicitly).
--   RLS: unchanged. enable_rls_per_domain.sql already gates all four tables
--     on private.has_permission(org_id, 'finance.read' / 'finance.write').
--
-- Ambition Angels: every existing row already carries AA's org_id
-- (add_org_id_to_tenant_tables.sql back-filled and set NOT NULL), ids are
-- unchanged, so every amount, budget line, rule and report is identical.
-- The back-fill below is a belt-and-braces no-op (org resolved by slug,
-- never a hardcoded uuid; skipped where the org row is absent).
--
-- Preflight: if any budget/transaction/rule row points at a category that
-- does not exist in the row's own org, the migration aborts with counts and
-- changes nothing (the whole DO block is one statement, so it is atomic).
-- See the design note for the read-only check to run first.
--
-- Also adds public.fin_seed_starter_categories(org uuid): a generic
-- nonprofit starter chart an OPERATOR runs for a new org. Never called
-- automatically; service-role / SQL-editor only.
--
-- Idempotent: every step checks the current shape first; re-running is a
-- no-op.

do $$
declare
  aa uuid;
  bad_budget int;
  bad_txn int;
  bad_rules int;
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'fin_categories_org_scope needs Postgres 15+ (ON DELETE SET NULL (column))';
  end if;

  -- 1. Back-fill (no-op today: org_id is already NOT NULL on all four).
  select id into aa from public.orgs where slug = 'ambition-angels';
  if aa is not null then
    update public.fin_categories     set org_id = aa where org_id is null;
    update public.fin_budget         set org_id = aa where org_id is null;
    update public.fin_transactions   set org_id = aa where org_id is null;
    update public.fin_category_rules set org_id = aa where org_id is null;
  end if;

  -- 2. Preflight: every category reference must resolve inside its own org.
  select count(*) into bad_budget from public.fin_budget b
   where not exists (select 1 from public.fin_categories c
                      where c.org_id = b.org_id and c.id = b.category_id);
  select count(*) into bad_txn from public.fin_transactions t
   where t.category_id is not null
     and not exists (select 1 from public.fin_categories c
                      where c.org_id = t.org_id and c.id = t.category_id);
  select count(*) into bad_rules from public.fin_category_rules r
   where not exists (select 1 from public.fin_categories c
                      where c.org_id = r.org_id and c.id = r.category_id);
  if bad_budget + bad_txn + bad_rules > 0 then
    raise exception
      'fin_categories_org_scope: % budget, % transaction, % rule row(s) reference a category outside their own org. Nothing changed. Resolve them first (specs/fin-categories-per-org.md, "Preflight").',
      bad_budget, bad_txn, bad_rules;
  end if;

  -- 3. Drop the global-id foreign keys (they depend on the old primary key).
  alter table public.fin_budget         drop constraint if exists fin_budget_category_id_fkey;
  alter table public.fin_transactions   drop constraint if exists fin_transactions_category_id_fkey;
  alter table public.fin_category_rules drop constraint if exists fin_category_rules_category_id_fkey;

  -- 4. fin_categories: primary key (id) → (org_id, id).
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.fin_categories'::regclass and contype = 'p'
       and pg_get_constraintdef(oid) = 'PRIMARY KEY (org_id, id)'
  ) then
    alter table public.fin_categories drop constraint if exists fin_categories_pkey;
    alter table public.fin_categories add constraint fin_categories_pkey primary key (org_id, id);
  end if;

  -- 5. fin_budget: primary key (year, category_id) → (org_id, year, category_id).
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.fin_budget'::regclass and contype = 'p'
       and pg_get_constraintdef(oid) = 'PRIMARY KEY (org_id, year, category_id)'
  ) then
    alter table public.fin_budget drop constraint if exists fin_budget_pkey;
    alter table public.fin_budget add constraint fin_budget_pkey primary key (org_id, year, category_id);
  end if;

  -- 6. Org-checked composite foreign keys.
  if not exists (select 1 from pg_constraint where conname = 'fin_budget_category_fkey'
                  and conrelid = 'public.fin_budget'::regclass) then
    alter table public.fin_budget add constraint fin_budget_category_fkey
      foreign key (org_id, category_id) references public.fin_categories (org_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fin_transactions_category_fkey'
                  and conrelid = 'public.fin_transactions'::regclass) then
    alter table public.fin_transactions add constraint fin_transactions_category_fkey
      foreign key (org_id, category_id) references public.fin_categories (org_id, id)
      on delete set null (category_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fin_category_rules_category_fkey'
                  and conrelid = 'public.fin_category_rules'::regclass) then
    alter table public.fin_category_rules add constraint fin_category_rules_category_fkey
      foreign key (org_id, category_id) references public.fin_categories (org_id, id)
      on delete cascade;
  end if;

  -- 7. No org_id default: a category row must name its org.
  alter table public.fin_categories     alter column org_id drop default;
  alter table public.fin_budget         alter column org_id drop default;
  alter table public.fin_category_rules alter column org_id drop default;

  -- RLS stays as enable_rls_per_domain.sql set it; re-asserting is a no-op.
  alter table public.fin_categories     enable row level security;
  alter table public.fin_budget         enable row level security;
  alter table public.fin_category_rules enable row level security;
end $$;

-- Indexes backing the composite FKs (delete/update on fin_categories).
create index if not exists fin_transactions_org_category_idx
  on public.fin_transactions (org_id, category_id);
create index if not exists fin_category_rules_org_category_idx
  on public.fin_category_rules (org_id, category_id);

-- ── Operator seed: generic nonprofit starter categories ────────────────────
-- Usage (Supabase SQL editor, as an operator):
--   select public.fin_seed_starter_categories(
--     (select id from public.orgs where slug = '<new-org-slug>'));
-- Returns the number of categories inserted. Safe to re-run: existing
-- (org_id, id) rows are left alone, so an org's renames survive. Functional
-- classes follow the Form 990 split; revenue/transfer rows have none.
create or replace function public.fin_seed_starter_categories(p_org uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  if p_org is null or not exists (select 1 from public.orgs where id = p_org) then
    raise exception 'fin_seed_starter_categories: org % not found', p_org;
  end if;

  insert into public.fin_categories
    (org_id, id, group_name, display_name, kind, functional_class, sort_order)
  select p_org, s.id, s.grp, s.name, s.kind, s.fc, s.ord
  from (values
    ('revenue.individuals',          'REVENUE',        'Individual donations',          'revenue',  null::text,    100),
    ('revenue.foundations',          'REVENUE',        'Foundation grants',             'revenue',  null,          101),
    ('revenue.corporate',            'REVENUE',        'Corporate gifts & sponsorships','revenue',  null,          102),
    ('revenue.government',           'REVENUE',        'Government grants',             'revenue',  null,          103),
    ('revenue.events',               'REVENUE',        'Event revenue',                 'revenue',  null,          104),
    ('revenue.program-fees',         'REVENUE',        'Program service fees',          'revenue',  null,          105),
    ('revenue.interest',             'REVENUE',        'Interest income',               'revenue',  null,          106),
    ('revenue.other',                'REVENUE',        'Other revenue',                 'revenue',  null,          107),
    ('payroll.salaries-program',     'PAYROLL',        'Salaries: program staff',       'expense',  'program',     200),
    ('payroll.salaries-admin',       'PAYROLL',        'Salaries: management & admin',  'expense',  'admin',       201),
    ('payroll.salaries-fundraising', 'PAYROLL',        'Salaries: fundraising staff',   'expense',  'fundraising', 202),
    ('payroll.taxes',                'PAYROLL',        'Payroll taxes',                 'expense',  'admin',       203),
    ('payroll.benefits',             'PAYROLL',        'Employee benefits',             'expense',  'admin',       204),
    ('program.supplies',             'PROGRAM',        'Program supplies',              'expense',  'program',     300),
    ('program.contractors',          'PROGRAM',        'Program contractors',           'expense',  'program',     301),
    ('program.participant-support',  'PROGRAM',        'Participant support & stipends','expense',  'program',     302),
    ('program.travel',               'PROGRAM',        'Program travel',                'expense',  'program',     303),
    ('program.events',               'PROGRAM',        'Program events',                'expense',  'program',     304),
    ('admin.rent',                   'OCCUPANCY',      'Rent',                          'expense',  'admin',       400),
    ('admin.utilities',              'OCCUPANCY',      'Utilities',                     'expense',  'admin',       401),
    ('admin.insurance',              'ADMINISTRATION', 'Insurance',                     'expense',  'admin',       500),
    ('admin.accounting',             'ADMINISTRATION', 'Accounting & audit',            'expense',  'admin',       501),
    ('admin.legal',                  'ADMINISTRATION', 'Legal fees',                    'expense',  'admin',       502),
    ('admin.software',               'ADMINISTRATION', 'Software & subscriptions',      'expense',  'admin',       503),
    ('admin.office-supplies',        'ADMINISTRATION', 'Office supplies & equipment',   'expense',  'admin',       504),
    ('admin.bank-fees',              'ADMINISTRATION', 'Bank & payment fees',           'expense',  'admin',       505),
    ('admin.licenses-fees',          'ADMINISTRATION', 'Licenses, permits & filing fees','expense', 'admin',       506),
    ('admin.staff-development',      'ADMINISTRATION', 'Staff training & development',  'expense',  'admin',       507),
    ('fundraising.events',           'FUNDRAISING',    'Fundraising events',            'expense',  'fundraising', 600),
    ('fundraising.platform-fees',    'FUNDRAISING',    'Donation platform fees',        'expense',  'fundraising', 601),
    ('fundraising.marketing',        'FUNDRAISING',    'Marketing & communications',    'expense',  'fundraising', 602),
    ('fundraising.stewardship',      'FUNDRAISING',    'Donor stewardship',             'expense',  'fundraising', 603),
    ('transfer.internal',            'TRANSFER',       'Internal transfer',             'transfer', null,          900),
    ('transfer.reimbursement',       'TRANSFER',       'Reimbursement',                 'transfer', null,          901)
  ) as s(id, grp, name, kind, fc, ord)
  on conflict (org_id, id) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- Operator-only: no browser role may call it (Supabase grants EXECUTE on new
-- public functions to anon and authenticated by default).
revoke execute on function public.fin_seed_starter_categories(uuid) from public;
revoke execute on function public.fin_seed_starter_categories(uuid) from anon;
revoke execute on function public.fin_seed_starter_categories(uuid) from authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.fin_seed_starter_categories(uuid) to service_role;
  end if;
end $$;
