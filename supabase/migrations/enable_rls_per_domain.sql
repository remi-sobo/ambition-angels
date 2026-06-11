-- BloomOS Ring 1: per-domain RLS on every tenant table.
--
-- Completes the "enable RLS table-by-table" item from docs/bloomos/07-roadmap.md.
-- Each table maps to one permission domain (the same domains seeded into
-- role_permissions by create_bloomos_core.sql); policies check
-- private.has_permission(org_id, '<domain>.read' / '<domain>.write'), so
-- role changes are data changes — policies never name roles.
--
-- Zero behavior change for the app TODAY: all server routes still use the
-- service-role client, which bypasses RLS. These policies are the
-- prerequisite for converting routes to user-scoped clients (next step),
-- and they close the anon-key read exposure on every remaining table.
--
-- Idempotent: re-running is safe (enable RLS is a no-op when already
-- enabled; policies are drop-and-recreate). Tables that don't exist yet in
-- an environment are skipped with a notice.
--
-- The one pre-existing anon-facing policy — public read of ACTIVE rows on
-- meeting_types (create_meet_schema.sql), which powers the public /meet
-- pages — is left untouched; the member policies below are additive
-- (permissive policies OR together).

do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      -- ── program ────────────────────────────────────────────────────
      ('quiz_submissions',         'program'),
      ('partner_waitlist',         'program'),
      ('ygb_registrations',        'program'),
      ('ygb_attendance',           'program'),
      ('demoday_notes',            'program'),
      ('demoday_signups',          'program'),
      ('bv_showcase_submissions',  'program'),
      ('bv_newsletter_subscribers','program'),
      -- ── fundraising ────────────────────────────────────────────────
      ('donations',                'fundraising'),
      ('hs_contacts',              'fundraising'),
      ('hs_companies',             'fundraising'),
      ('hs_deals',                 'fundraising'),
      ('hs_engagements',           'fundraising'),
      ('hs_sync_jobs',             'fundraising'),
      ('fr_prospect_scores',       'fundraising'),
      ('fr_prospect_briefs',       'fundraising'),
      ('fr_email_drafts',          'fundraising'),
      ('fr_touches',               'fundraising'),
      ('fr_agent_activity_log',    'fundraising'),
      ('fr_funding_opportunities', 'fundraising'),
      -- ── finance ────────────────────────────────────────────────────
      ('fin_categories',           'finance'),
      ('fin_budget',               'finance'),
      ('fin_revenue_commitments',  'finance'),
      ('fin_transactions',         'finance'),
      ('fin_imports',              'finance'),
      ('fin_category_rules',       'finance'),
      ('fin_config',               'finance'),
      -- ── ops (incl. meetings) ───────────────────────────────────────
      ('ops_projects',             'ops'),
      ('ops_tasks',                'ops'),
      ('meeting_types',            'ops'),
      ('bookings',                 'ops'),
      ('blackouts',                'ops'),
      -- ── reports (website analytics; member-read-only, writes happen
      --    only through the service-role tracking endpoints) ──────────
      ('page_views',               'reports'),
      ('click_events',             'reports')
    ) as m(tbl, domain)
  loop
    if to_regclass('public.' || rec.tbl) is null then
      raise notice 'skipping missing table %', rec.tbl;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', rec.tbl);

    execute format('drop policy if exists %I on public.%I',
      'members read ' || rec.tbl, rec.tbl);
    execute format($p$
      create policy %I on public.%I
        for select to authenticated
        using ( (select private.has_permission(org_id, %L)) )
      $p$,
      'members read ' || rec.tbl, rec.tbl, rec.domain || '.read');

    -- reports domain is read-only for members; no write policy.
    if rec.domain <> 'reports' then
      execute format('drop policy if exists %I on public.%I',
        'members write ' || rec.tbl, rec.tbl);
      -- FOR ALL also covers select for write-permission holders; every
      -- role seeded with <domain>.write also has <domain>.read, so this
      -- adds no access beyond the read policy above.
      execute format($p$
        create policy %I on public.%I
          for all to authenticated
          using ( (select private.has_permission(org_id, %L)) )
          with check ( (select private.has_permission(org_id, %L)) )
        $p$,
        'members write ' || rec.tbl, rec.tbl,
        rec.domain || '.write', rec.domain || '.write');
    end if;
  end loop;
end $$;
