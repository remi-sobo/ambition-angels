-- BloomOS Staff — Phase 2 (specs/bloomos-staff.md). Goals + KPIs, the first
-- sensitive tier. Additive; safe to apply before the Phase 2 code deploys.
--
-- Access model (the core of this phase): the directory tier (the staff row) is
-- readable by everyone with staff.read; this sensitive tier (goals, kpis,
-- snapshots) is readable only by the subject, anyone above them in the
-- reports_to chain, and staff.manage holders. That rule is ONE helper,
-- private.can_view_staff(), and every sensitive-tier SELECT policy is just a
-- call to it. SECURITY DEFINER + empty search_path (like private.has_permission)
-- lets it read public.staff without tripping staff's own RLS or recursing.

-- ── can_view_staff: subject OR manager-chain-above OR staff.manage ────────────
create or replace function private.can_view_staff(p_staff_id uuid)
returns boolean
language plpgsql security definer stable
set search_path to ''
as $$
declare
  v_org          uuid;
  v_subject_user uuid;
  cur            uuid;
  hops           int := 0;
begin
  select org_id, user_id, reports_to
    into v_org, v_subject_user, cur
    from public.staff where id = p_staff_id;
  if v_org is null then return false; end if;

  -- self
  if v_subject_user = auth.uid() then return true; end if;
  -- org-wide reviewers/admins
  if private.has_permission(v_org, 'staff.manage') then return true; end if;

  -- walk up the chain: is the caller a manager / skip-level above the subject?
  while cur is not null loop
    hops := hops + 1;
    if hops > 100 then exit; end if;
    if exists (select 1 from public.staff where id = cur and user_id = auth.uid()) then
      return true;
    end if;
    select reports_to into cur from public.staff where id = cur;
  end loop;

  return false;
end $$;

grant execute on function private.can_view_staff(uuid) to authenticated;

