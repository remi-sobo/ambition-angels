-- Comms v2.2 Phase G1 (specs/comms-v2-gmail-amendment.md): send from each
-- org's own Gmail.
--
-- org_comms_settings.transport picks how an org's campaign email leaves:
--   'gmail'  - the Gmail API as the org's connected Google account
--              (connections row, provider 'google_gmail'). The default for
--              every new org.
--   'resend' - the existing Resend path from org_comms_settings.from_email.
--              Ambition Angels stays here until it connects a Gmail account;
--              connecting flips it to 'gmail'.
--
-- The Gmail refresh token itself lives in `connections` (service-path only,
-- encrypted by lib/crypto/secret-box.ts), so no new table and no new policy.
--
-- Apply BEFORE the G1 code deploy: loadOrgCommsSettings selects this column.

alter table org_comms_settings
  add column if not exists transport text not null default 'gmail';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'org_comms_settings_transport_check'
  ) then
    alter table org_comms_settings
      add constraint org_comms_settings_transport_check
      check (transport in ('gmail', 'resend'));
  end if;
end $$;

-- Keep every existing row on the path it already uses (Ambition Angels'
-- Resend identity), so nothing changes until an org connects Gmail.
-- Idempotent: only rows that still hold the column default and a configured
-- Resend from address, and that have no Gmail connection, are moved.
update org_comms_settings s
   set transport = 'resend'
 where s.transport = 'gmail'
   and s.from_email <> ''
   and not exists (
     select 1 from connections c
      where c.org_id = s.org_id and c.provider = 'google_gmail' and c.status = 'active'
   );
