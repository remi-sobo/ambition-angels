-- Executive Briefing decision state (spec Phase 4).
-- One row per briefing item the operator has acted on. Decisions are
-- non-destructive to the underlying spine records and fully reversible
-- (undo = delete the row), so a "mark done"/"snooze"/"dismiss" can never eat
-- a real task or compliance deadline.
create table if not exists public.bloomos_briefing_state (
  item_id      text primary key,
  decision     text check (decision in ('snooze', 'dismiss', 'mark_done')),
  hidden_until timestamptz,
  updated_at   timestamptz not null default now()
);

-- Internal admin state — accessed only via the service role from the API
-- route. Enable RLS with no public policies so the anon/auth keys can't read
-- or write it.
alter table public.bloomos_briefing_state enable row level security;
