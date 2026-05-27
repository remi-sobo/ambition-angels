-- Per-attendee notes for the Fast Forward demo-day lookbook tracker
-- (/admin/demoday). One row per attendee, keyed by the stable attendee_key
-- (the lookbook export's originalRowIndex). Upserted on attendee_key so the
-- tracker can blind-write a note/star/status without first checking for an
-- existing row.

create table if not exists demoday_notes (
  id uuid default gen_random_uuid() primary key,
  attendee_key text not null unique,
  note text,
  starred boolean not null default false,
  -- null = untracked; otherwise one of the pipeline stages below.
  status text check (status in ('want_to_connect', 'contacted', 'following_up')),
  updated_by text check (updated_by in ('remi', 'shannon')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists demoday_notes_starred_idx on demoday_notes (starred);
create index if not exists demoday_notes_status_idx on demoday_notes (status);

-- Lock the table down. All reads/writes go through the service-role key
-- (lib/supabase/admin.ts), which bypasses RLS. Enabling RLS with no policies
-- means the anon/authenticated keys can't touch these notes, which may hold
-- sensitive relationship intel.
alter table demoday_notes enable row level security;

-- Keep updated_at fresh on every write.
create or replace function demoday_notes_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists demoday_notes_set_updated_at on demoday_notes;
create trigger demoday_notes_set_updated_at
  before update on demoday_notes
  for each row execute function demoday_notes_touch_updated_at();
