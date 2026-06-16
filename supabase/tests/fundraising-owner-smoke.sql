-- Fundraising v2 / Phase 0A — owner-session smoke.
--
-- Companion to rls-leak-test.sql. The leak test proves ISOLATION (a second
-- org sees nothing); this proves ACCESS: logged in as the Ambition Angels
-- owner, every table the nine fundraising pages read is readable through the
-- user-session client. It is the automated backstop for the manual app
-- smoke checklist in docs/bloomos/fundraising-v2-phase0a.md — it cannot click
-- the real UI, but it runs the exact reads each page issues, as the owner,
-- under RLS, and fails if RLS filters the operator out of any surface.
--
-- Run against a DISPOSABLE database that already has every migration applied
-- (e.g. immediately after scripts/test-rls.sh, which leaves such a DB):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fundraising-owner-smoke.sql
--
-- Page → tables covered:
--   fundraising (overview)      opportunities
--   donors                      constituents, gifts, recurring_plans
--   donors/[id]                 constituents, gifts, recurring_plans, interactions, fr_prospect_briefs
--   grants, grants/[id]         grants, grant_requirements
--   campaigns                   campaigns, appeals, gifts
--   acknowledgments             gifts
--   prospects                   hs_contacts, fr_prospect_scores
--   prospects/[hubspot_id]      hs_contacts, hs_companies, hs_deals, hs_engagements, fr_prospect_scores, fr_prospect_briefs

-- Provision the AA owner through the real bootstrap trigger.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001','remi@ambitionangels.org')
on conflict do nothing;

-- Seed one AA row per surface as service role (superuser bypasses RLS, like
-- the system ingestion paths). Idempotent on the unique/PK keys used.
do $$
declare aa uuid; c uuid; gr uuid;
begin
  select id into aa from orgs where slug = 'ambition-angels';

  insert into constituents (org_id, type, first_name, last_name, emails, source)
  values (aa,'person','Smoke','Donor',array['smoke@example.org'],'manual')
  returning id into c;

  insert into gifts (org_id, constituent_id, amount, gift_date, method, acknowledgment_status, external_source, external_id)
  values (aa, c, 250, '2026-03-01','card','pending','smoke','smoke-gift')
  on conflict (external_source, external_id) where external_id is not null do nothing;

  insert into recurring_plans (org_id, constituent_id, amount) values (aa, c, 25);
  insert into interactions (org_id, constituent_id, kind, notes) values (aa, c, 'note','smoke');
  insert into campaigns (org_id, name) values (aa,'Smoke Campaign');
  insert into appeals (org_id, name) values (aa,'Smoke Appeal');
  insert into opportunities (org_id, constituent_id, stage) values (aa, c, 'cultivate');
  insert into grants (org_id, name) values (aa,'Smoke Grant') returning id into gr;
  insert into grant_requirements (org_id, grant_id, kind, due_date) values (aa, gr, 'application','2026-09-01');

  insert into hs_contacts (hubspot_id, email, raw_json, org_id) values ('smoke-hs','smoke@example.org','{}'::jsonb, aa)
    on conflict (hubspot_id) do nothing;
  insert into hs_companies (hubspot_id, name, raw_json, org_id) values ('smoke-co','Smoke Co','{}'::jsonb, aa)
    on conflict (hubspot_id) do nothing;
  insert into hs_deals (hubspot_id, name, raw_json, org_id) values ('smoke-deal','Smoke Deal','{}'::jsonb, aa)
    on conflict (hubspot_id) do nothing;
  insert into hs_engagements (hubspot_id, engagement_type, raw_json, org_id) values ('smoke-eng','note','{}'::jsonb, aa)
    on conflict (hubspot_id) do nothing;
  insert into fr_prospect_scores (hubspot_contact_id, org_id) values ('smoke-hs', aa)
    on conflict (hubspot_contact_id) do nothing;
  insert into fr_prospect_briefs (hubspot_contact_id, content, org_id) values ('smoke-hs','{}'::jsonb, aa);
end $$;

-- Read every page-backing table as the owner, under RLS.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

do $$
declare
  t text;
  n int;
  page_tables text[] := array[
    'opportunities','constituents','gifts','recurring_plans','interactions',
    'campaigns','appeals','grants','grant_requirements',
    'hs_contacts','hs_companies','hs_deals','hs_engagements',
    'fr_prospect_scores','fr_prospect_briefs'
  ];
begin
  foreach t in array page_tables loop
    execute format('select count(*) from public.%I', t) into n;
    if n = 0 then
      raise exception 'SMOKE FAIL: AA owner reads zero rows from % under the user session (operator locked out)', t;
    end if;
  end loop;
end $$;

reset role;
reset request.jwt.claim.sub;

select 'Fundraising owner smoke: ALL NINE-PAGE SURFACES READABLE BY AA OWNER' as result;
