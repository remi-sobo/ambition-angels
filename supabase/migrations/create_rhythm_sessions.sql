-- BloomOS / Operating Rhythm v2 — Phase 1: the session artifact. DDL #1.
--
--   rhythm_sessions — one row per run of the weekly ritual (Monday "Plan" or
--                     Friday "Close"). Records what the run touched (stats),
--                     the close-out checklist, a note to next week, and when it
--                     was started/completed. The wizard reads/writes one row,
--                     keyed to (org, user, kind, week).
--
-- Tenant-isolated by construction: org_id NOT NULL, set from the SESSION
-- context (getOrgContext().orgId), with NO hardcoded default. This is the
-- deliberate departure from the legacy tenant tables (ops_tasks, ops_projects,
-- …) where add_org_id_to_tenant_tables.sql set an Ambition-Angels org default
-- that silently routes defaulted inserts into AA — the exact trap this table
-- must not repeat. The insert path supplies org_id explicitly; if it ever
-- doesn't, the NOT NULL fails loudly rather than mis-filing tenant-two data.
--
-- user_id is a bare uuid (no FK into auth.users), matching the
-- calendar_events.owner_user_id / meeting_records.owner_user_id convention —
-- it is the auth.uid() of whoever ran the ritual. Org-wide vs own-slice
-- filtering (owner/admin see the org, staff see their own) is done in app code
-- via the lens, not in RLS; RLS only gates by the ops permission on org_id,
-- the same grain ops_tasks/ops_projects use.
--
-- RLS: permission-gated on the 'ops' domain (this is ops work) —
--   select  → private.has_permission(org_id, 'ops.read')
--   insert  → private.has_permission(org_id, 'ops.write')
--   update  → private.has_permission(org_id, 'ops.write')
-- wrapped as (select private.has_permission(...)) for initplan caching, and
-- for <op> to authenticated, per the house idiom (create_bloomos_core.sql,
-- enable_rls_per_domain.sql). No delete policy: sessions are an append-and-
-- complete record, not deleted in the normal flow.
--
-- Idempotent: create-if-not-exists / drop-and-recreate policies.
-- Reuses set_updated_at() (create_ops_projects_and_tasks.sql).
-- Apply via the Supabase dashboard. Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

-- ── rhythm_sessions ─────────────────────────────────────────────────────────
create table if not exists public.rhythm_sessions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id),   -- from session; NO default
  user_id       uuid not null,                              -- auth.uid() of the runner
  kind          text not null check (kind in ('monday_plan','friday_close')),
  week_of       date not null,                              -- canonical Monday (mondayOf)
  status        text not null default 'in_progress'
                  check (status in ('in_progress','completed')),
  checklist     jsonb not null default '{}'::jsonb,
  stats         jsonb not null default '{}'::jsonb,         -- {planned, rolled_over, completed, …}
  notes         text,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, user_id, kind, week_of)
);

-- Hub/verdict reads "this user's run for this week"; the unique index above
-- already covers (org_id, user_id, kind, week_of). A week-scoped lookup for the
-- org-wide lens (owner/admin) benefits from (org_id, week_of).
create index if not exists rhythm_sessions_org_week_idx
  on public.rhythm_sessions (org_id, week_of desc);

alter table public.rhythm_sessions enable row level security;

drop policy if exists "ops readers read rhythm_sessions" on public.rhythm_sessions;
create policy "ops readers read rhythm_sessions" on public.rhythm_sessions
  for select to authenticated
  using ( (select private.has_permission(org_id, 'ops.read')) );

drop policy if exists "ops writers insert rhythm_sessions" on public.rhythm_sessions;
create policy "ops writers insert rhythm_sessions" on public.rhythm_sessions
  for insert to authenticated
  with check ( (select private.has_permission(org_id, 'ops.write')) );

drop policy if exists "ops writers update rhythm_sessions" on public.rhythm_sessions;
create policy "ops writers update rhythm_sessions" on public.rhythm_sessions
  for update to authenticated
  using ( (select private.has_permission(org_id, 'ops.write')) )
  with check ( (select private.has_permission(org_id, 'ops.write')) );

drop trigger if exists rhythm_sessions_set_updated_at on public.rhythm_sessions;
create trigger rhythm_sessions_set_updated_at
  before update on public.rhythm_sessions
  for each row execute function set_updated_at();
