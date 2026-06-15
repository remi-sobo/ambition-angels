-- Ops PR-1, captured for repo/DB parity.
--
-- PR-1 was applied directly to the database (no migration file landed in the
-- repo). This migration records those changes idempotently so a fresh
-- environment matches production:
--   * priority            text  ('urgent'|'high'|'medium'|'low'), default 'medium'
--   * parent_id           uuid  self-FK for subtasks
--   * labels              text[] default '{}'
--   * expanded status enum: 'todo'|'in_progress'|'blocked'|'done'
--   * narrowed task category set (distinct from ops_projects' set)
--
-- Safe to run against a DB where PR-1 already applied: every step is guarded.

alter table public.ops_tasks
  add column if not exists priority text not null default 'medium',
  add column if not exists parent_id uuid references public.ops_tasks(id) on delete cascade,
  add column if not exists labels text[] not null default '{}'::text[];

alter table public.ops_tasks drop constraint if exists ops_tasks_priority_check;
alter table public.ops_tasks add constraint ops_tasks_priority_check
  check (priority in ('urgent', 'high', 'medium', 'low'));

alter table public.ops_tasks drop constraint if exists ops_tasks_status_check;
alter table public.ops_tasks add constraint ops_tasks_status_check
  check (status in ('todo', 'in_progress', 'blocked', 'done'));

-- Task categories diverge from ops_projects here: PR Ops-2 narrowed the task
-- taxonomy (added product/operations, dropped admin/recruitment) without
-- touching projects.
alter table public.ops_tasks drop constraint if exists ops_tasks_category_check;
alter table public.ops_tasks add constraint ops_tasks_category_check
  check (category in (
    'fundraising', 'program', 'product', 'finance',
    'operations', 'compliance', 'board', 'other'
  ));

create index if not exists ops_tasks_parent_id_idx on public.ops_tasks(parent_id);
