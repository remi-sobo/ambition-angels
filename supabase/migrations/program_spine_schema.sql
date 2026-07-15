-- Program spine — the generic participant model (BloomOS V3 spec #4,
-- Phase 0 recommendations approved).
--
-- Generalizes IN PLACE (decision A): the students/cohorts tables keep their
-- physical names — per-tenant naming is org_terminology's job — while the
-- SEMANTICS move to data:
--   - programs: cohorts.program free text becomes a real org-scoped record.
--   - participant_stages: the journey vocabulary (discover→launch,
--     alumni/withdrawn) becomes per-org data rows with an `engaged` flag,
--     so "active participants" is a data question, not a hardcoded array
--     (app/admin/students/_lib/stages.ts remains only as the seed template
--     and fallback).
--   - registry: student / cohort / application / program become linkable
--     spine entities.
--   - queue: pending applications and past-but-unclosed sessions surface in
--     Needs You (module 'program', gated by program.read under invoker).
--
-- And it removes the largest remaining concentration of the org_id-default
-- trap: all EIGHT program tables drop their hardcoded AA defaults (decision
-- E). Every writer was made org-explicit first ("program: explicit org on
-- every write"); the ratchet baseline shrinks by eight in the same PR.

-- ── Programs: the offering itself, as a record ──────────────────────────────

create table if not exists public.programs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  name        text not null,
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, name)
);

drop trigger if exists programs_set_updated_at on public.programs;
create trigger programs_set_updated_at
  before update on public.programs
  for each row execute function public.set_updated_at();

alter table public.programs enable row level security;

drop policy if exists "read programs" on public.programs;
create policy "read programs" on public.programs
  for select to authenticated
  using ( (select private.has_permission(org_id, 'program.read')) );

drop policy if exists "write programs" on public.programs;
create policy "write programs" on public.programs
  for all to authenticated
  using ( (select private.has_permission(org_id, 'program.write')) )
  with check ( (select private.has_permission(org_id, 'program.write')) );

-- Promote the free-text cohorts.program values into records, then link.
insert into public.programs (org_id, name)
select distinct c.org_id, trim(c.program)
from public.cohorts c
where c.program is not null and trim(c.program) <> ''
on conflict (org_id, name) do nothing;

alter table public.cohorts
  add column if not exists program_id uuid references public.programs(id);

update public.cohorts c
set program_id = p.id
from public.programs p
where c.program_id is null
  and c.program is not null
  and p.org_id = c.org_id
  and p.name = trim(c.program);

-- ── Participant stages: the journey vocabulary as per-org data ──────────────

create table if not exists public.participant_stages (
  org_id     uuid not null references public.orgs(id) on delete cascade,
  stage_key  text not null,             -- matches students.stage values
  label      text not null,
  sort_order int  not null default 0,
  engaged    boolean not null default false, -- counts as "active participant"
  terminal   boolean not null default false, -- alumni / withdrawn
  created_at timestamptz not null default now(),
  primary key (org_id, stage_key)
);

alter table public.participant_stages enable row level security;

drop policy if exists "read participant_stages" on public.participant_stages;
create policy "read participant_stages" on public.participant_stages
  for select to authenticated
  using ( (select private.has_permission(org_id, 'program.read')) );

drop policy if exists "write participant_stages" on public.participant_stages;
create policy "write participant_stages" on public.participant_stages
  for all to authenticated
  using ( (select private.has_permission(org_id, 'program.write')) )
  with check ( (select private.has_permission(org_id, 'program.write')) );

-- Seed the current AA vocabulary for every org that already runs a program
-- (data-driven — no hardcoded org id). New tenants get their starter set at
-- provisioning.
insert into public.participant_stages (org_id, stage_key, label, sort_order, engaged, terminal)
select o.org_id, v.stage_key, v.label, v.sort_order, v.engaged, v.terminal
from (
  select org_id from public.students
  union
  select org_id from public.cohorts
) o
cross join (values
  ('discover',  'Discover',  1, false, false),
  ('learn',     'Learn',     2, true,  false),
  ('practice',  'Practice',  3, true,  false),
  ('connect',   'Connect',   4, true,  false),
  ('launch',    'Launch',    5, true,  false),
  ('alumni',    'Alumni',    6, false, true),
  ('withdrawn', 'Withdrawn', 7, false, true)
) as v(stage_key, label, sort_order, engaged, terminal)
on conflict (org_id, stage_key) do nothing;

-- ── Drop the eight org_id defaults (writers are explicit now) ────────────────

alter table public.students          alter column org_id drop default;
alter table public.cohorts           alter column org_id drop default;
alter table public.cohort_members    alter column org_id drop default;
alter table public.cohort_sessions   alter column org_id drop default;
alter table public.attendance        alter column org_id drop default;
alter table public.applications      alter column org_id drop default;
alter table public.ygb_registrations alter column org_id drop default;
alter table public.ygb_attendance    alter column org_id drop default;

-- ── Spine registry: the program domain becomes linkable ─────────────────────

insert into public.entity_types (entity_type, display_name, module, route_pattern, icon) values
  ('student',     'Student',     'program', '/admin/students',      'graduation-cap'),
  ('cohort',      'Cohort',      'program', '/admin/cohorts/{id}',  'users'),
  ('application', 'Application', 'program', '/admin/intake',        'inbox'),
  ('program',     'Program',     'program', '/admin/cohorts',       'layers')
