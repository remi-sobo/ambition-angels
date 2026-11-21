-- BloomOS V4 Stage B2: assignment (spec section 12, decision 3; approved by Remi 2026-11-21).
-- A nullable owner on donors and funders, asks, cohorts and programs. Ownership
-- drives "mine" views and Today panels; it does not change who can see a row
-- (RLS is unchanged). Removing a person never deletes their records.
-- The free-text asks.owner stays and is shown until owner_id is set.
alter table public.constituents add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.asks         add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.cohorts      add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.programs     add column if not exists owner_id uuid references auth.users(id) on delete set null;

create index if not exists constituents_org_owner_idx on public.constituents (org_id, owner_id);
create index if not exists asks_org_owner_idx         on public.asks (org_id, owner_id);
create index if not exists cohorts_org_owner_idx      on public.cohorts (org_id, owner_id);
create index if not exists programs_org_owner_idx     on public.programs (org_id, owner_id);
