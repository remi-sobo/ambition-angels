-- BloomOS / Reed — Phase 1: RLS safety on the formerly-RLS-off tables.
--
--   fr_prospects, fr_nba_suggestions, gmail_sync_jobs, fin_reconciliation_items
--   (+ fr_prospect_disqualified, fr_prospect_promoted — found via the security
--    advisor; see section 5 & 6 for the lighter fix applied to those two)
--
-- Each table gets RLS enabled AND has_permission policies in the SAME migration:
-- enabling RLS without a policy locks every role out and looks like an outage
-- (the floor rule in specs/bloomos-reed.md). The policy idiom is copied verbatim
-- from enable_rls_per_domain.sql so role changes stay data changes:
--   for select to authenticated using ( (select private.has_permission(org_id, '<domain>.read')) )
--   for all    to authenticated using/with check ( (select private.has_permission(org_id, '<domain>.write')) )
-- The (select ...) wrapper lets Postgres cache the predicate per statement (initplan).
--
-- org_id is made trustworthy on each table: the AA default is DROPPED from
-- fr_prospects (the "default trap"), fin_reconciliation_items GAINS an org_id
-- column, and the nullable columns are set NOT NULL. AA's uuid appears ONLY in
-- the one-time backfills of existing single-tenant rows below — never as a
-- column default (a default would silently re-arm the trap for tenant 2).
--
-- ORDER OF OPERATIONS — IMPORTANT: deploy the app changes in this PR FIRST.
-- They set org_id explicitly on every insert into these tables, so they are
-- compatible with the schema both before AND after this migration. Applying
-- this migration before the code is live would make those inserts violate the
-- new NOT NULL / dropped-default constraints.
--
-- Idempotent: enable RLS is a no-op when already on; policies are
-- drop-and-recreate; column/constraint changes guard with IF [NOT] EXISTS and
-- a null backfill precedes every SET NOT NULL.
--
-- Apply via the Supabase dashboard. Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).
-- Verified state 2026-06-25: all four RLS off, no existing policies; fr_prospects
-- 548 rows (org_id default = AA), fr_nba_suggestions 0 rows, gmail_sync_jobs 2 rows
-- (org_id already set), fin_reconciliation_items 1 row (no org_id column, no parent FK).

-- AA tenant uuid — used ONLY for the one-time backfills below: 17c75da8-082d-4c8f-b00b-a4100fb2eb22

-- ── 1. fr_prospects (fundraising) ───────────────────────────────────────────
-- Drop the AA default (the trap), then lock down. 548 rows already carry AA's
-- org_id and there are no nulls, so no backfill is needed here.
alter table public.fr_prospects alter column org_id drop default;
alter table public.fr_prospects enable row level security;

drop policy if exists "members read fr_prospects" on public.fr_prospects;
create policy "members read fr_prospects" on public.fr_prospects
  for select to authenticated
  using ( (select private.has_permission(org_id, 'fundraising.read')) );

drop policy if exists "members write fr_prospects" on public.fr_prospects;
create policy "members write fr_prospects" on public.fr_prospects
  for all to authenticated
  using ( (select private.has_permission(org_id, 'fundraising.write')) )
  with check ( (select private.has_permission(org_id, 'fundraising.write')) );

-- ── 2. fr_nba_suggestions (fundraising) ─────────────────────────────────────
-- Backfill (no-op today: 0 rows), NOT NULL, lock down.
update public.fr_nba_suggestions
  set org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' where org_id is null;
alter table public.fr_nba_suggestions alter column org_id set not null;
alter table public.fr_nba_suggestions enable row level security;

drop policy if exists "members read fr_nba_suggestions" on public.fr_nba_suggestions;
create policy "members read fr_nba_suggestions" on public.fr_nba_suggestions
  for select to authenticated
  using ( (select private.has_permission(org_id, 'fundraising.read')) );

drop policy if exists "members write fr_nba_suggestions" on public.fr_nba_suggestions;
create policy "members write fr_nba_suggestions" on public.fr_nba_suggestions
  for all to authenticated
  using ( (select private.has_permission(org_id, 'fundraising.write')) )
  with check ( (select private.has_permission(org_id, 'fundraising.write')) );

