-- ============================================================================
-- BloomOS  |  2026–27 OGSM (v3) load — PHASE 3: metric keys and provenance
-- Apply MANUALLY in the Supabase SQL editor. Review before running. Not auto-applied.
-- Org: Ambition Angels  =  17c75da8-082d-4c8f-b00b-a4100fb2eb22
--
-- PREREQ: Phase 2 (2027_ogsm_v3_phase2_seed.MANUAL.sql) applied — the v3 plan
-- (6/13/45/49) is live. Companion code (same PR): resolvers for the four new
-- computed keys in lib/admin/plan/metrics.ts + provenance entries for every
-- manual key in lib/admin/plan/provenance.ts.
--
-- What it does, in one transaction:
--   1. Assigns a metric_key to every measure that Phase 2 left null (33 rows),
--      matched by goal id + exact title.
--   2. Flips four of them to source='auto' — the data already lives in BloomOS:
--        anchor_gifts_closed, gifts_10k_closed  (gifts table, fiscal window)
--        monthly_donors                          (active recurring_plans)
--        ogsm_reviews_held                       (plan_reviews, fiscal window)
--      Everything else stays manual. No new pipelines.
--   3. Upserts metric_definitions for the 33 new keys; syncs names/targets on
--      reused keys to the v3 plan; flips donor_updates_sent_ytd to manual for
--      this plan year; deactivates definitions whose measures were retired
--      with the 2026 plan (pilot_completed, parents_active_dashboard,
--      coach_teens, hires_made, dollars_ceiling_fy26).
--   4. Links every plan_kpis row to its metric_definitions row (metric_id).
--   5. Verifies: 0 null keys, 49 linked rows, 7 auto rows — or aborts.
-- ============================================================================

BEGIN;

