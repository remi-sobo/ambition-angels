-- BloomOS / Reed — Phase 6: cross-module next-best-action.
--
-- The existing NBA (fr_nba_suggestions) is fundraising-only — its rows hang off
-- opportunity_id/constituent_id. reed_suggestions generalizes the propose-decide
-- shape (suggested -> accepted/dismissed, with who/when) to ANY module, so Reed
-- can surface "the next best thing to do" in finance, program, ops, compliance,
-- or board work, not just fundraising.
--
-- A suggestion is INERT, like a draft: proposing one recommends an action, it
-- never performs it. A human accepts or dismisses; executing an accepted action
-- is Phase 7 (gated, confirmed writes). The per-domain WRITE permission is
-- enforced in the propose_next_best_action tool before the row is written.
--
-- RLS membership-scoped, consistent with the other reed_* tables. Reuses
-- set_updated_at(). Idempotent. Apply via the dashboard (kzzdtibbwsucloaoqpqa).

create table if not exists public.reed_suggestions (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs(id),
  domain             text not null check (domain in ('program', 'fundraising', 'finance', 'ops', 'board', 'compliance')),
  title              text not null,
  rationale          text,
  priority           text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  target_type        text,
  target_id          text,
  status             text not null default 'suggested' check (status in ('suggested', 'accepted', 'dismissed')),
  decided_by         text,
  decided_at         timestamptz,
  created_by         text,
  source_activity_id uuid references public.reed_activity_log(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists reed_suggestions_org_status_idx on public.reed_suggestions (org_id, status, priority);
create index if not exists reed_suggestions_domain_idx on public.reed_suggestions (domain);

alter table public.reed_suggestions enable row level security;
drop policy if exists "members use reed_suggestions" on public.reed_suggestions;
create policy "members use reed_suggestions" on public.reed_suggestions
  for all to authenticated
  using ( exists (select 1 from public.memberships m
                  where m.user_id = auth.uid() and m.org_id = reed_suggestions.org_id) )
  with check ( exists (select 1 from public.memberships m
                       where m.user_id = auth.uid() and m.org_id = reed_suggestions.org_id) );

drop trigger if exists reed_suggestions_set_updated_at on public.reed_suggestions;
create trigger reed_suggestions_set_updated_at
  before update on public.reed_suggestions
  for each row execute function set_updated_at();
