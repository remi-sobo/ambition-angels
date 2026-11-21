-- Seed: notify.operator_emails for Ambition Angels only.
--
-- Pre-SafeSpace item 10. The scheduled jobs that email people
-- (daily-reminders, weekly-digest, meet-reminders) now skip every org that
-- does not hold notify.operator_emails (lib/cron/emailOptIn.ts). The key is
-- new and the entitlement reader treats unknown keys as OFF, so without this
-- row Ambition Angels would get no reminders either. Every other tenant stays
-- opted out until someone decides otherwise.
--
-- Data, not code: AA resolved by slug, no hardcoded org uuid, and a no-op
-- against a database where the org is not present (the RLS scratch DB).

insert into public.org_entitlements (org_id, feature_key, enabled, source)
select o.id, 'notify.operator_emails', true, 'seed:operator_email_optin'
from public.orgs o
where o.slug = 'ambition-angels'
on conflict (org_id, feature_key)
  do update set enabled = true, source = excluded.source, updated_at = now();
