-- Tenant-default ratchet (Sobo playbook: the org_id-default trap).
--
-- Many tenant tables still carry a hardcoded Ambition Angels org_id as the
-- column default (add_org_id_to_tenant_tables.sql and the fundraising create_*
-- migrations). That trap is being removed per-domain by tenant-two-hardening.md;
-- its Phase 9 flips the guard to forbid ANY org_id default. Until then a hard
-- ban would fail the build, so this is the RATCHET in the meantime: the current
-- set is frozen as a baseline, and the build fails if a NEW tenant table ships
-- with an org_id default. Removing a default (the hardening's job) keeps the set
-- a subset of the baseline, so it still passes — the ratchet only turns one way.
--
-- When Phase 9 lands and the defaults are gone, replace this with the hard ban
-- (assert the set is empty) and delete the baseline.
--
-- Run by scripts/test-rls.sh against the scratch DB after the leak assertions.

do $$
declare
  -- Frozen baseline: every public table that carried an org_id column default
  -- as of 2026-06-30. New defaults are forbidden; removals are welcome.
  baseline text[] := array[
    'acknowledgments','appeals','applications','attendance','blackouts','board_meetings',
    'board_members','bookings','briefings','bv_newsletter_subscribers','bv_showcase_submissions',
    'campaigns','click_events','cohort_members','cohort_sessions','cohorts','compliance_items',
    'connection_candidates','connections','constituents','demoday_notes','demoday_signups',
    'donations','email_campaigns','email_sends','fin_budget','fin_categories','fin_category_rules',
    'fin_config','fin_imports','fin_revenue_commitments','fin_transactions','fr_agent_activity_log',
    'fr_email_drafts','fr_funding_opportunities','fr_prospect_briefs','fr_prospect_scores',
    'fr_touches','funder_angles','funds','gifts','grant_requirements','grants','hs_companies',
    'hs_contacts','hs_deals','hs_engagements','hs_sync_jobs','interactions','journey_enrollments',
    'journey_steps','journeys','kpi_settings','kpi_snapshots','meeting_types','opportunities',
    'ops_projects','ops_tasks','page_views','partner_contacts','partner_interactions',
    'partner_waitlist','partners','pledge_payments','pledges','quiz_submissions','recurring_plans',
    'relationships','segments','soft_credits','strategy_angles','students','ygb_attendance',
    'ygb_registrations'
  ];
  extra text;
begin
  select string_agg(table_name, ', ' order by table_name) into extra
  from information_schema.columns
  where table_schema = 'public'
    and column_name = 'org_id'
    and column_default is not null
    and table_name <> all (baseline);

  if extra is not null then
    raise exception
      'New tenant table(s) with a hardcoded org_id default: %. The org_id-default trap is frozen (tenant-two-hardening Phase 9 removes it). Add the column with org_id NOT NULL and NO default, or update the baseline in this file deliberately.',
      extra;
  end if;
end $$;

select 'tenant-default ratchet: no new org_id defaults' as result;
