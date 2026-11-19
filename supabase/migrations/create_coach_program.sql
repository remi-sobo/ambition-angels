-- Ambition Coach: people, matches, sessions + the aa.coach entitlement.
--
-- coach_people   one row per person who signs up on /coach, kind = 'coach'
--                (a professional giving four sessions) or 'student' (a young
--                adult asking for a coach). access_token is the private link
--                to their page at /coach/me/<token>; staff can rotate it.
-- coach_matches  one coach + one student. Holds the student's Ambition Plan
--                (plan jsonb, written on their private page) and the coach's
--                reaction to it.
-- coach_sessions the four sessions of a match (n = 1..4), created with it.
--
-- Public writes (sign-up, private pages) go through server routes with the
-- service role, attributed to the resident org. Staff work the program in
-- BloomOS at /admin/programs/coach, fenced to orgs holding aa.coach.
--
-- RLS follows the standard program pattern: members with program.read see
-- their own org's rows, program.write can change them. No anon access.
--
-- The entitlement seed resolves AA by slug (no hardcoded uuid) and is a no-op
-- where the org isn't present (e.g. the RLS scratch DB). aa.coach is never
-- seeded for any other tenant.
--
-- Apply via the Supabase dashboard. Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

create table if not exists public.coach_people (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  kind text not null check (kind in ('coach', 'student')),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  field text not null,
  -- coach side
  role text,
  company text,
  linkedin text,
  -- student side
  age int check (age is null or (age between 13 and 99)),
  school text,
  program text,
  goal text,
  -- both
  timing text,
  referral text,
  note text,
  staff_note text,
  status text not null default 'new'
    check (status in ('new', 'talked', 'ready', 'matched', 'done', 'not_now')),
  access_token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  link_sent_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_people_org_kind_idx
  on public.coach_people (org_id, kind, created_at desc);

create table if not exists public.coach_matches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  coach_id uuid not null references public.coach_people(id) on delete cascade,
  student_id uuid not null references public.coach_people(id) on delete cascade,
  status text not null default 'proposed'
    check (status in ('proposed', 'intro_sent', 'active', 'done', 'ended')),
  intro_sent_at timestamptz,
  plan jsonb not null default '{}'::jsonb,
  plan_updated_at timestamptz,
  plan_shared_at timestamptz,
  coach_reaction text,
  coach_reaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_matches_org_idx on public.coach_matches (org_id, created_at desc);
create index if not exists coach_matches_coach_idx on public.coach_matches (coach_id);
create index if not exists coach_matches_student_idx on public.coach_matches (student_id);

create table if not exists public.coach_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  match_id uuid not null references public.coach_matches(id) on delete cascade,
  n int not null check (n between 1 and 4),
  scheduled_on date,
  done_at timestamptz,
  student_note text,
  coach_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, n)
);

create index if not exists coach_sessions_org_idx on public.coach_sessions (org_id, match_id);

drop trigger if exists coach_people_set_updated_at on public.coach_people;
create trigger coach_people_set_updated_at
  before update on public.coach_people
  for each row execute function set_updated_at();

drop trigger if exists coach_matches_set_updated_at on public.coach_matches;
create trigger coach_matches_set_updated_at
  before update on public.coach_matches
  for each row execute function set_updated_at();

drop trigger if exists coach_sessions_set_updated_at on public.coach_sessions;
create trigger coach_sessions_set_updated_at
  before update on public.coach_sessions
  for each row execute function set_updated_at();

alter table public.coach_people enable row level security;
alter table public.coach_matches enable row level security;
alter table public.coach_sessions enable row level security;

drop policy if exists "members read coach_people" on public.coach_people;
create policy "members read coach_people" on public.coach_people
  for select to authenticated
  using ( (select private.has_permission(org_id, 'program.read')) );

drop policy if exists "members write coach_people" on public.coach_people;
create policy "members write coach_people" on public.coach_people
  for all to authenticated
  using ( (select private.has_permission(org_id, 'program.write')) )
  with check ( (select private.has_permission(org_id, 'program.write')) );

drop policy if exists "members read coach_matches" on public.coach_matches;
create policy "members read coach_matches" on public.coach_matches
  for select to authenticated
  using ( (select private.has_permission(org_id, 'program.read')) );

drop policy if exists "members write coach_matches" on public.coach_matches;
create policy "members write coach_matches" on public.coach_matches
  for all to authenticated
  using ( (select private.has_permission(org_id, 'program.write')) )
  with check ( (select private.has_permission(org_id, 'program.write')) );

drop policy if exists "members read coach_sessions" on public.coach_sessions;
create policy "members read coach_sessions" on public.coach_sessions
  for select to authenticated
  using ( (select private.has_permission(org_id, 'program.read')) );

drop policy if exists "members write coach_sessions" on public.coach_sessions;
create policy "members write coach_sessions" on public.coach_sessions
  for all to authenticated
  using ( (select private.has_permission(org_id, 'program.write')) )
  with check ( (select private.has_permission(org_id, 'program.write')) );

insert into public.org_entitlements (org_id, feature_key, enabled, source)
select o.id, 'aa.coach', true, 'seed:coach_program'
from public.orgs o
where o.slug = 'ambition-angels'
on conflict (org_id, feature_key)
  do update set enabled = true, source = excluded.source, updated_at = now();
