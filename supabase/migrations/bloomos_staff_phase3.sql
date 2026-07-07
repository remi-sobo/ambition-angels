-- BloomOS Staff — Phase 3 (specs/bloomos-staff.md). 360 reviews.
-- Additive; safe to apply before the Phase 3 code deploys.
--
-- The honest-anonymity model (the crux):
--   * A cycle carries anonymity_mode (transparent | confidential | anonymous) and
--     a min_raters threshold. Manager (downward) and self feedback are ALWAYS
--     transparent to the subject. Upward/peer feedback obeys the mode.
--   * Below threshold, anonymous can't be real on a tiny team, so the honest
--     default is confidential: the subject sees only the synthesized summary,
--     not raw rater rows (private.subject_may_see_feedback enforces this).
--   * Anonymous masking is a read-layer concern: RLS decides row visibility; the
--     security_invoker view v_review_feedback_visible nulls rater_staff_id for the
--     subject on upward/peer rows. The app reads the view, never the base table.
--   * Private manager notes get a HARD guarantee, not a masked column: they live
--     in a separate table (review_manager_notes) whose RLS never grants the
--     subject, so "the subject never sees them in any view" is enforced by the DB,
--     not by remembering to use a view.
--   * CEO-has-no-manager: staff.manage holders can read all feedback org-wide (they
--     run cycles), so the CEO (who holds staff.manage) sees their own upward
--     feedback directly — the documented resolution. On a two-owner org this also
--     means true anonymity is impossible; the small-team warning + confidential
--     default is the honest handling rather than a promise we can't keep.

-- ── helpers ───────────────────────────────────────────────────────────────────
create or replace function private.staff_is_self(p_staff_id uuid)
returns boolean language sql security definer stable set search_path to '' as $$
  select exists (select 1 from public.staff where id = p_staff_id and user_id = auth.uid());
$$;
grant execute on function private.staff_is_self(uuid) to authenticated;

-- May the SUBJECT see raw feedback rows of a given relationship? Self/manager are
-- always transparent; upward/peer obey the cycle's mode and threshold.
create or replace function private.subject_may_see_feedback(p_cycle uuid, p_subject uuid, p_rel text)
returns boolean language plpgsql security definer stable set search_path to '' as $$
declare v_mode text; v_thr int; v_cnt int;
begin
  if p_rel in ('self','manager') then return true; end if;
  select anonymity_mode, min_raters_for_anonymity into v_mode, v_thr
    from public.review_cycles where id = p_cycle;
  if v_mode is null then return false; end if;
  if v_mode = 'transparent' then return true; end if;
  if v_mode = 'confidential' then return false; end if;
  -- anonymous: only real once the rater group meets the threshold
  select count(*) into v_cnt from public.review_feedback
    where cycle_id = p_cycle and subject_staff_id = p_subject
      and relationship = p_rel and status = 'submitted';
  return v_cnt >= v_thr;
end $$;
grant execute on function private.subject_may_see_feedback(uuid, uuid, text) to authenticated;

-- ── review_cycles ─────────────────────────────────────────────────────────────
create table if not exists public.review_cycles (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.orgs(id) on delete cascade,
  name                     text not null,
  status                   text not null default 'draft'
                             check (status in ('draft','collecting','synthesizing','shared','closed')),
  anonymity_mode           text not null default 'confidential'
                             check (anonymity_mode in ('transparent','confidential','anonymous')),
  min_raters_for_anonymity int  not null default 3,
  rating_scale_max         int  not null default 5,
  opens_on                 date,
  closes_on                date,
  created_by               uuid references auth.users(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists review_cycles_org_idx on public.review_cycles (org_id);

-- ── review_competencies (the "how" axis) ──────────────────────────────────────
create table if not exists public.review_competencies (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  name        text not null,
  description text,
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, name)
);
create index if not exists review_competencies_org_idx on public.review_competencies (org_id);

-- ── review_feedback (self / manager / report / peer) ──────────────────────────
create table if not exists public.review_feedback (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id) on delete cascade,
  cycle_id         uuid not null references public.review_cycles(id) on delete cascade,
  subject_staff_id uuid not null references public.staff(id) on delete cascade,
  rater_staff_id   uuid not null references public.staff(id) on delete cascade,
  relationship     text not null check (relationship in ('self','manager','report','peer')),
  status           text not null default 'pending' check (status in ('pending','submitted')),
  ratings          jsonb not null default '{}',   -- { competency_id: 1..5 }
  strengths        text,
  growth           text,
  comments         text,
  submitted_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (cycle_id, subject_staff_id, rater_staff_id)
);
create index if not exists review_feedback_cycle_idx   on public.review_feedback (cycle_id);
create index if not exists review_feedback_subject_idx on public.review_feedback (subject_staff_id);
create index if not exists review_feedback_rater_idx   on public.review_feedback (rater_staff_id);

-- ── review_summaries (shared with the subject) ────────────────────────────────
create table if not exists public.review_summaries (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id) on delete cascade,
  cycle_id         uuid not null references public.review_cycles(id) on delete cascade,
  subject_staff_id uuid not null references public.staff(id) on delete cascade,
  summary          text,
  author_staff_id  uuid references public.staff(id),
  shared_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (cycle_id, subject_staff_id)
);
create index if not exists review_summaries_cycle_idx on public.review_summaries (cycle_id);

