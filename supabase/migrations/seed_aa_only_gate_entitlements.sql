-- Seed: aa.career_library and aa.strategy_room for Ambition Angels.
--
-- The pre-SafeSpace fence (lib/admin/aaOnly.ts) gates the career library and
-- teen games admin on aa.career_library, and session access to /strategy on
-- aa.strategy_room. Both keys are new. The entitlement reader treats unknown
-- keys as OFF, so this must be applied BEFORE the fence deploys, or Ambition
-- Angels staff lose the Career Library pages until it is.
--
-- Data, not code: AA resolved by slug, no hardcoded org uuid, and a no-op
-- against a database where the org is not present (the RLS scratch DB).

insert into public.org_entitlements (org_id, feature_key, enabled, source)
select o.id, k.feature_key, true, 'seed:aa_only_gates'
from public.orgs o
cross join (values ('aa.career_library'), ('aa.strategy_room')) as k(feature_key)
where o.slug = 'ambition-angels'
on conflict (org_id, feature_key)
  do update set enabled = true, source = excluded.source, updated_at = now();
