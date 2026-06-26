-- ============================================================================
-- BloomOS  |  2026 OGSM reseed
-- Apply MANUALLY in the Supabase SQL editor. Review before running. Not auto-applied.
-- Org: Ambition Angels  =  17c75da8-082d-4c8f-b00b-a4100fb2eb22
--
-- Keeps the four existing objectives (updates their 2026 statements only).
-- Replaces all goals, initiatives (strategies), and KPIs (measures) for the org.
--
-- Foreign keys verified:
--   plan_initiatives.goal_id  -> plan_goals   ON DELETE CASCADE
--   plan_kpis.goal_id         -> plan_goals   ON DELETE CASCADE
--   plan_kpis.objective_id    -> plan_objectives CASCADE (objectives are NOT deleted)
--   plan_kpi_snapshots.kpi_id -> plan_kpis    ON DELETE CASCADE
--   ops_projects.initiative_id-> plan_initiatives ON DELETE SET NULL
-- Side effect: any ops_projects currently linked to an old initiative will have
-- initiative_id set to NULL (the project rows themselves are untouched).
-- ============================================================================

BEGIN;

-- 0. Sanity (optional): expect 4
-- SELECT count(*) FROM plan_objectives WHERE org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22';

-- 1. Refresh the 2026 statements on the four objectives (titles unchanged) -----
UPDATE plan_objectives SET three_year_statement =
 'Define and measure success, find the best formats, find new programmatic opportunities. 2026: lead with careers exposed, four internships and four careers a year, as the hard outcome, with Future Orientation Score as the directional belief indicator rather than a validated instrument this year. Finish the two-school pilot and bring the trusted-adult dashboard to parents.',
 updated_at = now()
 WHERE id = 'eb4497d2-132b-430b-8d6b-4aeb4d5b7b0d';

UPDATE plan_objectives SET three_year_statement =
 'Full-budget coverage through a diversified mix, plus a donor experience that drives long-term giving. 2026: rebased to necessity. Raise the committed floor of about 1,117,782 that runs the necessary plan, including the non-negotiable 400,000 platform build and a net-new program lead, then unlock about 250,000 of staged tiers as money lands, across foundations, corporate, individual, AIG, and earned revenue.',
 updated_at = now()
 WHERE id = 'dc83025c-b5e6-4871-8f4b-b921a588f1ea';

UPDATE plan_objectives SET three_year_statement =
 'A proven, replicable partnership model, with parents and mentors as the primary drivers of engagement. 2026: activate the roughly 20 current partners to real twice-a-week usage, convert the 50-partner pipeline, and design a platform a program can run without us in the room.',
 updated_at = now()
 WHERE id = 'bdbc837b-26c6-4414-9f3d-28b2436834b3';

-- (Objective 4, infrastructure, statement left as-is.)

-- 2. Clear the old plan for this org -----------------------------------------
-- Delete KPIs first (covers objective-only KPIs with null goal_id; cascades snapshots).
DELETE FROM plan_kpis  WHERE org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22';
-- Delete goals (cascades to plan_initiatives; unlinks ops_projects.initiative_id).
DELETE FROM plan_goals WHERE org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22';

