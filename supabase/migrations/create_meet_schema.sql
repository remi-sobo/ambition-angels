-- Custom scheduling system tables for /meet.
-- Times in meeting_types.available_start_time / available_end_time are
-- interpreted in the host timezone constant defined in lib/availability.ts
-- (America/Los_Angeles for Phase 1). Bookings always store UTC.

create table if not exists meeting_types (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  duration_minutes int not null,
  description text,
  prep_notes text,
  who_its_for text,
  color text default '#E8500A',
  icon_name text,
  buffer_minutes int default 15,
  min_notice_hours int default 24,
  max_advance_days int default 30,
  available_days int[] default '{1,2,3,4,5}',     -- 1=Mon, 7=Sun (ISO)
  available_start_time time default '09:00',
  available_end_time time default '17:00',
  daily_limit int,
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  meeting_type_id uuid references meeting_types(id) not null,

  start_time timestamptz not null,
  end_time timestamptz not null,
  attendee_timezone text not null,

  attendee_name text not null,
  attendee_email text not null,
  attendee_company text,
  attendee_role text,
  attendee_message text,

  google_event_id text,
  google_meet_url text,

  cancel_token text unique not null default gen_random_uuid()::text,
  status text default 'confirmed'
    check (status in ('confirmed','cancelled','no_show','completed')),
  cancelled_at timestamptz,
  cancellation_reason text,

  reminder_sent_24h boolean default false,
  reminder_sent_1h boolean default false,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_bookings_start_time on bookings(start_time);
create index if not exists idx_bookings_meeting_type on bookings(meeting_type_id);
create index if not exists idx_bookings_status on bookings(status);
create index if not exists idx_bookings_cancel_token on bookings(cancel_token);

-- Prevents double-booking races at the DB level. Only confirmed rows count;
-- cancelled rows can share a start_time with a future rebook.
create unique index if not exists uniq_bookings_confirmed_start
  on bookings(start_time) where status = 'confirmed';

create table if not exists blackouts (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  reason text,
  meeting_type_ids uuid[],                          -- null = blocks all types
  created_at timestamptz default now()
);

alter table meeting_types enable row level security;
alter table bookings enable row level security;
alter table blackouts enable row level security;

-- Public can read active meeting types only. Everything else goes through the
-- service-role client from server-side routes (lib/supabase/admin.ts).
drop policy if exists "public_reads_active_meeting_types" on meeting_types;
create policy "public_reads_active_meeting_types"
  on meeting_types for select
  using (is_active = true);
