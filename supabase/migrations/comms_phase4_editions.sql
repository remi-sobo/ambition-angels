-- Comms Phase 4 — formats and editions (specs/comms-module.md §6.1, §12 migration 4).
--
-- A FORMAT is the reusable structure of a publication: a named, ordered set of
-- slots. An EDITION is one instance of it — the Fall 2026 newsletter.
--
-- Formats are data rows, never code branches. That is the whole tenant-
-- genericity claim for this module: Young Life EPA runs a monthly leader
-- letter with different slots than AA's quarterly, and nobody writes a line of
-- code. The Flourish coach tailors a format through the same editor every org
-- has.
--
-- ── Why slot_def is copied onto the edition ─────────────────────────────────
-- comms_edition_slots stores its own snapshot of the slot definition (label,
-- kind, required, hint) rather than pointing at the format's current jsonb.
-- Without that, renaming a slot or changing a kind would silently rewrite
-- every edition ever published under that format, including ones already sent.
-- An in-flight edition keeps the structure it was started with; the next one
-- picks up the edit.
--
-- APPLIED 2026-08-19 to Ambition-Angels (kzzdtibbwsucloaoqpqa).

create table if not exists public.comms_formats (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  name        text not null,
  cadence     text not null default 'quarterly'
    check (cadence in ('monthly', 'quarterly', 'annual', 'adhoc')),
  -- Ordered array of { key, label, kind, required, hint }.
  -- kind in (letter, story, metrics, ask, freeform) — validated in lib/comms/
  -- formats.ts, not here, because the vocabulary should extend without a
  -- migration and a malformed slot is a 400, not a constraint violation.
  slots       jsonb not null default '[]'::jsonb,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists comms_formats_org_idx
  on public.comms_formats (org_id) where is_archived = false;

create table if not exists public.comms_editions (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete cascade,
  -- restrict, not cascade: deleting a format must not silently delete the
  -- editions published under it. The UI archives formats instead.
  format_id         uuid not null references public.comms_formats(id) on delete restrict,
  title             text not null,
  -- The email subject line. Not in the spec's draft, which mapped only the
  -- title to email_campaigns.name — but `subject` is also NOT NULL there and
  -- is the line recipients actually see, so it needs somewhere to live before
  -- Phase 5 compiles.
  subject           text,
  status            text not null default 'planning'
    check (status in ('planning', 'drafting', 'review', 'compiled', 'sent', 'archived')),
  target_date       date,
  email_campaign_id uuid references public.email_campaigns(id) on delete set null,
  sent_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists comms_editions_org_target_idx
  on public.comms_editions (org_id, target_date desc nulls last);
create index if not exists comms_editions_org_status_idx
  on public.comms_editions (org_id, status);

create table if not exists public.comms_edition_slots (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  edition_id  uuid not null references public.comms_editions(id) on delete cascade,
  slot_key    text not null,
  -- The snapshot. See the header note.
  slot_def    jsonb not null,
  story_id    uuid references public.stories(id) on delete set null,
  metric_ids  uuid[],
  content     text,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (edition_id, slot_key)
);
create index if not exists comms_edition_slots_edition_idx
  on public.comms_edition_slots (edition_id, position);
create index if not exists comms_edition_slots_story_idx
  on public.comms_edition_slots (story_id) where story_id is not null;

-- The FK Phase 3 deliberately left off, now that the target exists.
do $$ begin
  alter table public.comms_outputs
    add constraint comms_outputs_edition_fk
    foreign key (edition_id) references public.comms_editions(id) on delete set null;
exception when duplicate_object then null; end $$;

drop trigger if exists comms_formats_set_updated_at on public.comms_formats;
create trigger comms_formats_set_updated_at
  before update on public.comms_formats
  for each row execute function public.set_updated_at();

drop trigger if exists comms_editions_set_updated_at on public.comms_editions;
create trigger comms_editions_set_updated_at
  before update on public.comms_editions
  for each row execute function public.set_updated_at();

drop trigger if exists comms_edition_slots_set_updated_at on public.comms_edition_slots;
create trigger comms_edition_slots_set_updated_at
  before update on public.comms_edition_slots
  for each row execute function public.set_updated_at();

-- RLS: the stories pattern on all three. comms.manage is the whole gate — a
-- format is org structure, and an edition's slots hold copy that has already
-- been through the consent boundary.
alter table public.comms_formats       enable row level security;
alter table public.comms_editions      enable row level security;
alter table public.comms_edition_slots enable row level security;

drop policy if exists "read comms_formats" on public.comms_formats;
create policy "read comms_formats" on public.comms_formats
  for select to authenticated
  using ( (select private.has_permission(org_id, 'comms.manage')) );
drop policy if exists "write comms_formats" on public.comms_formats;
create policy "write comms_formats" on public.comms_formats
  for all to authenticated
  using ( (select private.has_permission(org_id, 'comms.manage')) )
  with check ( (select private.has_permission(org_id, 'comms.manage')) );

drop policy if exists "read comms_editions" on public.comms_editions;
create policy "read comms_editions" on public.comms_editions
  for select to authenticated
  using ( (select private.has_permission(org_id, 'comms.manage')) );
drop policy if exists "write comms_editions" on public.comms_editions;
create policy "write comms_editions" on public.comms_editions
  for all to authenticated
  using ( (select private.has_permission(org_id, 'comms.manage')) )
  with check ( (select private.has_permission(org_id, 'comms.manage')) );

drop policy if exists "read comms_edition_slots" on public.comms_edition_slots;
create policy "read comms_edition_slots" on public.comms_edition_slots
  for select to authenticated
  using ( (select private.has_permission(org_id, 'comms.manage')) );
drop policy if exists "write comms_edition_slots" on public.comms_edition_slots;
create policy "write comms_edition_slots" on public.comms_edition_slots
  for all to authenticated
  using ( (select private.has_permission(org_id, 'comms.manage')) )
  with check ( (select private.has_permission(org_id, 'comms.manage')) );
