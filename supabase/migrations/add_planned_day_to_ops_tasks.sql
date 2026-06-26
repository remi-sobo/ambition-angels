-- Phase 2 (BloomOS weekly rhythm): day-level planning.
--
-- planned_day places a task on a specific day within its planned_week (the
-- Phase 0 keystone). day_order is the manual order within that day. Both are
-- nullable: a task can be planned for the week without being dropped on a day,
-- and an unordered task sorts after ordered ones.
--
-- Dormant on apply: nothing read these until the day UI shipped. Additive and
-- reversible. Idempotent: safe to re-run.

alter table public.ops_tasks
  add column if not exists planned_day date,
  add column if not exists day_order integer;

comment on column public.ops_tasks.planned_day is
  'The specific day (YYYY-MM-DD, America/Los_Angeles) a task is placed on within its planned_week. Null = planned for the week but not a specific day.';
comment on column public.ops_tasks.day_order is
  'Manual ordering of a task within its planned_day (ascending). Null = unordered (sorts after ordered tasks).';

create index if not exists ops_tasks_planned_day_idx on public.ops_tasks (planned_day);
