-- Comms module Phase 1 — the story bank's core schema (specs/comms-module.md §12,
-- corrected by specs/comms-module-phase0-findings.md §11).
--
-- Four tables: stories, story_subjects, story_consents, story_media. Plus the
-- module's two permission keys and one trap fix.
--
-- Deviations from the spec's draft appendix, all recorded in the Phase 0
-- findings and applied here deliberately:
--
--   §11-B  Every create is `if not exists` (tests/migrations.test.ts enforces
--          it), every policy is drop-then-create, and RLS calls
--          `(select private.has_permission(...))` — the schema every other
--          policy in this database uses, wrapped in a SELECT so Postgres
--          caches it as an InitPlan instead of re-evaluating per row.
--          `public.has_permission` (the Reed RPC shim) is for the APP layer;
--          it is not used in policies.
--   §11-D  The subject-gating key is `comms.subjects.read`, not `.view` —
--          read/write/manage/admin/delete is the verb set every other domain
--          uses, and a permission string baked into policy bodies is
--          expensive to rename later.
--   §11-E  stories.strategic_goal_id is `on delete set null`. The annual OGSM
--          reseed deletes every plan_goals row for an org; a restricting FK
--          would block it. The link is decorative (a suggestion-score bonus),
--          so losing it on a reseed is correct.
--
-- org_id carries NO default on any table here (the '17c75da8-…' trap). Session
-- context supplies it; a row inserted without it fails RLS instead of silently
-- landing in Ambition Angels. supabase/tests/tenant-default-ratchet.sql fails
-- the build if that ever regresses.
--
-- APPLIED 2026-08-19 to Ambition-Angels (kzzdtibbwsucloaoqpqa), migration
-- version 20260819163509. Verified live: four tables with RLS on, eight
-- policies stored as written, both permission keys seeded, no org_id default
-- anywhere (bv_newsletter_subscribers included), and a real-session probe —
-- seeded and rolled back in one transaction — confirming a staff member at
-- SafeSpace reads the story and the partner subject but zero participant
-- subjects and zero of that participant's consent rows, while an admin reads
-- both. No new Supabase security advisories.
--
-- STILL NEEDED BEFORE PHASE 2: the `comms-media` storage bucket (private) plus
-- its storage RLS, created in the dashboard. Nothing writes story_media yet,
-- so Phase 1 does not depend on it.

-- ── 1. Trap fix: the one comms-adjacent org_id default ───────────────────────
-- 13 public tables still default org_id to AA's uuid. This is the one that
-- belongs to comms. Dropping it keeps the live set a subset of the ratchet's
-- frozen baseline, so tenant-default-ratchet.sql still passes untouched.
alter table public.bv_newsletter_subscribers alter column org_id drop default;

-- ── 2. Permission keys ───────────────────────────────────────────────────────
-- comms.manage        — the module gate: read and write across all four tables.
-- comms.subjects.read — the tighter key: see the identifiable participant
--                       behind a story, and the consent rows recorded for one.
--
-- This is the first deliberate split off the staff bundle: staff capture and
-- edit stories, but only owner/admin can see WHICH participant a story is
-- about. board_viewer and finance get neither key — no comms access in v1.
insert into public.role_permissions (role, permission) values
  ('owner', 'comms.manage'),
  ('admin', 'comms.manage'),
  ('staff', 'comms.manage'),
  ('owner', 'comms.subjects.read'),
  ('admin', 'comms.subjects.read')
on conflict do nothing;

