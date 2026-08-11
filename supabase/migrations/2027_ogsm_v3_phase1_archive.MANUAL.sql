-- ============================================================================
-- BloomOS  |  2026–27 OGSM (v3) load — PHASE 1: archive the 2026 plan
-- Apply MANUALLY in the Supabase SQL editor. Review before running. Not auto-applied.
-- Org: Ambition Angels  =  17c75da8-082d-4c8f-b00b-a4100fb2eb22
--
-- Prereq: create_plan_archives.sql has been applied (plan_archives exists).
--
-- Copies the live 2026 OGSM — objectives, goals, initiatives, KPIs, and ALL
-- KPI snapshots — verbatim into ONE jsonb archive row. Deletes nothing.
-- The transaction aborts if an archive with this label already exists, or if
-- any archived array's length differs from the live row count.
--
-- Expected live counts at time of writing (2026-08-11):
--   objectives 4, goals 10, initiatives 24, kpis 26, kpi_snapshots 9.
-- The verification block compares against the LIVE counts at run time, so the
-- archive is correct even if rows changed since.
--
-- After COMMIT, run the confirmation query at the bottom and confirm the
-- counts before running Phase 2 (2027_ogsm_v3_phase2_seed.MANUAL.sql).
-- ============================================================================

BEGIN;

-- 0. Guard: refuse to run twice --------------------------------------------
do $$
begin
  if exists (
    select 1 from plan_archives
    where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' and label = '2026-ogsm-v2'
  ) then
    raise exception 'plan_archives already has 2026-ogsm-v2 for this org — nothing written. Inspect it before re-archiving.';
  end if;
end $$;

-- 1. Archive the live plan, verbatim ---------------------------------------
insert into plan_archives (org_id, label, note, payload)
select
  '17c75da8-082d-4c8f-b00b-a4100fb2eb22',
  '2026-ogsm-v2',
  'Calendar-2026 OGSM (v2), superseded 2026-08 by the June 2026 – June 2027 plan (v3). Human-readable export: docs/plans/ogsm-2026-archived.md.',
  jsonb_build_object(
    'archived_at_counts', jsonb_build_object(
      'objectives',    (select count(*) from plan_objectives    where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'),
      'goals',         (select count(*) from plan_goals         where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'),
      'initiatives',   (select count(*) from plan_initiatives   where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'),
      'kpis',          (select count(*) from plan_kpis          where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'),
      'kpi_snapshots', (select count(*) from plan_kpi_snapshots where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22')
    ),
    'objectives', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order, t.created_at), '[]'::jsonb)
      from plan_objectives t where t.org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'
    ),
    'goals', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order, t.created_at), '[]'::jsonb)
      from plan_goals t where t.org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'
    ),
    'initiatives', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.goal_id, t.sort_order), '[]'::jsonb)
      from plan_initiatives t where t.org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'
    ),
    'kpis', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.goal_id, t.created_at), '[]'::jsonb)
      from plan_kpis t where t.org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'
    ),
    'kpi_snapshots', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.captured_on, t.kpi_id), '[]'::jsonb)
      from plan_kpi_snapshots t where t.org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'
    )
  );

-- 2. Verify: every archived array matches the live count, or abort ----------
do $$
declare
  p jsonb;
  live_n int;
  arch_n int;
  part text;
begin
  select payload into p from plan_archives
  where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' and label = '2026-ogsm-v2';

  foreach part in array array['objectives','goals','initiatives','kpis','kpi_snapshots'] loop
    execute format(
      'select count(*) from plan_%s where org_id = %L',
      part, '17c75da8-082d-4c8f-b00b-a4100fb2eb22'
    ) into live_n;
    arch_n := jsonb_array_length(p -> part);
    if arch_n is distinct from live_n then
      raise exception 'Archive mismatch on %: live % rows, archived % — ROLLING BACK.', part, live_n, arch_n;
    end if;
  end loop;

  raise notice 'Archive verified: objectives %, goals %, initiatives %, kpis %, snapshots %.',
    jsonb_array_length(p -> 'objectives'), jsonb_array_length(p -> 'goals'),
    jsonb_array_length(p -> 'initiatives'), jsonb_array_length(p -> 'kpis'),
    jsonb_array_length(p -> 'kpi_snapshots');
end $$;

COMMIT;

-- 3. Confirm after commit (run separately; expect one row, counts matching) --
-- select label, created_at,
--        jsonb_array_length(payload -> 'objectives')    as objectives,
--        jsonb_array_length(payload -> 'goals')         as goals,
--        jsonb_array_length(payload -> 'initiatives')   as initiatives,
--        jsonb_array_length(payload -> 'kpis')          as kpis,
--        jsonb_array_length(payload -> 'kpi_snapshots') as kpi_snapshots
-- from plan_archives
-- where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' and label = '2026-ogsm-v2';