-- ── review_manager_notes (NEVER visible to the subject — separate table) ──────
create table if not exists public.review_manager_notes (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id) on delete cascade,
  cycle_id         uuid not null references public.review_cycles(id) on delete cascade,
  subject_staff_id uuid not null references public.staff(id) on delete cascade,
  notes            text,
  author_staff_id  uuid references public.staff(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (cycle_id, subject_staff_id)
);
create index if not exists review_manager_notes_cycle_idx on public.review_manager_notes (cycle_id);

-- ── updated_at triggers ───────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['review_cycles','review_competencies','review_feedback',
                           'review_summaries','review_manager_notes'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.review_cycles        enable row level security;
alter table public.review_competencies  enable row level security;
alter table public.review_feedback      enable row level security;
alter table public.review_summaries     enable row level security;
alter table public.review_manager_notes enable row level security;

-- cycles + competencies: readable by the org (directory-ish), managed by staff.manage
drop policy if exists "read review_cycles" on public.review_cycles;
create policy "read review_cycles" on public.review_cycles
  for select to authenticated using ( (select private.has_permission(org_id, 'staff.read')) );
drop policy if exists "manage review_cycles" on public.review_cycles;
create policy "manage review_cycles" on public.review_cycles
  for all to authenticated
  using ( (select private.has_permission(org_id, 'staff.manage')) )
  with check ( (select private.has_permission(org_id, 'staff.manage')) );

drop policy if exists "read review_competencies" on public.review_competencies;
create policy "read review_competencies" on public.review_competencies
  for select to authenticated using ( (select private.has_permission(org_id, 'staff.read')) );
drop policy if exists "manage review_competencies" on public.review_competencies;
create policy "manage review_competencies" on public.review_competencies
  for all to authenticated
  using ( (select private.has_permission(org_id, 'staff.manage')) )
  with check ( (select private.has_permission(org_id, 'staff.manage')) );

-- feedback: rater sees own; managers-above + staff.manage see all about the
-- subject (to synthesize); the subject sees their own, anonymity-filtered.
drop policy if exists "view review_feedback" on public.review_feedback;
create policy "view review_feedback" on public.review_feedback
  for select to authenticated
  using (
    (select private.has_permission(org_id, 'staff.manage'))
    or (select private.staff_is_self(rater_staff_id))
    or ( (select private.can_view_staff(subject_staff_id)) and not (select private.staff_is_self(subject_staff_id)) )
    or ( (select private.staff_is_self(subject_staff_id))
         and (select private.subject_may_see_feedback(cycle_id, subject_staff_id, relationship)) )
  );

-- writes: a rater fills their own form; cycle admins (staff.manage) generate and
-- manage assignments. Managers-above don't edit raw feedback — they synthesize.
drop policy if exists "write review_feedback" on public.review_feedback;
create policy "write review_feedback" on public.review_feedback
  for all to authenticated
  using ( (select private.staff_is_self(rater_staff_id)) or (select private.has_permission(org_id, 'staff.manage')) )
  with check ( (select private.staff_is_self(rater_staff_id)) or (select private.has_permission(org_id, 'staff.manage')) );

-- summaries: managers/manage see + write always; the subject reads only once shared.
drop policy if exists "read review_summaries" on public.review_summaries;
create policy "read review_summaries" on public.review_summaries
  for select to authenticated
  using (
    ( (select private.can_view_staff(subject_staff_id)) and not (select private.staff_is_self(subject_staff_id)) )
    or ( (select private.staff_is_self(subject_staff_id)) and shared_at is not null )
  );
drop policy if exists "write review_summaries" on public.review_summaries;
create policy "write review_summaries" on public.review_summaries
  for all to authenticated
  using ( (select private.can_view_staff(subject_staff_id)) and not (select private.staff_is_self(subject_staff_id)) )
  with check ( (select private.can_view_staff(subject_staff_id)) and not (select private.staff_is_self(subject_staff_id)) );

-- manager notes: only managers-above / staff.manage, and NEVER the subject.
drop policy if exists "manage review_manager_notes" on public.review_manager_notes;
create policy "manage review_manager_notes" on public.review_manager_notes
  for all to authenticated
  using ( (select private.can_view_staff(subject_staff_id)) and not (select private.staff_is_self(subject_staff_id)) )
  with check ( (select private.can_view_staff(subject_staff_id)) and not (select private.staff_is_self(subject_staff_id)) );

-- ── v_review_feedback_visible: masks rater identity for the subject in anonymous
-- cycles on upward/peer rows. security_invoker so base-table RLS still applies;
-- the app reads THIS, never review_feedback directly.
create or replace view public.v_review_feedback_visible
with (security_invoker = true) as
select
  f.id, f.org_id, f.cycle_id, f.subject_staff_id,
  case
    when c.anonymity_mode = 'anonymous'
     and f.relationship in ('report','peer')
     and private.staff_is_self(f.subject_staff_id)
    then null
    else f.rater_staff_id
  end as rater_staff_id,
  f.relationship, f.status, f.ratings, f.strengths, f.growth, f.comments,
  f.submitted_at, f.created_at
from public.review_feedback f
join public.review_cycles c on c.id = f.cycle_id;

grant select on public.v_review_feedback_visible to authenticated;

-- ── Seed: five default competencies for AA (org-editable). ────────────────────
insert into public.review_competencies (org_id, name, description, sort_order) values
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','Mission and values','Lives the mission; decisions reflect the org''s values.',0),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','Communication','Clear, timely, and candid with teammates and partners.',1),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','Collaboration','Works across the team; makes others better.',2),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','Ownership and follow-through','Takes responsibility; closes the loop.',3),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','Judgment','Sound decisions with incomplete information.',4)
on conflict (org_id, name) do nothing;
