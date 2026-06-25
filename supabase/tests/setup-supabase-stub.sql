-- Stub of the Supabase-managed environment, for running migrations against
-- a plain Postgres (CI leak tests, local checks). Mirrors what the platform
-- provides: the auth schema with auth.uid(), the anon/authenticated roles,
-- and pgcrypto. pg_cron is NOT stubbed — the audit_log retention job is
-- tolerated as a known skip by the test driver.

create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);

-- Two production users referenced by hard-coded id in data-seed migrations
-- (create_profiles backfills their display names; create_agenda_delegations
-- seeds a delegation between them). Seed just the ids so those FKs resolve
-- when the migrations apply. Emails are left null on purpose: the leak test
-- provisions its own remi@/shannon@ principals under distinct synthetic uuids,
-- and a matching email here would collide on the unique constraint and skip
-- the leak test's owner/staff insert.
insert into auth.users (id) values
  ('aa39cd02-b813-4e75-aa36-52adadf5d2fe'),
  ('7312ba86-5203-4cf6-81d8-d8fbd3e2ec89')
on conflict do nothing;

-- Supabase resolves auth.uid() from the JWT; here we read a session GUC the
-- test driver sets per simulated user (set request.jwt.claim.sub = '<uuid>').
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- pg_cron stub: the audit_log partition migrations call cron.schedule /
-- cron.unschedule. Scheduling is a Supabase platform concern, not under test
-- here, so these are inert shims that let those migrations apply fully against
-- a plain Postgres (the rotation job itself is never exercised by the tests).
create schema if not exists cron;
create table if not exists cron.job (
  jobid bigserial primary key,
  jobname text,
  schedule text,
  command text
);
create or replace function cron.schedule(job_name text, schedule text, command text)
returns bigint language sql as
$$ insert into cron.job (jobname, schedule, command) values (job_name, schedule, command) returning jobid $$;
create or replace function cron.unschedule(job_name text)
returns boolean language sql as
$$ delete from cron.job where jobname = job_name; select true; $$;

do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;

grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated, anon;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, anon;

-- Tables that exist in production but predate the migrations folder
-- (created ad hoc). Minimal shapes — enough for org_id stamping and RLS.
create table if not exists page_views (
  id bigserial primary key,
  created_at timestamptz default now(),
  page text, referrer text, device text, browser text,
  session_id text, duration_seconds int
);
create table if not exists click_events (
  id bigserial primary key,
  created_at timestamptz default now(),
  event_name text, page text, session_id text, metadata jsonb
);
create table if not exists bv_showcase_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text
);
create table if not exists bv_newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  email text
);
