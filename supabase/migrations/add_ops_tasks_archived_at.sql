-- Two-step archive for ops tasks.
--
-- Marking a task done no longer removes it from the active Tasks surface; a
-- separate explicit "Archive" action does. archived_at is the flag: NULL = on
-- the active surface (open OR done-but-not-yet-archived), non-NULL = in the
-- Archived view. Nullable + backward compatible (existing rows stay active).
--
-- Idempotent: safe to re-run.

alter table public.ops_tasks add column if not exists archived_at timestamptz;

-- The active surfaces filter to archived_at is null; partial index keeps that cheap.
create index if not exists ops_tasks_active_idx on public.ops_tasks (org_id) where archived_at is null;
