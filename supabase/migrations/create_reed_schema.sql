-- BloomOS / Reed — Phase 4: Ask (read-only) schema. DDL #3.
--
--   reed_activity_log  — append-only trace of every Reed call (tokens, cost,
--                        surface, status), generalized from fr_agent_activity_log.
--   reed_threads       — one conversational thread (a FAB session, or a record-
--                        anchored ask), per org.
--   reed_messages      — the turns within a thread.
--
-- All three are tenant-isolated by construction: org_id NOT NULL, from the
-- session, NO hardcoded default (the trap stays dead). RLS is membership-scoped
-- — any member of the org may read/append their org's Reed rows. The PAID gate
-- (whether Reed runs at all) is the ai.reed entitlement checked in the route;
-- the per-tool data gate is private.has_permission (finance.read, etc.). These
-- tables only need tenant isolation, so membership is the right grain here —
-- the same idiom org_entitlements reads use — not a specific permission string
-- (there is no permission every Reed user holds, and the cost-cap read + log
-- write must work for any role with Reed access).
--
-- Idempotent: create-if-not-exists / drop-and-recreate policies / or-replace fn.
-- Reuses set_updated_at() (create_ops_projects_and_tasks.sql).
-- Apply via the Supabase dashboard. Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

-- ── public.has_permission — RPC shim over private.has_permission ─────────────
-- The app can't call private.* via PostgREST RPC, so Reed's tools need a public
-- entry point to the SAME authority that RLS policies use. SECURITY DEFINER; it
-- delegates verbatim and private.has_permission already scopes to auth.uid(), so
-- a caller can only ever learn about permissions they actually hold.
create or replace function public.has_permission(p_org uuid, p_perm text)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select private.has_permission(p_org, p_perm);
$$;
revoke all on function public.has_permission(uuid, text) from public;
grant execute on function public.has_permission(uuid, text) to authenticated;

-- ── reed_activity_log ───────────────────────────────────────────────────────
create table if not exists public.reed_activity_log (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id),
  created_at     timestamptz not null default now(),
  created_by     text,                    -- actor: a user identifier or 'agent'
  triggered_by   text,                    -- who initiated (user identifier / 'system')
  action_type    text not null default 'ask',
  surface        text,                    -- 'fab' | 'briefing' | 'grant' | ...
  thread_id      uuid,                    -- → reed_threads.id (set after thread exists)
  context_ref    jsonb,                   -- { type, id } the ask was anchored to, if any
  target_id      uuid,
  target_type    text,
  prompt_summary text,
  model_used     text,
  tokens_input   integer,
  tokens_output  integer,
  duration_ms    integer,
  cost_usd       numeric,
  status         text not null check (status in ('success', 'partial', 'failed')),
  error_message  text,
  metadata       jsonb not null default '{}'::jsonb
);
create index if not exists reed_activity_log_org_created_idx
  on public.reed_activity_log (org_id, created_at desc);
create index if not exists reed_activity_log_thread_idx
  on public.reed_activity_log (thread_id);

alter table public.reed_activity_log enable row level security;
-- Append-only: select + insert for members, no update/delete policy.
drop policy if exists "members read reed_activity_log" on public.reed_activity_log;
create policy "members read reed_activity_log" on public.reed_activity_log
  for select to authenticated
  using ( exists (select 1 from public.memberships m
                  where m.user_id = auth.uid() and m.org_id = reed_activity_log.org_id) );
drop policy if exists "members append reed_activity_log" on public.reed_activity_log;
create policy "members append reed_activity_log" on public.reed_activity_log
  for insert to authenticated
  with check ( exists (select 1 from public.memberships m
                       where m.user_id = auth.uid() and m.org_id = reed_activity_log.org_id) );

-- ── reed_threads ────────────────────────────────────────────────────────────
create table if not exists public.reed_threads (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id),
  created_by  text,
  surface     text,
  context_ref jsonb,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists reed_threads_org_updated_idx
  on public.reed_threads (org_id, updated_at desc);

alter table public.reed_threads enable row level security;
drop policy if exists "members use reed_threads" on public.reed_threads;
create policy "members use reed_threads" on public.reed_threads
  for all to authenticated
  using ( exists (select 1 from public.memberships m
                  where m.user_id = auth.uid() and m.org_id = reed_threads.org_id) )
  with check ( exists (select 1 from public.memberships m
                       where m.user_id = auth.uid() and m.org_id = reed_threads.org_id) );

drop trigger if exists reed_threads_set_updated_at on public.reed_threads;
create trigger reed_threads_set_updated_at
  before update on public.reed_threads
  for each row execute function set_updated_at();

-- ── reed_messages ───────────────────────────────────────────────────────────
create table if not exists public.reed_messages (
  id              uuid primary key default gen_random_uuid(),
  thread_id       uuid not null references public.reed_threads(id) on delete cascade,
  org_id          uuid not null references public.orgs(id),
  role            text not null check (role in ('user', 'assistant', 'tool')),
  content         text not null,
  activity_log_id uuid references public.reed_activity_log(id),
  created_at      timestamptz not null default now()
);
create index if not exists reed_messages_thread_idx
  on public.reed_messages (thread_id, created_at);

alter table public.reed_messages enable row level security;
drop policy if exists "members use reed_messages" on public.reed_messages;
create policy "members use reed_messages" on public.reed_messages
  for all to authenticated
  using ( exists (select 1 from public.memberships m
                  where m.user_id = auth.uid() and m.org_id = reed_messages.org_id) )
  with check ( exists (select 1 from public.memberships m
                       where m.user_id = auth.uid() and m.org_id = reed_messages.org_id) );
