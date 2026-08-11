-- ============================================================================
-- BloomOS  |  2026–27 OGSM (v3) load — PHASE 2: seed the new plan
-- Apply MANUALLY in the Supabase SQL editor. Review before running. Not auto-applied.
-- Org: Ambition Angels  =  17c75da8-082d-4c8f-b00b-a4100fb2eb22
-- Source document: docs/specs/ambition-angels-ogsm-2026-27-v3.md
-- Load spec:       docs/specs/ogsm-2026-27-v3-load.md
--
-- PREREQ: Phase 1 (2027_ogsm_v3_phase1_archive.MANUAL.sql) has been run and its
-- counts CONFIRMED. This script refuses to run if the archive row is missing.
--
-- What it does, in one transaction:
--   1. Flips fin_config to the July 2026 – June 2027 fiscal year
--      (fiscal_year_start_month = 7, current_year = 2027; FY named by end year).
--   2. Deletes the 2026 plan rows for this org (already archived verbatim):
--      plan_kpis (cascades snapshots), plan_goals (cascades initiatives),
--      plan_objectives (notes/tasks are empty; plan_reviews has no plan FK).
--   3. Inserts the v3 plan: 6 objectives, 13 goals, 45 strategies, 49 measures.
--   4. Verifies the counts, or aborts.
--
-- Decisions encoded here (approved 2026-08-11):
--   * WALL: goal-attached, title prefixed 'WALL · ' — exactly three.
--   * Booleans: unit='boolean', target=1 (verdict split, cross-login,
--     Exposure Ship, web platform, EPAA agreement).
--   * Units: '$' and '%' (not usd/percent).
--   * Reuse dollars_raised_fy26 for Raised, target 875000. No new key.
--   * donor_updates_sent_ytd seeded source='manual' for this plan year.
--   * Goals seed as on_track; measures as not_started, current NULL
--     (auto measures fill on the next metric refresh).
--   * metric_key set only where an existing key is reused; new measures get
--     NULL keys — Phase 3 (separate review) mints keys and provenance.
-- ============================================================================

BEGIN;

-- 0. Guard: the archive must exist -----------------------------------------
do $$
begin
  if not exists (
    select 1 from plan_archives
    where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' and label = '2026-ogsm-v2'
  ) then
    raise exception 'No 2026-ogsm-v2 archive row found for this org. Run Phase 1 first and confirm the counts. Nothing written.';
  end if;
end $$;

-- 1. Fiscal year: July 1 2026 – June 30 2027 (FY named by the year it ends) --
update fin_config
set fiscal_year_start_month = 7, current_year = 2027, updated_at = now()
where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22';

-- 2. Clear the 2026 plan (archived verbatim in Phase 1) ----------------------
delete from plan_kpis       where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'; -- cascades plan_kpi_snapshots
delete from plan_goals      where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'; -- cascades plan_initiatives
delete from plan_objectives where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'; -- notes/tasks empty; reviews have no plan FK

-- 3. Objectives (6) ----------------------------------------------------------
insert into plan_objectives (id, org_id, title, three_year_statement, owner, status, sort_order) values
 ('bb000001-0000-4000-8000-000000000001','17c75da8-082d-4c8f-b00b-a4100fb2eb22','Ship a platform a classroom can run without us in the room',null,'Demetric','on_track',0),
 ('bb000002-0000-4000-8000-000000000002','17c75da8-082d-4c8f-b00b-a4100fb2eb22','Get into ten sites and make them run',null,'Remi','on_track',1),
 ('bb000003-0000-4000-8000-000000000003','17c75da8-082d-4c8f-b00b-a4100fb2eb22','Every teen who is ready leaves with a plan',null,'Remi','on_track',2),
 ('bb000004-0000-4000-8000-000000000004','17c75da8-082d-4c8f-b00b-a4100fb2eb22','Prove it inside a bell schedule',null,'Remi','on_track',3),
 ('bb000005-0000-4000-8000-000000000005','17c75da8-082d-4c8f-b00b-a4100fb2eb22','Fund the year',null,'Remi','on_track',4),
 ('bb000006-0000-4000-8000-000000000006','17c75da8-082d-4c8f-b00b-a4100fb2eb22','Build an organization that does not depend on one person',null,'Shannon','on_track',5);