-- 0. Guard: the v3 plan must be live --------------------------------------
do $$
begin
  if (select count(*) from plan_kpis where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22') <> 49 then
    raise exception 'Expected the 49-measure v3 plan. Run Phase 2 first. Nothing written.';
  end if;
end $$;

-- 1. Assign keys to the 33 measures seeded with null keys -------------------
-- (goal id + exact title; every title is unique within its goal)
with keymap (goal_id, title, metric_key, new_source) as (values
  -- Goal 1.1 — Web platform live at EPAA
  ('bb100001-0000-4000-8000-000000000001'::uuid, 'Sites running on the web platform',                        'sites_on_web_platform',         null),
  ('bb100001-0000-4000-8000-000000000001'::uuid, 'Cross-login shipped',                                      'cross_login_shipped',           null),
  -- Goal 1.2 — Exposure Ships in production
  ('bb100002-0000-4000-8000-000000000002'::uuid, 'Exposure Ship format in production',                       'exposure_ship_in_production',   null),
  ('bb100002-0000-4000-8000-000000000002'::uuid, 'Careers live in catalog',                                  'careers_in_catalog',            null),
  ('bb100002-0000-4000-8000-000000000002'::uuid, 'Days to produce one new unit',                             'days_to_produce_unit',          null),
  -- Goal 1.3 — Prove depth
  ('bb100003-0000-4000-8000-000000000003'::uuid, 'Unit completion rate',                                     'unit_completion_rate',          null),
  -- Goal 2.1 — 1,000 teens
  ('bb200001-0000-4000-8000-000000000001'::uuid, 'Sponsored schools live',                                   'sponsored_schools_live',        null),
  ('bb200001-0000-4000-8000-000000000001'::uuid, 'Program partners live',                                    'program_partners_live',         null),
  ('bb200001-0000-4000-8000-000000000001'::uuid, 'Teens completing at least one unit',                       'teens_completed_one_unit',      null),
  ('bb200001-0000-4000-8000-000000000001'::uuid, 'Adults active weekly on the dashboard',                    'adults_active_weekly',          null),
  -- Goal 2.2 — trusted-adult layer
  ('bb200002-0000-4000-8000-000000000002'::uuid, 'EPAA agreement signed before baseline',                    'epaa_agreement_signed',         null),
  -- Goal 3.1 — Ambition Plans
  ('bb300001-0000-4000-8000-000000000001'::uuid, 'WALL · Ambition Plans completed',                          'ambition_plans_completed',      null),
  ('bb300001-0000-4000-8000-000000000001'::uuid, 'Coaches vetted, background-checked, and trained',          'coaches_trained',               null),
  ('bb300001-0000-4000-8000-000000000001'::uuid, 'Application to match rate',                                'application_match_rate',        null),
  ('bb300001-0000-4000-8000-000000000001'::uuid, 'Days from application to first session',                   'days_to_first_session',         null),
  ('bb300001-0000-4000-8000-000000000001'::uuid, 'Verdict split: validated, adjacent, not it',               'verdict_split_reported',        null),
  ('bb300001-0000-4000-8000-000000000001'::uuid, '90-day follow-through on action one',                      'followthrough_90day',           null),
  ('bb300001-0000-4000-8000-000000000001'::uuid, 'Coach return rate',                                        'coach_return_rate',             null),
  -- Goal 4.1 — EPAA result
  ('bb400001-0000-4000-8000-000000000001'::uuid, 'Students with a baseline collected',                       'students_baseline_collected',   null),
  ('bb400001-0000-4000-8000-000000000001'::uuid, 'Schools stating renewal intent in writing',                'schools_renewal_intent',        null),
  -- Goal 5.1 — Raise $875,000
  ('bb500001-0000-4000-8000-000000000001'::uuid, 'Anchor gifts of $150,000 or more closed',                  'anchor_gifts_closed',           'auto'),
  -- Goal 5.2 — four channels
  ('bb500002-0000-4000-8000-000000000002'::uuid, 'School and program sponsorships',                          'floor_source_sponsorships',     null),
  -- Goal 5.3 — gift table
  ('bb500003-0000-4000-8000-000000000003'::uuid, 'Gifts of $10,000 or more closed',                          'gifts_10k_closed',              'auto'),
  ('bb500003-0000-4000-8000-000000000003'::uuid, 'Donor meetings held per month',                            'donor_meetings_per_month',      null),
  ('bb500003-0000-4000-8000-000000000003'::uuid, 'Monthly donors',                                           'monthly_donors',                'auto'),
  -- Goal 6.1 — Partner Success
  ('bb600001-0000-4000-8000-000000000001'::uuid, 'Partner Success lead hired',                               'partner_success_hired',         null),
  ('bb600001-0000-4000-8000-000000000001'::uuid, 'Sites carried by Partner Success at year end',             'partner_success_sites',         null),
  ('bb600001-0000-4000-8000-000000000001'::uuid, 'Actual hours per school against the 90-hour assumption',   'hours_per_school',              null),
  -- Goal 6.2 — board
  ('bb600002-0000-4000-8000-000000000002'::uuid, 'Board members with an active fundraising assignment',      'board_fundraising_assignments', null),
  ('bb600002-0000-4000-8000-000000000002'::uuid, 'Board giving participation',                               'board_giving_participation',    null),
  ('bb600002-0000-4000-8000-000000000002'::uuid, 'Board-sourced introductions',                              'board_intros',                  null),
  ('bb600002-0000-4000-8000-000000000002'::uuid, 'Quarterly OGSM reviews held',                              'ogsm_reviews_held',             'auto'),
  -- Goal 6.3 — compliance
  ('bb600003-0000-4000-8000-000000000003'::uuid, 'Coaches with a completed background check',                'coach_background_checks',       null)
)
update plan_kpis k
set metric_key = m.metric_key,
    source     = coalesce(m.new_source, k.source),
    updated_at = now()
from keymap m
where k.org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'
  and k.goal_id = m.goal_id
  and k.title = m.title
  and k.metric_key is null;

-- 2. Catalog definitions for the 33 new keys --------------------------------
insert into metric_definitions
  (org_id, metric_key, name, description, department, unit, direction, cadence, source_kind, source_key, target, active)
values
  -- computed (source_key = metric_key; resolvers in lib/admin/plan/metrics.ts)
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','anchor_gifts_closed','Anchor gifts ($150K+) closed','Counts gifts of $150,000 or more received this fiscal year.','fundraising','count','up','weekly','computed','anchor_gifts_closed',1,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','gifts_10k_closed','Gifts of $10,000+ closed','Counts gifts of $10,000 or more received this fiscal year.','fundraising','count','up','weekly','computed','gifts_10k_closed',7,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','monthly_donors','Monthly donors','Active recurring giving plans.','fundraising','count','up','weekly','computed','monthly_donors',25,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','ogsm_reviews_held','Quarterly OGSM reviews held','Strategy reviews logged in BloomOS this fiscal year.','ops','count','up','quarterly','computed','ogsm_reviews_held',4,true),
  -- manual — Objective 1
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','sites_on_web_platform','Sites running on the web platform','Sites live on the web platform.','ops','count','up','monthly','manual',null,10,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','cross_login_shipped','Cross-login shipped','Unified web + mobile login shipped.','ops','boolean','up','monthly','manual',null,1,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','exposure_ship_in_production','Exposure Ship format in production','Exposure Ship format live in production.','ops','boolean','up','monthly','manual',null,1,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','careers_in_catalog','Careers live in catalog','Approved careers live in the catalog.','program','count','up','monthly','manual',null,40,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','days_to_produce_unit','Days to produce one new unit','Per-unit turnaround from the curriculum pipeline log.','ops','days','down','monthly','manual',null,5,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','unit_completion_rate','Unit completion rate','Unit completions ÷ starts, from platform analytics.','program','pct','up','monthly','manual',null,60,true),
  -- manual — Objective 2
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','sponsored_schools_live','Sponsored schools live','Signed sponsored schools running.','program','count','up','monthly','manual',null,4,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','program_partners_live','Program partners live','Program partners running.','program','count','up','monthly','manual',null,6,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','teens_completed_one_unit','Teens completing at least one unit','Teens with at least one completed unit, from platform analytics.','program','count','up','monthly','manual',null,2000,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','adults_active_weekly','Adults active weekly on the dashboard','Adult Guide dashboard weekly actives.','program','count','up','weekly','manual',null,150,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','epaa_agreement_signed','EPAA agreement signed before baseline','Signed EPAA agreement on file.','ops','boolean','up','monthly','manual',null,1,true),
  -- manual — Objective 3 (Ambition Coach)
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','ambition_plans_completed','Ambition Plans completed','Completed five-part plans delivered to adult guides.','program','count','up','monthly','manual',null,50,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','coaches_trained','Coaches vetted, background-checked, and trained','Coaches cleared and trained, from the coach program tracker.','program','count','up','monthly','manual',null,60,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','application_match_rate','Application to match rate','Matches ÷ applications per matching window.','program','pct','up','monthly','manual',null,80,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','days_to_first_session','Days from application to first session','Application date to first session date.','program','days','down','monthly','manual',null,30,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','verdict_split_reported','Verdict split reported','Verdict split (validated / adjacent / not it) reported.','program','boolean','up','quarterly','manual',null,1,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','followthrough_90day','90-day follow-through on action one','90-day follow-up on plan action one.','program','pct','up','quarterly','manual',null,50,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','coach_return_rate','Coach return rate','Coaches returning for another cohort.','program','pct','up','quarterly','manual',null,40,true),
  -- manual — Objective 4
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','students_baseline_collected','Students with a baseline collected','FOS baseline coverage at EPAA.','program','pct','up','quarterly','manual',null,90,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','schools_renewal_intent','Schools stating renewal intent in writing','Written renewal-intent statements on file.','program','count','up','quarterly','manual',null,2,true),
  -- manual — Objective 5
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','floor_source_sponsorships','School and program sponsorships','Campaign channel target: school and program sponsorships.','fundraising','usd','up','monthly','manual',null,175000,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','donor_meetings_per_month','Donor meetings held per month','Donor meetings logged in BloomOS.','fundraising','count','up','monthly','manual',null,8,true),
  -- manual — Objective 6
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','partner_success_hired','Partner Success lead hired','Signed offer / start date.','ops','count','up','monthly','manual',null,1,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','partner_success_sites','Sites carried by Partner Success at year end','Sites carried by Partner Success.','ops','count','up','quarterly','manual',null,6,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','hours_per_school','Actual hours per school','Delivery hours tracked per school against the 90-hour assumption.','ops','hours','down','quarterly','manual',null,90,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','board_fundraising_assignments','Board members with an active fundraising assignment','Campaign assignments per board member.','ops','pct','up','quarterly','manual',null,100,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','board_giving_participation','Board giving participation','Board gifts on file this fiscal year.','ops','pct','up','quarterly','manual',null,100,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','board_intros','Board-sourced introductions','Board-sourced introductions logged.','ops','count','up','monthly','manual',null,12,true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','coach_background_checks','Coaches with a completed background check','Background check vendor reports.','ops','pct','up','monthly','manual',null,100,true)
on conflict (org_id, metric_key) do update
  set name = excluded.name,
      description = excluded.description,
      department = excluded.department,
      unit = excluded.unit,
      direction = excluded.direction,
      cadence = excluded.cadence,
      source_kind = excluded.source_kind,
      source_key = excluded.source_key,
      target = excluded.target,
      active = true,
      updated_at = now();