-- 3. Goals (explicit ids so initiatives + KPIs can reference them) ------------
INSERT INTO plan_goals (id, org_id, objective_id, title, description, target_date, status, sort_order, owner) VALUES
 ('aa100001-0000-4000-8000-000000000001','17c75da8-082d-4c8f-b00b-a4100fb2eb22','eb4497d2-132b-430b-8d6b-4aeb4d5b7b0d','Ship the school-ready platform and bring the dashboard to parents','Finish the two-school pilot, ship the web-based school platform for twice-a-week in-program use, and extend the Adult Guide dashboard from program leaders to parents.','2026-09-30','on_track',0,'Remi'),
 ('aa100002-0000-4000-8000-000000000002','17c75da8-082d-4c8f-b00b-a4100fb2eb22','eb4497d2-132b-430b-8d6b-4aeb4d5b7b0d','Prove depth: four internships, four careers a year','Lock the rhythm of four internships per year, one per quarter, twice a week in program plus outside, and grow the content library to support it.','2026-12-31','on_track',1,'Remi'),
 ('aa100003-0000-4000-8000-000000000003','17c75da8-082d-4c8f-b00b-a4100fb2eb22','eb4497d2-132b-430b-8d6b-4aeb4d5b7b0d','Launch Ambition Coach','Stand up the four-week mentor sprint: seat a program lead to own it, recruit and train mentors from corporate employee engagement and the donor base, and run the first full cohorts.','2026-12-31','on_track',2,'Remi'),
 ('aa200001-0000-4000-8000-000000000001','17c75da8-082d-4c8f-b00b-a4100fb2eb22','dc83025c-b5e6-4871-8f4b-b921a588f1ea','Raise the committed floor and stage to the ceiling','Raise the 1,117,782 floor that funds the necessary plan, including the non-negotiable 400,000 build and the net-new program lead, then unlock about 250,000 of staged tiers as money lands.','2026-12-31','on_track',0,'Remi'),
 ('aa200002-0000-4000-8000-000000000002','17c75da8-082d-4c8f-b00b-a4100fb2eb22','dc83025c-b5e6-4871-8f4b-b921a588f1ea','Diversify across channels','Reach full-budget coverage across individual and AIG three-year commitments, foundations through the K-12 and workforce doors, corporate grants starting at 100,000, and earned revenue.','2026-12-31','on_track',1,'Remi'),
 ('aa200003-0000-4000-8000-000000000003','17c75da8-082d-4c8f-b00b-a4100fb2eb22','dc83025c-b5e6-4871-8f4b-b921a588f1ea','Keep a trustworthy pipeline','Maintain a clean, weighted pipeline: fix stale records, populate multi-year pledges, and hold honest close dates so the forecast can be shown to anyone.','2026-12-31','on_track',2,'Remi'),
 ('aa300001-0000-4000-8000-000000000001','17c75da8-082d-4c8f-b00b-a4100fb2eb22','bdbc837b-26c6-4414-9f3d-28b2436834b3','Reach 1,000 teens active twice a week','Activate the roughly 20 current partners to real twice-a-week usage, convert the 50-partner pipeline at about three conversations per partner, ship the integration toolkit so a program can run it without us in the room, and run place-based recruitment where a funder cares about a geography.','2026-12-31','on_track',0,'Remi'),
 ('aa300002-0000-4000-8000-000000000002','17c75da8-082d-4c8f-b00b-a4100fb2eb22','bdbc837b-26c6-4414-9f3d-28b2436834b3','Make the trusted-adult layer real and durable','Stand up MOUs and data-sharing agreements where none exist today, and define the adult engagement model with parents and mentors as primary drivers.','2026-12-31','on_track',1,'Remi'),
 ('aa400001-0000-4000-8000-000000000001','17c75da8-082d-4c8f-b00b-a4100fb2eb22','75207382-dbd6-4721-85af-bdc06e8f2fc5','Make the three hires in sequence','Hire the program lead first since it gates Coach and partnerships, rehire the curriculum director second, and add the fundraising hire later. Remi holds fundraising until then.','2026-12-31','on_track',0,'Remi'),
 ('aa400002-0000-4000-8000-000000000002','17c75da8-082d-4c8f-b00b-a4100fb2eb22','75207382-dbd6-4721-85af-bdc06e8f2fc5','Reduce founder dependency','Build the board into fundraising and oversight, run the org on BloomOS, and keep compliance filings and rhythms on schedule.','2026-12-31','on_track',1,'Shannon');