-- 4. Goals (13) --------------------------------------------------------------
insert into plan_goals (id, org_id, objective_id, title, description, target_date, status, sort_order, owner) values
 -- Objective 1
 ('bb100001-0000-4000-8000-000000000001','17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb000001-0000-4000-8000-000000000001','Web platform live at EPAA',null,'2026-09-30','on_track',0,'Demetric'),
 ('bb100002-0000-4000-8000-000000000002','17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb000001-0000-4000-8000-000000000001','Exposure Ships in production',null,'2026-12-31','on_track',1,'Remi'),
 ('bb100003-0000-4000-8000-000000000003','17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb000001-0000-4000-8000-000000000001','Prove depth: four careers a year',null,'2027-06-30','on_track',2,'Remi'),
 -- Objective 2
 ('bb200001-0000-4000-8000-000000000001','17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb000002-0000-4000-8000-000000000002','Reach 1,000 teens active twice a week',null,'2027-06-30','on_track',0,'Remi'),
 ('bb200002-0000-4000-8000-000000000002','17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb000002-0000-4000-8000-000000000002','Put the trusted-adult layer under contract','MOUs are now a dependency, not paperwork. No FOS data leaves a school without one.','2026-09-30','on_track',1,'Remi'),
 -- Objective 3
 ('bb300001-0000-4000-8000-000000000001','17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb000003-0000-4000-8000-000000000003','50 completed Ambition Plans','Four sessions producing a five-part written plan: the verdict, the job, the AI shift, the skills, the move. The plan goes to the adult guide by default. Gate: no teen application opens until 30 coaches are cleared and trained.','2027-06-30','on_track',0,'Remi'),
 -- Objective 4
 ('bb400001-0000-4000-8000-000000000001','17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb000004-0000-4000-8000-000000000004','EPAA produces a measurable result','Remi owns this until the Partner Success hire lands. September cannot slip. No baseline means no year-two story.','2027-05-31','on_track',0,'Remi'),
 -- Objective 5
 ('bb500001-0000-4000-8000-000000000001','17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb000005-0000-4000-8000-000000000005','Raise $875,000',null,'2027-06-30','on_track',0,'Remi'),
 ('bb500002-0000-4000-8000-000000000002','17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb000005-0000-4000-8000-000000000005','Diversify across four channels',null,'2027-06-30','on_track',1,'Remi'),
 ('bb500003-0000-4000-8000-000000000003','17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb000005-0000-4000-8000-000000000005','Build the individual gift table','Seventy-five percent of the individual number comes from fifteen gifts. Fifteen conversations, not a mail campaign. Gift table: 1 × $50,000 (4 prospects), 2 × $25,000 (8), 4 × $10,000 (14), 8 × $5,000 (28), 15 × $2,500 (45), ~40 under $1,000 (year-end appeal).','2027-06-30','on_track',2,'Remi'),
 -- Objective 6
 ('bb600001-0000-4000-8000-000000000001','17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb000006-0000-4000-8000-000000000006','Hire Partner Success','Delivery load this year is roughly 720 hours: 360 on four schools, 180 on six programs, 180 on Ambition Coach. That fits on one person only because Demetra carries coach matching logistics. Ten schools next year does not fit at all. No curriculum director hire this year — the AI curriculum pipeline is the bet that replaces it; checkpoint in December: if days-to-produce-a-unit is not at five or better, the hire goes back on the plan and the floor goes up. No fundraising hire this year — Remi holds fundraising.','2027-04-30','on_track',0,'Remi'),
 ('bb600002-0000-4000-8000-000000000002','17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb000006-0000-4000-8000-000000000006','Put the board to work','A $2M campaign with a passive board is a finding waiting to happen. A program officer will ask.','2027-06-30','on_track',1,'Shannon'),
 ('bb600003-0000-4000-8000-000000000003','17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb000006-0000-4000-8000-000000000006','Keep compliance clean',null,'2027-06-30','on_track',2,'Shannon');