-- 3. Sync reused definitions to the v3 plan ----------------------------------
update metric_definitions set name = 'Raised (fiscal year)', target = 875000, updated_at = now()
  where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' and metric_key = 'dollars_raised_fy26';
update metric_definitions set name = 'Weighted pipeline coverage', target = 650000, updated_at = now()
  where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' and metric_key = 'weighted_pipeline_fy26';
update metric_definitions set target = 6, updated_at = now()
  where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' and metric_key = 'cash_runway_months';
update metric_definitions set target = 1000, updated_at = now()
  where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' and metric_key = 'active_teens_2x_week';
update metric_definitions set target = 10, updated_at = now()
  where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' and metric_key = 'partners_2x_week';
update metric_definitions set name = 'Institutional grants', target = 325000, updated_at = now()
  where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' and metric_key = 'floor_source_foundations';
update metric_definitions set name = 'Individual and major gifts', target = 225000, updated_at = now()
  where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' and metric_key = 'floor_source_individual';
update metric_definitions set target = 150000, updated_at = now()
  where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' and metric_key = 'floor_source_corporate';
update metric_definitions set target = 12, updated_at = now()
  where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' and metric_key = 'donor_updates_sent_ytd';

-- donor_updates_sent_ytd is hand-tallied this plan year: the auto counter is
-- calendar-YTD and the plan year runs July–June (decision, 2026-08-11).
update metric_definitions
  set source_kind = 'manual', source_key = null, updated_at = now()
  where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' and metric_key = 'donor_updates_sent_ytd';