-- ── 3. stories ───────────────────────────────────────────────────────────────
-- The core object. `body` is the raw paragraph (imperfect is fine — a captured
-- rough story beats a polished one that never got written down). `outcome` is
-- the teaching field: what CHANGED because of this, not what happened. The
-- composer weights it heavily when present.
create table if not exists public.stories (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete cascade,
  title             text not null,
  body              text,
  outcome           text,
  status            text not null default 'raw'
    check (status in ('raw', 'drafted', 'approved', 'used', 'retired')),
  tags              text[] not null default '{}',
  happened_on       date,
  captured_by       text,
  -- Manual drag rank. NULL = unranked; the bank sorts ranked rows first and
  -- falls back to the computed suggestion score (Phase 2) below a hairline.
  rank_order        integer,
  strategic_goal_id uuid references public.plan_goals(id) on delete set null,
  source            text not null default 'manual'
    check (source in ('manual', 'reed', 'import')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists stories_org_rank_idx
  on public.stories (org_id, rank_order nulls last);
create index if not exists stories_org_status_idx
  on public.stories (org_id, status);
create index if not exists stories_org_happened_idx
  on public.stories (org_id, happened_on desc nulls last);

drop trigger if exists stories_set_updated_at on public.stories;
create trigger stories_set_updated_at
  before update on public.stories
  for each row execute function public.set_updated_at();

-- ── 4. story_subjects ────────────────────────────────────────────────────────
-- Who the story is about; zero or more per story. `subject_id` is polymorphic
-- (students / constituents / partners / staff by subject_type) and validated in
-- the API layer, not by a hard FK — the same pattern acknowledgments v2 uses,
-- and the reason a future participant-spine rename costs no migration here.
--
-- `display_label` is what the story may CALL this person under current consent:
-- "Marcus" when a first-name scope is granted, "a 16-year-old participant" when
-- it isn't. It is the value the redaction boundary reads.
create table if not exists public.story_subjects (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  story_id      uuid not null references public.stories(id) on delete cascade,
  subject_type  text not null
    check (subject_type in ('participant', 'constituent', 'partner', 'staff', 'none')),
  subject_id    uuid,
  display_label text not null,
  -- When true the redaction boundary is unconditional, regardless of consent.
  is_minor      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists story_subjects_story_idx
  on public.story_subjects (story_id);
create index if not exists story_subjects_org_type_idx
  on public.story_subjects (org_id, subject_type);

-- ── 5. story_consents ────────────────────────────────────────────────────────
-- One or more per subject. Consent STATE is computed, never stored (a stored
-- flag drifts the moment a date passes): pending / current / expiring /
-- expired / revoked, derived in lib/comms/consent.ts and mirrored by
-- v_publishable_stories in Phase 2.
--
-- `requested_at` without `granted_at` is the real workflow: the org emailed the
-- guardian the actual draft and photo and is waiting to hear back. That is
-- PENDING, and pending does not publish.
create table if not exists public.story_consents (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.orgs(id) on delete cascade,
  story_subject_id     uuid not null references public.story_subjects(id) on delete cascade,
  scope                text[] not null,
  requested_at         date,
  granted_by           text,
  granted_at           date,
  expires_at           date,
  revoked_at           timestamptz,
  evidence_document_id uuid references public.documents(id) on delete set null,
  notes                text,
  created_at           timestamptz not null default now(),
  -- A consent row records either an ask or a grant. Neither means it is noise.
  constraint story_consents_requested_or_granted
    check (requested_at is not null or granted_at is not null),
  -- Vocabulary as a constraint, extendable by migration, never per-tenant.
  constraint story_consents_scope_vocab
    check (
      coalesce(array_length(scope, 1), 0) > 0
      and scope <@ array['first_name', 'full_name', 'photo', 'video', 'quote', 'outcome_details']::text[]
    )
);
create index if not exists story_consents_subject_idx
  on public.story_consents (story_subject_id);
create index if not exists story_consents_org_idx
  on public.story_consents (org_id);

-- ── 6. story_media ───────────────────────────────────────────────────────────
-- Photos in v1; `kind` accepts video so the later spec needs no migration.
-- storage_path is {org_id}/{story_id}/{filename} in the comms-media bucket —
-- org id FIRST, matching every other bucket, so storage RLS can key off
-- (storage.foldername(name))[1]::uuid the way staff-photos does. (Phase 0
-- findings §11-C: the spec's `comms/{org_id}/` shape would have made that
-- policy form impossible.)
--
-- The bucket itself is created in the Supabase dashboard, NOT here —
-- storage.buckets does not exist on the scratch Postgres the RLS harness runs
-- against. Same reason documents_schema.sql leaves its insert commented:
--   insert into storage.buckets (id, name, public)
--   values ('comms-media', 'comms-media', false)
--   on conflict (id) do nothing;
--
-- The upload route (Phase 2) strips EXIF before the bytes land. Nothing in this
-- repo does that today — GPS coordinates on a photo of a minor are a real leak
-- vector, and it is new work, not a reused helper.
create table if not exists public.story_media (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  story_id     uuid not null references public.stories(id) on delete cascade,
  storage_path text not null,
  mime         text,
  size_bytes   bigint,
  caption      text,
  kind         text not null default 'photo' check (kind in ('photo', 'video')),
  created_at   timestamptz not null default now()
);
create index if not exists story_media_story_idx
  on public.story_media (story_id);
create index if not exists story_media_org_idx
  on public.story_media (org_id);

-- ── 7. Participant test helper (SECURITY DEFINER, and it must be) ────────────
-- story_consents gates on whether its PARENT subject is a participant. Asking
-- that with a plain `exists (select 1 from public.story_subjects …)` inside a
-- policy would be a leak, not a gate: story_subjects has its own RLS, so for a
-- caller without comms.subjects.read the participant row is invisible, the
-- exists() returns false, and the policy concludes "not a participant" —
-- granting exactly the access it was meant to deny.
--
-- So the test runs SECURITY DEFINER with an empty search_path, like every other
-- private helper. It answers one boolean about one row and leaks nothing else.
create or replace function private.story_subject_is_participant(p_subject_id uuid)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1 from public.story_subjects s
    where s.id = p_subject_id and s.subject_type = 'participant'
  );
$$;

grant execute on function private.story_subject_is_participant(uuid) to authenticated;

-- ── 8. RLS ───────────────────────────────────────────────────────────────────
alter table public.stories        enable row level security;
alter table public.story_subjects enable row level security;
alter table public.story_consents enable row level security;
alter table public.story_media    enable row level security;

-- stories: comms.manage is the whole gate. Read and write are one key in v1
-- (Phase 0 findings §1 flags the asymmetry against every other domain, which
-- splits .read from .write — revisiting that means revisiting these policies).
drop policy if exists "read stories" on public.stories;
create policy "read stories" on public.stories
  for select to authenticated
  using ( (select private.has_permission(org_id, 'comms.manage')) );

drop policy if exists "write stories" on public.stories;
create policy "write stories" on public.stories
  for all to authenticated
  using ( (select private.has_permission(org_id, 'comms.manage')) )
  with check ( (select private.has_permission(org_id, 'comms.manage')) );

-- story_subjects: the split. Everyone with comms.manage sees subjects that are
-- donors, partners, staff, or nobody. Only comms.subjects.read holders see the
-- rows naming a PARTICIPANT. Staff still see the story — the API collapses the
-- subject to its anonymous display_label for them.
drop policy if exists "read story_subjects" on public.story_subjects;
create policy "read story_subjects" on public.story_subjects
  for select to authenticated
  using (
    (select private.has_permission(org_id, 'comms.manage'))
    and (
      subject_type <> 'participant'
      or (select private.has_permission(org_id, 'comms.subjects.read'))
    )
  );

drop policy if exists "write story_subjects" on public.story_subjects;
create policy "write story_subjects" on public.story_subjects
  for all to authenticated
  using (
    (select private.has_permission(org_id, 'comms.manage'))
    and (
      subject_type <> 'participant'
      or (select private.has_permission(org_id, 'comms.subjects.read'))
    )
  )
  with check (
    (select private.has_permission(org_id, 'comms.manage'))
    and (
      subject_type <> 'participant'
      or (select private.has_permission(org_id, 'comms.subjects.read'))
    )
  );

-- story_consents: inherits the parent subject's gate. A consent row for a
-- participant carries the guardian's name and the evidence pointer, so it is
-- exactly as sensitive as the subject row itself.
drop policy if exists "read story_consents" on public.story_consents;
create policy "read story_consents" on public.story_consents
  for select to authenticated
  using (
    (select private.has_permission(org_id, 'comms.manage'))
    and (
      not (select private.story_subject_is_participant(story_subject_id))
      or (select private.has_permission(org_id, 'comms.subjects.read'))
    )
  );

drop policy if exists "write story_consents" on public.story_consents;
create policy "write story_consents" on public.story_consents
  for all to authenticated
  using (
    (select private.has_permission(org_id, 'comms.manage'))
    and (
      not (select private.story_subject_is_participant(story_subject_id))
      or (select private.has_permission(org_id, 'comms.subjects.read'))
    )
  )
  with check (
    (select private.has_permission(org_id, 'comms.manage'))
    and (
      not (select private.story_subject_is_participant(story_subject_id))
      or (select private.has_permission(org_id, 'comms.subjects.read'))
    )
  );

-- story_media: the plain stories gate, per spec §6.3, which scopes
-- comms.subjects.read to subject rows and consent evidence only. Deliberate —
-- staff who capture the photo have to be able to see it back, and gating media
-- on comms.subjects.read would break capture for exactly the people doing it.
-- The consequence is real and worth naming: a staff user cannot learn a
-- participant's NAME from the bank, but can see their FACE. Whether that line
-- is in the right place is a live question for Remi, recorded here rather than
-- decided in code.
drop policy if exists "read story_media" on public.story_media;
create policy "read story_media" on public.story_media
  for select to authenticated
  using ( (select private.has_permission(org_id, 'comms.manage')) );

drop policy if exists "write story_media" on public.story_media;
create policy "write story_media" on public.story_media
  for all to authenticated
  using ( (select private.has_permission(org_id, 'comms.manage')) )
  with check ( (select private.has_permission(org_id, 'comms.manage')) );
