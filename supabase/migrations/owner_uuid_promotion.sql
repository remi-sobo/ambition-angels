-- Owner promotion: text assignees → uuid (Operating Spine spec #1, open
-- decision B follow-on — "should land before the queue is sold to a tenant
-- with real staff headcount").
--
-- ops_tasks.assigned_to and compliance_items.assigned_to are free text
-- ('remi', 'shannon'), so "my items" has been best-effort string matching.
-- This adds a real uuid column beside each, backfills it by display-name
-- match against profiles (org-membership-scoped), and keeps it in sync with
-- a trigger — so EVERY existing write path (task routes, EntityTasks, rail
-- capture, meeting suggestions, Reed proposals) stays correct without
-- touching a single route. The text column remains the write interface for
-- now; flipping the UI to write uuids directly is the later cleanup, and the
-- trigger respects an explicit uuid write when one arrives.
--
-- v_action_items gains an owner_id column (populated for ops tasks,
-- compliance items, and stale metrics), so the queue's "Mine" filter becomes
-- an exact uuid match instead of a first-name guess.

alter table public.ops_tasks
  add column if not exists assigned_to_id uuid references public.profiles(user_id);
alter table public.compliance_items
  add column if not exists assigned_to_id uuid references public.profiles(user_id);

create index if not exists idx_ops_tasks_assigned_to_id
  on public.ops_tasks (assigned_to_id)
  where status <> 'done' and archived_at is null;

-- ── Sync trigger ────────────────────────────────────────────────────────────
-- Maps the text assignee to a profile of a member of the row's org, matching
-- on the first token of display_name case-insensitively ('remi' ↔ 'Remi',
-- 'Remi Sobo'). SECURITY DEFINER with an empty search_path (the
-- staff_validate_reports_to precedent) so the mapping works regardless of the
-- writer's RLS view of profiles/memberships. An explicit uuid write wins:
-- when a statement changes assigned_to_id itself, the trigger keeps it.
create or replace function public.sync_assigned_to_id()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Caller set the uuid explicitly (future UI) — trust it.
  if tg_op = 'UPDATE' and new.assigned_to_id is distinct from old.assigned_to_id then
    return new;
  end if;
  if tg_op = 'INSERT' and new.assigned_to_id is not null then
    return new;
  end if;

  if new.assigned_to is null or btrim(new.assigned_to) = '' then
    new.assigned_to_id := null;
  elsif tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to then
    select p.user_id into new.assigned_to_id
    from public.profiles p
    join public.memberships m on m.user_id = p.user_id and m.org_id = new.org_id
    where lower(split_part(btrim(p.display_name), ' ', 1))
        = lower(split_part(btrim(new.assigned_to), ' ', 1))
    limit 1;
  end if;
  return new;
end $$;

drop trigger if exists ops_tasks_sync_assigned_to_id on public.ops_tasks;
create trigger ops_tasks_sync_assigned_to_id
  before insert or update on public.ops_tasks
  for each row execute function public.sync_assigned_to_id();

drop trigger if exists compliance_items_sync_assigned_to_id on public.compliance_items;
create trigger compliance_items_sync_assigned_to_id
  before insert or update on public.compliance_items
  for each row execute function public.sync_assigned_to_id();

-- ── Backfill (best-effort; unmatched stay null and are reported) ────────────
update public.ops_tasks t
set assigned_to_id = p.user_id
from public.profiles p
join public.memberships m on m.user_id = p.user_id
where t.assigned_to_id is null
  and t.assigned_to is not null and btrim(t.assigned_to) <> ''
  and m.org_id = t.org_id
  and lower(split_part(btrim(p.display_name), ' ', 1))
    = lower(split_part(btrim(t.assigned_to), ' ', 1));

update public.compliance_items c
set assigned_to_id = p.user_id
from public.profiles p
join public.memberships m on m.user_id = p.user_id
where c.assigned_to_id is null
  and c.assigned_to is not null and btrim(c.assigned_to) <> ''
  and m.org_id = c.org_id
  and lower(split_part(btrim(p.display_name), ' ', 1))
    = lower(split_part(btrim(c.assigned_to), ' ', 1));

do $$
declare unmatched text;
begin
  select string_agg(distinct v.assigned_to, ', ') into unmatched
  from (
    select assigned_to from public.ops_tasks
    where assigned_to is not null and btrim(assigned_to) <> '' and assigned_to_id is null
    union all
    select assigned_to from public.compliance_items
    where assigned_to is not null and btrim(assigned_to) <> '' and assigned_to_id is null
  ) v;
  if unmatched is not null then
    raise notice 'owner promotion: text assignees with no matching profile (left null): %', unmatched;
  end if;
end $$;

-- ── v_action_items: expose owner_id ────────────────────────────────────────
-- Recreates the current nine-arm view verbatim, adding owner_id after
-- owner_ref. security_invoker stays on. Note: CREATE OR REPLACE VIEW cannot
-- add a column mid-list, so the view is dropped and recreated in one
-- transaction (migrations run atomically); grants are re-issued below.
drop view if exists public.v_action_items;
create view public.v_action_items
with (security_invoker = on) as

  select t.org_id,
         'ops_task'::text                as source,
         t.id                            as source_id,
         t.title                         as title,
         t.linked_entity_type            as entity_type,
         t.linked_entity_id              as entity_id,
         t.linked_label                  as entity_label,
         t.assigned_to                   as owner_ref,
         t.assigned_to_id                as owner_id,
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
         'grant', r.grant_id, null, null, null::uuid,
         r.due_date, 'high', r.status, 'fundraising'
  from public.grant_requirements r
  where r.status not in ('submitted', 'waived')

  union all
  select c.org_id, 'compliance_item', c.id, c.title,
         'compliance_item', c.id, c.title, c.assigned_to, c.assigned_to_id,
         c.due_date, 'high', c.status, 'compliance'
  from public.compliance_items c
  where c.status in ('upcoming', 'in_progress')

  union all
  select g.org_id, 'acknowledgment', g.id, 'Thank-you due',
         'gift', g.id, null, null, null::uuid,
         g.gift_date, 'high', 'pending', 'fundraising'
  from public.gifts g
  where g.acknowledgment_status = 'pending'

  union all
  select f.org_id, 'reconciliation_item', f.id, f.title,
         null, null, null, null, null::uuid,
         null::date, 'medium', f.status, 'finance'
  from public.fin_reconciliation_items f
  where f.status = 'pending'

  union all
  select d.org_id, 'document_renewal', d.id,
         'Renew: ' || coalesce(nullif(d.title, ''), d.filename),
         'document', d.id,
         coalesce(nullif(d.title, ''), d.filename), null, null::uuid,
         d.expires_at, 'medium', d.status, 'documents'
  from public.documents d
  where d.status = 'active'
    and d.expires_at is not null

  union all
  select m.org_id, 'metric_stale', m.id,
         'Update metric: ' || m.name,
         'metric', m.id, m.name,
         p.display_name, m.owner_id,
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
  select a.org_id, 'application_pending', a.id,
         'Application: ' || a.first_name || coalesce(' ' || a.last_name, ''),
         'application', a.id,
         a.first_name || coalesce(' ' || a.last_name, ''),
         null, null::uuid,
         null::date,
         case when a.status = 'offered' then 'high' else 'medium' end,
         a.status, 'program'
  from public.applications a
  where a.status in ('new', 'eligible', 'waitlisted', 'offered')

  union all
  select s.org_id, 'session_unrecorded', s.id,
         'Record attendance: ' || coalesce(nullif(s.title, ''), c.name || ' — ' || s.session_date),
         'cohort', s.cohort_id, c.name,
         null, null::uuid,
         s.session_date, 'medium', s.status, 'program'
  from public.cohort_sessions s
  join public.cohorts c on c.id = s.cohort_id
  where s.status = 'scheduled'
    and s.session_date < current_date;

grant select on public.v_action_items to authenticated;
