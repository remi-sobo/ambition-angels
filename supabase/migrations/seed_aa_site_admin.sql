-- aa.site_admin for Ambition Angels (specs/bloomos-repo-split.md §6e item 4).
--
-- Turns on the "Website admin" sidebar link, which points at
-- orgs.settings.website_admin_url (seed_aa_founder_plan.sql). Seeded with the
-- website admin itself, so the link never pointed at a page that wasn't
-- there. Careers and Analytics left the BloomOS nav in the same change.
--
-- Data, not code: AA by slug, no hardcoded uuid, a no-op on the RLS scratch DB.

insert into public.org_entitlements (org_id, feature_key, enabled, source)
select o.id, 'aa.site_admin', true, 'seed:aa_site_admin'
from public.orgs o
where o.slug = 'ambition-angels'
on conflict (org_id, feature_key)
  do update set enabled = true, source = excluded.source, updated_at = now();
