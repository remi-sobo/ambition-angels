-- Phase 2 — persist next-best-action suggestions so they survive reloads and we
-- can measure follow-through (how many suggested moves the operator actually
-- applied vs. dismissed). The agent stays the source of the text; this just
-- records each suggestion and its disposition.
--
-- Lifecycle: a "Suggest" run inserts rows as 'suggested'. Re-running supersedes
-- any still-'suggested' row for the same opportunity (so the open list never
-- duplicates), while applied/dismissed rows are kept as history. Apply →
-- 'applied' (and the opportunity's next_step is set via its own route);
-- Dismiss → 'dismissed'.

create table if not exists fr_nba_suggestions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  constituent_id uuid references constituents(id) on delete set null,
  batch_id uuid not null,
  priority int,
  action text not null,
  rationale text,
  channel text,
  suggested_due date,
  status text not null default 'suggested'
    check (status in ('suggested','applied','dismissed','superseded')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);

create index if not exists fr_nba_suggestions_status_idx
  on fr_nba_suggestions (status, priority);
create index if not exists fr_nba_suggestions_opp_idx
  on fr_nba_suggestions (opportunity_id);
