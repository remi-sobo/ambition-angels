-- Reed "next move" per constituent/prospect: persist the latest suggestion so
-- profile pages can show it without re-running the agent on every load, and so
-- follow-through (task created / dismissed) is measurable — same lifecycle
-- philosophy as fr_nba_suggestions, but keyed to a person instead of an
-- opportunity, and carrying the drafted email in the payload.
--
-- Lifecycle: a generate run inserts a 'suggested' row and supersedes any
-- still-'suggested' row for the same entity. Making the task → 'applied';
-- Dismiss → 'dismissed'. History is kept.

create table if not exists reed_next_moves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  entity_type text not null check (entity_type in ('constituent','fr_prospects')),
  entity_id uuid not null,
  action text not null,
  rationale text,
  channel text,
  due_in_days int,
  email_subject text,
  email_body text,
  model_used text,
  cost_usd numeric,
  generated_by text,
  status text not null default 'suggested'
    check (status in ('suggested','applied','dismissed','superseded')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);

create index if not exists reed_next_moves_entity_idx
  on reed_next_moves (entity_type, entity_id, status, created_at desc);

-- RLS from day one (fundraising domain, same shape as fr_nba_suggestions).
alter table public.reed_next_moves enable row level security;

drop policy if exists "members read reed_next_moves" on public.reed_next_moves;
create policy "members read reed_next_moves" on public.reed_next_moves
  for select to authenticated
  using ( (select private.has_permission(org_id, 'fundraising.read')) );

drop policy if exists "members write reed_next_moves" on public.reed_next_moves;
create policy "members write reed_next_moves" on public.reed_next_moves
  for all to authenticated
  using ( (select private.has_permission(org_id, 'fundraising.write')) )
  with check ( (select private.has_permission(org_id, 'fundraising.write')) );