on conflict (entity_type) do nothing;

-- Widen the ops_tasks link vocabulary to match the registry (it was frozen at
-- the ack_v2 five while the registry grew).
alter table public.ops_tasks
  drop constraint if exists ops_tasks_linked_entity_type_check;
alter table public.ops_tasks
  add constraint ops_tasks_linked_entity_type_check
  check (
    linked_entity_type is null
    or linked_entity_type in (
      'partner', 'constituent', 'opportunity', 'volunteer', 'milestone',
      'student', 'cohort', 'application', 'program', 'grant', 'document', 'metric'
    )
  );

-- ── Queue arms: program work joins Needs You ────────────────────────────────
-- Recreates v_action_items with the seven existing arms unchanged plus:
--   application_pending — intake needing a screening/offer decision.
--   session_unrecorded  — a session whose date has passed but was never
--                         closed out (held/canceled): attendance is missing.

create or replace view public.v_action_items
with (security_invoker = on) as

  select t.org_id,
         'ops_task'::text                as source,
         t.id                            as source_id,
         t.title                         as title,
         t.linked_entity_type            as entity_type,
         t.linked_entity_id              as entity_id,
         t.linked_label                  as entity_label,
         t.assigned_to                   as owner_ref,
         t.due_date                      as due_date,
         coalesce(t.priority, 'medium')  as priority,
         t.status                        as status,
         'ops'::text                     as module
  from public.ops_tasks t
  where t.status <> 'done'
    and t.archived_at is null

  union all
  select r.org_id, 'grant_requirement', r.id,
         initcap(replace(coalesce(nullif(r.label, ''), r.kind), '_', ' ')),
         'grant', r.grant_id, null, null,
         r.due_date, 'high', r.status, 'fundraising'
  from public.grant_requirements r
  where r.status not in ('submitted', 'waived')

  union all
  select c.org_id, 'compliance_item', c.id, c.title,
         'compliance_item', c.id, c.title, c.assigned_to,
         c.due_date, 'high', c.status, 'compliance'
  from public.compliance_items c
  where c.status in ('upcoming', 'in_progress')

  union all
  select g.org_id, 'acknowledgment', g.id, 'Thank-you due',
         'gift', g.id, null, null,
         g.gift_date, 'high', 'pending', 'fundraising'
  from public.gifts g
  where g.acknowledgment_status = 'pending'

  union all
  select f.org_id, 'reconciliation_item', f.id, f.title,
         null, null, null, null,
         null::date, 'medium', f.status, 'finance'
  from public.fin_reconciliation_items f
  where f.status = 'pending'

  union all
  select d.org_id, 'document_renewal', d.id,
         'Renew: ' || coalesce(nullif(d.title, ''), d.filename),
         'document', d.id,
         coalesce(nullif(d.title, ''), d.filename), null,
         d.expires_at, 'medium', d.status, 'documents'
  from public.documents d
  where d.status = 'active'
    and d.expires_at is not null

  union all
  select m.org_id, 'metric_stale', m.id,
         'Update metric: ' || m.name,
         'metric', m.id, m.name,
         p.display_name,
         (coalesce(ls.last_on, current_date)
           + (case m.cadence when 'daily' then 2 when 'weekly' then 10 when 'monthly' then 40 when 'quarterly' then 100 else 40 end))::date,
         'medium', 'stale', 'metrics'
  from public.metric_definitions m
  left join lateral (
    select max(s.captured_on) as last_on
    from public.metric_snapshots s
    where s.metric_id = m.id
  ) ls on true
  left join public.profiles p on p.user_id = m.owner_id
  where m.active
    and m.owner_id is not null
    and (
      ls.last_on is null
      or ls.last_on < current_date
         - (case m.cadence when 'daily' then 2 when 'weekly' then 10 when 'monthly' then 40 when 'quarterly' then 100 else 40 end)
    )

  union all
  -- Applications waiting on a human decision. Offers already out rank high.
  select a.org_id, 'application_pending', a.id,
         'Application: ' || a.first_name || coalesce(' ' || a.last_name, ''),
         'application', a.id,
         a.first_name || coalesce(' ' || a.last_name, ''), null,
         null::date,
         case when a.status = 'offered' then 'high' else 'medium' end,
         a.status, 'program'
  from public.applications a
  where a.status in ('new', 'eligible', 'waitlisted', 'offered')

  union all
  -- Sessions whose date passed but were never closed out — attendance missing.
  select s.org_id, 'session_unrecorded', s.id,
         'Record attendance: ' || coalesce(nullif(s.title, ''), c.name || ' — ' || s.session_date),
         'cohort', s.cohort_id, c.name, null,
         s.session_date, 'medium', s.status, 'program'
  from public.cohort_sessions s
  join public.cohorts c on c.id = s.cohort_id
  where s.status = 'scheduled'
    and s.session_date < current_date;

grant select on public.v_action_items to authenticated;

create index if not exists idx_applications_pending
  on public.applications (org_id, status)
  where status in ('new', 'eligible', 'waitlisted', 'offered');

create index if not exists idx_cohort_sessions_unrecorded
  on public.cohort_sessions (org_id, session_date)
  where status = 'scheduled';