-- 5. Strategies / initiatives (45) -------------------------------------------
insert into plan_initiatives (org_id, goal_id, title, description, owner, status, sort_order) values
 -- Goal 1.1 — Web platform live at EPAA
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb100001-0000-4000-8000-000000000001','Ship V1: internships, life lessons, adult dashboard',null,'Demetric','todo',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb100001-0000-4000-8000-000000000001','Unify web and mobile login so a teen uses one account in both',null,'Demetric','todo',1),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb100001-0000-4000-8000-000000000001','Rewrite dashboard language from class and period to group so nonprofits run the same tool',null,'Demetric','todo',2),
 -- Goal 1.2 — Exposure Ships in production
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb100002-0000-4000-8000-000000000002','Design one Exposure Ship end to end and test with real students before building ten',null,'Remi','todo',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb100002-0000-4000-8000-000000000002','Stand up the AI curriculum pipeline with checker agents',null,'Demetric','todo',1),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb100002-0000-4000-8000-000000000002','Career data from O*NET and BLS only, human approval gate on every unit',null,'Remi','todo',2),
 -- Goal 1.3 — Prove depth: four careers a year
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb100003-0000-4000-8000-000000000003','Lock the four-internship-a-year rhythm at partner sites',null,'Remi','todo',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb100003-0000-4000-8000-000000000003','Attach vetted opportunity links to a subset of units',null,'Remi','todo',1),
 -- Goal 2.1 — Reach 1,000 teens active twice a week
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb200001-0000-4000-8000-000000000001','Reactivate the existing partner base to twice-a-week usage before acquiring new sites',null,'Remi','todo',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb200001-0000-4000-8000-000000000001','Only pursue schools with advisory, homeroom, or an economics block',null,'Remi','todo',1),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb200001-0000-4000-8000-000000000001','Target sites of 300 to 500 students',null,'Remi','todo',2),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb200001-0000-4000-8000-000000000001','Work the warm lanes: Summit through Kayla Francis, MESA and Cañada, existing nonprofits',null,'Remi','todo',3),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb200001-0000-4000-8000-000000000001','Sell at list price: $25,000 per school, $10,000 per program',null,'Remi','todo',4),
 -- Goal 2.2 — Put the trusted-adult layer under contract
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb200002-0000-4000-8000-000000000002','Stand up MOU and data-sharing agreement templates',null,'Remi','todo',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb200002-0000-4000-8000-000000000002','Sign EPAA before the September baseline',null,'Remi','todo',1),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb200002-0000-4000-8000-000000000002','Sign every new site at contract, not after launch',null,'Remi','todo',2),
 -- Goal 3.1 — 50 completed Ambition Plans
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb300001-0000-4000-8000-000000000001','Write the program pieces in August: code of conduct, safety and consent policy, training deck, session playbook, plan template, applications, background check vendor',null,'Remi','todo',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb300001-0000-4000-8000-000000000001','Recruit 30 coaches at Twilio Global Impact Week in September',null,'Remi','todo',1),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb300001-0000-4000-8000-000000000001','Train cohort one in October, publish bench depth by career family',null,'Demetra','todo',2),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb300001-0000-4000-8000-000000000001','Open applications in November at EPAA and two nonprofit sites, gated on one completed track',null,'Remi','todo',3),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb300001-0000-4000-8000-000000000001','Monthly matching windows, first Monday, coach onboarding quarterly',null,'Demetra','todo',4),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb300001-0000-4000-8000-000000000001','Two doors in: teen applies or adult guide nominates',null,'Remi','todo',5),
 -- Goal 4.1 — EPAA produces a measurable result
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb400001-0000-4000-8000-000000000001','Baseline FOS in September, midyear in January, post in May',null,'Remi','todo',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb400001-0000-4000-8000-000000000001','Teacher interviews at all three points',null,'Remi','todo',1),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb400001-0000-4000-8000-000000000001','Write it up before the summer ask cycle',null,'Remi','todo',2),
 -- Goal 5.1 — Raise $875,000
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500001-0000-4000-8000-000000000001','Close one anchor gift of $150,000 or more before the campaign number goes public',null,'Remi','todo',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500001-0000-4000-8000-000000000001','Fold the remaining FY26 gap into the campaign so one number is in circulation',null,'Remi','todo',1),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500001-0000-4000-8000-000000000001','Sell named-school sponsorships at list price, one-year term, donor invited back as a match in year two',null,'Remi','todo',2),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500001-0000-4000-8000-000000000001','Corporate gets its own document with its own first page, and the coach bench is the offer',null,'Remi','todo',3),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500001-0000-4000-8000-000000000001','Launch monthly giving',null,'Shannon','todo',4),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500001-0000-4000-8000-000000000001','Close Red Iron. Hold the December cohort for December',null,'Remi','todo',5),
 -- Goal 5.2 — Diversify across four channels
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500002-0000-4000-8000-000000000002','Open foundations through the K-12 and workforce doors, never cold, never under six figures',null,'Remi','todo',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500002-0000-4000-8000-000000000002','Land corporate partnerships starting at $100,000',null,'Remi','todo',1),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500002-0000-4000-8000-000000000002','Secure multi-year individual commitments',null,'Remi','todo',2),
 -- Goal 5.3 — Build the individual gift table
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500003-0000-4000-8000-000000000003','Work the top fifteen personally, everything at $2,500 and below runs on a calendar',null,'Remi','todo',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500003-0000-4000-8000-000000000003','Shannon owns the year-end appeal and monthly donor program',null,'Shannon','todo',1),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500003-0000-4000-8000-000000000003','Every touch logged in BloomOS',null,'Remi','todo',2),
 -- Goal 6.1 — Hire Partner Success
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb600001-0000-4000-8000-000000000001','Fund the role from the anchor gift and name the salary line in the case',null,'Remi','todo',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb600001-0000-4000-8000-000000000001','Hire in spring, onboarded and carrying six sites before the next year opens',null,'Remi','todo',1),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb600001-0000-4000-8000-000000000001','Keep Demetra on coach matching logistics through the year',null,'Remi','todo',2),
 -- Goal 6.2 — Put the board to work
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb600002-0000-4000-8000-000000000002','Give every board member a fundraising role in the campaign',null,'Shannon','todo',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb600002-0000-4000-8000-000000000002','Run a give-or-get expectation conversation with each member',null,'Shannon','todo',1),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb600002-0000-4000-8000-000000000002','Quarterly board review of this OGSM',null,'Shannon','todo',2),
 -- Goal 6.3 — Keep compliance clean
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb600003-0000-4000-8000-000000000003','Keep filings and rhythms on schedule',null,'Shannon','todo',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb600003-0000-4000-8000-000000000003','Hold the data agreement and background check requirements as compliance items, not program items',null,'Shannon','todo',1);

