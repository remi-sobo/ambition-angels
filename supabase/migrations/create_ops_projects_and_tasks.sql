-- Migration: ops_projects + ops_tasks — operations domain schema.
--
-- Two tables for the Ops Hub admin section.
--   - ops_projects: longer-running initiatives with a description / plan.
--   - ops_tasks:    discrete actions, optionally tied to a project.
--
-- Both share a category enum (8 values, enforced via CHECK rather than a
-- Postgres ENUM type so future values can be added with a simple CHECK
-- swap instead of ALTER TYPE choreography).
--
-- updated_at is auto-bumped on row update via a new shared set_updated_at()
-- trigger function attached to both tables. last_touched_at on ops_projects
-- is set at insert via the column default and bumped by the application
-- layer on project edits (v1; cross-task bumps come later).
--
-- Idempotent end-to-end:
--   - CREATE TABLE / CREATE INDEX use IF NOT EXISTS
--   - trigger function uses CREATE OR REPLACE
--   - triggers are DROP IF EXISTS + CREATE (Postgres has no
--     CREATE TRIGGER IF NOT EXISTS clause, and the spec calls for
--     idempotency without relying on PG14+'s CREATE OR REPLACE TRIGGER)
--
-- RLS: not enabled (project convention).

-- ── set_updated_at() trigger function ──────────────────────────────────────
-- Reusable across any table that has an `updated_at timestamptz` column.
-- First trigger function in this project; future migrations should reuse
-- it rather than redefining their own.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── ops_projects ───────────────────────────────────────────────────────────
create table if not exists ops_projects (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  category         text not null
                     check (category in (
                       'fundraising', 'admin', 'board', 'recruitment',
                       'program', 'finance', 'compliance', 'other'
                     )),
  status           text not null default 'active'
                     check (status in ('active', 'paused', 'done', 'archived')),
  description      text,
  assigned_to      text
                     check (assigned_to is null or assigned_to in ('remi', 'shannon')),
  created_by       text not null
                     check (created_by in ('remi', 'shannon')),
  due_date         date,
  last_touched_at  timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz
);

create index if not exists ops_projects_status_idx          on ops_projects (status);
create index if not exists ops_projects_assigned_to_idx     on ops_projects (assigned_to);
create index if not exists ops_projects_category_idx        on ops_projects (category);
create index if not exists ops_projects_last_touched_at_idx on ops_projects (last_touched_at desc);

drop trigger if exists ops_projects_set_updated_at on ops_projects;
create trigger ops_projects_set_updated_at
  before update on ops_projects
  for each row execute function set_updated_at();

-- ── ops_tasks ──────────────────────────────────────────────────────────────
-- project_id is nullable + ON DELETE SET NULL: deleting a project orphans
-- its tasks rather than nuking them. category stays required on every task
-- so standalone tasks (no project) remain categorizable; when a task IS in
-- a project, the app layer is expected to seed its category from the
-- project but a hard mismatch isn't enforced at the DB level.
create table if not exists ops_tasks (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  description           text,
  project_id            uuid references ops_projects(id) on delete set null,
  category              text not null
                          check (category in (
                            'fundraising', 'admin', 'board', 'recruitment',
                            'program', 'finance', 'compliance', 'other'
                          )),
  status                text not null default 'todo'
                          check (status in ('todo', 'in_progress', 'done', 'blocked')),
  assigned_to           text
                          check (assigned_to is null or assigned_to in ('remi', 'shannon')),
  created_by            text not null
                          check (created_by in ('remi', 'shannon')),
  due_date              date,
  pinned_for_today      boolean not null default false,
  pinned_for_this_week  boolean not null default false,
  -- NULL for standalone tasks. App layer manages ordering within a project.
  display_order         integer,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  completed_at          timestamptz
);

create index if not exists ops_tasks_status_idx       on ops_tasks (status);
create index if not exists ops_tasks_assigned_to_idx  on ops_tasks (assigned_to);
create index if not exists ops_tasks_category_idx     on ops_tasks (category);
create index if not exists ops_tasks_project_id_idx   on ops_tasks (project_id);
create index if not exists ops_tasks_due_date_idx     on ops_tasks (due_date);
-- Partial indexes: only the small subset of pinned rows is indexed, which
-- keeps the index tiny and makes "today" / "this week" lookups cheap.
create index if not exists ops_tasks_pinned_today_idx
  on ops_tasks (pinned_for_today) where pinned_for_today = true;
create index if not exists ops_tasks_pinned_week_idx
  on ops_tasks (pinned_for_this_week) where pinned_for_this_week = true;

drop trigger if exists ops_tasks_set_updated_at on ops_tasks;
create trigger ops_tasks_set_updated_at
  before update on ops_tasks
  for each row execute function set_updated_at();
