-- Reed for strategy — Phase B: inert OGSM proposals.
--
-- reed_plan_proposals holds elements Reed PROPOSES for the plan — objectives,
-- goals, initiatives, KPIs — for the operator to edit, accept, or dismiss. A
-- proposal is INERT: creating or accepting one never writes plan_*. Applying an
-- accepted proposal into the real plan is Phase D (a gated, human-initiated
-- write). parent_ref ladders a child to a real parent ({type, id} from
-- get_strategy_plan) or another proposal; payload carries the level's fields.
--
-- Membership-scoped RLS, consistent with the other reed_* tables. The per-element
-- WRITE permission (org.manage — the plan is leadership-owned) is enforced in the
-- propose_plan_element tool before the row is written. Reuses set_updated_at().
-- Idempotent. Apply via the dashboard (kzzdtibbwsucloaoqpqa).

create table if not exists public.reed_plan_proposals (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs(id),
  proposed_type      text not null check (proposed_type in ('objective', 'goal', 'initiative', 'kpi')),
  parent_ref         jsonb,                  -- { type, id } — real parent or another proposal
  payload            jsonb not null,         -- the fields for that level (title, target, owner, …)
  rationale          text,
  status             text not null default 'proposed' check (status in ('proposed', 'accepted', 'dismissed')),
  created_by         text,
  decided_by         text,
  decided_at         timestamptz,
  source_activity_id uuid references public.reed_activity_log(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists reed_plan_proposals_org_status_idx on public.reed_plan_proposals (org_id, status);

alter table public.reed_plan_proposals enable row level security;
drop policy if exists "members use reed_plan_proposals" on public.reed_plan_proposals;
create policy "members use reed_plan_proposals" on public.reed_plan_proposals
  for all to authenticated
  using ( exists (select 1 from public.memberships m
                  where m.user_id = auth.uid() and m.org_id = reed_plan_proposals.org_id) )
  with check ( exists (select 1 from public.memberships m
                       where m.user_id = auth.uid() and m.org_id = reed_plan_proposals.org_id) );

drop trigger if exists reed_plan_proposals_set_updated_at on public.reed_plan_proposals;
create trigger reed_plan_proposals_set_updated_at
  before update on public.reed_plan_proposals
  for each row execute function set_updated_at();
