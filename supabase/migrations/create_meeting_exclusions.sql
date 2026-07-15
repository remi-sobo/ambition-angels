-- Meetings follow-up: exclude personal/irrelevant calendar events from the
-- follow-up loop — permanently, including all future instances of a recurring
-- event. calendar_events gains Google's recurringEventId so every instance of
-- a series shares a stable key; meeting_exclusions stores the excluded keys
-- per owner. The meetings sync skips excluded events (no meeting_record is
-- created), and the Upcoming list hides them.

alter table public.calendar_events
  add column if not exists recurring_event_id text;

create table if not exists public.meeting_exclusions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  owner_user_id uuid not null,
  -- Google recurringEventId for a series, or the google_event_id itself for a
  -- one-off event (see lib/meetings/exclusions.ts seriesKey()).
  series_key text not null,
  title text,
  created_at timestamptz not null default now()
);

create unique index if not exists meeting_exclusions_key_idx
  on public.meeting_exclusions (org_id, owner_user_id, series_key);

alter table public.meeting_exclusions enable row level security;

-- Read predicate mirrors meeting_records exactly: ops.read AND owner-or-grantee,
-- within org. Writes go through the service role only (no insert/update policy),
-- same as meeting_records.
drop policy if exists "members read meeting_exclusions" on public.meeting_exclusions;
create policy "members read meeting_exclusions" on public.meeting_exclusions
  for select using (
    private.has_permission(org_id, 'ops.read')
    and (
      owner_user_id = auth.uid()
      or exists (
        select 1 from public.agenda_delegations d
        where d.org_id = meeting_exclusions.org_id
          and d.grantee_user_id = auth.uid()
          and d.grantor_user_id = meeting_exclusions.owner_user_id
      )
    )
  );
