-- Capture ops_tasks.planned_week in a committed migration (schema-drift fix).
--
-- planned_week (the Phase 0 weekly-rhythm keystone, referenced by
-- add_planned_day_to_ops_tasks.sql and add_roll_count_to_ops_tasks.sql) has
-- been live in the database but was never written as a migration. So the repo
-- could not rebuild its own schema from scratch, and v_ops_task_health
-- (create_ops_task_health_view.sql) could not apply to a fresh DB and had to be
-- skipped by the RLS leak harness. This closes that gap.
--
-- The column is a `date` stamped to the Monday of a task's planned week (see
-- lib/admin/ops/week.ts and the agenda layer), nullable (a task can be
-- unplanned). Additive, idempotent, reversible; a no-op on the live DB where
-- the column already exists.

alter table public.ops_tasks
  add column if not exists planned_week date;

comment on column public.ops_tasks.planned_week is
  'The Monday (YYYY-MM-DD, America/Los_Angeles) anchoring the week a task is planned for. Null = not yet planned into a week. Stamped by the ops task PATCH route and the agenda layer (lib/admin/ops/week.ts).';

-- The Monday/this-week reads (week-pulse, rhythm, the Monday page) all filter or
-- order by planned_week.
create index if not exists ops_tasks_planned_week_idx on public.ops_tasks (planned_week);

-- ── rollback ──────────────────────────────────────────────
-- drop index if exists ops_tasks_planned_week_idx;
-- alter table public.ops_tasks drop column if exists planned_week;
