-- YGB Creators Camp — registration + attendance.
--
-- Security model (matches the rest of this database): RLS is ENABLED and NO
-- policies are defined, so neither the `anon` nor the `authenticated` Postgres
-- roles can read or write these tables. ALL access goes through server-side
-- API routes that use the service-role client (lib/supabase/admin.ts), which
-- bypasses RLS:
--   - public writes  → app/api/ygb/*          (rate-limited, validated)
--   - admin reads/writes → app/api/admin/ygb/* (gated by lib/admin/auth.ts)
-- These tables hold minors' PII and medical info, so the public anon key
-- (which ships to every browser) must never be able to touch them directly.

create table if not exists ygb_registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  -- parent / guardian
  parent_first_name text not null,
  parent_last_name text not null,
  parent_email text not null,
  parent_phone text not null,
  secondary_contact_name text,
  secondary_contact_phone text,
  secondary_contact_relationship text,

  -- camper
  camper_first_name text not null,
  camper_last_name text not null,
  camper_dob date not null,
  camper_age int not null,
  camper_grade text not null,
  camper_tshirt_size text not null,
  allergies_medical text,
  special_accommodations text,

  -- emergency contact
  emergency_contact_name text not null,
  emergency_contact_phone text not null,
  emergency_contact_relationship text not null,

  -- waivers (all three required — enforced by the register API)
  liability_waiver_signed boolean default false,
  photo_video_release_signed boolean default false,
  medical_consent_signed boolean default false,

  returning_family boolean default false,
  early_access boolean default false,

  status text not null default 'confirmed'
    check (status in ('confirmed','waitlisted','cancelled')),

  -- Friday showcase RSVP
  showcase_attending boolean default false,
  showcase_guest_count int default 0 check (showcase_guest_count >= 0),
  showcase_guest_names text,

  notes text
);

create index if not exists ygb_registrations_created_at_idx on ygb_registrations (created_at desc);
create index if not exists ygb_registrations_parent_email_idx on ygb_registrations (parent_email);
create index if not exists ygb_registrations_status_idx on ygb_registrations (status);

create table if not exists ygb_attendance (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references ygb_registrations(id) on delete cascade,
  attendance_date date not null,
  checked_in boolean default false,
  check_in_time timestamptz,
  check_out_time timestamptz,
  marked_by text,
  unique (registration_id, attendance_date)
);

create index if not exists ygb_attendance_date_idx on ygb_attendance (attendance_date);

-- Service-role-only: enable RLS, define no policies.
alter table ygb_registrations enable row level security;
alter table ygb_attendance enable row level security;

-- Drop the earlier permissive policies if present. The anon INSERT path is
-- replaced by the rate-limited /api/ygb/register route; the broad
-- `authenticated` ALL policies are unused (the app never authenticates end
-- users against Supabase) and flagged by the security linter.
drop policy if exists public_can_register on ygb_registrations;
drop policy if exists admin_full_access_registrations on ygb_registrations;
drop policy if exists admin_full_access_attendance on ygb_attendance;
