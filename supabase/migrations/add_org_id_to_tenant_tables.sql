-- BloomOS Ring 1: stamp org_id on every existing tenant table.
--
-- Single-tenant-compatible: the column defaults to the Ambition Angels org,
-- so existing insert paths keep working unchanged. RLS policies referencing
-- org_id land per-domain as routes convert from the service-role client to
-- user-scoped clients.

do $$
declare
  aa uuid;
  t text;
  tenant_tables text[] := array[
    'donations','quiz_submissions','partner_waitlist',
    'page_views','click_events',
    'hs_contacts','hs_companies','hs_deals','hs_engagements','hs_sync_jobs',
    'fr_prospect_scores','fr_prospect_briefs','fr_email_drafts','fr_touches',
    'fr_agent_activity_log','fr_funding_opportunities',
    'ops_projects','ops_tasks',
    'meeting_types','bookings','blackouts',
    'fin_categories','fin_budget','fin_revenue_commitments','fin_transactions',
    'fin_imports','fin_category_rules','fin_config',
    'ygb_registrations','ygb_attendance',
    'demoday_notes','demoday_signups',
    'bv_showcase_submissions','bv_newsletter_subscribers'
  ];
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    raise exception 'ambition-angels org not found — run create_bloomos_core first';
  end if;

  foreach t in array tenant_tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping missing table %', t;
      continue;
    end if;
    execute format(
      'alter table public.%I add column if not exists org_id uuid references public.orgs(id)', t);
    execute format(
      'update public.%I set org_id = %L where org_id is null', t, aa);
    execute format(
      'alter table public.%I alter column org_id set not null', t);
    execute format(
      'alter table public.%I alter column org_id set default %L', t, aa);
    execute format(
      'create index if not exists %I on public.%I (org_id)', t || '_org_id_idx', t);
  end loop;
end $$;