-- ── staff_goals: period SMART goals, self-proposes / manager-approves ─────────
create table if not exists public.staff_goals (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  staff_id            uuid not null references public.staff(id) on delete cascade,
  title               text not null,
  description         text,
  metric_type         text not null default 'qualitative'
                        check (metric_type in ('numeric','milestone','qualitative')),
  target_value        numeric(14,2),
  current_value       numeric(14,2),
  unit                text,
  period              text,                          -- 'FY26', 'Q3-2026', …
  target_date         date,
  linked_plan_goal_id uuid references public.plan_goals(id) on delete set null,
  status              text not null default 'not_started'
                        check (status in ('not_started','on_track','at_risk','behind','done')),
  approval_status     text not null default 'draft'
                        check (approval_status in ('draft','proposed','approved')),
  sort_order          int  not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists staff_goals_staff_idx on public.staff_goals (staff_id);
create index if not exists staff_goals_org_idx   on public.staff_goals (org_id);

-- ── staff_kpis + snapshots: recurring personal metrics (mirrors plan_kpis) ────
create table if not exists public.staff_kpis (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs(id) on delete cascade,
  staff_id           uuid not null references public.staff(id) on delete cascade,
  title              text not null,
  unit               text,
  target             numeric(14,2),
  current            numeric(14,2),
  cadence            text,
  source             text not null default 'manual' check (source in ('auto','manual')),
  linked_metric_key  text,                           -- into lib/admin/staff/metrics.ts when source='auto'
  status             text not null default 'not_started'
                       check (status in ('not_started','on_track','at_risk','behind','done')),
  last_updated_at    timestamptz,
  sort_order         int  not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists staff_kpis_staff_idx on public.staff_kpis (staff_id);
create index if not exists staff_kpis_org_idx   on public.staff_kpis (org_id);

create table if not exists public.staff_kpi_snapshots (
  org_id      uuid not null references public.orgs(id) on delete cascade,
  kpi_id      uuid not null references public.staff_kpis(id) on delete cascade,
  captured_on date not null,
  value       numeric(14,2) not null,
  created_at  timestamptz not null default now(),
  primary key (kpi_id, captured_on)
);
create index if not exists staff_kpi_snapshots_idx on public.staff_kpi_snapshots (org_id, kpi_id, captured_on);

-- ── updated_at triggers ───────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['staff_goals','staff_kpis'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;

-- ── Approval guard: the subject may propose, only a manager (chain-above) or a
-- staff.manage holder may move a goal to 'approved'. Row-level RLS can't express
-- "who may flip THIS column", so a trigger does it — same shape as the Phase 1
-- self-guard.
create or replace function public.staff_goals_guard_approval()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_owner uuid;
begin
  if new.approval_status = 'approved'
     and (tg_op = 'INSERT' or old.approval_status is distinct from 'approved') then
    select user_id into v_owner from public.staff where id = new.staff_id;
    -- can_view_staff is true for the subject too, so also require "not self":
    -- (can_view_staff AND not self) == manager-chain-above OR staff.manage.
    if not (private.can_view_staff(new.staff_id) and v_owner <> auth.uid()) then
      raise exception 'only a manager can approve a goal';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists staff_goals_guard_approval on public.staff_goals;
create trigger staff_goals_guard_approval
  before insert or update of approval_status on public.staff_goals
  for each row execute function public.staff_goals_guard_approval();

-- ── RLS: every sensitive-tier policy is private.can_view_staff(...) ───────────
alter table public.staff_goals         enable row level security;
alter table public.staff_kpis          enable row level security;
alter table public.staff_kpi_snapshots enable row level security;

-- staff_goals
drop policy if exists "view staff_goals" on public.staff_goals;
create policy "view staff_goals" on public.staff_goals
  for select to authenticated
  using ( (select private.can_view_staff(staff_id)) );

drop policy if exists "write staff_goals" on public.staff_goals;
create policy "write staff_goals" on public.staff_goals
  for all to authenticated
  using ( (select private.can_view_staff(staff_id)) )
  with check ( (select private.can_view_staff(staff_id)) );

-- staff_kpis
drop policy if exists "view staff_kpis" on public.staff_kpis;
create policy "view staff_kpis" on public.staff_kpis
  for select to authenticated
  using ( (select private.can_view_staff(staff_id)) );

drop policy if exists "write staff_kpis" on public.staff_kpis;
create policy "write staff_kpis" on public.staff_kpis
  for all to authenticated
  using ( (select private.can_view_staff(staff_id)) )
  with check ( (select private.can_view_staff(staff_id)) );

-- staff_kpi_snapshots — visibility follows the parent KPI's subject. The
-- subquery reads staff_kpis under the caller's own RLS (which itself calls
-- can_view_staff), so an invisible KPI yields no row and the policy denies.
drop policy if exists "view staff_kpi_snapshots" on public.staff_kpi_snapshots;
create policy "view staff_kpi_snapshots" on public.staff_kpi_snapshots
  for select to authenticated
  using ( (select private.can_view_staff(
            (select staff_id from public.staff_kpis k where k.id = kpi_id))) );

drop policy if exists "write staff_kpi_snapshots" on public.staff_kpi_snapshots;
create policy "write staff_kpi_snapshots" on public.staff_kpi_snapshots
  for all to authenticated
  using ( (select private.can_view_staff(
            (select staff_id from public.staff_kpis k where k.id = kpi_id))) )
  with check ( (select private.can_view_staff(
            (select staff_id from public.staff_kpis k where k.id = kpi_id))) );

-- ── public.can_view_staff: SECURITY DEFINER shim so the app can ask the same
-- question the sensitive-tier policies ask (mirrors the public.has_permission
-- shim). Lets the profile page decide whether to render the sensitive sections
-- at all, instead of showing an empty section it can't populate.
create or replace function public.can_view_staff(p_staff_id uuid)
returns boolean language sql security definer stable set search_path to '' as $$
  select private.can_view_staff(p_staff_id);
$$;
grant execute on function public.can_view_staff(uuid) to authenticated;

-- ── Seed: one auto KPI on Remi to prove the binding (source='auto', bound to
-- cash_runway_months in lib/admin/staff/metrics.ts). Idempotent via NOT EXISTS.
insert into public.staff_kpis (org_id, staff_id, title, unit, cadence, source, linked_metric_key, sort_order)
select s.org_id, s.id, 'Months of runway', 'months', 'monthly', 'auto', 'cash_runway_months', 0
from public.staff s
where s.org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'
  and s.user_id = 'aa39cd02-b813-4e75-aa36-52adadf5d2fe'
  and not exists (
    select 1 from public.staff_kpis k
    where k.staff_id = s.id and k.linked_metric_key = 'cash_runway_months'
  );
