-- Phase 3 (BloomOS meetings): the meeting spine, kept off the sync mirror.
-- calendar_events is a sync mirror the cron can overwrite/delete; curated human
-- state (follow-up status, summary, transcript) lives here and survives sync.
-- org_id is set from session by writers (no column default), per the house trap.

create table if not exists public.meeting_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  owner_user_id uuid not null,
  calendar_event_id uuid references public.calendar_events(id) on delete set null,
  title text,
  occurred_at timestamptz not null,
  source text not null check (source in ('calendar','upload','manual')),
  summary text,
  -- Transcript is opt-in per the privacy decision (§10.1): summary by default,
  -- full text only when the user uploads + opts in (store_transcript = true).
  transcript text,
  store_transcript boolean not null default false,
  follow_up_status text not null default 'needs_follow_up'
    check (follow_up_status in ('needs_follow_up','has_follow_up','none_needed','dismissed')),
  external_source text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotency: re-matching a calendar event or re-uploading the same transcript
-- doesn't duplicate.
create unique index if not exists meeting_records_idem_idx
  on public.meeting_records (org_id, source, external_id) where external_id is not null;
create index if not exists meeting_records_owner_idx on public.meeting_records (owner_user_id);
create index if not exists meeting_records_org_idx on public.meeting_records (org_id);
create index if not exists meeting_records_occurred_idx on public.meeting_records (occurred_at);

alter table public.meeting_records enable row level security;

-- Read predicate mirrors calendar_events exactly: ops.read AND owner-or-grantee,
-- all within org. The one RLS predicate that keeps a CEO's meetings from leaking.
drop policy if exists "members read meeting_records" on public.meeting_records;
create policy "members read meeting_records" on public.meeting_records
  for select using (
    private.has_permission(org_id, 'ops.read')
    and (
      owner_user_id = auth.uid()
      or exists (
        select 1 from public.agenda_delegations d
        where d.org_id = meeting_records.org_id
          and d.grantee_user_id = auth.uid()
          and d.grantor_user_id = meeting_records.owner_user_id
      )
    )
  );
