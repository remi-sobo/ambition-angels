-- Phase 4 (BloomOS agenda): the drag-into-block link. A task scheduled into a
-- calendar block points at the calendar_events row BloomOS wrote for it.
-- on delete set null: deleting the block unschedules the task, never deletes it.
-- Additive, nullable, dormant until the write engine sets it.

alter table public.ops_tasks
  add column if not exists calendar_event_id uuid references public.calendar_events(id) on delete set null;

create index if not exists ops_tasks_calendar_event_idx
  on public.ops_tasks (calendar_event_id) where calendar_event_id is not null;
