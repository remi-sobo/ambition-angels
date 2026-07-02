-- Comms v2 Phase 1 (specs/comms-v2-mail-merge.md): compliance floor tables.
--
-- org_comms_settings — per-org sending identity (from, reply-to, mailing
-- address, footer, daily cap). Replaces the hardcoded from-address constant.
-- email_suppressions — org-scoped, email-channel-specific opt-out list,
-- written by the public unsubscribe endpoint (service role) and, from
-- Phase 2, by bounce/complaint webhooks. Separate from do_not_contact,
-- which stays the human, all-channel CRM flag.
--
-- Apply this file BEFORE the Phase 1 code deploy. The companion
-- comms_v2_phase1_default_drops.sql applies AFTER the deploy is verified.
-- Neither table carries an org_id default (the org_id trap).

create extension if not exists citext;

create table if not exists org_comms_settings (
  org_id uuid primary key references orgs(id),
  from_name text not null default '',
  from_email text not null default '',
  reply_to text,
  mailing_address text not null default '',
  footer_text text,
  daily_send_cap int not null default 2000 check (daily_send_cap > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists email_suppressions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  email citext not null,
  reason text not null check (reason in ('unsubscribed','hard_bounce','complaint','manual')),
  source_campaign_id uuid references email_campaigns(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);
create index if not exists email_suppressions_org_idx on email_suppressions (org_id);

do $$
declare
  aa uuid;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    raise exception 'ambition-angels org not found — run create_bloomos_core first';
  end if;

  execute 'drop trigger if exists org_comms_settings_set_updated_at on org_comms_settings';
  execute 'create trigger org_comms_settings_set_updated_at before update on org_comms_settings for each row execute function set_updated_at()';

  -- Settings: any fundraising reader can see them (send paths need them);
  -- only org managers may change the sending identity.
  execute 'alter table public.org_comms_settings enable row level security';
  execute 'drop policy if exists "members read org_comms_settings" on public.org_comms_settings';
  execute $p$
    create policy "members read org_comms_settings" on public.org_comms_settings
      for select to authenticated
      using ( (select private.has_permission(org_id, 'fundraising.read')) )
  $p$;
  execute 'drop policy if exists "managers write org_comms_settings" on public.org_comms_settings';
  execute $p$
    create policy "managers write org_comms_settings" on public.org_comms_settings
      for all to authenticated
      using ( (select private.has_permission(org_id, 'org.manage')) )
      with check ( (select private.has_permission(org_id, 'org.manage')) )
  $p$;

  -- Suppressions: fundraising read/write for the session paths (resolver,
  -- manual suppression). The public unsubscribe endpoint writes via the
  -- service-role client, which bypasses RLS — no anon policy on purpose.
  execute 'alter table public.email_suppressions enable row level security';
  execute 'drop policy if exists "members read email_suppressions" on public.email_suppressions';
  execute $p$
    create policy "members read email_suppressions" on public.email_suppressions
      for select to authenticated
      using ( (select private.has_permission(org_id, 'fundraising.read')) )
  $p$;
  execute 'drop policy if exists "members write email_suppressions" on public.email_suppressions';
  execute $p$
    create policy "members write email_suppressions" on public.email_suppressions
      for all to authenticated
      using ( (select private.has_permission(org_id, 'fundraising.write')) )
      with check ( (select private.has_permission(org_id, 'fundraising.write')) )
  $p$;

  -- Seed AA's row from the values that were hardcoded before this migration
  -- (open decision A may replace the from address later — that's an UPDATE,
  -- not code). Idempotent: never clobbers an edited row.
  insert into org_comms_settings (org_id, from_name, from_email, reply_to, mailing_address, footer_text)
  values (
    aa,
    'Ambition Angels',
    'careers@mail.ambitionangels.org',
    null,
    '380 Portage Ave, Palo Alto, CA 94306',
    'EIN 87-2513010'
  )
  on conflict (org_id) do nothing;
end $$;
