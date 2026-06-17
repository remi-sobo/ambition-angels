-- Let an ops task hang off a CRM record — a partner org or a constituent
-- (donor). This is what powers "Add task" on a partner / donor profile and
-- the per-entity task list. Polymorphic by (type, id) with a denormalised
-- label so the profile widgets don't need a join to show what a task is on.
-- Additive + idempotent; ops_tasks has RLS disabled (project convention),
-- so no policy work here.

alter table public.ops_tasks
  add column if not exists linked_entity_type text
    check (linked_entity_type is null or linked_entity_type in ('partner', 'constituent')),
  add column if not exists linked_entity_id uuid,
  add column if not exists linked_label text;

create index if not exists ops_tasks_linked_entity_idx
  on public.ops_tasks (linked_entity_type, linked_entity_id);
