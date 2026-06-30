-- BloomOS — unified AI call ledger.
--
-- One append-only, per-org row for every model call across the whole app
-- (Reed, funder research, briefing, acknowledgments, ...), so spend can be read
-- in one place instead of from per-agent silos (reed_activity_log,
-- fr_agent_activity_log). Those silos stay as-is; this ledger is written
-- additively beside them and becomes the single source for a per-org spend
-- view and a global monthly backstop.
--
-- Tenant isolation by construction: org_id NOT NULL, from the session, NO
-- hardcoded default (the org_id-default trap stays dead). RLS is
-- membership-scoped and append-only — any member of the org may read and append
-- their org's rows; nobody updates or deletes. This mirrors reed_activity_log
-- (create_reed_schema.sql) verbatim; see that file for the rationale.
--
-- Idempotent: create-if-not-exists / drop-and-recreate policies.
-- Apply via the Supabase dashboard. Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

create table if not exists public.ai_calls (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id),
  created_at     timestamptz not null default now(),
  surface        text not null,                 -- 'reed' | 'funder_research' | 'briefing' | 'acknowledgment' | ...
  triggered_by   text,                          -- user identifier / 'agent' / 'system'
  model_used     text,
  tokens_input   integer not null default 0,
  tokens_output  integer not null default 0,
  cost_usd       numeric  not null default 0,
  status         text not null default 'success' check (status in ('success', 'partial', 'failed')),
  metadata       jsonb not null default '{}'::jsonb
);

-- month-to-date sum per org (the cap read), and per-surface breakdown
create index if not exists ai_calls_org_created_idx
  on public.ai_calls (org_id, created_at desc);
create index if not exists ai_calls_org_surface_created_idx
  on public.ai_calls (org_id, surface, created_at desc);

alter table public.ai_calls enable row level security;

-- Append-only: select + insert for members, no update/delete policy.
drop policy if exists "members read ai_calls" on public.ai_calls;
create policy "members read ai_calls" on public.ai_calls
  for select to authenticated
  using ( exists (select 1 from public.memberships m
                  where m.user_id = auth.uid() and m.org_id = ai_calls.org_id) );

drop policy if exists "members append ai_calls" on public.ai_calls;
create policy "members append ai_calls" on public.ai_calls
  for insert to authenticated
  with check ( exists (select 1 from public.memberships m
                       where m.user_id = auth.uid() and m.org_id = ai_calls.org_id) );

-- ── rollback ──────────────────────────────────────────────
-- drop table public.ai_calls cascade;
