-- BloomOS: minimal user profiles (editable display name). No profiles/users table
-- existed; names came from a hardcoded remi/shannon dict + email local-part. This
-- gives every user a name they can set in Settings, used for the greeting and (later)
-- agenda owner chips. One global row per user — a person has one name across orgs.

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Co-membership helper (private, SECURITY DEFINER) — "do I share any org with this
-- user?" Matches the existing private.has_permission / private.is_org_member pattern
-- and avoids coupling the profiles policy to memberships' own RLS visibility.
create or replace function private.shares_org(p_user uuid)
returns boolean
language sql stable security definer set search_path to ''
as $$
  select exists (
    select 1
    from public.memberships me
    join public.memberships them on them.org_id = me.org_id
    where me.user_id = auth.uid() and them.user_id = p_user
  );
$$;

-- Read: your own profile, or anyone who shares an org with you (owner chips).
drop policy if exists "read profiles in my orgs" on profiles;
create policy "read profiles in my orgs" on profiles
  for select to authenticated
  using ( user_id = auth.uid() or (select private.shares_org(user_id)) );

-- Write: only your own profile.
drop policy if exists "write own profile" on profiles;
create policy "write own profile" on profiles
  for all to authenticated
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

-- Seed existing AA names (verified live 2026-06-25).
insert into profiles (user_id, display_name) values
  ('aa39cd02-b813-4e75-aa36-52adadf5d2fe', 'Remi'),
  ('7312ba86-5203-4cf6-81d8-d8fbd3e2ec89', 'Shannon')
on conflict (user_id) do nothing;
