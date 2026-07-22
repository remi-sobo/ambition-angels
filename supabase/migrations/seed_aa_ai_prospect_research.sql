-- Seed: ai.prospect_research for AA (tenant one).
-- Must be applied BEFORE the code that fences the fundraising agent routes
-- (research, discover) behind this key deploys, or AA locks itself out of its
-- own prospect research. ai.reed is already seeded by create_org_entitlements
-- (seed:bloom_flourish), so the ai.reed-gated routes (NBA, next-move) are safe.
--
-- The key has been in the FEATURE_KEYS vocabulary since the core fence spec
-- and already fences the prospects UI (FeatureGate), but until now no API
-- route enforced it. Data, not code: AA resolved by slug like the
-- create_org_entitlements seed — no hardcoded org uuid, and a no-op against a
-- DB where the org isn't present (e.g. the RLS scratch DB).
--
-- Apply via the Supabase dashboard. Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

insert into public.org_entitlements (org_id, feature_key, enabled, source)
select o.id, 'ai.prospect_research', true, 'seed:grow_tier'
from public.orgs o
where o.slug = 'ambition-angels'
on conflict (org_id, feature_key)
  do update set enabled = true, source = excluded.source, updated_at = now();
