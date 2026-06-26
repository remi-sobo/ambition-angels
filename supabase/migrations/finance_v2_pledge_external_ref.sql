-- Finance v2 (Phase 4b): adopt HubSpot deals into editable Bloom pledges.
--
-- external_ref carries the originating system's id (a hs_deals.deal_id) on the
-- Bloom commitment created when someone "adopts" a HubSpot pledge to edit it.
-- The runway/pledge assembler hides any HubSpot deal whose id already exists as
-- an external_ref, so an adopted deal is counted once (from Bloom), never twice.
--
-- The partial unique index makes "adopt" idempotent per year: a second adopt of
-- the same deal in the same year fails cleanly instead of creating a duplicate.
-- Additive and nullable; reversible by dropping the index then the column.

alter table public.fin_revenue_commitments
  add column if not exists external_ref text null;

create unique index if not exists fin_revenue_commitments_year_external_ref_uq
  on public.fin_revenue_commitments (year, external_ref)
  where external_ref is not null;

comment on column public.fin_revenue_commitments.external_ref is
  'Originating system id (e.g. hs_deals.deal_id) when this pledge was adopted from an external source. The assembler de-dups HubSpot deals against this so adopted deals never double-count.';
