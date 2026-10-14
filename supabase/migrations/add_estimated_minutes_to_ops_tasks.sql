-- Weekly Plan v2, PR 2: task estimates (specs: Weekly Plan v2 Spec).
--
-- ops_tasks.estimated_minutes: how long a task is expected to take, in
-- minutes. Nullable on purpose: the RLS leak test, MCP create_task and the
-- ingest path all insert without it, and "no estimate" is a real state the
-- Plan capacity meter counts at the user's default block length and flags.
-- Bounded 1 to 960 (16 hours, two long working days).
--
-- v_ops_task_health exposes it as its LAST column. The view's final select is
-- an explicit column list (t.* only appears inside the base CTE), so
-- CREATE OR REPLACE can append a column; no drop needed, and the existing
-- grants survive the replace. security_invoker is restated so the replace
-- can't drop it. The body is otherwise unchanged from
-- create_ops_task_health_view.sql.
--
-- Additive and idempotent: re-running is a no-op. Applied by hand under the
-- ledger name add_estimated_minutes_to_ops_tasks.
-- Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

alter table public.ops_tasks
  add column if not exists estimated_minutes integer
  check (estimated_minutes between 1 and 960);

comment on column public.ops_tasks.estimated_minutes is
  'Weekly Plan v2: expected effort in minutes (1 to 960). Null = not estimated; the Plan capacity meter then counts calendar_prefs.default_block_minute and flags it.';

create or replace view public.v_ops_task_health
with (security_invoker = true) as
with cfg as (
  select * from public.v_ops_task_health_config
),
base as (
  select
    t.*,
    -- Day-granularity ages off UTC now(); the week machinery uses LA time but
    -- "how many days old" doesn't need the tz nuance and reads simpler this way.
    floor(extract(epoch from (now() - t.created_at)) / 86400)::int as age_days,
    floor(extract(epoch from (now() - t.updated_at)) / 86400)::int as days_since_last_touch,
    (t.status <> 'done' and t.archived_at is null)                 as is_open
  from public.ops_tasks t
)
select
  b.id,
  b.org_id,
  b.title,
  b.status,
  b.category,
  b.assigned_to,
  b.priority,
  b.project_id,
  b.planned_week,
  b.due_date,
  b.created_at,
  b.updated_at,
  b.is_open,
  b.age_days,
  b.days_since_last_touch,
  -- Punt signal — kept distinct from health on purpose (spec failure mode #2).
  b.roll_count,
  case
    when not b.is_open then 'done'
    when b.age_days >= c.stuck_after_days
         and b.days_since_last_touch >= c.stale_touch_days then 'stuck'
    when b.age_days >= c.aging_after_days then 'aging'
    else 'fresh'
  end as health,
  case
    when b.is_open
         and b.age_days >= c.stuck_after_days
         and b.days_since_last_touch >= c.stale_touch_days
    then b.age_days || ' days old, no movement in ' || b.days_since_last_touch || ' days'
    else null
  end as stuck_reason,
  -- Weekly Plan v2 (PR 2): appended LAST so create-or-replace can add it.
  b.estimated_minutes
from base b
cross join cfg c;

grant select on public.v_ops_task_health to authenticated;

-- After apply, verify security_invoker survived:
--   select reloptions from pg_class where relname = 'v_ops_task_health';
--   -- expect {security_invoker=true}

-- ── rollback ──────────────────────────────────────────────
-- Re-run create_ops_task_health_view.sql would FAIL (it drops a column);
-- instead: drop view public.v_ops_task_health; then re-run that file, then
-- alter table public.ops_tasks drop column if exists estimated_minutes;
