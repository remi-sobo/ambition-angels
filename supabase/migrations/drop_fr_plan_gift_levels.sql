-- Retire the v1 gift-range table (specs/fundraising-gift-tables.md, Phase 4).
--
-- `fr_plan_gift_levels` was the gift table under a fundraising-plan strategy:
-- gift size × how many needed, matched against linked opportunities by amount
-- band. It shipped with fundraising_plan.sql and was never used — nobody ever
-- created a strategy, and the page it lived on is reachable only by direct URL
-- since the V2 nav folded Plan into Campaigns.
--
-- Gift tables are their own surface now, and they are a different thing: an
-- explicit window, a coverage basis, levels native to their cadence, real
-- names placed at each level with a warm path to each of them, and the work
-- that follows from the gaps. Matching open asks onto amount bands was never
-- the hard part.
--
-- Its callers went first, in the same PR:
--   app/api/admin/fundraising/plan/levels/route.ts   deleted
--   plan/[id]/page.tsx                               gift-level block removed
--   PlanControls.tsx                                 GiftTableEditor removed
--   lib/fundraising/plan.ts                          generateGiftLevels,
--                                                    matchGiftLevels and their
--                                                    helpers removed
--
-- `fr_plan_strategies` STAYS. Open decision 8: the reason is not Today (which
-- reads nothing of the sort) but the applied `plan_strategy_id` links on
-- opportunities, grants and campaigns, which Start ask now writes.
--
-- THE ROW CHECK RUNS HERE, at drop time, not from a Phase 0 reading. A count
-- taken weeks ago is a claim about the past; this is the only moment the
-- answer matters. If anything is in the table the migration aborts with the
-- count, and nobody loses data they forgot they had.
--
-- Idempotent: no-op once the table is gone.

do $$
declare
  n bigint;
begin
  if to_regclass('public.fr_plan_gift_levels') is null then
    raise notice 'fr_plan_gift_levels is already gone; nothing to do.';
    return;
  end if;

  execute 'select count(*) from public.fr_plan_gift_levels' into n;
  if n > 0 then
    raise exception
      'fr_plan_gift_levels holds % row(s). Refusing to drop. Export them, or confirm they are disposable, then re-run.', n;
  end if;

  drop table public.fr_plan_gift_levels;
  raise notice 'fr_plan_gift_levels dropped (0 rows).';
end $$;

-- Verify:
--
-- select to_regclass('public.fr_plan_gift_levels') as gift_levels,
--        to_regclass('public.fr_plan_strategies') as strategies;
-- Expect: gift_levels NULL, strategies still present.
--
-- select count(*) from information_schema.columns
--  where table_schema = 'public'
--    and column_name = 'plan_strategy_id'
--    and table_name in ('opportunities', 'grants', 'campaigns');
-- Expect: 3 — the strategy links are untouched.
