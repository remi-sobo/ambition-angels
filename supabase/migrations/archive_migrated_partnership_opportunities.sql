-- Archive the migrated partnership opportunities (spec Phase 4 — optional, later).
--
-- PRECONDITION: apply consolidate_partnership_pipeline_into_partners.sql FIRST
-- and confirm the /admin/partners board looks right. This is the reversible
-- cleanup that follows once you're satisfied — it is NOT required for the
-- consolidation to be correct, and running it before Phase 1 would hide
-- partnership data that was never consolidated (recoverable via the rollback
-- block below, but avoid the round trip).
--
-- What it does: retags the 169 shadow "Partnership Pipeline" opportunities
-- (pipeline='59855776') with a sentinel pipeline value ('archived_partnership')
-- so they leave the active opportunities set entirely. NOTHING IS DELETED — this
-- is fully reversible (see the rollback block at the bottom). A later, separate
-- step can hard-delete them once you're certain, after exporting.
--
-- Why a sentinel and not a delete: a partner org that is also a funder may share
-- a constituent with real gift history, so keeping the rows (just retagged) means
-- nothing is lost. The fundraising guards (EXCLUDE_PARTNERSHIP_OPPS in
-- lib/hubspot/stage-map.ts) already exclude BOTH '59855776' and this sentinel, so
-- archiving keeps these rows invisible to every money rollup and Today's Moves —
-- before and after this runs. HubSpot sync-out is unaffected: it never reads the
-- pipeline column (it hardcodes 'default' on push).
--
-- Idempotent: re-running archives any stragglers and is a no-op once done.

begin;

update public.opportunities
set pipeline = 'archived_partnership'
where pipeline = '59855776';

commit;

-- ── Verification (run separately after applying) ──
-- Expect 0 rows left at '59855776' and 169 at 'archived_partnership'.
--
--   select coalesce(pipeline, '(null)') as pipeline, count(*)
--   from public.opportunities
--   group by 1 order by 2 desc;

-- ── Rollback (un-archive — restores the exact pre-Phase-4 state) ──
--
--   update public.opportunities
--   set pipeline = '59855776'
--   where pipeline = 'archived_partnership';

-- ── Later: hard delete (only once you're certain; export first) ──
-- This is the genuinely destructive step. Keep it commented until you've
-- eyeballed the board, confirmed no archived row is a real money deal, and saved
-- an export. It is the one part of this whole effort that is NOT reversible.
--
--   -- \copy (select * from public.opportunities where pipeline='archived_partnership')
--   --   to 'archived_partnership_opportunities_backup.csv' csv header;
--   delete from public.opportunities where pipeline = 'archived_partnership';
