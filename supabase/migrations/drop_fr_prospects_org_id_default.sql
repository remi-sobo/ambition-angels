-- Drop the hardcoded org_id default on fr_prospects.
--
-- create_fr_prospects.sql gave fr_prospects.org_id a hardcoded AA default, so
-- any insert that omitted org_id silently landed in AA — the "org_id default
-- trap" (same class as drop_households_org_id_default.sql). Every insert path
-- now sets org_id explicitly from session context (prospects/add,
-- prospects/import, the by-hubspot page), so the default is no longer
-- load-bearing and a missing org_id should fail loudly rather than route
-- another tenant's prospect onto AA's bench.
--
-- Column stays NOT NULL — that's the point. Reversible:
--   alter table public.fr_prospects
--     alter column org_id set default '17c75da8-082d-4c8f-b00b-a4100fb2eb22';

alter table public.fr_prospects alter column org_id drop default;
