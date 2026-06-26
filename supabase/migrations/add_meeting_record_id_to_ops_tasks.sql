-- Phase 3: the coverage join. A follow-up task links to its donor/partner via
-- linked_entity_* (so it shows on their timeline) AND carries meeting_record_id
-- so the deterministic coverage check can tell which meetings have a follow-up.
-- Additive, nullable, dormant until the coverage code reads it.

alter table public.ops_tasks
  add column if not exists meeting_record_id uuid references public.meeting_records(id) on delete set null;

create index if not exists ops_tasks_meeting_record_idx
  on public.ops_tasks (meeting_record_id) where meeting_record_id is not null;
