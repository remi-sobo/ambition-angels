-- Seed: aa.hubspot_mirror for AA (tenant one).
-- specs/bloomos-settings-data-sources.md S1 — must be applied BEFORE the code
-- that fences /api/admin/hubspot/sync and /api/admin/data-age behind this key
-- deploys, or AA locks itself out of its own sync.
--
-- The key has been in the FEATURE_KEYS vocabulary since the core fence spec
-- (aa.* flags fence AA's website-coupled surfaces off from other tenants) but
-- was never seeded, because nothing enforced it. Data, not code: AA resolved
-- by slug like the create_org_entitlements seed — no hardcoded org uuid, and a
-- no-op against a DB where the org isn't present (e.g. the RLS scratch DB).
--
-- Apply via the Supabase dashboard. Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

insert into public.org_entitlements (org_id, feature_key, enabled, source)
select o.id, 'aa.hubspot_mirror', true, 'seed:aa_site_fence'
from public.orgs o
where o.slug = 'ambition-angels'
on conflict (org_id, feature_key)
  do update set enabled = true, source = excluded.source, updated_at = now();
