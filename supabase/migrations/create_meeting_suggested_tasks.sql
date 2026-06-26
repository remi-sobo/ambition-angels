-- Phase 3: staging table for Reed's proposed follow-ups. Mirrors fr_nba_suggestions.
-- Keeps the ops_tasks execution-status scale clean: nothing becomes a live task
-- until a human accepts. Reed never writes a live task silently.

create table if not exists public.meeting_suggested_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  meeting_record_id uuid not null references public.meeting_records(id) on delete cascade,
  suggested_title text not null,
  suggested_category text,
  suggested_entity_type text check (suggested_entity_type in ('partner','constituent')),
  suggested_entity_id uuid,
  status text not null default 'pending' check (status in ('pending','accepted','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meeting_suggested_tasks_meeting_idx
  on public.meeting_suggested_tasks (meeting_record_id);
create index if not exists meeting_suggested_tasks_status_idx
  on public.meeting_suggested_tasks (status);

alter table public.meeting_suggested_tasks enable row level security;

-- Visible to whoever can see the parent meeting (same owner-or-grantee gate).
drop policy if exists "members read meeting_suggested_tasks" on public.meeting_suggested_tasks;
create policy "members read meeting_suggested_tasks" on public.meeting_suggested_tasks
  for select using (
    private.has_permission(org_id, 'ops.read')
    and exists (
      select 1 from public.meeting_records m
      where m.id = meeting_suggested_tasks.meeting_record_id
        and (
          m.owner_user_id = auth.uid()
          or exists (
            select 1 from public.agenda_delegations d
            where d.org_id = m.org_id
              and d.grantee_user_id = auth.uid()
              and d.grantor_user_id = m.owner_user_id
          )
        )
    )
  );
