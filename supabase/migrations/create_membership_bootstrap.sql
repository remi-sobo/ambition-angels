-- BloomOS Ring 1: automatic membership provisioning.
--
-- When a user signs up / is created in Supabase Auth, grant org membership
-- automatically when their email is allowlisted (exact match wins, with an
-- org-level domain rule as fallback). Anyone else gets a session but no
-- membership — and lib/admin/auth.ts treats no-membership as unauthenticated,
-- so random self-signups can't reach anything.

create table if not exists org_email_allowlist (
  email text primary key,            -- stored lowercase
  org_id uuid not null references orgs(id) on delete cascade,
  role org_role not null default 'staff'
);
alter table org_email_allowlist enable row level security;
drop policy if exists "managers manage allowlist" on org_email_allowlist;
create policy "managers manage allowlist" on org_email_allowlist
  for all to authenticated
  using ( (select private.has_permission(org_id, 'members.manage')) )
  with check ( (select private.has_permission(org_id, 'members.manage')) );

create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_email text := lower(new.email);
  v_row public.org_email_allowlist%rowtype;
  v_org uuid;
begin
  if v_email is null or v_email = '' then
    return new;
  end if;

  -- 1) Exact allowlist match.
  select * into v_row from public.org_email_allowlist where email = v_email;
  if found then
    insert into public.memberships (user_id, org_id, role)
    values (new.id, v_row.org_id, v_row.role)
    on conflict do nothing;
    return new;
  end if;

  -- 2) Org domain rule: orgs.settings->>'email_domain' grants 'staff'.
  select id into v_org
  from public.orgs
  where lower(coalesce(settings->>'email_domain','')) = split_part(v_email, '@', 2)
  limit 1;
  if v_org is not null then
    insert into public.memberships (user_id, org_id, role)
    values (new.id, v_org, 'staff')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Seeds for Ambition Angels: Remi as owner; anyone on the org domain as staff.
insert into org_email_allowlist (email, org_id, role)
select 'remi@ambitionangels.org', id, 'owner' from orgs where slug = 'ambition-angels'
on conflict (email) do nothing;

update orgs
set settings = settings || '{"email_domain":"ambitionangels.org"}'::jsonb
where slug = 'ambition-angels';

-- Backfill memberships for any auth users that existed before this trigger.
insert into memberships (user_id, org_id, role)
select u.id, a.org_id, a.role
from auth.users u
join org_email_allowlist a on a.email = lower(u.email)
on conflict do nothing;

insert into memberships (user_id, org_id, role)
select u.id, o.id, 'staff'
from auth.users u
join orgs o on lower(coalesce(o.settings->>'email_domain','')) = split_part(lower(u.email), '@', 2)
on conflict do nothing;
