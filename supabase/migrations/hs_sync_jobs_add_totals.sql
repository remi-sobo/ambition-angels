-- Migration: hs_sync_jobs.totals — the denominator for "X of Y synced".
--
-- The sync UI could previously only show `counts` (records processed so
-- far this run) with nothing to compare it against — HubSpot's paginated
-- list endpoints never report a grand total. `totals` holds a one-time
-- snapshot (per step) taken from HubSpot's search endpoint when the job is
-- created, in the same shape as `counts`. Nullable: a failed totals lookup
-- must never block the sync itself, so the UI falls back to showing counts
-- alone when this is null.
--
-- Idempotent.

alter table hs_sync_jobs add column if not exists totals jsonb;
