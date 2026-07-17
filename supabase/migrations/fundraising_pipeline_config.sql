-- Fundraising pipeline stages become per-org configuration data (Option C:
-- Bloom owns the pipeline; HubSpot is one optional source).
--
-- Part 1 of 2 (apply before fundraising_pipeline_remap.sql): the config tables,
-- their RLS, and the seed. Part 2 remaps opportunities.stage onto the new keys
-- and swaps the hardcoded check constraint for a composite FK into these
-- tables. Spec: specs/fundraising-pipeline-stages.md.
--
-- Seed layout:
--   * Every org gets the ten-stage Sales taxonomy on its `default` pipeline
--     (the org default per decision D3). AA's rows carry the real HubSpot
--     dealstage ids so the stage sync can translate both directions; other
--     orgs get the same keys with null external ids (standalone).
--   * AA's two other HubSpot pipelines ('59855776' retired Partnership,
--     '727459407' Angel Connectors) and the 'archived_partnership' sentinel
--     (see archive_migrated_partnership_opportunities.sql) are seeded with the
--     legacy five-stage funnel purely so the composite FK holds for their
--     existing rows. Their board experience does not change this round.
--
-- Idempotent. Apply via the Supabase dashboard.

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  key text not null,
  label text not null,
  sort_order int not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  pipeline text not null,
  key text not null,
  label text not null,
  sort_order int not null,
  stage_type text not null check (stage_type in ('open','won','lost','on_hold')),
  -- HubSpot dealstage internal id, for stage-sync translation. Null for
  -- standalone orgs and for stages that have no HubSpot counterpart.
  external_stage_id text,
  probability_default int check (probability_default is null or (probability_default between 0 and 100)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, pipeline, key)
);

create index if not exists pipeline_stages_org_pipeline_idx
  on public.pipeline_stages (org_id, pipeline, sort_order);

-- updated_at triggers + fundraising-domain RLS, same pattern as
-- create_opportunities.sql. Stage-config writes gate on fundraising.write
-- (decision D4; revisit if a settings.* permission lands with Epic 1b).
do $$
declare
  t text;
begin
  foreach t in array array['pipelines', 'pipeline_stages'] loop
    execute format('drop trigger if exists %I on %I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on %I for each row execute function set_updated_at()',
      t || '_set_updated_at', t);

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'members read ' || t, t);
    execute format($p$
      create policy %I on public.%I
        for select to authenticated
        using ( (select private.has_permission(org_id, 'fundraising.read')) )
      $p$, 'members read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'members write ' || t, t);
    execute format($p$
      create policy %I on public.%I
        for all to authenticated
        using ( (select private.has_permission(org_id, 'fundraising.write')) )
        with check ( (select private.has_permission(org_id, 'fundraising.write')) )
      $p$, 'members write ' || t, t);
  end loop;
end $$;

-- ── Seed: default pipeline for every org ─────────────────────────────────────

insert into public.pipelines (org_id, key, label, sort_order, is_default)
select o.id, 'default', 'Sales Pipeline', 0, true
from orgs o
on conflict (org_id, key) do nothing;

-- Ten-stage Sales taxonomy (HubSpot order, AIG Member omitted). Pledged is
-- open at 90% (decision D1: "committed" means money actually closed).
-- On Hold is excluded from weighted and committed but stays a column (D2).
insert into public.pipeline_stages
  (org_id, pipeline, key, label, sort_order, stage_type, probability_default)
select o.id, 'default', v.key, v.label, v.sort_order, v.stage_type, v.prob
from orgs o, (values
  ('identified',            'Identified',                        1, 'open',    10),
  ('researched',            'Researched',                        2, 'open',    20),
  ('needs_appointment',     'Needs Appointment',                 3, 'open',    30),
  ('appointment_scheduled', 'Appointment Scheduled',             4, 'open',    40),
  ('meeting_complete',      'Meeting Complete / Ready for Ask',  5, 'open',    60),
  ('ask_made',              'Ask Made',                          6, 'open',    75),
  ('pledged',               'Pledged',                           7, 'open',    90),
  ('closed_won',            'Closed Won',                        8, 'won',    100),
  ('closed_lost',           'Closed Lost',                       9, 'lost',     0),
  ('on_hold',               'On Hold',                          10, 'on_hold', null::int)
) as v(key, label, sort_order, stage_type, prob)
on conflict (org_id, pipeline, key) do nothing;

-- ── Seed: AA-specific rows (HubSpot ids + the two legacy pipelines) ──────────

do $$
declare
  aa uuid;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    return; -- non-AA database (e.g. the RLS scratch harness before core seed)
  end if;

  -- Real HubSpot dealstage ids for AA's Sales pipeline. Identified/Researched
  -- ids confirmed in Phase 0 from lib/hubspot/stage-map.ts / fr_map_dealstage.
  update public.pipeline_stages ps
  set external_stage_id = v.ext
  from (values
    ('identified',            '68574501'),
    ('researched',            '3448542949'),
    ('needs_appointment',     '59213864'),
    ('appointment_scheduled', 'appointmentscheduled'),
    ('meeting_complete',      '3448504042'),
    ('ask_made',              '68574502'),
    ('pledged',               '59189578'),
    ('closed_won',            'closedwon'),
    ('closed_lost',           'closedlost'),
    ('on_hold',               '3448542951')
  ) as v(key, ext)
  where ps.org_id = aa and ps.pipeline = 'default' and ps.key = v.key
    and ps.external_stage_id is distinct from v.ext;

  -- The out-of-scope pipelines, seeded only so the composite FK holds for
  -- their existing rows. Real labels confirmed in Phase 0 (the spec draft had
  -- them swapped): 59855776 is the retired Partnership Pipeline (consolidated
  -- into `partners`), 727459407 is Angel Connectors. 'archived_partnership' is
  -- the sentinel pipeline value that
  -- archive_migrated_partnership_opportunities.sql retags the 169 shadow rows
  -- to — without a seed here, applying that archive after the FK would fail.
  insert into public.pipelines (org_id, key, label, sort_order, is_default)
  values
    (aa, '59855776',             'Partnership Pipeline (retired)', 1, false),
    (aa, '727459407',            'Angel Connectors',               2, false),
    (aa, 'archived_partnership', 'Archived Partnership',           3, false)
  on conflict (org_id, key) do nothing;

  insert into public.pipeline_stages (org_id, pipeline, key, label, sort_order, stage_type)
  select aa, p.pipeline, v.key, v.label, v.sort_order, v.stage_type
  from (values ('59855776'), ('727459407'), ('archived_partnership')) as p(pipeline),
       (values
         ('identify',  'Identification', 1, 'open'),
         ('qualify',   'Qualification',  2, 'open'),
         ('cultivate', 'Cultivation',    3, 'open'),
         ('solicit',   'Solicitation',   4, 'open'),
         ('steward',   'Stewardship',    5, 'won'),
         ('lost',      'Lost',           6, 'lost')
       ) as v(key, label, sort_order, stage_type)
  on conflict (org_id, pipeline, key) do nothing;
end $$;

-- Verify: select pipeline, count(*) from public.pipeline_stages
--         where org_id = (select id from orgs where slug='ambition-angels')
--         group by pipeline;
-- Expect default=10 and 6 each for 59855776 / 727459407 / archived_partnership.