-- 6. Measures / KPIs (49) ----------------------------------------------------
-- metric_key only where an existing key is reused (Phase 3 mints the rest).
-- source='auto' only where the reused key has a live resolver we keep:
-- dollars_raised_fy26, cash_runway_months, weighted_pipeline_fy26.
-- donor_updates_sent_ytd is deliberately 'manual' this plan year (decision).
insert into plan_kpis (org_id, goal_id, title, unit, target, current, owner, cadence, source, status, metric_key) values
 -- Goal 1.1 — Web platform live at EPAA
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb100001-0000-4000-8000-000000000001','Web school platform shipped','boolean',1,null,'Demetric','monthly','manual','not_started','web_platform_shipped'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb100001-0000-4000-8000-000000000001','Sites running on the web platform','count',10,null,'Demetric',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb100001-0000-4000-8000-000000000001','Cross-login shipped','boolean',1,null,'Demetric',null,'manual','not_started',null),
 -- Goal 1.2 — Exposure Ships in production
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb100002-0000-4000-8000-000000000002','Exposure Ship format in production','boolean',1,null,'Remi',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb100002-0000-4000-8000-000000000002','Careers live in catalog','count',40,null,'Remi',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb100002-0000-4000-8000-000000000002','Days to produce one new unit','days',5,null,'Remi',null,'manual','not_started',null),
 -- Goal 1.3 — Prove depth: four careers a year
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb100003-0000-4000-8000-000000000003','Careers exposed per active teen','count',4,null,'Remi','quarterly','manual','not_started','careers_exposed_per_teen'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb100003-0000-4000-8000-000000000003','Unit completion rate','%',60,null,'Remi',null,'manual','not_started',null),
 -- Goal 2.1 — Reach 1,000 teens active twice a week
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb200001-0000-4000-8000-000000000001','WALL · Teens active twice a week','count',1000,null,'Remi','weekly','manual','not_started','active_teens_2x_week'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb200001-0000-4000-8000-000000000001','Partners running twice a week','count',10,null,'Remi','monthly','manual','not_started','partners_2x_week'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb200001-0000-4000-8000-000000000001','Sponsored schools live','count',4,null,'Remi',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb200001-0000-4000-8000-000000000001','Program partners live','count',6,null,'Remi',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb200001-0000-4000-8000-000000000001','Teens completing at least one unit','count',2000,null,'Remi',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb200001-0000-4000-8000-000000000001','Adults active weekly on the dashboard','count',150,null,'Remi',null,'manual','not_started',null),
 -- Goal 2.2 — Put the trusted-adult layer under contract
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb200002-0000-4000-8000-000000000002','Partners with a signed MOU or data agreement','count',8,null,'Remi','monthly','manual','not_started','partners_with_mou'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb200002-0000-4000-8000-000000000002','EPAA agreement signed before baseline','boolean',1,null,'Remi',null,'manual','not_started',null),
 -- Goal 3.1 — 50 completed Ambition Plans
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb300001-0000-4000-8000-000000000001','WALL · Ambition Plans completed','count',50,null,'Remi',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb300001-0000-4000-8000-000000000001','Coaches vetted, background-checked, and trained','count',60,null,'Remi',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb300001-0000-4000-8000-000000000001','Application to match rate','%',80,null,'Remi',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb300001-0000-4000-8000-000000000001','Days from application to first session','days',30,null,'Remi',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb300001-0000-4000-8000-000000000001','Verdict split: validated, adjacent, not it','boolean',1,null,'Remi',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb300001-0000-4000-8000-000000000001','90-day follow-through on action one','%',50,null,'Remi',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb300001-0000-4000-8000-000000000001','Coach return rate','%',40,null,'Remi',null,'manual','not_started',null),
 -- Goal 4.1 — EPAA produces a measurable result
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb400001-0000-4000-8000-000000000001','Students with a baseline collected','%',90,null,'Remi',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb400001-0000-4000-8000-000000000001','Future Orientation Score lift','%',14,null,'Remi','quarterly','manual','not_started','fos_lift'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb400001-0000-4000-8000-000000000001','Deeply engaged teens with a connected adult','count',400,null,'Remi','quarterly','manual','not_started','deeply_engaged_with_adult'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb400001-0000-4000-8000-000000000001','Schools stating renewal intent in writing','count',2,null,'Remi',null,'manual','not_started',null),
 -- Goal 5.1 — Raise $875,000
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500001-0000-4000-8000-000000000001','WALL · Raised','$',875000,null,'Remi','weekly','auto','not_started','dollars_raised_fy26'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500001-0000-4000-8000-000000000001','Anchor gifts of $150,000 or more closed','count',1,null,'Remi',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500001-0000-4000-8000-000000000001','Cash runway, months','months',6,null,'Remi','monthly','auto','not_started','cash_runway_months'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500001-0000-4000-8000-000000000001','Weighted pipeline coverage','$',650000,null,'Remi','weekly','auto','not_started','weighted_pipeline_fy26'),
 -- Goal 5.2 — Diversify across four channels
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500002-0000-4000-8000-000000000002','Institutional grants','$',325000,null,'Remi',null,'manual','not_started','floor_source_foundations'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500002-0000-4000-8000-000000000002','Individual and major gifts','$',225000,null,'Remi',null,'manual','not_started','floor_source_individual'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500002-0000-4000-8000-000000000002','School and program sponsorships','$',175000,null,'Remi',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500002-0000-4000-8000-000000000002','Corporate','$',150000,null,'Remi',null,'manual','not_started','floor_source_corporate'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500002-0000-4000-8000-000000000002','Multi-year individual commitments','count',10,null,'Remi','monthly','manual','not_started','aig_multiyear_commitments'),
 -- Goal 5.3 — Build the individual gift table
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500003-0000-4000-8000-000000000003','Gifts of $10,000 or more closed','count',7,null,'Remi',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500003-0000-4000-8000-000000000003','Donor meetings held per month','count',8,null,'Remi',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500003-0000-4000-8000-000000000003','Monthly donors','count',25,null,'Shannon',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb500003-0000-4000-8000-000000000003','Donor updates sent','count',12,null,'Remi',null,'manual','not_started','donor_updates_sent_ytd'),
 -- Goal 6.1 — Hire Partner Success
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb600001-0000-4000-8000-000000000001','Partner Success lead hired','count',1,null,'Remi',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb600001-0000-4000-8000-000000000001','Sites carried by Partner Success at year end','count',6,null,'Remi',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb600001-0000-4000-8000-000000000001','Actual hours per school against the 90-hour assumption','hours',90,null,'Remi',null,'manual','not_started',null),
 -- Goal 6.2 — Put the board to work
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb600002-0000-4000-8000-000000000002','Board members with an active fundraising assignment','%',100,null,'Shannon',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb600002-0000-4000-8000-000000000002','Board giving participation','%',100,null,'Shannon',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb600002-0000-4000-8000-000000000002','Board-sourced introductions','count',12,null,'Shannon',null,'manual','not_started',null),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb600002-0000-4000-8000-000000000002','Quarterly OGSM reviews held','count',4,null,'Shannon',null,'manual','not_started',null),
 -- Goal 6.3 — Keep compliance clean
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb600003-0000-4000-8000-000000000003','Compliance items on time','%',100,null,'Shannon','monthly','manual','not_started','compliance_on_time'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','bb600003-0000-4000-8000-000000000003','Coaches with a completed background check','%',100,null,'Shannon',null,'manual','not_started',null);

