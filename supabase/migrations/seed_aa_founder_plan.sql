-- Founder plan for Ambition Angels (specs/bloomos-repo-split.md §6e).
--
-- Ambition Angels was BloomOS's first user and keeps it free forever. That
-- promise lives here, as data on the org row, so it outlasts memory and code:
--
--   settings.plan              'founder'
--   settings.billing_exempt    true. When billing ships it must read this and
--                              skip the org. The billing spec names it.
--   settings.website_admin_url where the "Website admin" sidebar link points.
--                              The link only shows once the org also holds
--                              aa.site_admin, which is seeded with the website
--                              admin itself (phase 2c), so nobody gets a link
--                              to a page that doesn't exist yet.
--
-- Also turns on aa.site_signals (website numbers into BloomOS metrics).
-- Harmless until the site-signals cron ships (phase 2f).
--
-- Data, not code: AA resolved by slug, no hardcoded org uuid, and a no-op
-- against a database where the org is not present (the RLS scratch DB).
-- Re-runnable: settings merge with ||, entitlements upsert.

update public.orgs
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
      'plan', 'founder',
      'billing_exempt', true,
      'website_admin_url', 'https://www.ambitionangels.org/admin'
    ),
    updated_at = now()
where slug = 'ambition-angels';

insert into public.org_entitlements (org_id, feature_key, enabled, source)
select o.id, 'aa.site_signals', true, 'seed:aa_founder_plan'
from public.orgs o
where o.slug = 'ambition-angels'
on conflict (org_id, feature_key)
  do update set enabled = true, source = excluded.source, updated_at = now();
