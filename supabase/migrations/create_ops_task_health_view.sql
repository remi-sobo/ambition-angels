-- BloomOS / Ops — Stuck Work detection (specs/ops-stuck-work.md), commit 2.
--
-- A computed health read over ops_tasks: each task carries fresh / aging /
-- stuck, derived from how old it is and how long it's sat untouched. No new
-- table, no data migration — just two security_invoker views.
--
-- WHY NO audit_log JOIN (Phase 0 recon, docs/recon/ops-stuck-work-recon.md):
--   audit_log carries ops_task rows but ONLY the ops.task.ingest action —
--   task mutations are never audited, so an audit touch-count would measure
--   "days since created," which ops_tasks already gives us. Worse, audit_log
--   is gated by 'org.manage' while ops_tasks is 'ops.read'; under
--   security_invoker, Shannon (ops.read, no org.manage) would silently get
--   zero audit rows while Remi got real ones — a per-user-inconsistent input.
--   So v1 health = age (created_at) + staleness (updated_at) + roll_count,
--   exactly the degraded path the spec anticipated. If a real
--   "reviewed-not-advanced" signal is wanted later, add audit() calls to the
--   task PATCH route (a write path scoped OUT of v1) rather than mine this log.
--
-- PUNT vs STUCK stay distinct (spec failure mode #2): roll_count is exposed as
-- its own column and is deliberately NOT folded into the health enum. A task
-- pushed every Friday reads as rolled-N; a task left to rot reads as stuck.
-- The UI shows them separately.
--
-- Thresholds live in v_ops_task_health_config (a one-row view of constants),
-- not inline in the query, so a future tenant tunes them in one place — or
-- swaps the config view for a table-backed version — without touching the
-- health logic. Defaults match the spec: aging at 7 days, stuck at 14.
--
-- security_invoker so the querying role's ops.read RLS on ops_tasks applies;
-- the role still needs SELECT on the views (granted below).
--
-- Idempotent (create or replace view). Apply via the Supabase dashboard.
-- Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

-- ── Tunable thresholds (zero new tables; edit here to retune) ───────────────
create or replace view public.v_ops_task_health_config
with (security_invoker = true) as
select
  7::int  as aging_after_days,  -- open & this old → 'aging'
  14::int as stuck_after_days,  -- open & this old AND stale → 'stuck'
  7::int  as stale_touch_days;  -- days_since_last_touch floor for 'stuck'

comment on view public.v_ops_task_health_config is
  'Stuck Work thresholds (specs/ops-stuck-work.md). One row of constants consumed by v_ops_task_health. Retune here, or replace with a table-backed config for multi-tenant tuning — the health logic does not change.';

grant select on public.v_ops_task_health_config to authenticated;

-- ── Per-task health read ───────────────────────────────────────────────────
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
  end as stuck_reason
from base b
cross join cfg c;

comment on view public.v_ops_task_health is
  'Stuck Work detection (specs/ops-stuck-work.md). Per ops_task: age_days (since created_at), days_since_last_touch (since updated_at), roll_count, and a derived health enum fresh/aging/stuck + stuck_reason. Open tasks only earn aging/stuck; done/archived read ''done''. Thresholds come from v_ops_task_health_config. No audit_log join by design (Phase 0 recon: task mutations are unaudited and audit_log is org.manage-gated). roll_count is the PUNT signal and is intentionally separate from health. security_invoker — ops.read RLS on ops_tasks applies.';

grant select on public.v_ops_task_health to authenticated;
