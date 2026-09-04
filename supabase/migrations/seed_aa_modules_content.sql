-- Seed: modules.content for AA (tenant one). Spec B, stage B1.
--
-- The career library's nav entry was gated on aa.quiz — a V1 error (the quiz
-- and the career library are different products). B1 gives content production
-- its own key, modules.content, which also becomes the gate for V2's
-- Programs → Content tab. Default off for new tenants; only orgs that manage
-- curriculum hold it.
--
-- Must be applied BEFORE the B1 nav change deploys, or AA's Career Library
-- sidebar row disappears until it is (the entitlement reader treats unknown
-- keys as OFF, by design).
--
-- Data, not code: AA resolved by slug like the create_org_entitlements seed —
-- no hardcoded org uuid, and a no-op against a DB where the org isn't present
-- (e.g. the RLS scratch DB).
--
-- Apply via the Supabase dashboard. Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

insert into public.org_entitlements (org_id, feature_key, enabled, source)
select o.id, 'modules.content', true, 'seed:spec_b_b1'
from public.orgs o
where o.slug = 'ambition-angels'
on conflict (org_id, feature_key)
  do update set enabled = true, source = excluded.source, updated_at = now();
