-- ============================================================================
-- BloomOS  |  2026–27 OGSM (v3) load — PHASE 4: open items
-- Apply MANUALLY in the Supabase SQL editor. Review before running. Not auto-applied.
-- Org: Ambition Angels  =  17c75da8-082d-4c8f-b00b-a4100fb2eb22
--
-- The v3 document's three open items, filed where BloomOS already tracks open
-- questions against a plan: objective tasks (dated, owned) and objective notes
-- (standing constraints), on Objective 5 — Fund the year
-- (bb000005-0000-4000-8000-000000000005). No new tables.
--
--   01 · The floor: $1,117,782 (2026 plan) vs $875,000 (this campaign) — a
--        $243K gap between what we raise and what the last plan said it costs.
--        Task, owner Remi, due 2026-08-31. (fin_config.fundraising_goal still
--        holds a third number, $1,247,982 — same reconciliation.)
--   02 · Cash runway 1.26 months vs target 6 — the constraint behind every
--        other number. Note (tracked live by the Cash runway measure).
--   03 · Per-teen figure (~$290) — verify against named career programs before
--        the case for support goes out. Task, owner Remi.
-- ============================================================================

BEGIN;

-- 0. Guard: objective exists, items not already filed ------------------------
do $$
begin
  if not exists (
    select 1 from plan_objectives
    where id = 'bb000005-0000-4000-8000-000000000005'
      and org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'
  ) then
    raise exception 'Objective 5 (Fund the year) not found — run Phase 2 first. Nothing written.';
  end if;
  if exists (
    select 1 from plan_objective_tasks
    where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'
      and title like 'Reconcile the floor%'
  ) then
    raise exception 'Open items already filed — nothing written.';
  end if;
end $$;

-- 1. Tasks (dated, owned) ----------------------------------------------------
insert into plan_objective_tasks (org_id, objective_id, title, assignee, status, due_date, sort_order) values
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb000005-0000-4000-8000-000000000005',
  'Reconcile the floor: $1,117,782 (2026 plan) vs $875,000 (campaign) vs $1,247,982 (fin_config fundraising_goal) — campaign total and year-one number move with the answer',
  'Remi','todo','2026-08-31',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb000005-0000-4000-8000-000000000005',
  'Verify the ~$290 per-teen figure against two or three named career programs before the case for support goes out',
  'Remi','todo',null,1);

-- 2. Note (standing constraint) ----------------------------------------------
insert into plan_objective_notes (org_id, objective_id, body, author) values
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb000005-0000-4000-8000-000000000005',
  'Open item 02 · Cash runway is 1.26 months against a target of 6. This is the constraint behind every other number in the plan — tracked live by the "Cash runway, months" measure on Goal 5.1.',
  'Remi');

-- 3. Verify, or abort --------------------------------------------------------
do $$
declare
  n_tasks int; n_notes int;
begin
  select count(*) into n_tasks from plan_objective_tasks
    where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'
      and objective_id = 'bb000005-0000-4000-8000-000000000005';
  select count(*) into n_notes from plan_objective_notes
    where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'
      and objective_id = 'bb000005-0000-4000-8000-000000000005';
  if n_tasks < 2 or n_notes < 1 then
    raise exception 'Open items missing (tasks %, notes %) — expected at least 2/1. ROLLING BACK.', n_tasks, n_notes;
  end if;
end $$;

COMMIT;
