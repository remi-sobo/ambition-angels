-- Board portal (specs/board-portal.md §6) — the read surface at /board.
--
-- Authored in /admin (BloomOS), read at /board. One source of truth: this
-- migration EXTENDS the existing board_members / board_meetings from
-- create_board.sql rather than standing up spec-shaped twins beside them.
-- The spec's data model wins on shape; "nothing is maintained twice" wins on
-- where it lives, so every new column is additive and every column
-- /admin/board already reads (name, officer_role, meeting_date, agenda,
-- minutes, minutes_status) keeps working untouched.
--
-- Documents are deliberately NOT a new table. documents + document_links
-- already carry a board carve-out written for exactly this path: an
-- org-visible document linked to a board_meeting is readable by board.read
-- holders (documents_schema.sql). meeting_documents would have duplicated it
-- and split the file cabinet in two.
--
-- ── The one rule this file exists to enforce ──────────────────────────────
-- member_notes is readable ONLY by the director who wrote it. board_admin
-- gets no read path, in policy and in practice. A director who suspects the
-- CEO can read her notes stops writing honest ones. There is no admin policy
-- on that table below, and application code must reach it only through the
-- user-scoped client (lib/supabase/server.ts) so RLS actually applies — the
-- service-role client bypasses RLS and would silently defeat this.
-- tests/board-notes-isolation.test.ts guards the application half.

-- ── Who is the signed-in director? ────────────────────────────────────────
-- Directors are identified by email against the roster, not by a user_id
-- column on board_members: a director has a roster row long before she first
-- signs in, and the roster is what gates the magic link.
--
-- The email comes from auth.users via auth.uid(), NOT from the JWT's own email
-- claim. A JWT is minted at sign-in and lives 30 days here, so a claim can be
-- stale after an address change, and this function decides who can read a
-- director's private notes — it should read the current record, not a month-old
-- copy of it. security definer so the lookup is not subject to the policies it
-- feeds; search_path pinned so nothing can be shadowed.
create or replace function private.board_member_id(p_org uuid)
returns uuid
language sql security definer stable
set search_path = ''
as $$
  select bm.id
  from public.board_members bm
  join auth.users u on lower(u.email) = lower(bm.email)
  where bm.org_id = p_org
    and bm.status = 'active'
    and bm.email is not null
    and u.id = (select auth.uid())
  limit 1
$$;
grant execute on function private.board_member_id(uuid) to authenticated;

-- ── board_members: additive columns for the portal ────────────────────────
alter table public.board_members add column if not exists is_staff    boolean not null default false;
alter table public.board_members add column if not exists is_voting   boolean not null default true;
alter table public.board_members add column if not exists title       text;
alter table public.board_members add column if not exists photo_url   text;
alter table public.board_members add column if not exists bio         text;
create unique index if not exists board_members_org_email_idx
  on public.board_members (org_id, lower(email)) where email is not null;

-- ── board_meetings: additive columns for the portal ───────────────────────
-- meeting_date stays authoritative for /admin/board; starts_at carries the
-- time-of-day and zone the portal needs. Backfilled at the foot of this file.
alter table public.board_meetings add column if not exists fiscal_label     text;
alter table public.board_meetings add column if not exists meeting_type     text not null default 'regular';
alter table public.board_meetings add column if not exists starts_at        timestamptz;
alter table public.board_meetings add column if not exists ends_at          timestamptz;
alter table public.board_meetings add column if not exists location         text;
alter table public.board_meetings add column if not exists zoom_url         text;
alter table public.board_meetings add column if not exists zoom_room        text;
alter table public.board_meetings add column if not exists status           text not null default 'upcoming';
alter table public.board_meetings add column if not exists quorum_required  int not null default 3;
alter table public.board_meetings add column if not exists published_at     timestamptz;
-- The three numbers on the home screen (spec §5.2). Data, not markup, so
-- Shannon can restate them for the next meeting without a deploy:
-- [{ value, label, note }, …].
alter table public.board_meetings add column if not exists headline_stats   jsonb not null default '[]';

