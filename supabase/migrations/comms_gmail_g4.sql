-- Comms v2.2 Phase G4 (specs/comms-v2-gmail-amendment.md): safety nets.
--
-- Stuck-send alarm: the worker tells an org's admins (in BloomOS and by
-- email) when a campaign is still sending after 24 hours, or when the org's
-- sender is broken while emails wait. Each alarm fires once per day at most;
-- these columns remember when it last did.
--
-- Copy to leadership: a short per-org list of addresses that get a copy of
-- every campaign once it finishes sending.
--
-- Apply BEFORE the G4 code deploy.

alter table email_campaigns add column if not exists stuck_alerted_at timestamptz;
alter table email_campaigns add column if not exists leadership_copied_at timestamptz;

alter table org_comms_settings add column if not exists leadership_copy_emails text[] not null default '{}';
alter table org_comms_settings add column if not exists blocked_alerted_at timestamptz;

-- Campaigns that finished before G4 aren't copied retroactively.
update email_campaigns
   set leadership_copied_at = coalesce(finished_at, sent_at, now())
 where status in ('sent', 'canceled') and leadership_copied_at is null;
