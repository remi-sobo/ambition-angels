-- Per-org operational settings (tenant-neutral defaults follow-on).
--
-- First setting: default_steward — the first-name handle of the person who
-- works the stewardship/acknowledgment queue (thank-you tasks, thankathon
-- batches, milestone touches). This was hardcoded to tenant one's ops lead
-- ('shannon'); the resolver (lib/fundraising/steward.ts) now reads this row
-- and falls back to the org owner's handle for orgs that haven't set one.
--
-- Service-path only for now (RLS enabled, no policies = deny-all), matching
-- the connections table: every consumer runs on the service-role client. A
-- settings UI can add member read / owner write policies later.

create table if not exists org_settings (
  org_id          uuid primary key references orgs(id) on delete cascade,
  default_steward text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table org_settings enable row level security;

-- Preserve tenant one's behavior: its steward has always been Shannon. Keyed
-- by slug (the same anchor getResidentOrgId uses), no-op on databases where
-- the org doesn't exist (e.g. the CI throwaway Postgres).
insert into org_settings (org_id, default_steward)
select id, 'shannon' from orgs where slug = 'ambition-angels'
on conflict (org_id) do nothing;
