-- ============================================================================
-- BloomOS  |  2026 fin_budget rebase to the committed floor
-- Apply MANUALLY in the Supabase SQL editor. Review before running. Not auto-applied.
-- Org: 17c75da8-082d-4c8f-b00b-a4100fb2eb22   |   year 2026
--
-- Decisions baked in (confirmed with Remi):
--   - Platform build (program.tech-app, 400,000) stays committed. Must be paid. No change.
--   - Program lead is net-new and committed: new payroll line at 90,000
--     (fully loaded ESTIMATE -- replace with the real figure when known).
--   - Student rewards cut 100,000 -> 20,000 (partner-directed pot only). The 80,000 is a real cut.
--   - Video and contract-engagement move OUT of the committed floor INTO staged contingency,
--     because the net-new program lead now owns the engagement function.
--
-- Result (verify block at the bottom confirms):
--   Committed floor (base)   : 1,117,782   <- the number we must raise to run the necessary plan
--   Staged tier 1 (t1)       :   160,000   (marketing 110,000 + video 50,000)
--   Staged tier 2 (t2)       :    90,000   (optional contract engagement)
--   Everything-on envelope   : 1,367,782
-- ============================================================================

BEGIN;

-- 1. Rewards: 100,000 -> 20,000 (partner-directed only) --------------------
UPDATE fin_budget SET base_amount = 20000, updated_at = now()
 WHERE year = 2026 AND category_id = 'rewards.payouts'
   AND org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22';

-- 2. Video: move 50,000 from committed base into staged tier 1 -------------
UPDATE fin_budget SET base_amount = 0, contingency_t1 = 50000, updated_at = now()
 WHERE year = 2026 AND category_id = 'program.video-contract'
   AND org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22';

-- 3. Contract engagement: move 90,000 from committed base into staged tier 2
--    The program lead now owns engagement; keep contract help available but not committed.
UPDATE fin_budget SET base_amount = 0, contingency_t2 = 90000, updated_at = now()
 WHERE year = 2026 AND category_id = 'program.engagement-contract'
   AND org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22';

-- 4. Program lead: net-new committed line ----------------------------------
--    a) create the category if it does not already exist
INSERT INTO fin_categories (id, group_name, display_name, kind, functional_class, sort_order, enabled, org_id)
VALUES ('payroll.program-lead','PAYROLL','Program Lead (net-new)','expense','program',104,true,'17c75da8-082d-4c8f-b00b-a4100fb2eb22')
ON CONFLICT (id) DO NOTHING;
--    b) budget it at 90,000 in the committed base (ESTIMATE -- set the real fully-loaded figure)
INSERT INTO fin_budget (year, category_id, base_amount, contingency_t1, contingency_t2, activated_contingency, org_id)
VALUES (2026,'payroll.program-lead',90000,0,0,0,'17c75da8-082d-4c8f-b00b-a4100fb2eb22');

-- 5. OPTIONAL: make the committed floor your headline goal in fin_config.
--    Leave commented to keep the current goal; uncomment to rebase the dashboard number.
-- UPDATE fin_config SET fundraising_goal = 1117782, updated_at = now()
--  WHERE org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22';

-- Verify before commit (optional) ------------------------------------------
-- SELECT
--   (SELECT COALESCE(SUM(base_amount),0)    FROM fin_budget WHERE year=2026 AND org_id='17c75da8-082d-4c8f-b00b-a4100fb2eb22') AS floor_base,        -- expect 1117782
--   (SELECT COALESCE(SUM(contingency_t1),0) FROM fin_budget WHERE year=2026 AND org_id='17c75da8-082d-4c8f-b00b-a4100fb2eb22') AS staged_t1,         -- expect 160000
--   (SELECT COALESCE(SUM(contingency_t2),0) FROM fin_budget WHERE year=2026 AND org_id='17c75da8-082d-4c8f-b00b-a4100fb2eb22') AS staged_t2;         -- expect 90000

COMMIT;