-- 4. Initiatives (strategies) ------------------------------------------------
INSERT INTO plan_initiatives (org_id, goal_id, title, description, owner, status, sort_order) VALUES
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa100001-0000-4000-8000-000000000001','Finish the two-school pilot to completion',NULL,'Remi','in_progress',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa100001-0000-4000-8000-000000000001','Ship the web-based school platform','Twice-a-week in-program use. Parent dashboard already built.','Demetric','in_progress',1),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa100001-0000-4000-8000-000000000001','Extend the Adult Guide dashboard to parents',NULL,'Demetric','todo',2),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa100002-0000-4000-8000-000000000002','Lock the four-internship-a-year rhythm',NULL,'Remi','todo',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa100002-0000-4000-8000-000000000002','Grow the internship content library',NULL,'Remi','todo',1),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa100003-0000-4000-8000-000000000003','Seat the program lead to own Coach',NULL,'Remi','todo',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa100003-0000-4000-8000-000000000003','Recruit and train mentors via employee engagement and donors',NULL,'Remi','todo',1),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa100003-0000-4000-8000-000000000003','Run the first full Coach cohorts',NULL,'Remi','todo',2),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa200001-0000-4000-8000-000000000001','Rebase the budget: rewards 100K to 20K, staged tiers',NULL,'Remi','in_progress',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa200001-0000-4000-8000-000000000001','Lead with the floor, unlock tiers as money lands',NULL,'Remi','todo',1),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa200002-0000-4000-8000-000000000002','Secure AIG three-year commitments',NULL,'Remi','todo',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa200002-0000-4000-8000-000000000002','Open foundations through K-12 and workforce',NULL,'Remi','todo',1),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa200002-0000-4000-8000-000000000002','Land corporate grants starting at 100K',NULL,'Remi','todo',2),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa200003-0000-4000-8000-000000000003','Run pipeline hygiene: Koshland, stale dates, pledges',NULL,'Remi','in_progress',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa300001-0000-4000-8000-000000000001','Activate current partners to twice-a-week',NULL,'Remi','in_progress',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa300001-0000-4000-8000-000000000001','Convert the 50-partner pipeline',NULL,'Remi','in_progress',1),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa300001-0000-4000-8000-000000000001','Ship the partner integration toolkit',NULL,'Demetric','todo',2),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa300001-0000-4000-8000-000000000001','Run place-based recruitment where a funder cares',NULL,'Remi','todo',3),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa300002-0000-4000-8000-000000000002','Stand up MOUs and data-sharing agreements',NULL,'Remi','todo',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa300002-0000-4000-8000-000000000002','Define the adult engagement model',NULL,'Remi','todo',1),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa400001-0000-4000-8000-000000000001','Hire the program lead',NULL,'Remi','todo',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa400001-0000-4000-8000-000000000001','Rehire the curriculum director',NULL,'Remi','todo',1),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa400002-0000-4000-8000-000000000002','Build the board into fundraising and oversight',NULL,'Shannon','todo',0),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa400002-0000-4000-8000-000000000002','Keep compliance filings and rhythms on schedule',NULL,'Shannon','in_progress',1);

-- 5. KPIs (measures). Most are source=manual (entered at the review). The four
--    money measures are source=auto: dollars_raised_fy26, weighted_pipeline_fy26,
--    corporate_raised, cash_runway_months are computed live by the auto-metric
--    registry (lib/admin/plan/metrics.ts -> lib/admin/strategy/money.ts) on the
--    "Refresh metrics" button + weekly cron. Their seeded current/status here are
--    just placeholders until the first refresh.

