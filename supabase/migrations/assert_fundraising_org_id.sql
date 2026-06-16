-- BloomOS Fundraising v2 / Phase 0A: assert the multi-tenant floor.
--
-- Every fundraising table must already carry `org_id NOT NULL` (referencing
-- orgs) and have row-level security enabled — established by
-- create_fundraising_core.sql, create_opportunities.sql, create_grants.sql,
-- create_segments.sql, add_org_id_to_tenant_tables.sql, and
-- enable_rls_per_domain.sql. This migration writes NO schema; it is a guard
-- that fails loudly if any of those invariants ever regresses, so the
-- "org_id on every fundraising table" guarantee is explicit and CI-checked
-- rather than implied. No-op on the current schema.
--
-- Idempotent and side-effect-free: safe to re-run.

do $$
declare
  t text;
  has_col int;
  is_notnull boolean;
  has_fk boolean;
  rls_on boolean;
  fundraising_tables text[] := array[
    -- spine + money model (create_fundraising_core.sql)
    'households','constituents','relationships','interactions',
    'funds','campaigns','appeals','recurring_plans','gifts',
    'soft_credits','acknowledgments',
    -- pipeline / grants / segments
    'opportunities','grants','grant_requirements','segments',
    -- agent + scoring (org_id via add_org_id_to_tenant_tables.sql)
    'fr_prospect_scores','fr_prospect_briefs','fr_email_drafts',
    'fr_touches','fr_agent_activity_log','fr_funding_opportunities',
    -- HubSpot import staging
    'hs_contacts','hs_companies','hs_deals','hs_engagements','hs_sync_jobs'
  ];
begin
  foreach t in array fundraising_tables loop
    if to_regclass('public.' || t) is null then
      raise exception 'fundraising table public.% is missing', t;
    end if;

    -- org_id column present and NOT NULL.
    select a.attnotnull into is_notnull
    from pg_attribute a
    where a.attrelid = ('public.' || t)::regclass
      and a.attname = 'org_id'
      and not a.attisdropped;
    get diagnostics has_col = row_count;
    if has_col = 0 then
      raise exception 'fundraising table public.% has no org_id column', t;
    end if;
    if not is_notnull then
      raise exception 'fundraising table public.%.org_id is nullable (must be NOT NULL)', t;
    end if;

    -- org_id is a foreign key into orgs.
    select exists (
      select 1
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.conrelid = ('public.' || t)::regclass
        and c.contype = 'f'
        and c.confrelid = 'public.orgs'::regclass
        and a.attname = 'org_id'
    ) into has_fk;
    if not has_fk then
      raise exception 'fundraising table public.%.org_id is not a FK to orgs', t;
    end if;

    -- Row-level security is enabled (policies are meaningless without it).
    select c.relrowsecurity into rls_on
    from pg_class c
    where c.oid = ('public.' || t)::regclass;
    if not rls_on then
      raise exception 'fundraising table public.% does not have RLS enabled', t;
    end if;
  end loop;

  raise notice 'assert_fundraising_org_id: all % fundraising tables carry org_id NOT NULL (FK orgs) with RLS enabled',
    array_length(fundraising_tables, 1);
end $$;
