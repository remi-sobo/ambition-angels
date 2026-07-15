-- Metric Catalog — Phase 5: retire kpi_settings / kpi_snapshots
-- (specs: BloomOS V3 #3, open decision A — approved).
--
-- Phase 0 recon found these were NOT reader-free as the spec assumed: the old
-- /admin/kpis page read both, /api/admin/kpis/[metric_key] wrote settings,
-- and lib/kpis.snapshotKpis wrote snapshots from the Monday digest cron
-- (silently failing — the table stayed at 0 rows). Every one of those code
-- paths was removed in Phase 4/5 of this spec:
--   - /admin/kpis rebuilt on metric_definitions + metric_snapshots,
--   - the settings route and TargetEditor deleted,
--   - snapshotKpis deleted and the digest call removed.
-- Zero readers re-confirmed against the merged code before this drop.
--
-- Both tables were empty (0 rows), and kpi_settings carried the hardcoded AA
-- org_id default — this drop removes a live instance of the tenant-default
-- trap (also removed from the ratchet baseline in
-- supabase/tests/tenant-default-ratchet.sql).
--
-- Reversible: create_kpis_and_plan.sql still holds the definitions if they
-- are ever needed again (they won't be — the catalog is the registry now).

drop table if exists public.kpi_snapshots;
drop table if exists public.kpi_settings;