-- 7. Verify counts, or abort -------------------------------------------------
do $$
declare
  n_obj int; n_goals int; n_inits int; n_kpis int; n_wall int;
begin
  select count(*) into n_obj   from plan_objectives  where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22';
  select count(*) into n_goals from plan_goals       where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22';
  select count(*) into n_inits from plan_initiatives where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22';
  select count(*) into n_kpis  from plan_kpis        where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22';
  select count(*) into n_wall  from plan_kpis        where org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' and title like 'WALL · %';

  if n_obj <> 6 or n_goals <> 13 or n_inits <> 45 or n_kpis <> 49 or n_wall <> 3 then
    raise exception 'Seed count mismatch (objectives %, goals %, initiatives %, kpis %, wall %) — expected 6/13/45/49/3. ROLLING BACK.',
      n_obj, n_goals, n_inits, n_kpis, n_wall;
  end if;

  raise notice 'v3 plan seeded: 6 objectives, 13 goals, 45 strategies, 49 measures, 3 WALL.';
end $$;

COMMIT;

-- 8. After commit: refresh the auto measures ---------------------------------
-- Press "Refresh metrics" in /admin/strategic-plan (or wait for the daily
-- cron) so WALL · Raised, Cash runway, and Weighted pipeline populate under
-- the new July–June fiscal window. Expected Raised immediately after flip:
-- ~$63,238 (gifts since 2026-07-01), against the $875,000 target.
