-- Deletion & cleanup (consultant model): money/history is retained, junk is
-- removable. Two additions:
--
-- 1. constituents.archived_at — soft archive. Archived constituents drop out of
--    the working lists/queues but keep all gifts and history; fully reversible.
--    This is the safe path for real donors (hard delete is blocked for anyone
--    with gifts, since gifts.constituent_id is ON DELETE SET NULL and would
--    silently orphan their giving as anonymous).
--
-- 2. fr_prospect_disqualified — a suppression set for the Prospects list, which
--    is a read-only HubSpot mirror keyed by hubspot_id. Disqualifying drops a
--    prospect off the working list without touching the mirror (which would
--    just re-sync); reversible by deleting the row.

alter table constituents add column if not exists archived_at timestamptz;
create index if not exists constituents_archived_idx
  on constituents (archived_at) where archived_at is not null;

create table if not exists fr_prospect_disqualified (
  hubspot_id text primary key,
  org_id uuid references orgs(id),
  reason text,
  disqualified_at timestamptz not null default now(),
  disqualified_by text
);
