-- BloomOS / Operating Rhythm v2 — Phase 3: roll-count on ops_tasks.
--
-- A task that's pushed to "next week" every Friday keeps getting its
-- planned_week re-stamped to the most recent Monday, so any derived "weeks
-- slipped" measure resets to 1 each roll and the furniture goes invisible —
-- the exact failure mode the spec calls out. A persistent counter is the only
-- honest signal: it only goes up, so a task rolled six times reads as rolled
-- six times no matter how recent its planned_week.
--
-- Incremented by the task PATCH route when planned_week moves FORWARD (the
-- deliberate "push" — Monday carryover and Friday rollover both go through that
-- path). Pulling a slipped task INTO the current week is not a roll and does not
-- increment. Backfills to 0: we start counting now, which is truthful (no roll
-- history exists to reconstruct).
--
-- Idempotent. Apply via the Supabase dashboard. Project: Ambition-Angels
-- (kzzdtibbwsucloaoqpqa).

alter table public.ops_tasks
  add column if not exists roll_count integer not null default 0;

comment on column public.ops_tasks.roll_count is
  'Operating Rhythm v2: times this task has been deliberately pushed to a later week. Set by the ops task PATCH route when planned_week moves forward; surfaced in the Monday carryover to weight rollover furniture for attention.';
