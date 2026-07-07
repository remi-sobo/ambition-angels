-- BloomOS Staff — Phase 1 (specs/bloomos-staff.md, Appendix A).
-- The people layer: an org-scoped, self-referencing org chart that hangs off the
-- existing identity spine (auth.users -> profiles -> memberships). `staff` is NOT
-- a parallel identity system — every row links to a real auth.users id and a
-- membership still owns "who can log in and with what role". `staff` owns "who
-- they are on the team, who they report to, and (Phases 2-3) their development
-- data".
--
-- Additive and safe to apply before the Phase 1 code deploys: it only creates a
-- new table + a private storage bucket, and seeds three permissions + two people.
--
-- Two deliberate choices, both matching the newer strategy migrations:
--   * NO hardcoded org_id default (the org_id-default trap). New rows set org_id
--     from session context in the routes.
--   * RLS from the first migration, gated on private.has_permission (the same
--     authority every other policy uses), plus a self-service update lane.
--
-- Naming note: `staff` is already a *role* name in role_permissions. The
-- `staff.*` *permission* domain added below is orthogonal to that role and does
-- not collide — the role governs finance/fundraising access; these permissions
-- govern the people module. Kept distinct on purpose.

-- ── staff table ──────────────────────────────────────────────────────────────
create table if not exists public.staff (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,   -- NO default; set from session
  user_id         uuid not null references auth.users(id) on delete cascade,
  full_name       text not null,
  title           text,
  reports_to      uuid references public.staff(id),
  department      text,
  employment_type text not null default 'staff'
                    check (employment_type in ('staff','contractor','volunteer','board')),
  photo_path      text,
  start_date      date,
  status          text not null default 'active' check (status in ('active','inactive')),
  sort_order      int  not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists staff_org_idx        on public.staff (org_id);
create index if not exists staff_reports_to_idx on public.staff (reports_to);
create index if not exists staff_user_idx       on public.staff (user_id);

-- updated_at (shared house trigger, defined in create_kpis_and_plan.sql)
drop trigger if exists staff_set_updated_at on public.staff;
create trigger staff_set_updated_at
  before update on public.staff
  for each row execute function public.set_updated_at();

-- reports_to integrity: manager must be in the same org, and no cycles.
-- SECURITY DEFINER + empty search_path (fully schema-qualified) mirrors the
-- private.* helpers and keeps the self-referential walk out of RLS's way.
create or replace function public.staff_validate_reports_to()
returns trigger language plpgsql security definer set search_path to '' as $$
declare mgr_org uuid; cur uuid; hops int := 0;
begin
  if new.reports_to is null then return new; end if;
  if new.reports_to = new.id then raise exception 'staff cannot report to itself'; end if;
  select org_id into mgr_org from public.staff where id = new.reports_to;
  if mgr_org is null then raise exception 'reports_to target does not exist'; end if;
  if mgr_org <> new.org_id then raise exception 'manager must be in the same org'; end if;
  cur := new.reports_to;
  while cur is not null loop
    hops := hops + 1;
    if cur = new.id then raise exception 'reports_to would create a cycle'; end if;
    if hops > 100 then raise exception 'reports_to chain too deep'; end if;
    select reports_to into cur from public.staff where id = cur;
  end loop;
  return new;
end $$;

drop trigger if exists staff_validate_reports_to on public.staff;
create trigger staff_validate_reports_to
  before insert or update of reports_to, org_id on public.staff
  for each row execute function public.staff_validate_reports_to();

-- Self-service guard: a staff member editing their OWN row may change only their
-- photo. Title, manager, org, status, sort order, name, department, type, and
-- start date are HR-admin fields (staff.write). Admins with staff.write bypass
-- this entirely. Row-level RLS can't express column-level rules, so this trigger
-- does it. Uses private.has_permission (the same authority the RLS policies use).
create or replace function public.staff_guard_self_update()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.user_id = auth.uid() and not private.has_permission(new.org_id, 'staff.write') then
    if (new.title, new.reports_to, new.org_id, new.user_id, new.status, new.sort_order,
        new.full_name, new.department, new.employment_type, new.start_date)
       is distinct from
       (old.title, old.reports_to, old.org_id, old.user_id, old.status, old.sort_order,
        old.full_name, old.department, old.employment_type, old.start_date)
    then
      raise exception 'you may update only your own photo';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists staff_guard_self_update on public.staff;
create trigger staff_guard_self_update
  before update on public.staff
  for each row execute function public.staff_guard_self_update();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Directory tier: the staff row (name/title/photo/who-reports-to-whom) is low
-- sensitivity and useful to everyone, so SELECT is gated on staff.read (every
-- role holds it). The sensitive tier (goals/kpis/reviews) arrives in Phases 2-3
-- behind private.can_view_staff(). Writes: staff.write for HR-admin edits, plus
-- a self lane so a person can update their own photo (column-guarded above).
alter table public.staff enable row level security;

drop policy if exists "members read staff" on public.staff;
create policy "members read staff" on public.staff
  for select to authenticated
  using ( (select private.has_permission(org_id, 'staff.read')) );

drop policy if exists "hr admins write staff" on public.staff;
create policy "hr admins write staff" on public.staff
  for all to authenticated
  using ( (select private.has_permission(org_id, 'staff.write')) )
  with check ( (select private.has_permission(org_id, 'staff.write')) );

drop policy if exists "self update staff" on public.staff;
create policy "self update staff" on public.staff
  for update to authenticated
  using ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

-- ── permissions ──────────────────────────────────────────────────────────────
-- staff.read  -> everyone (the directory is not secret)
-- staff.write -> owner/admin (HR admin: add/remove/reorder, edit title/manager)
-- staff.manage-> owner/admin (run review cycles, see sensitive data org-wide;
--                mirrors members.manage)
insert into public.role_permissions (role, permission) values
  ('owner','staff.read'), ('admin','staff.read'), ('staff','staff.read'),
  ('finance','staff.read'), ('board_viewer','staff.read'),
  ('owner','staff.write'), ('admin','staff.write'),
  ('owner','staff.manage'), ('admin','staff.manage')
on conflict do nothing;

-- ── Seed: Remi + Shannon (AA org) ────────────────────────────────────────────
-- Idempotent via unique (org_id, user_id). Shannon's reports_to is resolved from
-- Remi's seeded row so re-applying is safe whether or not Remi already exists.
with remi as (
  insert into public.staff (org_id, user_id, full_name, title, reports_to, sort_order)
  values ('17c75da8-082d-4c8f-b00b-a4100fb2eb22',
          'aa39cd02-b813-4e75-aa36-52adadf5d2fe',
          'Remi Sobomehin', 'Founder & CEO', null, 0)
  on conflict (org_id, user_id) do nothing
  returning id
)
insert into public.staff (org_id, user_id, full_name, title, reports_to, sort_order)
select '17c75da8-082d-4c8f-b00b-a4100fb2eb22',
       '7312ba86-5203-4cf6-81d8-d8fbd3e2ec89',
       'Shannon', 'Operations & Executive Support',
       (select id from public.staff
        where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'
          and user_id = 'aa39cd02-b813-4e75-aa36-52adadf5d2fe'),
       1
on conflict (org_id, user_id) do nothing;

-- ── staff-photos storage bucket + policies ───────────────────────────────────
-- Private bucket (public=false, like the other bloomos buckets). Path convention
-- {org_id}/{staff_id}/{filename}. Unlike bloomos-asks/bloomos-reports (created
-- out-of-band and reached via service-role), this bucket ships with storage RLS
-- so the *session* client can read/write it directly — the Staff module never
-- touches the service-role client. Reads are still served through short-lived
-- signed URLs, never public URLs.
insert into storage.buckets (id, name, public)
values ('staff-photos', 'staff-photos', false)
on conflict (id) do nothing;

-- read: anyone who is a member of the org in the path's first segment.
drop policy if exists "staff photos read" on storage.objects;
create policy "staff photos read" on storage.objects for select to authenticated
using (
  bucket_id = 'staff-photos'
  and exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid())
      and m.org_id::text = (storage.foldername(name))[1]
  )
);

-- write/update/delete: staff.write on that org, or the person editing their own
-- folder (path's second segment is their own staff.id).
drop policy if exists "staff photos write" on storage.objects;
create policy "staff photos write" on storage.objects for insert to authenticated
with check (
  bucket_id = 'staff-photos'
  and (
    (select private.has_permission(((storage.foldername(name))[1])::uuid, 'staff.write'))
    or exists (
      select 1 from public.staff s
      where s.id::text = (storage.foldername(name))[2] and s.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "staff photos modify" on storage.objects;
create policy "staff photos modify" on storage.objects for update to authenticated
using (
  bucket_id = 'staff-photos'
  and (
    (select private.has_permission(((storage.foldername(name))[1])::uuid, 'staff.write'))
    or exists (select 1 from public.staff s
               where s.id::text = (storage.foldername(name))[2] and s.user_id = (select auth.uid()))
  )
);

drop policy if exists "staff photos delete" on storage.objects;
create policy "staff photos delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'staff-photos'
  and (
    (select private.has_permission(((storage.foldername(name))[1])::uuid, 'staff.write'))
    or exists (select 1 from public.staff s
               where s.id::text = (storage.foldername(name))[2] and s.user_id = (select auth.uid()))
  )
);