-- ── 3. gmail_sync_jobs (fundraising) ────────────────────────────────────────
-- Backfill (no-op today: 0 nulls), NOT NULL, read-only for app roles. Writes
-- happen only on the service-role sync path (lib/fundraising/gmail-sync.ts),
-- which bypasses RLS, so no write policy is needed. Mapped to the fundraising
-- domain to match its sibling CRM-sync log hs_sync_jobs (enable_rls_per_domain.sql)
-- and its home in lib/fundraising/. (The spec floated ops.read; with today's
-- roles the access set is identical — staff/admin/owner either way. Swap the two
-- 'fundraising.read' strings below to 'ops.read' if you prefer the ops domain.)
update public.gmail_sync_jobs
  set org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' where org_id is null;
alter table public.gmail_sync_jobs alter column org_id set not null;
alter table public.gmail_sync_jobs enable row level security;

drop policy if exists "members read gmail_sync_jobs" on public.gmail_sync_jobs;
create policy "members read gmail_sync_jobs" on public.gmail_sync_jobs
  for select to authenticated
  using ( (select private.has_permission(org_id, 'fundraising.read')) );

-- ── 4. fin_reconciliation_items (finance) ───────────────────────────────────
-- Heaviest fix: no org_id column and no parent record carries org_id (confirmed
-- — no outbound FK), so add the column, backfill the 1 existing row, NOT NULL,
-- lock down. NO column default: the app insert path (this PR) sets org_id from
-- the session going forward.
alter table public.fin_reconciliation_items
  add column if not exists org_id uuid references public.orgs(id);
update public.fin_reconciliation_items
  set org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' where org_id is null;
alter table public.fin_reconciliation_items alter column org_id set not null;
alter table public.fin_reconciliation_items enable row level security;

drop policy if exists "members read fin_reconciliation_items" on public.fin_reconciliation_items;
create policy "members read fin_reconciliation_items" on public.fin_reconciliation_items
  for select to authenticated
  using ( (select private.has_permission(org_id, 'finance.read')) );

drop policy if exists "members write fin_reconciliation_items" on public.fin_reconciliation_items;
create policy "members write fin_reconciliation_items" on public.fin_reconciliation_items
  for all to authenticated
  using ( (select private.has_permission(org_id, 'finance.write')) )
  with check ( (select private.has_permission(org_id, 'finance.write')) );

-- ── 5 & 6. fr_prospect_disqualified, fr_prospect_promoted (fundraising) ──────
-- Found via the Supabase security advisor after applying Phases 2/4: two more
-- prospect-lifecycle tables (a suppression set and its promoted sibling) that
-- are RLS-off and PostgREST-exposed — missed by the original enable_rls_per_domain
-- sweep and by the spec's "four." Both already carry org_id (nullable, no default)
-- and neither is written by any app code (the disqualify/promote routes update
-- fr_prospects.status; no insert path sets these). So this is the lighter fix:
-- backfill org_id, enable RLS, add fundraising policies — the same idiom as
-- enable_rls_per_domain.sql. org_id is left NULLABLE (not forced NOT NULL): with
-- no traceable writer, a NOT NULL constraint could break an unknown path, and
-- RLS already closes the exposure (the actual vulnerability). Tighten to NOT NULL
-- in a later pass once a writer is confirmed.
update public.fr_prospect_disqualified
  set org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' where org_id is null;
alter table public.fr_prospect_disqualified enable row level security;
drop policy if exists "members read fr_prospect_disqualified" on public.fr_prospect_disqualified;
create policy "members read fr_prospect_disqualified" on public.fr_prospect_disqualified
  for select to authenticated
  using ( (select private.has_permission(org_id, 'fundraising.read')) );
drop policy if exists "members write fr_prospect_disqualified" on public.fr_prospect_disqualified;
create policy "members write fr_prospect_disqualified" on public.fr_prospect_disqualified
  for all to authenticated
  using ( (select private.has_permission(org_id, 'fundraising.write')) )
  with check ( (select private.has_permission(org_id, 'fundraising.write')) );

update public.fr_prospect_promoted
  set org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' where org_id is null;
alter table public.fr_prospect_promoted enable row level security;
drop policy if exists "members read fr_prospect_promoted" on public.fr_prospect_promoted;
create policy "members read fr_prospect_promoted" on public.fr_prospect_promoted
  for select to authenticated
  using ( (select private.has_permission(org_id, 'fundraising.read')) );
drop policy if exists "members write fr_prospect_promoted" on public.fr_prospect_promoted;
create policy "members write fr_prospect_promoted" on public.fr_prospect_promoted
  for all to authenticated
  using ( (select private.has_permission(org_id, 'fundraising.write')) )
  with check ( (select private.has_permission(org_id, 'fundraising.write')) );
