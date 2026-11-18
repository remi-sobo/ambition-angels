-- Ambition Coach sign-ups (public /coach page) + the aa.coach entitlement.
--
-- One table for both sides of the match: kind = 'coach' (a professional
-- volunteering four sessions) or 'student' (a young adult asking for a coach).
-- Rows are written only by the public /api/coach-signup route through the
-- service role, attributed to the resident org. Staff read and update them in
-- BloomOS at /admin/programs/coach, which is fenced to orgs holding aa.coach.
--
-- RLS follows the standard program pattern: members with program.read see
-- their own org's rows, program.write can update them. No anon access.
--
-- The entitlement seed resolves AA by slug (no hardcoded uuid) and is a no-op
-- where the org isn't present (e.g. the RLS scratch DB). aa.coach is never
-- seeded for any other tenant.
--
-- Apply via the Supabase dashboard. Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

create table if not exists public.coach_signups (
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
  -- both
  timing text,
  referral text,
  note text,
  status text not null default 'new'
    check (status in ('new', 'talked', 'matched', 'active', 'done', 'not_now')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_signups_org_kind_idx
  on public.coach_signups (org_id, kind, created_at desc);

drop trigger if exists coach_signups_set_updated_at on public.coach_signups;
create trigger coach_signups_set_updated_at
  before update on public.coach_signups
  for each row execute function set_updated_at();

alter table public.coach_signups enable row level security;

drop policy if exists "members read coach_signups" on public.coach_signups;
create policy "members read coach_signups" on public.coach_signups
  for select to authenticated
  using ( (select private.has_permission(org_id, 'program.read')) );

drop policy if exists "members write coach_signups" on public.coach_signups;
create policy "members write coach_signups" on public.coach_signups
  for all to authenticated
  using ( (select private.has_permission(org_id, 'program.write')) )
  with check ( (select private.has_permission(org_id, 'program.write')) );

insert into public.org_entitlements (org_id, feature_key, enabled, source)
select o.id, 'aa.coach', true, 'seed:coach_signups'
from public.orgs o
where o.slug = 'ambition-angels'
on conflict (org_id, feature_key)
  do update set enabled = true, source = excluded.source, updated_at = now();
