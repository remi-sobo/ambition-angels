-- Meetings tab — Shannon's connection backlog, Phase 5 (close the loop).
--
-- Optionally tie a connection task to the /meet booking that fulfilled it.
-- "Booked" is a status outcome (the task goes to done); this link is the light,
-- optional extra. Nullable + ON DELETE SET NULL so deleting a booking doesn't
-- delete the task. ops_tasks has RLS disabled (project convention), so no
-- policy work. Additive + idempotent.

alter table public.ops_tasks
  add column if not exists booking_id uuid references bookings(id) on delete set null;

create index if not exists ops_tasks_booking_id_idx
  on public.ops_tasks (booking_id) where booking_id is not null;
