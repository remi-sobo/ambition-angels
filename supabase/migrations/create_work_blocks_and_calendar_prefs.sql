-- Calendar & Time Blocking — Phase 1 (specs/bloomos-calendar-time-blocking.md §6–7).
--
-- Four changes, one migration:
--   1. calendar_events.source CHECK widened to include 'bloomos' — the deployed
--      block writers (lib/agenda/task-blocks.ts, calendar-sync.ts) have written
--      'bloomos' since Agenda Phase 4, but the committed constraint never
--      allowed it, so every mirror write was silently failing. This commits
--      the intended reality.
--   2. private.manages_user(owner, org) — the org-chart read arm: true when the
--      caller directly manages `owner` via staff.reports_to in that org.
--   3. work_blocks + work_block_tasks — a block is the container (one Google
--      event, several tasks); a task lives on ONE block at a time
--      (unique (task_id) — moving is an upsert), and a done task keeps its row
--      as the record of where the work happened. No completion flag on the
--      join: ops_tasks.status stays the only truth.
--   4. calendar_prefs — per-user working hours feeding the week grid extent and
--      the open-block computation (replaces the hardcoded 09:00–17:00).
--
-- Minutes-from-midnight (day date + start_minute/duration_minute) matches the
-- existing /api/admin/agenda/blocks contract; the single DST-sensitive
-- conversion stays in dayStartInstant(). The Google event and the
-- calendar_events mirror carry the absolute instants.
--
-- org_id: NO resident-tenant default on any new table (org_id default trap).
-- Service/app inserts MUST pass org_id explicitly.
--
-- RLS: read = ops.read AND (own OR delegated OR you manage the owner); write =
-- ops.write AND own — a manager or delegate can look, never touch. The
-- per-user predicate is the protection; ops.read alone covers all staff.

-- ── 1. Widen the source CHECK (commit the deployed reality) ────────────────

alter table calendar_events drop constraint if exists calendar_events_source_check;
alter table calendar_events
  add constraint calendar_events_source_check
  check (source in ('google', 'booking', 'bloomos'));

-- ── 2. private.manages_user ────────────────────────────────────────────────
-- Direct reports only (spec §10.2): the transitive chain invites an accidental
-- panopticon; a skip-level is granted explicitly via agenda_delegations.
-- plpgsql + to_regclass guard so the function applies and runs on databases
-- where the staff migrations haven't been applied (the RLS scratch DB
-- excludes bloomos_staff_phase1..4; the leak test creates a minimal fixture).

create or replace function private.manages_user(p_owner uuid, p_org uuid)
returns boolean
language plpgsql security definer stable
set search_path = ''
as $$
begin
  if to_regclass('public.staff') is null then
    return false;
  end if;
  return exists (
    select 1
    from public.staff tgt
    join public.staff mgr on tgt.reports_to = mgr.id
    where tgt.user_id = p_owner
      and mgr.user_id = auth.uid()
      and tgt.org_id = p_org
      and mgr.org_id = p_org
      and tgt.status = 'active'
      and mgr.status = 'active'
  );
end;
$$;

grant execute on function private.manages_user(uuid, uuid) to authenticated;

-- ── 3. work_blocks + work_block_tasks ──────────────────────────────────────

create table if not exists work_blocks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  owner_user_id uuid not null references auth.users(id),
  day date not null,  -- org-TZ local day; instants derive via dayStartInstant()
  start_minute int not null check (start_minute >= 0 and start_minute < 1440),
  duration_minute int not null check (duration_minute > 0 and duration_minute <= 1440),
  title text not null default 'Work block',
  google_event_id text,
  calendar_event_id uuid references calendar_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_blocks_owner_day_idx
  on work_blocks (org_id, owner_user_id, day);
create index if not exists work_blocks_google_event_idx
  on work_blocks (google_event_id) where google_event_id is not null;

create table if not exists work_block_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  block_id uuid not null references work_blocks(id) on delete cascade,
  task_id uuid not null references ops_tasks(id) on delete cascade,
  position int not null default 0,
  created_at timestamptz not null default now(),
  -- One home at a time; moving a task between blocks is an upsert on task_id.
  unique (task_id)
);

create index if not exists work_block_tasks_block_idx
  on work_block_tasks (block_id, position);

