-- BloomOS Ring 1: multi-tenancy core.
-- See docs/bloomos/03-architecture.md §2 for the design and rationale.
--
-- Additive only: creates orgs/memberships/invitations/role_permissions and
-- the private helper functions used by all future RLS policies. Does NOT
-- touch existing tables; org_id backfill on existing tables ships in a
-- follow-up migration once auth cutover lands.

-- ── Orgs ────────────────────────────────────────────────────────────────

create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  create type org_role as enum ('owner','admin','staff','finance','board_viewer');
exception when duplicate_object then null; end $$;

create table if not exists memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id  uuid not null references orgs(id) on delete cascade,
  role    org_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);
create index if not exists memberships_user_id_idx on memberships (user_id);
create index if not exists memberships_org_id_idx on memberships (org_id);

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  email text not null,
  role org_role not null default 'staff',
  token text unique not null default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invitations_org_id_idx on invitations (org_id);

-- Role → permission mapping. Code and policies check permissions, never
-- role names, so adding/adjusting a role is a data change.
create table if not exists role_permissions (
  role org_role not null,
  permission text not null,
  primary key (role, permission)
);

-- ── Private helpers (SECURITY DEFINER breaks RLS recursion on memberships
--    and is the documented fast path; wrap calls in SELECT inside policies
--    for initPlan caching) ──────────────────────────────────────────────

create schema if not exists private;

create or replace function private.is_org_member(p_org uuid)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and org_id = p_org
  );
$$;

create or replace function private.has_permission(p_org uuid, p_perm text)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role = m.role
    where m.user_id = auth.uid()
      and m.org_id = p_org
      and rp.permission = p_perm
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_permission(uuid, text) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────

alter table orgs enable row level security;
alter table memberships enable row level security;
alter table invitations enable row level security;
alter table role_permissions enable row level security;

drop policy if exists "members read org" on orgs;
create policy "members read org" on orgs
  for select to authenticated
  using ( (select private.is_org_member(id)) );

drop policy if exists "org managers update org" on orgs;
create policy "org managers update org" on orgs
  for update to authenticated
  using ( (select private.has_permission(id, 'org.manage')) )
  with check ( (select private.has_permission(id, 'org.manage')) );

drop policy if exists "members read memberships" on memberships;
create policy "members read memberships" on memberships
  for select to authenticated
  using ( (select private.is_org_member(org_id)) );

drop policy if exists "managers write memberships" on memberships;
create policy "managers write memberships" on memberships
  for all to authenticated
  using ( (select private.has_permission(org_id, 'members.manage')) )
  with check ( (select private.has_permission(org_id, 'members.manage')) );

drop policy if exists "managers manage invitations" on invitations;
create policy "managers manage invitations" on invitations
  for all to authenticated
  using ( (select private.has_permission(org_id, 'members.manage')) )
  with check ( (select private.has_permission(org_id, 'members.manage')) );

-- role_permissions is static config, readable by any signed-in user;
-- writes only via migrations/service role.
drop policy if exists "read role permissions" on role_permissions;
create policy "read role permissions" on role_permissions
  for select to authenticated
  using (true);

-- ── Seed: permissions per role ──────────────────────────────────────────
-- Domains: org, members, program, fundraising, finance, ops, board,
-- compliance, reports. Verbs: read, write, manage. Owner/admin get manage
-- everywhere (owner additionally implies billing/destructive org actions,
-- enforced in app code).

insert into role_permissions (role, permission) values
  -- owner: everything
  ('owner','org.manage'), ('owner','members.manage'),
  ('owner','program.read'), ('owner','program.write'),
  ('owner','fundraising.read'), ('owner','fundraising.write'),
  ('owner','finance.read'), ('owner','finance.write'),
  ('owner','ops.read'), ('owner','ops.write'),
  ('owner','board.read'), ('owner','board.write'),
  ('owner','compliance.read'), ('owner','compliance.write'),
  ('owner','reports.read'),
  -- admin: everything except org.manage-level destructive actions (app-enforced)
  ('admin','org.manage'), ('admin','members.manage'),
  ('admin','program.read'), ('admin','program.write'),
  ('admin','fundraising.read'), ('admin','fundraising.write'),
  ('admin','finance.read'), ('admin','finance.write'),
  ('admin','ops.read'), ('admin','ops.write'),
  ('admin','board.read'), ('admin','board.write'),
  ('admin','compliance.read'), ('admin','compliance.write'),
  ('admin','reports.read'),
  -- staff: day-to-day program/fundraising/ops work, read-only finance
  ('staff','program.read'), ('staff','program.write'),
  ('staff','fundraising.read'), ('staff','fundraising.write'),
  ('staff','finance.read'),
  ('staff','ops.read'), ('staff','ops.write'),
  ('staff','compliance.read'),
  ('staff','reports.read'),
  -- finance: finance module + reports only
  ('finance','finance.read'), ('finance','finance.write'),
  ('finance','compliance.read'),
  ('finance','reports.read'),
  -- board_viewer: board materials + reports, read-only
  ('board_viewer','board.read'),
  ('board_viewer','reports.read')
on conflict do nothing;

-- ── Seed: the first tenant ──────────────────────────────────────────────

insert into orgs (name, slug)
values ('Ambition Angels', 'ambition-angels')
on conflict (slug) do nothing;
