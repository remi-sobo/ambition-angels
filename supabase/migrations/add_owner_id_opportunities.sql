-- BloomOS V4: an owner on Pipeline board cards (approved by Remi 2026-11-21).
-- The board's cards are `opportunities` rows, which carried only the free-text
-- `owner` (a first-name handle). This adds the same nullable member owner the
-- Stage B2 migration gave constituents, asks, cohorts and programs
-- (add_owner_id_assignment.sql). Ownership drives "My asks" on the board and
-- Today's "mine"; it never changes who can see a row (RLS is unchanged).
-- Removing a person never deletes their records (on delete set null).
-- The free-text opportunities.owner stays and is shown until owner_id is set.
-- Idempotent.
alter table public.opportunities add column if not exists owner_id uuid references auth.users(id) on delete set null;

create index if not exists opportunities_org_owner_idx on public.opportunities (org_id, owner_id);
