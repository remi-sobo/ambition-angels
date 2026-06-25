-- BloomOS Agenda — Phase 1: delegation + calendar event cache (specs/bloomos-agenda.md §6–7).
--
-- Three changes, one migration:
--   1. connections.user_id  — per-user calendar auth (nullable; org-level rows like
--                             hubspot stay null, google_calendar rows set it).
--   2. agenda_delegations    — who may see whose calendar. Seeds Remi -> Shannon.
--   3. calendar_events       — cached Google Calendar reads, filled by the
--                             service-role sync job (Phase 2). No app behavior yet.
--
-- RLS uses the existing private.has_permission(org_id, perm) helper
-- (memberships -> role_permissions). IMPORTANT: 'ops.read' grants to
-- owner/admin/staff, so the permission gate ALONE does not protect a calendar.
-- The calendar_events read policy is has_permission('ops.read') AND
-- (you own the row OR an explicit grant exists) — the per-user predicate is the
-- real protection (spec §9, delegation leak).
--
-- org_id is set from the session by app/service paths — NO resident-tenant column
-- default on these new tables (spec §9, org_id default trap), unlike the older
-- tenant tables. Service/app inserts MUST pass org_id explicitly. The seed below
-- sets it explicitly via slug lookup.
--
-- Apply via the Supabase dashboard SQL editor. Reviewable; not auto-applied.

-- ── 1. connections.user_id ─────────────────────────────────────────────────

alter table connections
  add column if not exists user_id uuid references auth.users(id);

create index if not exists connections_user_id_idx
  on connections (user_id) where user_id is not null;

-- ── 2. agenda_delegations ──────────────────────────────────────────────────

create table if not exists agenda_delegations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  grantor_user_id uuid not null references auth.users(id),  -- whose calendar
  grantee_user_id uuid not null references auth.users(id),  -- who may see it
  created_at timestamptz not null default now(),
  unique (org_id, grantor_user_id, grantee_user_id),
  check (grantor_user_id <> grantee_user_id)
);
create index if not exists agenda_delegations_grantee_idx
  on agenda_delegations (org_id, grantee_user_id);
create index if not exists agenda_delegations_grantor_idx
  on agenda_delegations (org_id, grantor_user_id);

alter table agenda_delegations enable row level security;

-- Members (ops.read) may read grants they are party to (grantor or grantee).
drop policy if exists "members read agenda_delegations" on agenda_delegations;
create policy "members read agenda_delegations" on agenda_delegations
  for select to authenticated
  using (
    (select private.has_permission(org_id, 'ops.read'))
    and (grantor_user_id = auth.uid() or grantee_user_id = auth.uid())
  );

-- Granting/revoking a delegation is an org-management action (owner/admin).
-- (Open decision #6: revisit if a grantor should self-manage grants of their
-- own calendar.)
drop policy if exists "managers write agenda_delegations" on agenda_delegations;
create policy "managers write agenda_delegations" on agenda_delegations
  for all to authenticated
  using ( (select private.has_permission(org_id, 'org.manage')) )
  with check ( (select private.has_permission(org_id, 'org.manage')) );

-- ── 3. calendar_events ─────────────────────────────────────────────────────

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  owner_user_id uuid not null references auth.users(id),  -- whose calendar
  google_event_id text,
  calendar_id text,
  title text,
  description text,
  location text,
  start_time timestamptz,
  end_time timestamptz,
  all_day boolean not null default false,
  status text,
  attendees jsonb not null default '[]',
  is_external boolean not null default false,  -- any attendee outside org domain
  source text not null default 'google' check (source in ('google','booking')),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upsert key for the Google sync (spec §6): one row per (owner, google event).
-- Non-partial so PostgREST ON CONFLICT can target it; NULLs stay distinct, so
-- booking-sourced rows (null google_event_id) remain unconstrained.
create unique index if not exists calendar_events_owner_gevent_uniq
  on calendar_events (owner_user_id, google_event_id);

-- Agenda range scan: a viewer's owners over a time window.
create index if not exists calendar_events_owner_time_idx
  on calendar_events (org_id, owner_user_id, start_time);

alter table calendar_events enable row level security;

-- Read = ops.read AND (own calendar OR an explicit grant). The per-user predicate
-- is the protection; ops.read alone covers all staff (spec §9).
drop policy if exists "members read calendar_events" on calendar_events;
create policy "members read calendar_events" on calendar_events
  for select to authenticated
  using (
    (select private.has_permission(org_id, 'ops.read'))
    and (
      owner_user_id = auth.uid()
      or exists (
        select 1 from agenda_delegations d
        where d.org_id = calendar_events.org_id
          and d.grantee_user_id = auth.uid()
          and d.grantor_user_id = calendar_events.owner_user_id
      )
    )
  );

-- No authenticated WRITE policy on purpose: the Phase 2 sync job uses the
-- service-role client, which bypasses RLS. Authenticated/anon cannot write.

-- ── 4. Seed the AA grant: Remi (grantor) -> Shannon (grantee) ──────────────
-- Generalizes to any ED/EA. org_id resolved by slug (no hardcoded org uuid).
-- User uuids verified live 2026-06-25: remi@ (owner), shannon@ (admin).
insert into agenda_delegations (org_id, grantor_user_id, grantee_user_id)
select o.id,
       'aa39cd02-b813-4e75-aa36-52adadf5d2fe',  -- remi@ambitionangels.org
       '7312ba86-5203-4cf6-81d8-d8fbd3e2ec89'   -- shannon@ambitionangels.org
from orgs o
where o.slug = 'ambition-angels'
on conflict (org_id, grantor_user_id, grantee_user_id) do nothing;
