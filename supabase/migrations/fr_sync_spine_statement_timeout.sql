-- fr_sync_hubspot_to_spine: allow up to 60s.
--
-- The HubSpot sync calls this through PostgREST, whose authenticator role caps
-- statements at 8s. The projection now takes 4 to 12s (pg_stat_statements:
-- mean 3.5s, max 11.8s), so the 2026-11-23 run timed out twice and the
-- spine (constituents / opportunities / gifts) was not refreshed. PostgREST
-- applies a function's own statement_timeout setting when it calls it.
--
-- Applied to production 2026-11-24. Idempotent.

alter function public.fr_sync_hubspot_to_spine() set statement_timeout = '60s';
