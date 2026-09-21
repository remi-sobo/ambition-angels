-- Seed: Ambition Angels Year-End 2026 gift table
-- (specs/fundraising-gift-tables.md, Open decision 6).
--
-- The five build phases shipped the machinery and none of them created data,
-- so AA's Campaigns page still shows the empty state. This puts the year-end
-- push into Bloom as a real table.
--
-- The numbers are transcribed from AA's own Year-End workbook, the same
-- reading the Phase 0 findings took and the same one tests/gift-table.test.ts
-- asserts against. Nothing here is invented:
--
--   target 350,000 x multiplier 1.2  = table goal  420,000
--   9 levels, 72 gifts               = table shape 445,000
--   143 prospects needed
--
-- Overshoot is expected and correct. Gifts arrive in sensible bands, not in
-- amounts that happen to sum to a target, so the shape sits above the goal.
--
-- WHAT THIS DOES NOT DO: place names. The workbook lists 107 of them, but a
-- placement carries a real constituent_id, and matching a spreadsheet name to
-- the right person in the CRM is a judgement call with a merge at the end of
-- it if you get it wrong. Place them from the level drawer instead, where the
-- candidate pools do the looking up for you.
--
-- Status is DRAFT on purpose. A draft feeds no queues, so this cannot put work
-- in anyone's Today until a human has read the table and clicked "Make it
-- active". To seed it active instead, change the status literal below.
--
-- AA is resolved BY SLUG, not by a hardcoded uuid, so this is a no-op against
-- any database where the org is absent (the RLS scratch DB included).
--
-- Idempotent, and deliberately non-destructive: if a table of this name
-- already exists for AA the whole seed is skipped. Re-running must never
-- overwrite levels a human has since edited.
--
-- Apply via the Supabase dashboard SQL editor.
-- Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

do $$
declare
  v_org_id uuid;
  v_table_id uuid;
begin
  select id into v_org_id from public.orgs where slug = 'ambition-angels';
  if v_org_id is null then
    raise notice 'Org "ambition-angels" is not in this database. Nothing to seed.';
    return;
  end if;

  select id into v_table_id
  from public.fr_gift_tables
  where org_id = v_org_id and name = 'Year-End 2026';

  if v_table_id is not null then
    raise notice
      'AA already has a "Year-End 2026" gift table (%). Skipping, so nothing a human edited is overwritten.',
      v_table_id;
    return;
  end if;

  insert into public.fr_gift_tables (
    org_id, name, starts_on, ends_on, status,
    target, multiplier, goal_round_to, coverage_basis,
    default_term_years, monthly_modeled_years,
    ratio_major, ratio_mid, ratio_base, major_threshold,
    target_rationale, multiplier_rationale, notes
  )
  values (
    v_org_id,
    'Year-End 2026',
    date '2026-09-14',
    date '2026-12-31',
    'draft',
    350000,
    1.2,
    null,            -- AA takes the exact product. EPA is the one that rounds.
    'window',        -- Every figure counts money landing between those dates.
    1,
    1,
    4, 3, 1,
    null,            -- Each level carries its own prospects_per_gift below, so
                     -- no band is inferred from a threshold.
    'Transcribed from the Year-End 2026 workbook. Replace this with the reasoning in your own words: a target that cannot say why it is 350,000 is a spreadsheet.',
    'Transcribed from the workbook at 1.2, which assumes roughly one ask in six does not close or slips past December 31. Replace with the real basis if it was set differently.',
    'Seeded from AA''s Year-End 2026 workbook. Levels match the workbook exactly; no names are placed yet. Place them from each level drawer, where the candidate pools surface renewals, lapsed donors and upgrade candidates.'
  )
  returning id into v_table_id;

  -- Level, amount, gifts needed, prospects per gift, purpose.
  -- 4 prospects per gift at the top four levels, 3 in the middle, 1 at the
  -- appeal base: the standard major-gift ratios, and what the workbook used.
  insert into public.fr_gift_table_levels (
    org_id, gift_table_id, label, amount, cadence, term_years,
    gifts_needed, prospects_per_gift, purpose, sort
  )
  values
    (v_org_id, v_table_id, '01', 100000, 'one_time', null,  1, 4, 'Lead gift. One yes here is a quarter of the goal.', 1),
    (v_org_id, v_table_id, '02',  75000, 'one_time', null,  1, 4, 'Second anchor.', 2),
    (v_org_id, v_table_id, '03',  50000, 'one_time', null,  2, 4, null, 3),
    (v_org_id, v_table_id, '04',  25000, 'one_time', null,  3, 4, null, 4),
    (v_org_id, v_table_id, '05',  10000, 'one_time', null,  4, 3, null, 5),
    (v_org_id, v_table_id, '06',   5000, 'one_time', null,  5, 3, null, 6),
    (v_org_id, v_table_id, '07',   2500, 'one_time', null,  4, 3, null, 7),
    (v_org_id, v_table_id, '08',   1000, 'one_time', null, 12, 3, null, 8),
    (v_org_id, v_table_id, '09',    200, 'one_time', null, 40, 1, 'Appeal base. One prospect per gift: this level is worked by mail, not by meeting.', 9);

  raise notice 'Seeded AA "Year-End 2026" (%) as a DRAFT with 9 levels.', v_table_id;
end $$;

-- Verify:
--
-- select t.name, t.status, t.starts_on, t.ends_on, t.coverage_basis,
--        t.target, t.multiplier,
--        round(t.target * t.multiplier, 2)                as table_goal,
--        sum(l.amount * l.gifts_needed)                   as table_shape,
--        sum(l.gifts_needed)                              as gifts,
--        sum(l.prospects_per_gift * l.gifts_needed)       as prospects_needed,
--        count(l.id)                                      as levels
--   from public.fr_gift_tables t
--   join public.fr_gift_table_levels l on l.gift_table_id = t.id
--   join public.orgs o on o.id = t.org_id
--  where o.slug = 'ambition-angels' and t.name = 'Year-End 2026'
--  group by t.id, t.name, t.status, t.starts_on, t.ends_on,
--           t.coverage_basis, t.target, t.multiplier;
--
-- Expect: table_goal 420000.00, table_shape 445000, gifts 72,
--         prospects_needed 143, levels 9, status draft.
--
-- To undo (only while nothing is placed against it):
--
-- delete from public.fr_gift_tables t
--  using public.orgs o
--  where t.org_id = o.id and o.slug = 'ambition-angels'
--    and t.name = 'Year-End 2026'
--    and not exists (
--      select 1 from public.fr_gift_table_placements p where p.gift_table_id = t.id
--    );
