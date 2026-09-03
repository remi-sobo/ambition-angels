-- fr_prospect family hardening (docs/constituent-dedupe-report.md §7).
-- Two gaps in one pass:
--
--   1. Missing FKs: fr_prospects.constituent_id and
--      fr_prospect_promoted.constituent_id reference constituents(id) by
--      convention only — no constraint. (fr_prospect_promoted.org_id also
--      lacked its orgs FK.)
--   2. fr_prospect_promoted.org_id and fr_prospect_disqualified.org_id are
--      nullable, unlike every other org_id-carrying tenant table. Both tables
--      are RLS-scoped by org_id (rls_reed_phase1_four_tables.sql), so a row
--      inserted with NULL org_id is invisible to every tenant, its owner
--      included. NOT NULL makes that insert fail loudly instead. No default
--      is added — the tenant-default ratchet forbids it; writers must be
--      org-explicit.
--
-- Verified against production 2026-09-03 before writing: zero NULL org_id
-- rows in either table, zero orphaned constituent_id values — the
-- constraints can go straight on. Ordered after
-- rls_reed_phase1_four_tables.sql, which backfills historical NULL org_ids,
-- so the chain replays cleanly on a scratch database too.
--
-- Idempotent: FK adds are guarded on pg_constraint; SET NOT NULL re-applies
-- harmlessly.

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'fr_prospects_constituent_id_fkey') then
    alter table public.fr_prospects
      add constraint fr_prospects_constituent_id_fkey
      foreign key (constituent_id) references constituents(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint
                 where conname = 'fr_prospect_promoted_constituent_id_fkey') then
    alter table public.fr_prospect_promoted
      add constraint fr_prospect_promoted_constituent_id_fkey
      foreign key (constituent_id) references constituents(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint
                 where conname = 'fr_prospect_promoted_org_id_fkey') then
    alter table public.fr_prospect_promoted
      add constraint fr_prospect_promoted_org_id_fkey
      foreign key (org_id) references orgs(id);
  end if;
end $$;

alter table public.fr_prospect_promoted    alter column org_id set not null;
alter table public.fr_prospect_disqualified alter column org_id set not null;