do $$ begin
  alter table public.board_meetings add constraint board_meetings_type_chk
    check (meeting_type in ('regular','special','annual','budget','consent'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.board_meetings add constraint board_meetings_status_chk
    check (status in ('upcoming','live','closed'));
exception when duplicate_object then null; end $$;

create index if not exists board_meetings_status_idx
  on public.board_meetings (org_id, status, starts_at desc);

-- ── agenda_items ──────────────────────────────────────────────────────────
create table if not exists public.agenda_items (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id) on delete cascade,
  meeting_id       uuid not null references public.board_meetings(id) on delete cascade,
  position         int  not null,
  starts_at_label  text,                       -- "4:00" as printed on the agenda
  title            text not null,
  description      text,
  owner            text,
  duration_minutes int,
  item_type        text not null default 'information'
    check (item_type in ('information','discussion','decision','demonstration')),
  status           text not null default 'upcoming'
    check (status in ('upcoming','current','done')),
  -- The decision brief (spec 5.3): decision / recommends / why / tradeoff /
  -- motion. jsonb because it is prose the Chair edits, not queried fields.
  brief            jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (meeting_id, position)
);
create index if not exists agenda_items_meeting_idx on public.agenda_items (meeting_id, position);

-- ── meeting_attendance ────────────────────────────────────────────────────
create table if not exists public.meeting_attendance (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  meeting_id      uuid not null references public.board_meetings(id) on delete cascade,
  board_member_id uuid not null references public.board_members(id) on delete cascade,
  rsvp            text check (rsvp in ('yes','no','unsure')),
  attended        boolean,
  is_staff        boolean not null default false,
  updated_at      timestamptz not null default now(),
  unique (meeting_id, board_member_id)
);
create index if not exists meeting_attendance_meeting_idx on public.meeting_attendance (meeting_id);

-- ── minutes ───────────────────────────────────────────────────────────────
-- Stored as structured JSON so one record renders three ways: HTML in the
-- portal, print-to-PDF for the minute book, and a section inside a packet.
-- Immutable once approved_at is set (enforced by trigger below).
create table if not exists public.minutes (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs(id) on delete cascade,
  meeting_id            uuid not null references public.board_meetings(id) on delete cascade,
  body                  jsonb not null default '{"sections":[]}',
  called_to_order_at    text,
  adjourned_at          text,
  quorum_met            boolean,
  approved_at           timestamptz,
  approved_by_meeting_id uuid references public.board_meetings(id),
  -- The signed record: an auditor wants this one, a director reads the HTML.
  signed_pdf_path       text,
  signed_by             text,
  signed_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (meeting_id)
);

-- Approved minutes are the corporate record. Freeze the body once approved.
create or replace function public.minutes_freeze_when_approved()
returns trigger language plpgsql as $$
begin
  if old.approved_at is not null and new.body is distinct from old.body then
    raise exception 'minutes % are approved and immutable', old.id;
  end if;
  return new;
end;
$$;
drop trigger if exists minutes_freeze on public.minutes;
create trigger minutes_freeze before update on public.minutes
  for each row execute function public.minutes_freeze_when_approved();

-- ── resolutions ───────────────────────────────────────────────────────────
create table if not exists public.resolutions (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  meeting_id     uuid not null references public.board_meetings(id) on delete cascade,
  agenda_item_id uuid references public.agenda_items(id) on delete set null,
  motion_text    text not null,
  moved_by       text,
  seconded_by    text,
  votes_for      int,
  votes_against  int,
  abstentions    text[] not null default '{}',
  passed         boolean,
  notes          text,
  created_at     timestamptz not null default now()
);
create index if not exists resolutions_meeting_idx on public.resolutions (org_id, meeting_id);

-- ── follow_ups ────────────────────────────────────────────────────────────
-- status carries state, not just a completion timestamp, so the continuity
-- block can render OVERDUE across two meetings — that is the feature working.
create table if not exists public.follow_ups (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete cascade,
  meeting_id        uuid not null references public.board_meetings(id) on delete cascade,
  source_meeting_id uuid references public.board_meetings(id) on delete set null,
  description       text not null,
  owner             text,
  due_date          date,
  status            text not null default 'in_progress'
    check (status in ('done','in_progress','not_pursued','overdue')),
  completed_at      timestamptz,
  note              text,
  created_at        timestamptz not null default now()
);
create index if not exists follow_ups_meeting_idx on public.follow_ups (org_id, meeting_id);

-- ── prep_items ────────────────────────────────────────────────────────────
-- One row per director per item: completion is per-director and is NEVER
-- shown to another director (spec 5.2). The roll-up lives in /admin.
create table if not exists public.prep_items (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  meeting_id      uuid not null references public.board_meetings(id) on delete cascade,
  board_member_id uuid not null references public.board_members(id) on delete cascade,
  position        int not null default 0,
  label           text not null,
  sub_label       text,
  href            text,
  minutes_est     int,
  completed_at    timestamptz,
  unique (meeting_id, board_member_id, label)
);
create index if not exists prep_items_member_idx on public.prep_items (meeting_id, board_member_id, position);

-- ── coi_disclosures ───────────────────────────────────────────────────────
create table if not exists public.coi_disclosures (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  board_member_id uuid not null references public.board_members(id) on delete cascade,
  year            int not null,
  -- status is authoritative; signed_at is the date WHEN IT IS KNOWN. The 2026
  -- cycle is recorded in the pre-read as signed by four directors and
  -- outstanding from one, without dates. Inventing a date to make the column
  -- non-null would put a fabricated fact in a governance record, so a
  -- disclosure can be 'signed' with a null date and the portal says so.
  status          text not null default 'outstanding'
    check (status in ('signed','outstanding','not_required')),
  signed_at       date,
  file_path       text,
  unique (board_member_id, year)
);

-- ── member_notes — private to the author, full stop ───────────────────────
create table if not exists public.member_notes (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  meeting_id      uuid not null references public.board_meetings(id) on delete cascade,
  agenda_item_id  uuid references public.agenda_items(id) on delete cascade,
  board_member_id uuid not null references public.board_members(id) on delete cascade,
  body            text not null default '',
  updated_at      timestamptz not null default now(),
  unique (meeting_id, agenda_item_id, board_member_id)
);
create index if not exists member_notes_owner_idx on public.member_notes (board_member_id, meeting_id);

-- ── member_questions — asymmetric on purpose ──────────────────────────────
-- The asker sees her own and their answers. board_admin sees all, with the
-- asker named. Nothing is board-wide: a visible thread would be discussion
-- outside a noticed meeting.
create table if not exists public.member_questions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  meeting_id      uuid not null references public.board_meetings(id) on delete cascade,
  board_member_id uuid not null references public.board_members(id) on delete cascade,
  body            text not null,
  answered_at     timestamptz,
  answer_body     text,
  created_at      timestamptz not null default now()
);
create index if not exists member_questions_meeting_idx on public.member_questions (org_id, meeting_id, created_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Board-wide tables: read with board.read (every director), write with
-- board.write (Remi, Shannon — authored in /admin).
do $$
declare t text;
begin
  foreach t in array array[
    'agenda_items','meeting_attendance','minutes','resolutions',
    'follow_ups','coi_disclosures'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'board read ' || t, t);
    execute format($p$
      create policy %I on public.%I
        for select to authenticated
        using ( (select private.has_permission(org_id, 'board.read')) )
      $p$, 'board read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'board write ' || t, t);
    execute format($p$
      create policy %I on public.%I
        for all to authenticated
        using ( (select private.has_permission(org_id, 'board.write')) )
        with check ( (select private.has_permission(org_id, 'board.write')) )
      $p$, 'board write ' || t, t);
  end loop;
end $$;

-- updated_at, only on the tables that carry the column.
do $$
declare t text;
begin
  foreach t in array array['agenda_items','minutes','meeting_attendance','member_notes'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;

-- RSVP: a director sets her OWN attendance row; the tally is board-wide
-- (quorum matters, so attendance is deliberately not private).
drop policy if exists "director sets own rsvp" on public.meeting_attendance;
create policy "director sets own rsvp" on public.meeting_attendance
  for update to authenticated
  using ( board_member_id = (select private.board_member_id(org_id)) )
  with check ( board_member_id = (select private.board_member_id(org_id)) );

-- prep_items: a director reads and completes ONLY her own rows. Another
-- director's completion state is never visible to her (spec 5.2).
alter table public.prep_items enable row level security;
drop policy if exists "own prep read" on public.prep_items;
create policy "own prep read" on public.prep_items
  for select to authenticated
  using ( board_member_id = (select private.board_member_id(org_id)) );
drop policy if exists "own prep write" on public.prep_items;
create policy "own prep write" on public.prep_items
  for update to authenticated
  using ( board_member_id = (select private.board_member_id(org_id)) )
  with check ( board_member_id = (select private.board_member_id(org_id)) );
-- Authors in /admin see the roll-up.
drop policy if exists "board write prep_items" on public.prep_items;
create policy "board write prep_items" on public.prep_items
  for all to authenticated
  using ( (select private.has_permission(org_id, 'board.write')) )
  with check ( (select private.has_permission(org_id, 'board.write')) );

-- member_notes: the owning director, and NOBODY else. There is deliberately
-- no board.write policy on this table. Do not add one.
alter table public.member_notes enable row level security;
drop policy if exists "own notes" on public.member_notes;
create policy "own notes" on public.member_notes
  for all to authenticated
  using ( board_member_id = (select private.board_member_id(org_id)) )
  with check ( board_member_id = (select private.board_member_id(org_id)) );

-- member_questions: the asker, plus board.write holders (who answer them).
alter table public.member_questions enable row level security;
drop policy if exists "asker or admin reads questions" on public.member_questions;
create policy "asker or admin reads questions" on public.member_questions
  for select to authenticated
  using (
    board_member_id = (select private.board_member_id(org_id))
    or (select private.has_permission(org_id, 'board.write'))
  );
drop policy if exists "asker writes questions" on public.member_questions;
create policy "asker writes questions" on public.member_questions
  for insert to authenticated
  with check ( board_member_id = (select private.board_member_id(org_id)) );
drop policy if exists "admin answers questions" on public.member_questions;
create policy "admin answers questions" on public.member_questions
  for update to authenticated
  using ( (select private.has_permission(org_id, 'board.write')) )
  with check ( (select private.has_permission(org_id, 'board.write')) );

-- ── Realtime ──────────────────────────────────────────────────────────────
-- The live agenda subscribes to agenda_items.status. Guarded: the publication
-- does not exist on the scratch Postgres the RLS harness runs against.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agenda_items'
    ) then
      alter publication supabase_realtime add table public.agenda_items;
    end if;
  end if;
end $$;

-- ── Backfill ──────────────────────────────────────────────────────────────
-- Existing meetings predate starts_at. Give them one so the portal can order
-- and label them; 4pm Pacific is the standing board hour.
update public.board_meetings
   set starts_at = (meeting_date::timestamp + time '16:00') at time zone 'America/Los_Angeles'
 where starts_at is null;
update public.board_meetings
   set status = case when minutes_status = 'approved' then 'closed' else status end
 where status = 'upcoming' and meeting_date < current_date;

-- Register board_meeting in the spine registry so documents can link to one
-- (documents_schema.sql's carve-out reads entity_type = 'board_meeting').
insert into public.entity_types (entity_type, display_name, module, route_pattern, icon)
values ('board_meeting', 'Board meeting', 'board', '/admin/board', 'users')
on conflict (entity_type) do nothing;