-- ── 4. calendar_prefs ──────────────────────────────────────────────────────

create table if not exists calendar_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references orgs(id),
  day_start_minute int not null default 540
    check (day_start_minute >= 0 and day_start_minute < 1440),   -- 09:00
  day_end_minute int not null default 1020
    check (day_end_minute > 0 and day_end_minute <= 1440),       -- 17:00
  default_block_minute int not null default 60
    check (default_block_minute > 0 and default_block_minute <= 1440),
  updated_at timestamptz not null default now(),
  check (day_end_minute > day_start_minute)
);

-- ── 5. RLS ─────────────────────────────────────────────────────────────────

alter table work_blocks enable row level security;

-- Read: own week, a week delegated to you, or a direct report's week.
drop policy if exists "members read work_blocks" on work_blocks;
create policy "members read work_blocks" on work_blocks
  for select to authenticated
  using (
    (select private.has_permission(org_id, 'ops.read'))
    and (
      owner_user_id = (select auth.uid())
      or exists (
        select 1 from agenda_delegations d
        where d.org_id = work_blocks.org_id
          and d.grantee_user_id = auth.uid()
          and d.grantor_user_id = work_blocks.owner_user_id
      )
      or (select private.manages_user(owner_user_id, org_id))
    )
  );

-- Write: only the owner blocks their own time. Managers and delegates look,
-- never touch (delegated writing is agenda-spec open decision #6).
drop policy if exists "owner writes work_blocks" on work_blocks;
create policy "owner writes work_blocks" on work_blocks
  for all to authenticated
  using (
    (select private.has_permission(org_id, 'ops.write'))
    and owner_user_id = (select auth.uid())
  )
  with check (
    (select private.has_permission(org_id, 'ops.write'))
    and owner_user_id = (select auth.uid())
  );

alter table work_block_tasks enable row level security;

-- Task links ride the block's visibility: the subquery runs under the caller's
-- own work_blocks policies, so whoever can see the block sees its checklist.
drop policy if exists "members read work_block_tasks" on work_block_tasks;
create policy "members read work_block_tasks" on work_block_tasks
  for select to authenticated
  using (
    exists (select 1 from work_blocks b where b.id = work_block_tasks.block_id)
  );

-- Writes require owning the block (not merely seeing it).
drop policy if exists "owner writes work_block_tasks" on work_block_tasks;
create policy "owner writes work_block_tasks" on work_block_tasks
  for all to authenticated
  using (
    (select private.has_permission(org_id, 'ops.write'))
    and exists (
      select 1 from work_blocks b
      where b.id = work_block_tasks.block_id
        and b.owner_user_id = auth.uid()
    )
  )
  with check (
    (select private.has_permission(org_id, 'ops.write'))
    and exists (
      select 1 from work_blocks b
      where b.id = work_block_tasks.block_id
        and b.owner_user_id = auth.uid()
    )
  );

alter table calendar_prefs enable row level security;

-- Prefs are the user's own row, membership-bound. Nobody reads another
-- person's working hours directly; the grid reads a viewed owner's prefs
-- through the server (service role) where the manager/delegation gate is
-- re-asserted in app code.
drop policy if exists "self manages calendar_prefs" on calendar_prefs;
create policy "self manages calendar_prefs" on calendar_prefs
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_org_member(org_id))
  )
  with check (
    user_id = (select auth.uid())
    and (select private.is_org_member(org_id))
  );

-- ── 6. calendar_events: add the manager read arm ───────────────────────────
-- Same policy as create_agenda_delegations_and_calendar_events.sql plus the
-- reports_to arm, so a manager sees a direct report's meetings the way a
-- delegate already can. Write stays service-role only.

drop policy if exists "members read calendar_events" on calendar_events;
create policy "members read calendar_events" on calendar_events
  for select to authenticated
  using (
    (select private.has_permission(org_id, 'ops.read'))
    and (
      owner_user_id = auth.uid()
      or exists (
        select 1 from agenda_delegations d
        where d.org_id = calendar_events.org_id
          and d.grantee_user_id = auth.uid()
          and d.grantor_user_id = calendar_events.owner_user_id
      )
      or (select private.manages_user(owner_user_id, org_id))
    )
  );
