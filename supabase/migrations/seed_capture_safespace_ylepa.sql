-- Seed: ai.capture (Talk to log) on for SafeSpace and Young Life EPA
-- (approved by Remi 2026-11-21).
--
-- Same shape as the ai.capture seed in capture_tables.sql: data, not code,
-- orgs resolved by slug (no hardcoded uuid), and a no-op against a database
-- where the slugs are absent (the RLS scratch DB). The slugs are the ones
-- production reported for both tenants (seed_pledged_stage_flag.MANUAL.sql's
-- verify query, 2026-09-16: safespace, young-life-epa), matching
-- specs/younglife-epa-tenant-onboarding.md and the migration runbook's
-- SafeSpace seed.
--
-- Apply AFTER capture_use_permission.sql, so finance and board members in
-- these orgs get Talk to log from day one. Idempotent (upsert).

insert into public.org_entitlements (org_id, feature_key, enabled, source)
select o.id, 'ai.capture', true, 'seed:capture_safespace_ylepa'
from public.orgs o
where o.slug in ('safespace', 'young-life-epa')
on conflict (org_id, feature_key)
  do update set enabled = true, source = excluded.source, updated_at = now();
