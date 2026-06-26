-- Phase 3: partner-side meeting dedup. partner_interactions lacked the external
-- keys that interactions already has; add them so a matched meeting upserts once
-- per partner. Additive, nullable, dormant until the meeting matcher writes them.

alter table public.partner_interactions
  add column if not exists external_source text,
  add column if not exists external_id text;

-- Non-partial so the meeting matcher's PostgREST upsert can target it (a partial
-- index can't be inferred by ON CONFLICT). NULL external_id rows stay distinct.
create unique index if not exists partner_interactions_external_idx
  on public.partner_interactions (org_id, external_source, external_id, partner_id);