-- 4. Deactivate definitions retired with the 2026 plan -----------------------
-- (History in metric_snapshots is preserved; active=false just removes them
-- from staleness checks and the unlinked-computed capture.)
update metric_definitions
  set active = false, updated_at = now()
  where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'
    and metric_key in ('pilot_completed','parents_active_dashboard','coach_teens','hires_made','dollars_ceiling_fy26');

-- 5. Link every measure to its catalog definition ---------------------------
update plan_kpis k
set metric_id = d.id, updated_at = now()
from metric_definitions d
where k.org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'
  and d.org_id = k.org_id
  and d.metric_key = k.metric_key
  and k.metric_id is distinct from d.id;

-- 6. Verify, or abort --------------------------------------------------------
do $$
declare
  n_nullkey int; n_linked int; n_auto int;
begin
  select count(*) into n_nullkey from plan_kpis
    where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' and metric_key is null;
  select count(*) into n_linked from plan_kpis
    where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' and metric_id is not null;
  select count(*) into n_auto from plan_kpis
    where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' and source = 'auto';

  if n_nullkey <> 0 or n_linked <> 49 or n_auto <> 7 then
    raise exception 'Phase 3 mismatch (null keys %, linked %, auto %) — expected 0/49/7. ROLLING BACK.',
      n_nullkey, n_linked, n_auto;
  end if;

  raise notice 'Phase 3 complete: 49 keyed + linked measures, 7 auto (3 reused + 4 newly wired).';
end $$;

COMMIT;
