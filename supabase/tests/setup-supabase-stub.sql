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

-- Supabase resolves auth.uid() from the JWT; here we read a session GUC the
-- test driver sets per simulated user (set request.jwt.claim.sub = '<uuid>').
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

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