INSERT INTO plan_kpis (org_id, goal_id, objective_id, title, unit, target, current, owner, cadence, source, status, metric_key) VALUES
 -- Objective 1: program
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa100001-0000-4000-8000-000000000001','eb4497d2-132b-430b-8d6b-4aeb4d5b7b0d','Web-based school platform shipped','boolean',1,0,'Demetric','monthly','manual','not_started','web_platform_shipped'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa100001-0000-4000-8000-000000000001','eb4497d2-132b-430b-8d6b-4aeb4d5b7b0d','Two-school pilot completed','count',1,0,'Remi','monthly','manual','not_started','pilot_completed'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa100001-0000-4000-8000-000000000001','eb4497d2-132b-430b-8d6b-4aeb4d5b7b0d','Parents with an active dashboard','count',100,NULL,'Remi','monthly','manual','not_started','parents_active_dashboard'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa100002-0000-4000-8000-000000000002','eb4497d2-132b-430b-8d6b-4aeb4d5b7b0d','Careers exposed per active teen','count',4,NULL,'Remi','quarterly','manual','not_started','careers_exposed_per_teen'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa100002-0000-4000-8000-000000000002','eb4497d2-132b-430b-8d6b-4aeb4d5b7b0d','Future Orientation Score lift, directional','percent',14,14,'Remi','quarterly','manual','on_track','fos_lift'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa100003-0000-4000-8000-000000000003','eb4497d2-132b-430b-8d6b-4aeb4d5b7b0d','Teens through Ambition Coach','count',50,NULL,'Remi','quarterly','manual','not_started','coach_teens'),
 -- Objective 2: fundraising
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa200001-0000-4000-8000-000000000001','dc83025c-b5e6-4871-8f4b-b921a588f1ea','Raised toward the committed floor','usd',1117782,196310,'Remi','weekly','auto','behind','dollars_raised_fy26'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa200001-0000-4000-8000-000000000001','dc83025c-b5e6-4871-8f4b-b921a588f1ea','Approved ceiling, stretch','usd',1367782,196310,'Remi','monthly','manual','behind','dollars_ceiling_fy26'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa200001-0000-4000-8000-000000000001','dc83025c-b5e6-4871-8f4b-b921a588f1ea','Cash runway, months','months',6,2.3,'Shannon','monthly','auto','behind','cash_runway_months'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa200002-0000-4000-8000-000000000002','dc83025c-b5e6-4871-8f4b-b921a588f1ea','Corporate raised','usd',100000,0,'Remi','monthly','auto','not_started','corporate_raised'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa200002-0000-4000-8000-000000000002','dc83025c-b5e6-4871-8f4b-b921a588f1ea','AIG multi-year commitments logged','count',10,0,'Remi','monthly','manual','not_started','aig_multiyear_commitments'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa200003-0000-4000-8000-000000000003','dc83025c-b5e6-4871-8f4b-b921a588f1ea','Weighted pipeline closing in FY26','usd',650000,405500,'Remi','weekly','auto','behind','weighted_pipeline_fy26'),
 -- Objective 3: recruitment
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa300001-0000-4000-8000-000000000001','bdbc837b-26c6-4414-9f3d-28b2436834b3','Teens active twice a week','count',1000,NULL,'Remi','weekly','manual','not_started','active_teens_2x_week'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa300001-0000-4000-8000-000000000001','bdbc837b-26c6-4414-9f3d-28b2436834b3','Partners running twice a week','count',20,NULL,'Remi','monthly','manual','not_started','partners_2x_week'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa300002-0000-4000-8000-000000000002','bdbc837b-26c6-4414-9f3d-28b2436834b3','Deeply engaged teens with a connected adult','count',400,NULL,'Remi','quarterly','manual','not_started','deeply_engaged_with_adult'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa300002-0000-4000-8000-000000000002','bdbc837b-26c6-4414-9f3d-28b2436834b3','Partners with a signed MOU or data agreement','count',8,0,'Remi','monthly','manual','not_started','partners_with_mou'),
 -- Objective 4: infrastructure
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa400001-0000-4000-8000-000000000001','75207382-dbd6-4721-85af-bdc06e8f2fc5','Key hires made: program lead and curriculum','count',2,0,'Remi','monthly','manual','not_started','hires_made'),
 ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','aa400002-0000-4000-8000-000000000002','75207382-dbd6-4721-85af-bdc06e8f2fc5','Compliance items on time','percent',100,NULL,'Shannon','monthly','manual','not_started','compliance_on_time');

-- Verify before commit (optional):
-- SELECT (SELECT count(*) FROM plan_goals       WHERE org_id='17c75da8-082d-4c8f-b00b-a4100fb2eb22') AS goals,
--        (SELECT count(*) FROM plan_initiatives WHERE org_id='17c75da8-082d-4c8f-b00b-a4100fb2eb22') AS initiatives,
--        (SELECT count(*) FROM plan_kpis        WHERE org_id='17c75da8-082d-4c8f-b00b-a4100fb2eb22') AS kpis;
-- Expected: goals 10, initiatives 24, kpis 18.

COMMIT;
