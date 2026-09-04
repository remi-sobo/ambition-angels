-- BloomOS V2 / Spec A, stage A6 — seed the eight Contract 2 metrics for AA.
-- (specs/bloomos-v2-spec-a-platform-contracts.md §Contract 2 · Seeding;
--  docs/v2-recon.md §B.3/§B.4)
--
-- Data, not schema: A1 already added numerator/denominator/population/
-- confirmed_state and the (org_id, metric_key) unique index. This inserts
-- the eight definitions the spec names, idempotently, for tenant one only.
-- AA resolved BY SLUG like the entitlement seeds — no hardcoded org uuid
-- (a deliberate deviation from the recon §B.4 draft), and a no-op against a
-- DB where the org isn't present (e.g. the RLS scratch DB).
--
-- Seeding decisions, stated rather than buried:
--
-- 1. finish_30_days and second_track_rate seed confirmed_state='conflict'
--    ON PURPOSE — the 27% / 74% / 86% return-rate question is unsettled, and
--    conflict is what blocks their export under Contract 7 (A5 gate) until a
--    human resolves it. Do not "fix" these to confirmed in a later edit; the
--    fix is settling the definition at /admin/kpis, not editing the seed.
--
-- 2. cost_per_teen seeds source_kind='manual' — a DEVIATION from the recon
--    draft (which marked it computed). Its numerator (program-function
--    expense FYTD) is computable, but its denominator — teens reached FYTD —
--    lives in the teen-app platform, exactly like reached_all_time. A
--    resolver would have to invent the denominator; manual is honest. Flips
--    to computed when a platform export lands, same as the other five.
--
-- 3. attendance_rate's definition text follows the HOUSE attendance rule
--    (app/admin/cohorts/_lib/rollups.ts, every attendance surface):
--    (present + late) / (present + late + absent) — excused and unmarked
--    never count against anyone. The recon draft's "all marks" denominator
--    would have quietly invented a second attendance formula, the exact
--    two-answers failure Contract 2 exists to end.
--
-- 4. enrolled_in_cohort and attendance_rate are computed and their resolvers
--    ship in the same PR (lib/admin/metrics/resolvers.ts) — a computed
--    definition with no resolver is an A4 finding, never seeded knowingly.
--
-- Apply via the migration API (registers in the ledger). Project:
-- Ambition-Angels (kzzdtibbwsucloaoqpqa).

insert into public.metric_definitions
  (org_id, metric_key, name, description, department, unit, direction, cadence,
   source_kind, source_key, numerator, denominator, population, confirmed_state, active)
select o.id, m.*
from public.orgs o,
     (values
  ('reached_all_time', 'Reached, all time',
   'Distinct teens with any recorded engagement, since inception',
   'program', 'count', 'up', 'monthly', 'manual', null,
   'distinct teens with any recorded engagement', null,
   'all teens, since inception', 'unconfirmed', true),
  ('active_on_platform', 'Active on platform',
   'Teens with app activity in the last 30 days',
   'program', 'count', 'up', 'weekly', 'manual', null,
   'teens with app activity in the last 30 days', null,
   'all teens on the platform', 'unconfirmed', true),
  ('enrolled_in_cohort', 'Enrolled in a cohort',
   'Distinct teens enrolled in an active cohort (current term)',
   'program', 'count', 'up', 'weekly', 'computed', 'enrolled_in_cohort',
   'distinct enrolled cohort_members rows, active cohorts', null,
   'teens on a facilitated roster, current term', 'confirmed', true),
  ('finish_30_days', 'Finish the 30 days',
   'Finishers over starters, FY26 cohort since Jul 1',
   'program', 'pct', 'up', 'monthly', 'manual', null,
   'teens who finished a 30-day track',
   'teens who started a track, FY26',
   'FY26 cohort', 'conflict', true),
  ('second_track_rate', 'Start a second track',
   'Second starts over finishers, FY26 cohort',
   'program', 'pct', 'up', 'monthly', 'manual', null,
   'teens who started a second track',
   'teens who finished the 30 days',
   'FY26 finishers', 'conflict', true),
  ('attendance_rate', 'Attendance rate',
   'Present + late over present + late + absent, active cohorts, trailing 3 weeks',
   'program', 'pct', 'up', 'weekly', 'computed', 'attendance_rate',
   'present + late marks, held sessions, trailing 3 weeks',
   'present + late + absent marks (excused and unmarked excluded)',
   'enrolled teens in active cohorts', 'confirmed', true),
  ('cost_per_teen', 'Cost per teen',
   'Program expense over teens reached, fiscal year to date',
   'finance', 'usd', 'down', 'quarterly', 'manual', null,
   'program-function expense, FYTD',
   'teens reached, FYTD',
   'all teens reached this FY', 'unconfirmed', true),
  ('active_guides', 'Active guides',
   'Adult guides with a matched teen and activity in 60 days',
   'program', 'count', 'up', 'monthly', 'manual', null,
   'guides with a matched teen and activity in 60 days', null,
   'all adult guides', 'unconfirmed', true)
     ) as m(metric_key, name, description, department, unit, direction, cadence,
            source_kind, source_key, numerator, denominator, population,
            confirmed_state, active)
where o.slug = 'ambition-angels'
on conflict (org_id, metric_key) do nothing;

-- ── rollback (reference only; never applied automatically) ──────────────────
-- delete from public.metric_definitions
--   where org_id = (select id from public.orgs where slug = 'ambition-angels')
--     and metric_key in ('reached_all_time','active_on_platform','enrolled_in_cohort',
--                        'finish_30_days','second_track_rate','attendance_rate',
--                        'cost_per_teen','active_guides');
