-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 3b — Pipeline, grants, asks, gift tables, plan, prospect research
--   grants (+ requirements, payments, contacts) and the GIFT ROWS that record
--   received grant money; opportunities on both pipelines (default "Major
--   Gifts & Grants" and corporate) incl. closed history; the Ask Log (+ doc
--   metadata); the Year-End gift table (levels, named + data-driven
--   placements, credits); fundraising plan strategies (this calendar year and
--   last) linked to grants, opportunities and campaigns; the prospect bench
--   (prospects, scores, briefs, research runs); next-best-action suggestions;
--   the agent activity log; funder_angles on Section 6's strategy angles.
--
-- How the app represents received grant money (read from the code):
--   the gifts ledger is the single record of landed money
--   (lib/finance/schedule.ts loadReceivedTotal; v_fr_rollups lifetime totals;
--   Campaigns/plan rollups). A received grant installment is therefore a
--   gifts row (constituent = the funder org, method ach/check, fund from the
--   grant) plus a grant_payments row status 'received' with gift_id → that
--   gift. Expected installments are grant_payments 'scheduled', which
--   v_revenue_schedule turns into committed inflows. Gift ids: gift:gp_<key>.
--
-- Cross-section reads (all FK-guarded with EXISTS so a missing row skips the
-- insert instead of failing the section):
--   S3a: pledge:chen, pledge:kinetic, gift:goldberg_daf, optional
--        pledge:harrington; funder contacts con:pc09/pc15..pc22; bulk donors
--        con:dNNN (data-driven gift-table placements); corp_harborlight,
--        corp_quillfeather.
--   S6 : strategy_angles angle:<key> (funder_angles block — 60 applies after
--        35, so re-run this idempotent file once after 60 to fill it).
--
-- Not created here (another section owns them / they have no reader):
--   strategy_angles (S6), follow_ups (S7 seeds them), fr_touches,
--   fr_email_drafts, fr_prospect_promoted, fr_prospect_disqualified (legacy
--   HubSpot-keyed tables nothing reads; this org has no HubSpot).
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ── Section-local helpers (pg_temp, prefixed s35_) ─────────────────────────
-- A December date in the year-end campaign's year, never sooner than a week out.
create or replace function pg_temp.s35_ye(dd int) returns date language sql stable
  as $$ select greatest(make_date(extract(year from pg_temp.d(60))::int, 12, dd), pg_temp.d(7)) $$;
-- A date in the most recent past December.
create or replace function pg_temp.s35_lastdec(dd int) returns date language sql stable
  as $$ select make_date(extract(year from pg_temp.d(0))::int
                         - case when extract(month from pg_temp.d(0)) = 12 then 0 else 1 end, 12, dd) $$;
-- Day offset of a date from the anchor (feeds pg_temp.ts()).
create or replace function pg_temp.s35_off(x date) returns int language sql stable
  as $$ select x - pg_temp.nb_anchor() $$;
-- fy_start() + n days; last FY start + n days.
create or replace function pg_temp.s35_fs(n int) returns date language sql stable
  as $$ select pg_temp.fy_start() + n $$;
create or replace function pg_temp.s35_ly(n int) returns date language sql stable
  as $$ select (pg_temp.fy_start() - interval '1 year')::date + n $$;
-- Next business day.
create or replace function pg_temp.s35_bd(x date) returns date language sql immutable
  as $$ select case extract(isodow from x)::int when 6 then x + 2 when 7 then x + 1 else x end $$;
-- Timestamp on a calendar date at a Pacific wall-clock time.
create or replace function pg_temp.s35_at(x date, hhmi text default '10:00') returns timestamptz
  language sql stable as $$ select (x::text || ' ' || hhmi)::timestamp at time zone 'America/Los_Angeles' $$;
-- Constituent id if it exists in this org (guards cross-section references).
create or replace function pg_temp.s35_con(k text) returns uuid language sql stable
  as $$ select id from public.constituents where id = pg_temp.nb_id('con:' || k) and org_id = pg_temp.nb_org() $$;
-- GivingTuesday of a year (Tuesday after the 4th Thursday of November).
create or replace function pg_temp.s35_gt(y int) returns date language sql immutable
  as $$ select make_date(y, 11, 1) + ((4 - extract(isodow from make_date(y, 11, 1))::int + 7) % 7) + 21 + 5 $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Pipeline prospects no other section names (new organizations and one
--    individual surfaced by the board). No gifts: they are prospects.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.constituents
  (id, org_id, type, first_name, last_name, org_name, emails, phones, street, city, state, postal_code,
   tags, source, notes, why_matters, preferred_ack_channel, custom_fields, created_at, updated_at)
select pg_temp.nb_id('con:' || c.k), pg_temp.nb_org(), c.t, c.fn, c.ln, c.org, array[c.email], array[c.phone],
       c.street, c.city, 'CA', c.zip, c.tags, 'manual', c.notes, c.why, c.ack, '{}'::jsonb,
       pg_temp.ts(c.since, '10:20'), pg_temp.ts(c.touched, '15:10')
from (values
  ('pl_lumenfield', 'organization', null::text, null::text, 'Lumenfield Systems', 'lumenfield.giving@example.com', '(415) 555-0141',
   '700 Brannan St', 'San Francisco', '94107', array['corporate','prospect','employer_prospect','tech'],
   'Cloud infrastructure company, about 400 staff. Declined a Summer Works sponsorship last year on timing; their new head of impact took our intro call last month.',
   'Could become the second IT employer for Pathways fellows after Kinetic Labs.', 'email', -420, -12),
  ('pl_lakeside', 'organization', null, null, 'Lakeside Medical Group', 'careers@example.org', '(510) 555-0142',
   '3100 Summit St', 'Oakland', '94609', array['corporate','health_system','prospect'],
   'Multi-specialty medical group with 14 East Bay clinics. Hiring medical assistants faster than they can train them.',
   'A second healthcare employer would double clinical placements for the healthcare track.', 'email', -60, -5),
  ('pl_pinecrest', 'organization', null, null, 'Pinecrest Family Foundation', 'info@example.net', '(925) 555-0143',
   '1990 N California Blvd', 'Walnut Creek', '94596', array['foundation','declined'],
   'Declined our Mentor Circles LOI this spring: this cycle they fund school-day programs only.', null, 'letter', -260, -150),
  ('pl_rotary', 'organization', null, null, 'Lakeshore Rotary Club', 'service@example.org', '(510) 555-0144',
   '3255 Lakeshore Ave', 'Oakland', '94610', array['civic','prospect'],
   'Club service grants up to $10K. We withdrew last spring when their cycle closed after our summer start; their service chair wrote in through the website yesterday.',
   null, 'letter', -480, -1),
  ('pl_greenleaf', 'organization', null, null, 'Greenleaf Community Trust', 'greenleaf.grants@example.org', '(510) 555-0145',
   '1800 Harrison St Ste 300', 'Oakland', '94612', array['foundation','prospect'],
   'Community trust with a youth employment docket that meets in December. Program officer invited a proposal after the site visit.',
   null, 'email', -90, -6),
  ('pl_halvorsen', 'person', 'Irene', 'Halvorsen', null, 'irene.halvorsen@example.com', '(510) 555-0146',
   '52 Crocker Ave', 'Piedmont', '94611', array['major_donor_prospect'],
   'Retired architect and Celeste Harrington''s neighbor. Came to the gala as Celeste''s guest and asked about the trades track.',
   'Her late husband was a general contractor; she wants to see a Redline job site.', 'letter', -160, -18)
) as c(k, t, fn, ln, org, email, phone, street, city, zip, tags, notes, why, ack, since, touched)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Fundraising plan strategies. plan_year is the CALENDAR year (the plan
--    pages default to it). Last year's plan holds last year's wins.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.fr_plan_strategies (id, org_id, plan_year, name, goal, owner, notes, sort, created_at, updated_at)
select pg_temp.nb_id('frplan:' || s.k), pg_temp.nb_org(), extract(year from pg_temp.d(0))::int + s.yo, s.n, s.goal, s.owner, s.notes, s.sort,
       pg_temp.ts(s.created, '11:00'), pg_temp.ts(s.updated, '16:30')
from (values
  ('cur:foundation', 0, 'Foundation grants', 700000::numeric, 'lena',
   'Renewals first (Hollis is in; Cypress and East Bay are next), then the two new asks: Meridian for San Leandro and Sequoia. Lena owns the calendar and every report; Remi owns the Meridian and Sequoia relationships.', 1, -300, -3),
  ('cur:public', 0, 'Public contracts', 770000, 'lena',
   'The Eastshore WDB cost-reimbursement contract for Pathways and the second year of the state Youth Opportunity award. Kwame invoices quarterly; Andre keeps eligibility files audit-ready.', 2, -300, -12),
  ('cur:major', 0, 'Major gifts', 550000, 'remi',
   'Twelve to fifteen personal asks of $5K and up, most of them in November and December. Remi and Celeste carry the top of the list; Priya runs the moves calendar every Monday.', 3, -300, -2),
  ('cur:corporate', 0, 'Corporate partnerships', 300000, 'priya',
   'Summer Works sponsors plus the IT and healthcare employer partners. Sell the package: sponsorship, interns, and employee mentors together.', 4, -300, -6),
  ('cur:yearend', 0, 'Year-End campaign', 400000, 'priya',
   'Quiet phase with the board, public launch with the letter, the GivingTuesday board match, and a last push the week after Christmas. The gift table on Campaigns is the working plan.', 5, -60, -3),
  ('cur:gala', 0, 'Northbridge Rising Gala', 275000, 'jordan',
   'Tables, sponsorships, and the paddle raise. Every director fills or sells a table.', 6, -300, -150),
  ('cur:annual', 0, 'Annual fund & monthly giving', 255000, 'jordan',
   'Spring appeal, monthly giving circle, and online gifts. Goal: 50 active monthly donors by June.', 7, -300, -20),
  ('prev:foundation', -1, 'Foundation grants', 900000, 'lena',
   'Closed with Bayview''s three-year renewal, the Hollis pilot year, and first grants from Cypress and East Bay. Alder & Finch declined.', 1, -650, -290),
  ('prev:public', -1, 'Public contracts', 180000, 'lena',
   'The Eastshore WDB pilot contract proved the cost-reimbursement model and led to this year''s full contract.', 3, -650, -290),
  ('prev:major', -1, 'Major gifts', 300000, 'remi',
   'The Chen family''s three-year pledge anchored the year; Nnamdi Okafor''s first major gift came after the gala.', 2, -650, -290)
) as s(k, yo, n, goal, owner, notes, sort, created, updated)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Grants (bible §5 keys + the pursuits and history behind them)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.grants
  (id, org_id, funder_id, name, stage, amount_requested, amount_awarded, restrictions, fund_id,
   period_start, period_end, program, owner, notes, plan_strategy_id, created_at, updated_at)
select pg_temp.nb_id('grant:' || g.k), pg_temp.nb_org(), pg_temp.nb_id('con:' || g.funder), g.n, g.stage, g.req, g.awd, g.restr,
       case when g.fund is null then null else pg_temp.nb_id('fund:' || g.fund) end,
       g.ps, g.pe, g.prog, g.owner, g.notes,
       case when g.strat is null then null else pg_temp.nb_id('frplan:' || g.strat) end,
       pg_temp.ts(g.created, '10:05'), g.updated
from (values
  ('bayview_gos', 'bayview', 'Bayview Community Foundation · General operating (three years)', 'active', 750000::numeric, 750000::numeric, null::text, 'general',
   pg_temp.s35_ly(0), (pg_temp.fy_start() + interval '2 years - 1 day')::date, null::text, 'lena',
   'Year two of a three-year, $750K general operating award: $250K a year, unrestricted. Year three releases when Janelle approves the annual report. She has said a renewal conversation can start next fall.',
   'prev:foundation', -470, pg_temp.ts(-4, '11:15')),
  ('hollis_pathways', 'hollis', 'Hollis Family Foundation · Pathways Fellowship', 'active', 150000, 150000,
   'Pathways Fellowship only: coaching, certification fees, and placement staff.', 'pathways',
   pg_temp.fy_start(), (pg_temp.fy_start() + interval '1 year - 1 day')::date, 'Pathways Fellowship', 'lena',
   'Two installments of $75K. The second releases when Martin approves the interim report. Martin wants fellow-level outcomes, not averages.',
   'cur:foundation', -150, pg_temp.ts(-1, '16:40')),
  ('eastbay_workforce', 'eastbay', 'East Bay Workforce Fund · Summer Works stipends', 'closed', 120000, 120000,
   'Youth stipends for Summer Works interns.', 'stipends',
   pg_temp.s35_ly(0), pg_temp.s35_fs(-1), 'Summer Works', 'lena',
   'Paid in full. Final report submitted three weeks ago; renewal invited for the winter cycle at $130K.',
   'prev:foundation', -520, pg_temp.ts(-20, '15:45')),
  ('workforce_contract', 'eastshore_wdb', 'Eastshore WDB · Pathways cost-reimbursement contract', 'active', 450000, 420000,
   null, null,
   pg_temp.fy_start(), (pg_temp.fy_start() + interval '1 year - 1 day')::date, 'Pathways Fellowship', 'lena',
   'Full-year contract after last year''s pilot. Cost-reimbursement for Pathways services to eligible young adults (18 to 24), invoiced quarterly against actual costs by the 10th after quarter end. Kwame prepares the cost report; Andre certifies participant eligibility. Denise Holloway is the contract manager.',
   'cur:public', -170, pg_temp.ts(-12, '14:20')),
  ('state_yoi', 'ca_yoi', 'California Youth Opportunity Initiative · two-year award', 'active', 350000, 350000,
   null, null,
   pg_temp.s35_ly(0), (pg_temp.fy_start() + interval '1 year - 1 day')::date, 'Summer Works + Pathways', 'lena',
   'Two-year state award, $175K per fiscal year. Year one paid last winter; the year-two tranche pays after the state countersigns the budget amendment.',
   'cur:public', -420, pg_temp.ts(-9, '10:30')),
  ('cypress_launchpad', 'cypress', 'The Cypress Fund · Launchpad Academy', 'closed', 75000, 75000,
   null, 'general',
   pg_temp.s35_ly(0), pg_temp.s35_fs(-1), 'Launchpad Academy', 'lena',
   'One-year Launchpad grant, paid in full; final report accepted. Cypress invited a renewal LOI.',
   'prev:foundation', -500, pg_temp.ts(-60, '12:00')),
  ('meridian', 'meridian', 'Meridian Foundation · San Leandro expansion (two years)', 'submitted', 300000, null,
   'Launch and run a fourth Launchpad site with San Leandro Unified.', null,
   pg_temp.mon(3), (pg_temp.mon(3) + interval '2 years - 1 day')::date, 'Launchpad Academy (San Leandro)', 'lena',
   'Full two-year proposal submitted three weeks ago. Decision expected in about five weeks. Remi owns the relationship with Camille Washington; a second funder would make San Leandro two cohorts instead of one.',
   null, -200, pg_temp.ts(-2, '09:50')),
  ('harbor_health', 'harbor', 'Harbor Health Partners · Healthcare track (community benefit)', 'active', 40000, 40000,
   'Pathways healthcare track: CNA and medical-assistant certifications.', 'pathways',
   pg_temp.fy_start(), (pg_temp.fy_start() + interval '1 year - 1 day')::date, 'Pathways Fellowship', 'lena',
   'Community-benefit grant, paid in full. Monique Jackson (board) opened the door; clinical placements for CNA and medical-assistant fellows continue alongside it.',
   'cur:corporate', -125, pg_temp.ts(-40, '13:30')),
  ('cypress_renewal', 'cypress', 'The Cypress Fund · Launchpad renewal', 'loi', 85000, null,
   null, null,
   pg_temp.mon(3), (pg_temp.mon(3) + interval '1 year - 1 day')::date, 'Launchpad Academy', 'lena',
   'LOI due in 18 days. Lead with senior-year college and career plans; Cypress asked for attendance and credit-recovery data.',
   null, -50, pg_temp.ts(-3, '17:05')),
  ('eastbay_renewal', 'eastbay', 'East Bay Workforce Fund · Summer Works renewal', 'qualified', 130000, null,
   'Youth stipends for Summer Works interns.', null,
   pg_temp.mon(7), (pg_temp.mon(10) - 1), 'Summer Works', 'lena',
   'Renewal for next summer: ten more interns at the new minimum wage. The RFP opens in winter.',
   null, -60, pg_temp.ts(-20, '16:10')),
  ('sequoia', 'sequoia', 'Sequoia Trust for Education · first grant', 'prospect', 100000, null,
   null, null, null, null, 'Launchpad Academy', 'lena',
   'New prospect surfaced by prospect research. Intro meeting with Arthur Feld in three days; no ask yet.',
   null, -35, pg_temp.ts(-4, '10:10')),
  ('greenleaf', 'pl_greenleaf', 'Greenleaf Community Trust · Summer Works stipends', 'proposal', 30000, null,
   'Youth stipends for Summer Works interns.', null,
   pg_temp.mon(3), (pg_temp.mon(15) - 1), 'Summer Works', 'lena',
   'Program officer invited a proposal after the site visit. Their youth employment docket meets in December.',
   null, -45, pg_temp.ts(-6, '15:00')),
  ('alder_prior', 'alder', 'Alder & Finch Foundation · Launchpad (declined)', 'declined', 50000, null,
   null, null, pg_temp.s35_ly(0), pg_temp.s35_fs(-1), 'Launchpad Academy', 'lena',
   'Declined: outside their priorities at the time. Their new strategy names youth workforce, so we are re-cultivating through Dr. Freeman.',
   'prev:foundation', -560, pg_temp.ts(pg_temp.s35_off(pg_temp.s35_ly(170)), '11:00')),
  ('workforce_pilot', 'eastshore_wdb', 'Eastshore WDB · Pathways pilot contract', 'closed', 180000, 180000,
   null, null, pg_temp.s35_ly(120), pg_temp.s35_fs(-1), 'Pathways Fellowship', 'lena',
   'Eight-month pilot of the cost-reimbursement model, paid in two reimbursements; final report accepted. Led to the RFP and this year''s full contract.',
   'prev:public', -365, pg_temp.ts(pg_temp.s35_off(pg_temp.s35_fs(35)), '10:00')),
  ('hollis_prior', 'hollis', 'Hollis Family Foundation · Pathways pilot year', 'closed', 120000, 120000,
   'Pathways Fellowship only.', 'pathways',
   pg_temp.s35_ly(0), pg_temp.s35_fs(-1), 'Pathways Fellowship', 'lena',
   'Pilot year of the Pathways partnership, paid in two installments; final report accepted. Renewed at $150K.',
   'prev:foundation', -540, pg_temp.ts(pg_temp.s35_off(pg_temp.s35_fs(22)), '10:00'))
) as g(k, funder, n, stage, req, awd, restr, fund, ps, pe, prog, owner, notes, strat, created, updated)
on conflict do nothing;

-- ── Requirements (the reporting calendar). Dates tied to the fiscal year flip
--    to 'submitted' once past, so a re-anchored seed never shows stale work. ─
insert into public.grant_requirements
  (id, org_id, grant_id, kind, label, due_date, status, submitted_at, owner_id, why_it_matters, notes, created_at, updated_at)
select pg_temp.nb_id('greq:' || r.k), pg_temp.nb_org(), pg_temp.nb_id('grant:' || r.g), r.kind, r.label, r.due,
       case when r.fyrel and r.due < pg_temp.d(0) then 'submitted' else r.status end,
       case when r.status = 'submitted' or (r.fyrel and r.due < pg_temp.d(0))
            then coalesce(r.sub, pg_temp.s35_at(r.due - 3, '16:20')) end,
       case when r.owner is null then null else pg_temp.nb_user(r.owner) end,
       r.why, r.notes,
       pg_temp.ts(r.created, '09:40'),
       case when r.status = 'submitted' or (r.fyrel and r.due < pg_temp.d(0))
            then coalesce(r.sub, pg_temp.s35_at(r.due - 3, '16:20')) else pg_temp.ts(r.touched, '14:05') end
from (values
  ('bay_checkin', 'bayview_gos', 'interim_report', 'Bayview mid-grant check-in', pg_temp.d(-100), 'submitted', pg_temp.ts(-102, '16:10'), false, 'lena',
   null::text, 'Released the year-two payment.', -140, -102),
  ('bay_annual', 'bayview_gos', 'interim_report', 'Bayview annual report', pg_temp.d(26), 'upcoming', null::timestamptz, false, 'lena',
   'Year three ($250K unrestricted) is contingent on it. It needs the audited financials from the audit now in fieldwork.',
   'Outcomes for the grant year plus audited financials, through Bayview''s portal.', -60, -8),
  ('hol_interim', 'hollis_pathways', 'interim_report', 'Hollis interim report', pg_temp.d(12), 'in_progress', null, false, 'lena',
   'Releases the second $75K installment. Lena is drafting; Andre owes the fellow-level outcomes table.',
   'Narrative plus budget-to-actuals for the first half of the grant.', -95, 0),
  ('hol_final', 'hollis_pathways', 'final_report', 'Hollis final report', (pg_temp.fy_start() + interval '1 year 44 days')::date, 'upcoming', null, true, 'lena',
   null, null, -95, -95),
  ('eb_interim', 'eastbay_workforce', 'interim_report', 'East Bay interim report', pg_temp.s35_fs(-150), 'submitted', null, true, 'lena',
   null, null, -470, -470),
  ('eb_final', 'eastbay_workforce', 'final_report', 'East Bay final report', pg_temp.d(-15), 'submitted', pg_temp.ts(-20, '15:40'), false, 'lena',
   null, 'Submitted early; Rosalind asked for two intern stories for their annual report.', -110, -20),
  ('ws_q1', 'workforce_contract', 'financial_report', 'Eastshore Q1 invoice and cost report', pg_temp.s35_fs(101), 'upcoming', null, true, 'kwame',
   'Reimburses Jul–Sep Pathways costs ($105K).', 'Invoice with timesheets and the enrollment and placement report.', -110, -12),
  ('ws_q2', 'workforce_contract', 'financial_report', 'Eastshore Q2 invoice and cost report', pg_temp.s35_fs(193), 'upcoming', null, true, 'kwame',
   'Reimburses Oct–Dec Pathways costs ($105K).', null, -110, -110),
  ('ws_q3', 'workforce_contract', 'financial_report', 'Eastshore Q3 invoice and cost report', pg_temp.s35_fs(283), 'upcoming', null, true, 'kwame',
   'Reimburses Jan–Mar Pathways costs ($105K).', null, -110, -110),
  ('ws_q4', 'workforce_contract', 'financial_report', 'Eastshore Q4 invoice and cost report', pg_temp.s35_fs(375), 'upcoming', null, true, 'kwame',
   'Reimburses Apr–Jun Pathways costs ($105K).', null, -110, -110),
  ('ws_roster', 'workforce_contract', 'other', 'Eastshore monthly participant roster', pg_temp.d(-3), 'in_progress', null, false, 'andre',
   'Monthly eligibility roster for the WDB portal. Two new fellows are still missing income verification.', null, -30, -1),
  ('ws_monitor', 'workforce_contract', 'other', 'Eastshore monitoring visit', pg_temp.d(45), 'upcoming', null, false, 'tasha',
   'Desk review of eligibility files and timesheets. Kwame pulls the cost files; Andre pulls the fellow files.', null, -21, -21),
  ('yoi_y1', 'state_yoi', 'interim_report', 'CA YOI year-one progress report', pg_temp.s35_fs(45), 'upcoming', null, true, 'lena',
   null, 'Placements, credentials, and stipend hours for year one.', -400, -60),
  ('yoi_amend', 'state_yoi', 'other', 'CA YOI year-two budget amendment', pg_temp.d(7), 'in_progress', null, false, 'kwame',
   'The year-two tranche ($175K) cannot pay until the state countersigns the amendment.', 'Signed by Remi; waiting on the payee data form.', -25, -2),
  ('yoi_semi', 'state_yoi', 'interim_report', 'CA YOI semi-annual progress report', pg_temp.s35_fs(215), 'upcoming', null, true, 'lena',
   null, null, -400, -400),
  ('yoi_final', 'state_yoi', 'final_report', 'CA YOI final report', (pg_temp.fy_start() + interval '1 year 60 days')::date, 'upcoming', null, true, 'lena',
   null, null, -400, -400),
  ('cy_final', 'cypress_launchpad', 'final_report', 'Cypress final report', pg_temp.s35_fs(30), 'submitted', null, true, 'lena',
   null, 'Accepted; Gregory invited the renewal LOI the same week.', -480, -80),
  ('cyr_loi', 'cypress_renewal', 'loi', 'Cypress renewal LOI', pg_temp.d(18), 'in_progress', null, false, 'lena',
   'Two pages. Cypress approves renewals at its December board meeting; missing this pushes us a full cycle.', null, -50, -3),
  ('mer_app', 'meridian', 'application', 'Meridian full proposal', pg_temp.d(-21), 'submitted', pg_temp.ts(-21, '17:05'), false, 'lena',
   null, 'Narrative, two-year budget, San Leandro Unified letter of support.', -120, -21),
  ('mer_followup', 'meridian', 'other', 'Meridian follow-up materials', pg_temp.d(5), 'in_progress', null, false, 'remi',
   'Camille asked for the San Leandro MOU draft and a year-two budget narrative before her committee meets.', null, -14, -1),
  ('har_final', 'harbor_health', 'final_report', 'Harbor Health year-end impact report', (pg_temp.fy_start() + interval '1 year 30 days')::date, 'upcoming', null, true, 'lena',
   null, 'Certifications earned and clinical hires.', -40, -40),
  ('ebr_app', 'eastbay_renewal', 'application', 'East Bay renewal application', pg_temp.d(80), 'upcoming', null, false, 'lena',
   null, null, -20, -20),
  ('gl_app', 'greenleaf', 'application', 'Greenleaf proposal', pg_temp.d(33), 'in_progress', null, false, 'lena',
   'Their youth employment docket meets in December.', null, -40, -6),
  ('alder_app', 'alder_prior', 'application', 'Alder & Finch application', pg_temp.s35_ly(90), 'submitted', null, true, 'lena',
   null, null, -560, -560),
  ('wsp_final', 'workforce_pilot', 'final_report', 'Eastshore pilot final report', pg_temp.s35_fs(30), 'submitted', null, true, 'lena',
   null, 'Enrollment, credentials, and placements for the pilot.', -360, -360),
  ('holp_final', 'hollis_prior', 'final_report', 'Hollis pilot-year final report', pg_temp.s35_fs(20), 'submitted', null, true, 'lena',
   null, null, -540, -540)
) as r(k, g, kind, label, due, status, sub, fyrel, owner, why, notes, created, touched)
on conflict do nothing;

-- ── Contacts: program officers, finance contacts, intro sources ────────────
insert into public.grant_contacts (id, org_id, grant_id, constituent_id, role, is_primary, notes, created_at, updated_at)
select pg_temp.nb_id('gcon:' || c.g || ':' || c.con), pg_temp.nb_org(), pg_temp.nb_id('grant:' || c.g), pg_temp.s35_con(c.con),
       c.role, c.prim, c.notes, pg_temp.ts(c.created, '11:30'), pg_temp.ts(c.created, '11:30')
from (values
  ('bayview_gos', 'po_bayview', 'program_officer', true, 'Senior Program Officer, Economic Mobility. Prefers a call before anything formal.', -460),
  ('bayview_gos', 'pc15', 'finance_reporting', false, 'Grants Manager: payment schedule and the report portal.', -460),
  ('hollis_pathways', 'po_hollis', 'program_officer', true, 'Family trustee and program lead; reads every report himself.', -140),
  ('hollis_pathways', 'pc16', 'other', false, 'Trustee. Came to the Cohort 6 graduation.', -140),
  ('hollis_prior', 'po_hollis', 'program_officer', true, null, -530),
  ('eastbay_workforce', 'pc18', 'program_officer', true, 'Reviewed the final report; owns the renewal.', -510),
  ('eastbay_renewal', 'pc18', 'program_officer', true, null, -55),
  ('workforce_contract', 'po_eastshore', 'finance_reporting', true, 'Contract manager: invoices, monthly rosters, and the monitoring visit.', -160),
  ('workforce_pilot', 'po_eastshore', 'finance_reporting', true, null, -360),
  ('state_yoi', 'pc19', 'program_officer', true, 'Program analyst: tranche timing and reporting.', -410),
  ('cypress_launchpad', 'pc17', 'program_officer', true, null, -490),
  ('cypress_renewal', 'pc17', 'program_officer', true, 'Invited the renewal LOI.', -48),
  ('meridian', 'po_meridian', 'program_officer', true, 'Program Director, Youth Opportunity.', -190),
  ('meridian', 'pc21', 'other', false, 'Program associate; logistics for the proposal review.', -60),
  ('meridian', 'bd_harrington', 'intro_source', false, 'Celeste met Camille at a national workforce convening and made the introduction.', -190),
  ('sequoia', 'po_sequoia', 'program_officer', true, 'Executive Director; first meeting set.', -30),
  ('sequoia', 'pc22', 'other', false, 'Grants associate; scheduling.', -30),
  ('sequoia', 'bd_harrington', 'intro_source', false, 'Celeste''s note opened the door.', -30),
  ('harbor_health', 'bd_jackson', 'primary', true, 'VP Community Health at Harbor and a Northbridge director. Recuses from board votes on Harbor items.', -120),
  ('harbor_health', 'pc09', 'other', false, 'Director of Clinical Education: approves the clinical rotations.', -120),
  ('alder_prior', 'bd_freeman', 'intro_source', true, 'Re-cultivating through Dr. Freeman.', -200),
  ('alder_prior', 'pc20', 'program_officer', false, 'Joined Alder & Finch after the decline; open to a workforce conversation.', -90)
) as c(g, con, role, prim, notes, created)
where pg_temp.s35_con(c.con) is not null
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Grant money. One schedule drives both the gifts rows (money that has
--    landed) and grant_payments (received → gift, scheduled → v_revenue_schedule).
--    Received = due date before today.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function pg_temp.s35_gpay() returns table(
    k text, grant_k text, funder_k text, due date, amt numeric, method text, fund_k text,
    ack text, gnote text, pnote text, booked int)
  language sql stable as $$
  select * from (values
    ('bay_y1',  'bayview_gos',        'bayview',       pg_temp.d(-425), 250000::numeric, 'ach',   'general'::text,  'sent', 'Bayview general operating grant, year 1 of 3.', null::text, -440),
    ('bay_y2',  'bayview_gos',        'bayview',       pg_temp.d(-60),  250000, 'ach',   'general',  'sent', 'Bayview general operating grant, year 2 of 3.', 'Released after the mid-grant check-in.', -440),
    ('bay_y3',  'bayview_gos',        'bayview',       pg_temp.d(305),  250000, 'ach',   'general',  'sent', 'Bayview general operating grant, year 3 of 3.', 'Releases when Janelle approves the annual report.', -440),
    ('hol_i1',  'hollis_pathways',    'hollis',        pg_temp.d(-95),  75000,  'ach',   'pathways', 'sent', 'Hollis Pathways grant, installment 1 of 2.', null, -130),
    ('hol_i2',  'hollis_pathways',    'hollis',        pg_temp.d(40),   75000,  'ach',   'pathways', 'sent', 'Hollis Pathways grant, installment 2 of 2.', 'Releases when Martin approves the interim report.', -130),
    ('holp_1',  'hollis_prior',       'hollis',        pg_temp.s35_ly(16),  60000, 'ach', 'pathways', 'sent', 'Hollis Pathways pilot-year grant, installment 1 of 2.', null, -535),
    ('holp_2',  'hollis_prior',       'hollis',        pg_temp.s35_ly(237), 60000, 'ach', 'pathways', 'sent', 'Hollis Pathways pilot-year grant, installment 2 of 2.', null, -535),
    ('eb_1',    'eastbay_workforce',  'eastbay',       pg_temp.s35_bd(pg_temp.s35_ly(275)), 120000, 'ach', 'stipends', 'sent', 'East Bay Workforce Fund grant for Summer Works stipends, paid in full.', null, -515),
    ('cy_1',    'cypress_launchpad',  'cypress',       pg_temp.s35_bd(pg_temp.s35_ly(145)), 75000, 'ach', 'general', 'sent', 'Cypress Fund grant for Launchpad Academy, paid in full.', null, -495),
    ('yoi_t1',  'state_yoi',          'ca_yoi',        pg_temp.s35_bd(pg_temp.s35_ly(225)), 175000, 'ach', null, 'not_required', 'California Youth Opportunity Initiative award, year 1 of 2.', null, -415),
    ('yoi_t2',  'state_yoi',          'ca_yoi',        pg_temp.d(70),   175000, 'ach',   null,       'not_required', 'California Youth Opportunity Initiative award, year 2 of 2.', 'Pays after the state countersigns the year-two budget amendment.', -415),
    ('har_1',   'harbor_health',      'harbor',        pg_temp.d(-40),  40000,  'ach',   'pathways', 'sent', 'Harbor Health community-benefit grant for the Pathways healthcare track, paid in full.', null, -70),
    ('wsp_1',   'workforce_pilot',    'eastshore_wdb', pg_temp.s35_ly(252), 85000, 'ach', null, 'not_required', 'Eastshore WDB pilot contract reimbursement 1 of 2.', null, -360),
    ('wsp_2',   'workforce_pilot',    'eastshore_wdb', pg_temp.s35_ly(344), 95000, 'ach', null, 'not_required', 'Eastshore WDB pilot contract reimbursement 2 of 2.', null, -360),
    ('ws_q1',   'workforce_contract', 'eastshore_wdb', pg_temp.s35_fs(140), 105000, 'ach', null, 'not_required', 'Eastshore WDB reimbursement, Jul–Sep Pathways services.', 'Jul–Sep services. Invoice submitted; the WDB pays net-45.', -165),
    ('ws_q2',   'workforce_contract', 'eastshore_wdb', pg_temp.s35_fs(230), 105000, 'ach', null, 'not_required', 'Eastshore WDB reimbursement, Oct–Dec Pathways services.', 'Oct–Dec services; invoice due by the 10th after quarter end.', -165),
    ('ws_q3',   'workforce_contract', 'eastshore_wdb', pg_temp.s35_fs(320), 105000, 'ach', null, 'not_required', 'Eastshore WDB reimbursement, Jan–Mar Pathways services.', 'Jan–Mar services.', -165),
    ('ws_q4',   'workforce_contract', 'eastshore_wdb', pg_temp.s35_fs(410), 105000, 'ach', null, 'not_required', 'Eastshore WDB reimbursement, Apr–Jun Pathways services.', 'Apr–Jun services; lands after the fiscal year closes.', -165)
  ) as v(k, grant_k, funder_k, due, amt, method, fund_k, ack, gnote, pnote, booked) $$;

insert into public.gifts
  (id, org_id, constituent_id, amount, gift_date, method, fund_id, campaign_id, appeal_id,
   acknowledgment_status, acknowledged_at, notes, created_at, updated_at)
select pg_temp.nb_id('gift:gp_' || p.k), pg_temp.nb_org(), pg_temp.nb_id('con:' || p.funder_k), p.amt, p.due, p.method,
       case when p.fund_k is null then null else pg_temp.nb_id('fund:' || p.fund_k) end, null, null,
       p.ack, case when p.ack = 'sent' then pg_temp.s35_at(p.due + 3, '10:30') end,
       p.gnote, pg_temp.s35_at(p.due, '15:00'),
       case when p.ack = 'sent' then pg_temp.s35_at(p.due + 3, '10:30') else pg_temp.s35_at(p.due, '15:00') end
from pg_temp.s35_gpay() p
where p.due < pg_temp.d(0)
on conflict do nothing;

insert into public.grant_payments (id, org_id, grant_id, due_date, expected_amount, status, gift_id, received_at, notes, created_at)
select pg_temp.nb_id('gpay:' || p.k), pg_temp.nb_org(), pg_temp.nb_id('grant:' || p.grant_k), p.due, p.amt,
       case when p.due < pg_temp.d(0) then 'received' else 'scheduled' end,
       case when p.due < pg_temp.d(0) then pg_temp.nb_id('gift:gp_' || p.k) end,
       case when p.due < pg_temp.d(0) then pg_temp.s35_at(p.due, '11:00') end,
       p.pnote, pg_temp.ts(least(p.booked, pg_temp.s35_off(p.due) - 1), '09:15')
from pg_temp.s35_gpay() p
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Opportunities. ~25 open across both pipelines (~$1.1M, ~$530K
--    weighted), dated next steps (several this week, two overdue), plus
--    closed history. Closed rows carry no next step (v_obligations and
--    v_fr_rollups only exclude legacy stage keys).
--    Plan links: open pursuits link their opportunity; awarded grants link
--    the grant row instead, so the plan counts each pursuit once.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.opportunities
  (id, org_id, constituent_id, name, pipeline, stage, ask_amount, expected_close, probability,
   capacity_rating, affinity_rating, owner, next_step, next_step_due, notes, plan_strategy_id,
   snoozed_until, created_at, updated_at)
select pg_temp.nb_id('opp:' || o.k), pg_temp.nb_org(), pg_temp.s35_con(o.con), o.n, o.pipe, o.stage, o.ask, o.close, o.prob,
       o.cap, o.aff, o.owner, o.next, o.due, o.notes,
       case when o.strat is null then null else pg_temp.nb_id('frplan:' || o.strat) end,
       o.snooze, pg_temp.ts(o.created, '10:40'), o.updated
from (values
  -- ── default pipeline: open ──
  ('meridian', 'meridian', 'default', 'Meridian Foundation — San Leandro expansion', 'ask_made', 300000::numeric, pg_temp.d(35), 40, 5, 3, 'remi'::text,
   'Send Camille the San Leandro MOU draft and the year-two budget narrative'::text, pg_temp.d(2),
   'First-time national funder. The full two-year proposal went in three weeks ago; Camille''s committee meets in about five weeks and she asked for the MOU draft before then. Lena owns the grant file; Remi owns the relationship.'::text,
   'cur:foundation'::text, null::date, -200, pg_temp.ts(-1, '16:20')),
  ('sequoia', 'sequoia', 'default', 'Sequoia Trust — first grant', 'appointment_scheduled', 100000, null, 40, 4, 2, 'remi',
   'Intro meeting with Arthur Feld; bring the Launchpad outcomes one-pager', pg_temp.d(3),
   'Surfaced by prospect research. Arthur answered Celeste''s note within a day. Goal for the first meeting: learn their cycle and whether San Leandro fits.',
   'cur:foundation', null, -35, pg_temp.ts(-4, '11:05')),
  ('wu', 'wu', 'default', 'Jennifer Wu — healthcare track naming gift', 'meeting_complete', 100000, pg_temp.s35_ye(15), 50, 5, 4, 'remi',
   'Schedule the ask meeting; offer two dates in the next three weeks', pg_temp.d(4),
   'Toured Pathways last month and stayed an hour with the healthcare cohort. Her mother was a nurse. The ask: $100K over two years to name the healthcare track.',
   'cur:major', null, -70, pg_temp.ts(-11, '15:30')),
  ('eastbay_renewal', 'eastbay', 'default', 'East Bay Workforce Fund — Summer Works renewal', 'meeting_complete', 130000, pg_temp.d(150), 55, 4, 4, 'lena',
   'Debrief call with Rosalind: confirm the winter RFP timeline and the stipend match', pg_temp.d(9),
   'Final report went in three weeks ago. They funded $120K last year; the renewal asks $130K to cover ten more interns at the new minimum wage.',
   'cur:foundation', null, -60, pg_temp.ts(-20, '16:15')),
  ('cypress_renewal', 'cypress', 'default', 'The Cypress Fund — Launchpad renewal', 'meeting_complete', 85000, pg_temp.s35_ye(17), 50, 3, 4, 'lena',
   'Finish the LOI draft; pull attendance and credit-recovery numbers from Ben', pg_temp.d(5),
   'Invited to submit an LOI, due in 18 days. Cypress approves renewals at its December board meeting.',
   'cur:foundation', null, -50, pg_temp.ts(-3, '17:10')),
  ('alder', 'alder', 'default', 'Alder & Finch — re-cultivation', 'identified', 50000, null, 10, 3, 2, 'lena',
   'Ask Dr. Freeman for an introduction to Miriam Stokes, their new program officer', pg_temp.d(14),
   'Declined last year (outside priorities). Their new strategy names youth workforce. No ask until we have a real conversation.',
   'cur:foundation', null, -90, pg_temp.ts(-30, '10:00')),
  ('okafor', 'okafor', 'default', 'Nnamdi Okafor — renewal', 'needs_appointment', 25000, pg_temp.s35_ye(20), 50, 4, 4, 'remi',
   'Call Nnamdi (he prefers a call to email) and ask for lunch', pg_temp.d(0),
   'Gave $25K last year after the gala; nothing yet this year. Bring Luis''s Summer Works story: he interned at a bank, like Nnamdi did at 16.',
   'cur:major', null, -120, pg_temp.ts(-7, '09:20')),
  ('bell', 'bell', 'default', 'Sarah Bell — year-end gift', 'meeting_complete', 12000, pg_temp.s35_ye(18), 80, 3, 5, 'priya',
   'Remi''s handwritten note rides with the year-end letter; ask her to round up to $12K', pg_temp.d(21),
   'Gives $10K every December, usually the week after the letter lands.',
   'cur:yearend', null, -40, pg_temp.ts(-15, '14:00')),
  ('patel', 'bd_patel', 'default', 'Ravi Patel — first board gift', 'needs_appointment', 15000, pg_temp.d(28), 30, 4, 3, 'remi',
   'Fold the giving conversation into Ravi''s onboarding coffee', pg_temp.d(9),
   'Joined the board three months ago. Board giving is at 7 of 9 this year; Ravi and Victor are the two outstanding.',
   'cur:major', null, -60, pg_temp.ts(-21, '11:45')),
  ('ramos', 'bd_ramos', 'default', 'Victor Ramos — board gift', 'ask_made', 5000, pg_temp.d(14), 75, 2, 4, 'remi',
   'Celeste to call Victor about his board gift', pg_temp.d(-2),
   'Asked at the annual meeting. Victor always gives; he is late, not reluctant.',
   'cur:major', null, -45, pg_temp.ts(-30, '10:30')),
  ('alvarez', 'alvarez_ricardo', 'default', 'Alvarez family — year-end gift', 'appointment_scheduled', 15000, pg_temp.s35_ye(10), 40, 3, 5, 'priya',
   'Confirm lunch with Ricardo and Elena; bring a kitchen intern story', pg_temp.d(-1),
   'Bought a gala table two years running. Ricardo hires Summer Works interns in his kitchens; Elena volunteers in Mentor Circles.',
   'cur:major', null, -100, pg_temp.ts(-12, '13:15')),
  ('halvorsen', 'pl_halvorsen', 'default', 'Irene Halvorsen — first gift', 'researched', 25000, null, 20, 4, 3, 'priya',
   'Invite Irene to the trades job-site visit with Redline', pg_temp.d(16),
   'Celeste''s neighbor; asked about the trades track at the gala. Celeste will host the first conversation.',
   'cur:major', null, -150, pg_temp.ts(-18, '15:50')),
  ('greenleaf', 'pl_greenleaf', 'default', 'Greenleaf Community Trust — Summer Works stipends', 'meeting_complete', 30000, pg_temp.s35_ye(16), 40, 3, 3, 'lena',
   'Draft the proposal narrative for their December docket', pg_temp.d(12),
   'Program officer invited a proposal after the site visit.',
   'cur:foundation', null, -90, pg_temp.ts(-6, '15:05')),
  ('rotary', 'pl_rotary', 'default', 'Lakeshore Rotary — Summer Works stipends', 'identified', 8000, null, 10, 2, 3, null,
   'Reply to the service chair''s web inquiry and set a call', pg_temp.d(3),
   'Inbound through the website last night. We withdrew last spring when their cycle closed. Needs an owner.',
   'cur:foundation', null, -1, pg_temp.ts(-1, '20:14')),
  ('freeman_legacy', 'bd_freeman', 'default', 'Dr. Alicia Freeman — legacy gift conversation', 'identified', null, null, null, 3, 5, 'remi',
   'Share the planned-giving one-pager after the Program committee meeting', pg_temp.d(30),
   'Alicia mentioned naming Northbridge in her estate plan. Go slowly; no amount yet.',
   'cur:major', null, -40, pg_temp.ts(-40, '12:00')),
  -- ── default pipeline: on hold ──
  ('harrington_reserve', 'bd_harrington', 'default', 'Celeste Harrington — Opportunity Reserve lead gift', 'on_hold', 100000, null, null, 5, 5, 'remi',
   'Revisit after the board retreat', pg_temp.d(70),
   'Celeste offered to seed the reserve once the board adopts the reserve investment policy at the retreat. Parked until then.',
   'cur:major', pg_temp.d(67), -75, pg_temp.ts(-28, '17:20')),
  -- ── corporate pipeline: open ──
  ('pacific_renewal', 'pacific_summit', 'corporate', 'Pacific Summit Bank — Summer Works presenting sponsor renewal', 'cultivate', 60000, pg_temp.s35_ye(12), 55, 5, 5, 'priya',
   'Follow up with Daniel on the proposal before the bank''s budget lock', pg_temp.d(6),
   'Renewal at $60K, up from $50K, to add four interns in commercial banking. Daniel Osei is the internal champion; Ian Morales manages the budget. The proposal went in ten days ago.',
   'cur:corporate', null, -60, pg_temp.ts(-10, '16:00')),
  ('pacific_ye_match', 'pacific_summit', 'corporate', 'Pacific Summit Bank — Year-End match', 'solicit', 25000, pg_temp.s35_ye(1), 75, 5, 5, 'priya',
   'Daniel to confirm the match amount with the bank''s foundation committee', pg_temp.d(8),
   'A dollar-for-dollar match on year-end gifts, announced in the letter. Daniel is carrying it inside the bank.',
   'cur:yearend', null, -40, pg_temp.ts(-5, '12:40')),
  ('lumenfield', 'pl_lumenfield', 'corporate', 'Lumenfield Systems — Pathways IT apprenticeship sponsor', 'qualify', 35000, null, 30, 4, 2, 'priya',
   'Send the apprenticeship one-pager and propose a site visit at Kinetic Labs', pg_temp.d(10),
   'Promoted from prospect research. Declined a summer sponsorship last year on timing; their new head of impact took the intro call last month. Ken Nakamura knows their CTO.',
   'cur:corporate', null, -40, pg_temp.ts(-12, '10:15')),
  ('harbor_cna', 'harbor', 'corporate', 'Harbor Health — CNA cohort sponsorship', 'solicit', 30000, pg_temp.s35_ye(5), 75, 4, 5, 'priya',
   'Finalize MOU language on clinical-hour supervision with Samuel Reyes', pg_temp.d(8),
   'Sponsors the CNA exam fees and scrubs for the next healthcare cohort, on top of the community-benefit grant.',
   'cur:corporate', null, -50, pg_temp.ts(-14, '11:20')),
  ('redline_renewal', 'redline', 'corporate', 'Redline Builders — trades pathway, next summer', 'pledged', 30000, pg_temp.s35_ye(15), 90, 4, 5, 'priya',
   'Send the sponsor agreement for Rick Saldana''s signature', pg_temp.d(11),
   'Verbal yes from Rick after the pre-apprenticeship completions. Paperwork after their budget closes.',
   'cur:corporate', null, -35, pg_temp.ts(-9, '14:35')),
  ('lakeside', 'pl_lakeside', 'corporate', 'Lakeside Medical Group — medical assistant pathway', 'identify', 25000, null, 15, 4, 2, 'priya',
   'Monique to introduce Priya to their new CHRO', pg_temp.d(12),
   'Promoted from prospect research. Fourteen clinics, chronic medical-assistant shortage.',
   'cur:corporate', null, -30, pg_temp.ts(-5, '09:45')),
  ('kinetic_match', 'kinetic', 'corporate', 'Kinetic Labs — year-end employee giving match', 'pledged', 15000, pg_temp.s35_ye(31), 90, 5, 5, 'priya',
   'Get the match terms in writing for the year-end letter', pg_temp.d(7),
   'Kinetic matches employee gifts to Northbridge up to $15K through December 31, on top of the $75K partnership pledge.',
   'cur:yearend', null, -25, pg_temp.ts(-2, '16:50')),
  ('harborlight_gala', 'corp_harborlight', 'corporate', 'Harborlight Property Group — gala presenting sponsor', 'qualify', 25000, null, 30, 4, 4, 'jordan',
   'Lunch with Peter Lindgren to review this year''s recognition', pg_temp.d(19),
   'Presenting sponsor two years running. Early ask for next spring before their budget is set.',
   'cur:gala', null, -30, pg_temp.ts(-8, '13:00')),
  ('quillfeather_it', 'corp_quillfeather', 'corporate', 'Quillfeather Software — IT internship sponsorship', 'cultivate', 20000, pg_temp.s35_ye(14), 55, 4, 4, 'priya',
   'Send Celia Moreno the two-intern sponsorship proposal', pg_temp.d(13),
   'Hosts two IT-track interns each summer and matches employee gifts. Asking them to fund the stipends as well.',
   'cur:corporate', null, -45, pg_temp.ts(-16, '10:50')),
  -- ── default pipeline: closed (this year and last) ──
  ('won_goldberg', 'goldberg', 'default', 'Aaron Goldberg — DAF grant', 'closed_won', 20000, pg_temp.d(-9), 100, 4, 5, 'remi', null, null,
   'Recommended through his donor-advised fund at Bay Legacy Giving Fund. Thank-you call is overdue.', 'cur:major', null, -60, pg_temp.ts(-9, '14:10')),
  ('won_harrington_h1', 'bd_harrington', 'default', 'Celeste Harrington — first half of her annual gift', 'closed_won', 20000, pg_temp.d(-100), 100, 5, 5, 'remi', null, null,
   'Second half pledged for December.', 'cur:major', null, -130, pg_temp.ts(-100, '15:00')),
  ('won_hollis', 'hollis', 'default', 'Hollis Family Foundation — Pathways Fellowship', 'closed_won', 150000, pg_temp.s35_fs(-30), 100, 4, 5, 'lena', null, null,
   'Renewed at $150K after the pilot year.', null, null, -200, pg_temp.ts(pg_temp.s35_off(pg_temp.s35_fs(-30)), '16:00')),
  ('won_harbor', 'harbor', 'default', 'Harbor Health Partners — community-benefit grant', 'closed_won', 40000, pg_temp.d(-70), 100, 4, 5, 'lena', null, null,
   null, null, null, -125, pg_temp.ts(-70, '12:30')),
  ('won_eastshore', 'eastshore_wdb', 'default', 'Eastshore WDB — Pathways contract', 'closed_won', 420000, pg_temp.s35_fs(-45), 100, 5, 3, 'lena', null, null,
   'Awarded $420K of the $450K requested.', null, null, -230, pg_temp.ts(pg_temp.s35_off(pg_temp.s35_fs(-45)), '11:00')),
  ('won_eastshore_pilot', 'eastshore_wdb', 'default', 'Eastshore WDB — Pathways pilot contract', 'closed_won', 180000, pg_temp.s35_ly(110), 100, 5, 3, 'lena', null, null,
   null, null, null, -370, pg_temp.ts(pg_temp.s35_off(pg_temp.s35_ly(110)), '11:00')),
  ('won_ca_yoi', 'ca_yoi', 'default', 'California YOI — two-year award', 'closed_won', 350000, pg_temp.s35_ly(150), 100, 5, 3, 'lena', null, null,
   null, null, null, -470, pg_temp.ts(pg_temp.s35_off(pg_temp.s35_ly(150)), '11:00')),
  ('won_bayview', 'bayview', 'default', 'Bayview Community Foundation — three-year general operating', 'closed_won', 750000, pg_temp.d(-445), 100, 5, 5, 'remi', null, null,
   null, null, null, -520, pg_temp.ts(-445, '15:20')),
  ('won_eastbay', 'eastbay', 'default', 'East Bay Workforce Fund — Summer Works stipends', 'closed_won', 120000, pg_temp.s35_ly(200), 100, 4, 4, 'lena', null, null,
   null, null, null, -540, pg_temp.ts(pg_temp.s35_off(pg_temp.s35_ly(200)), '12:00')),
  ('won_cypress', 'cypress', 'default', 'The Cypress Fund — Launchpad Academy', 'closed_won', 75000, pg_temp.s35_ly(110), 100, 3, 4, 'lena', null, null,
   null, null, null, -540, pg_temp.ts(pg_temp.s35_off(pg_temp.s35_ly(110)), '12:00')),
  ('won_okafor_last', 'okafor', 'default', 'Nnamdi Okafor — post-gala gift', 'closed_won', 25000, pg_temp.d(-300), 100, 4, 4, 'remi', null, null,
   'First major gift, two weeks after his first gala.', 'prev:major', null, -340, pg_temp.ts(-300, '13:00')),
  ('won_chen', 'chen_margaret', 'default', 'Chen family — three-year Launchpad pledge', 'closed_won', 150000, pg_temp.d(-335), 100, 5, 5, 'remi', null, null,
   '$50K a year for three years.', 'prev:major', null, -420, pg_temp.ts(-335, '17:00')),
  ('won_harrington_prev', 'bd_harrington', 'default', 'Celeste Harrington — annual gift (last year)', 'closed_won', 40000, pg_temp.s35_lastdec(11), 100, 5, 5, 'remi', null, null,
   null, 'prev:major', null, -480, pg_temp.ts(pg_temp.s35_off(pg_temp.s35_lastdec(11)), '12:00')),
  ('won_bell_last', 'bell', 'default', 'Sarah Bell — year-end gift (last year)', 'closed_won', 10000, pg_temp.s35_lastdec(15), 100, 3, 5, 'priya', null, null,
   null, 'prev:major', null, pg_temp.s35_off(pg_temp.s35_lastdec(15)) - 40, pg_temp.ts(pg_temp.s35_off(pg_temp.s35_lastdec(15)), '12:00')),
  ('lost_alder', 'alder', 'default', 'Alder & Finch — Launchpad', 'closed_lost', 50000, pg_temp.s35_ly(170), 0, 3, 2, 'lena', null, null,
   'Declined: outside their priorities at the time.', 'prev:foundation', null, -560, pg_temp.ts(pg_temp.s35_off(pg_temp.s35_ly(170)), '11:00')),
  ('lost_pinecrest', 'pl_pinecrest', 'default', 'Pinecrest Family Foundation — Mentor Circles', 'closed_lost', 40000, pg_temp.d(-150), 0, 3, 2, 'lena', null, null,
   'LOI declined: they fund school-day programs only this cycle.', 'cur:foundation', null, -230, pg_temp.ts(-150, '10:40')),
  -- ── corporate pipeline: closed ──
  ('signed_pacific', 'pacific_summit', 'corporate', 'Pacific Summit Bank — Summer Works presenting sponsor', 'closed_won', 50000, pg_temp.d(-150), 100, 5, 5, 'priya', null, null,
   'Paid ten days later. Eight interns in branch operations and commercial banking.', 'cur:corporate', null, -230, pg_temp.ts(-150, '16:30')),
  ('signed_kinetic', 'kinetic', 'corporate', 'Kinetic Labs — annual partnership (three installments)', 'closed_won', 75000, pg_temp.d(-45), 100, 5, 5, 'priya', null, null,
   '$75K in three installments plus twelve employee mentors.', 'cur:corporate', null, -110, pg_temp.ts(-45, '15:10')),
  ('signed_redline', 'redline', 'corporate', 'Redline Builders — trades internships', 'closed_won', 25000, pg_temp.d(-80), 100, 4, 5, 'priya', null, null,
   null, 'cur:corporate', null, -120, pg_temp.ts(-80, '11:30')),
  ('declined_lumenfield', 'pl_lumenfield', 'corporate', 'Lumenfield Systems — Summer Works sponsorship', 'closed_lost', 20000, pg_temp.s35_fs(-60), 0, 4, 2, 'priya', null, null,
   'Declined on timing; budget was committed. Re-approached this fall with the IT apprenticeship angle.', 'cur:corporate', null, -420, pg_temp.ts(pg_temp.s35_off(pg_temp.s35_fs(-60)), '10:00'))
) as o(k, con, pipe, n, stage, ask, close, prob, cap, aff, owner, next, due, notes, strat, snooze, created, updated)
where pg_temp.s35_con(o.con) is not null
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. The Ask Log: every solicitation, tied to a funder (+ document metadata;
--    the files themselves are not in storage).
-- ════════════════════════════════════════════════════════════════════════════
insert into public.asks
  (id, org_id, funder_id, form, title, amount_requested, ask_date, status, amount_committed, decided_on,
   owner, grant_id, opportunity_id, notes, created_by, created_at, updated_at)
select pg_temp.nb_id('ask:' || a.k), pg_temp.nb_org(), pg_temp.s35_con(a.funder), a.form, a.title, a.req, a.dt, a.status, a.cmt, a.dec,
       a.owner,
       case when a.grantk is null then null else pg_temp.nb_id('grant:' || a.grantk) end,
       (select id from public.opportunities where id = pg_temp.nb_id('opp:' || a.oppk) and org_id = pg_temp.nb_org()),
       a.notes, a.owner, pg_temp.ts(a.created, '10:25'), pg_temp.ts(a.touched, '16:05')
from (values
  -- open
  ('meridian', 'meridian', 'grant_proposal', 'San Leandro expansion: two-year proposal', 300000::numeric, pg_temp.d(-21), 'pending', null::numeric, null::date, 'lena',
   'meridian'::text, 'meridian'::text, 'Submitted through Meridian''s portal. Committee decision in about five weeks.'::text, -60, -2),
  ('cypress_loi', 'cypress', 'loi', 'Launchpad renewal LOI', 85000, pg_temp.d(18), 'draft', null, null, 'lena',
   'cypress_renewal', 'cypress_renewal', 'Draft two is with Remi.', -14, -3),
  ('greenleaf', 'pl_greenleaf', 'grant_proposal', 'Summer Works stipends proposal', 30000, pg_temp.d(33), 'draft', null, null, 'lena',
   'greenleaf', 'greenleaf', null, -10, -6),
  ('wu', 'wu', 'major_gift', 'Healthcare track naming gift', 100000, null, 'draft', null, null, 'remi',
   null, 'wu', 'Ask meeting to schedule. Lead with Keisha''s clinical rotation and the CNA pass rate.', -11, -11),
  ('bell', 'bell', 'letter', 'Year-end letter with a handwritten note', 12000, pg_temp.d(15), 'draft', null, null, 'priya',
   null, 'bell', null, -15, -15),
  ('pacific_renewal', 'pacific_summit', 'corporate_sponsorship', 'Summer Works presenting sponsor renewal', 60000, pg_temp.d(-10), 'submitted', null, null, 'priya',
   null, 'pacific_renewal', 'Deck plus a one-page intern roster from last summer.', -12, -10),
  ('harbor_cna', 'harbor', 'corporate_sponsorship', 'CNA cohort sponsorship', 30000, pg_temp.d(-14), 'submitted', null, null, 'priya',
   null, 'harbor_cna', null, -16, -14),
  ('ramos', 'bd_ramos', 'verbal', 'Board gift for this fiscal year', 5000, pg_temp.d(-44), 'pending', null, null, 'remi',
   null, 'ramos', 'Asked at the annual meeting.', -44, -30),
  -- decided
  ('state_yoi', 'ca_yoi', 'grant_proposal', 'Youth workforce services: two-year application', 350000, pg_temp.s35_ly(60), 'awarded', 350000, pg_temp.s35_ly(150), 'lena',
   'state_yoi', 'won_ca_yoi', null, -480, -470),
  ('workforce', 'eastshore_wdb', 'grant_proposal', 'Pathways services RFP response', 450000, pg_temp.s35_fs(-120), 'partial', 420000, pg_temp.s35_fs(-45), 'lena',
   'workforce_contract', 'won_eastshore', 'Awarded $420K of $450K; the WDB trimmed the supportive-services line.', -250, -230),
  ('workforce_pilot', 'eastshore_wdb', 'grant_proposal', 'Pathways pilot contract proposal', 180000, pg_temp.s35_ly(80), 'awarded', 180000, pg_temp.s35_ly(110), 'lena',
   'workforce_pilot', 'won_eastshore_pilot', null, -370, -365),
  ('hollis', 'hollis', 'grant_proposal', 'Pathways Fellowship: year-two request', 150000, pg_temp.s35_fs(-100), 'awarded', 150000, pg_temp.s35_fs(-30), 'lena',
   'hollis_pathways', 'won_hollis', null, -215, -200),
  ('harbor_grant', 'harbor', 'grant_proposal', 'Community benefit: healthcare track', 40000, pg_temp.d(-120), 'awarded', 40000, pg_temp.d(-70), 'lena',
   'harbor_health', 'won_harbor', null, -125, -70),
  ('bayview', 'bayview', 'grant_proposal', 'General operating: three-year renewal', 750000, pg_temp.d(-500), 'awarded', 750000, pg_temp.d(-445), 'remi',
   'bayview_gos', 'won_bayview', null, -520, -445),
  ('eastbay', 'eastbay', 'grant_proposal', 'Summer Works stipends', 120000, pg_temp.s35_ly(130), 'awarded', 120000, pg_temp.s35_ly(200), 'lena',
   'eastbay_workforce', 'won_eastbay', null, -545, -540),
  ('cypress_prior', 'cypress', 'grant_proposal', 'Launchpad Academy', 75000, pg_temp.s35_ly(40), 'awarded', 75000, pg_temp.s35_ly(110), 'lena',
   'cypress_launchpad', 'won_cypress', null, -545, -540),
  ('hollis_prior', 'hollis', 'grant_proposal', 'Pathways pilot year', 120000, pg_temp.s35_ly(-60), 'awarded', 120000, pg_temp.s35_ly(-10), 'remi',
   'hollis_prior', null, null, -560, -555),
  ('alder_prior', 'alder', 'grant_proposal', 'Launchpad Academy', 50000, pg_temp.s35_ly(90), 'declined', null, pg_temp.s35_ly(170), 'lena',
   'alder_prior', 'lost_alder', 'Outside their priorities at the time.', -560, -470),
  ('pinecrest', 'pl_pinecrest', 'loi', 'Mentor Circles expansion LOI', 40000, pg_temp.d(-190), 'declined', null, pg_temp.d(-150), 'lena',
   null, 'lost_pinecrest', 'They fund school-day programs only this cycle.', -200, -150),
  ('rotary_prior', 'pl_rotary', 'grant_proposal', 'Summer Works stipends (club grant)', 10000, pg_temp.s35_fs(-150), 'withdrawn', null, pg_temp.s35_fs(-120), 'jordan',
   null, null, 'Withdrew: the club''s cycle closed after our summer start.', -480, -470),
  ('lumenfield_prior', 'pl_lumenfield', 'corporate_sponsorship', 'Summer Works sponsorship', 20000, pg_temp.s35_fs(-90), 'declined', null, pg_temp.s35_fs(-60), 'priya',
   null, 'declined_lumenfield', 'Declined on timing.', -420, -400),
  ('kinetic', 'kinetic', 'corporate_sponsorship', 'Annual partnership: Pathways IT plus employee mentors', 75000, pg_temp.d(-75), 'awarded', 75000, pg_temp.d(-45), 'priya',
   null, 'signed_kinetic', null, -80, -45),
  ('pacific_prior', 'pacific_summit', 'corporate_sponsorship', 'Summer Works presenting sponsor', 50000, pg_temp.d(-190), 'awarded', 50000, pg_temp.d(-150), 'priya',
   null, 'signed_pacific', null, -195, -150),
  ('redline', 'redline', 'corporate_sponsorship', 'Trades pathway sponsorship', 25000, pg_temp.d(-110), 'awarded', 25000, pg_temp.d(-80), 'priya',
   null, 'signed_redline', null, -115, -80),
  ('okafor_prior', 'okafor', 'verbal', 'Post-gala gift', 25000, pg_temp.d(-310), 'awarded', 25000, pg_temp.d(-300), 'remi',
   null, 'won_okafor_last', 'Asked over lunch; he wired it the next week.', -312, -300),
  ('chen_pledge', 'chen_margaret', 'major_gift', 'Three-year Launchpad pledge', 150000, pg_temp.d(-360), 'awarded', 150000, pg_temp.d(-335), 'remi',
   null, 'won_chen', null, -365, -335),
  ('goldberg', 'goldberg', 'letter', 'Fall letter with a note from Remi', 20000, pg_temp.d(-40), 'awarded', 20000, pg_temp.d(-9), 'remi',
   null, 'won_goldberg', 'Answered with a DAF recommendation for the full amount.', -42, -9)
) as a(k, funder, form, title, req, dt, status, cmt, dec, owner, grantk, oppk, notes, created, touched)
where pg_temp.s35_con(a.funder) is not null
on conflict do nothing;

insert into public.ask_documents (id, org_id, ask_id, storage_path, filename, mime, size_bytes, label, uploaded_by, created_at)
select pg_temp.nb_id('askdoc:' || d.k), pg_temp.nb_org(), pg_temp.nb_id('ask:' || d.ask),
       'asks/' || pg_temp.nb_id('ask:' || d.ask) || '/' || (extract(epoch from pg_temp.ts(d.created, '11:00')) * 1000)::bigint
         || '-' || substr(md5('nb:askdoc:' || d.k), 1, 8) || '.' || d.ext,
       d.fname, d.mime, d.size, d.label, d.who, pg_temp.ts(d.created, '11:00')
from (values
  ('mer_narr', 'meridian', 'Northbridge_Meridian_Proposal_SanLeandro.pdf', 'pdf', 'application/pdf', 1843200::bigint, 'Proposal narrative', 'lena', -21),
  ('mer_budget', 'meridian', 'Meridian_TwoYear_Budget.xlsx', 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 96256, 'Two-year budget', 'kwame', -21),
  ('mer_letter', 'meridian', 'SLUSD_Letter_of_Support.pdf', 'pdf', 'application/pdf', 412672, 'District letter of support', 'lena', -22),
  ('cy_loi', 'cypress_loi', 'Cypress_Renewal_LOI_draft2.docx', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 58368, 'LOI draft 2', 'lena', -3),
  ('ps_deck', 'pacific_renewal', 'SummerWorks_Presenting_Sponsor_Renewal.pdf', 'pdf', 'application/pdf', 3276800, 'Sponsorship deck', 'priya', -10),
  ('har_cna', 'harbor_cna', 'Harbor_CNA_Cohort_Sponsorship.pdf', 'pdf', 'application/pdf', 905216, 'Sponsorship proposal', 'priya', -14),
  ('wu_onepager', 'wu', 'Healthcare_Track_Naming_OnePager.pdf', 'pdf', 'application/pdf', 655360, 'One-pager', 'priya', -9),
  ('hol_prop', 'hollis', 'Hollis_Pathways_YearTwo_Request.pdf', 'pdf', 'application/pdf', 1228800, 'Proposal', 'lena', pg_temp.s35_off(pg_temp.s35_fs(-100))),
  ('ws_rfp', 'workforce', 'Eastshore_WDB_RFP_Response.pdf', 'pdf', 'application/pdf', 4718592, 'RFP response', 'lena', pg_temp.s35_off(pg_temp.s35_fs(-120))),
  ('yoi_app', 'state_yoi', 'CA_YOI_Application.pdf', 'pdf', 'application/pdf', 2621440, 'State application', 'lena', pg_temp.s35_off(pg_temp.s35_ly(60))),
  ('bay_prop', 'bayview', 'Bayview_GOS_ThreeYear_Proposal.pdf', 'pdf', 'application/pdf', 1572864, 'Proposal', 'remi', -500)
) as d(k, ask, fname, ext, mime, size, label, who, created)
where exists (select 1 from public.asks a where a.id = pg_temp.nb_id('ask:' || d.ask) and a.org_id = pg_temp.nb_org())
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. The Year-End gift table (specs/fundraising-gift-tables.md): active, so it
--    feeds Today's Moves. Window opens with the board's quiet phase.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.fr_gift_tables
  (id, org_id, name, starts_on, ends_on, status, target, multiplier, goal_round_to, coverage_basis,
   default_term_years, monthly_modeled_years, ratio_major, ratio_mid, ratio_base, major_threshold,
   target_rationale, multiplier_rationale, notes, strategy_id, campaign_id, created_at, updated_at)
select pg_temp.nb_id('gifttable:yearend'), pg_temp.nb_org(),
       'Year-End ' || extract(year from pg_temp.d(60))::int,
       pg_temp.d(-44), make_date(extract(year from pg_temp.d(60))::int, 12, 31), 'active',
       320000, 1.1, null, 'window', 1, 1, 4, 3, 1, null,
       'The campaign goal is $400,000. About $80,000 of that comes from the mail and online appeal in gifts under $1,000, which we work as a mailing rather than as names, so it sits outside this table. That leaves $320,000 to raise from named asks.',
       '1.1 because roughly one ask in ten slips past December 31 or closes smaller than asked. Last year we ran 1.0 and came up $18,000 short at the $25,000 level.',
       'Quiet phase opened with board asks at the ' || to_char(pg_temp.d(-44), 'FMMonth') || ' annual meeting; the letter and public launch go out '
         || to_char(pg_temp.d(14), 'FMMonth FMDD') || '. The $1,000 to $5,000 names come from last year''s renewals; Priya and Jordan split them.',
       (select id from public.fr_plan_strategies where id = pg_temp.nb_id('frplan:cur:yearend')),
       (select id from public.campaigns where id = pg_temp.nb_id('camp:yearend') and org_id = pg_temp.nb_org()),
       pg_temp.ts(-50, '14:00'), pg_temp.ts(-3, '16:45')
on conflict do nothing;

insert into public.fr_gift_table_levels
  (id, org_id, gift_table_id, label, amount, cadence, term_years, gifts_needed, prospects_per_gift, purpose, sort, created_at, updated_at)
select pg_temp.nb_id('gtl:yearend:' || l.label), pg_temp.nb_org(), pg_temp.nb_id('gifttable:yearend'), l.label, l.amt, 'one_time', null,
       l.n, l.ppg, l.purpose, l.sort, pg_temp.ts(-50, '14:10'), pg_temp.ts(-21, '11:00')
from (values
  ('01', 50000::numeric, 2, 4, 'Lead gifts. Two yeses here are more than a quarter of the table.', 1),
  ('02', 25000, 4, 4, 'The board chair, last year''s lead donors, and the bank match.', 2),
  ('03', 10000, 6, 3, 'Upgrade the donors who give $5K to $10K every December.', 3),
  ('04', 5000, 8, 3, 'Board members and loyal mid-level donors.', 4),
  ('05', 2500, 12, 2, 'Mid-level renewals: a personal note, then a call.', 5),
  ('06', 1000, 30, 1, 'Leadership circle. Worked by letter with a follow-up call, one prospect per gift.', 6)
) as l(label, amt, n, ppg, purpose, sort)
where exists (select 1 from public.fr_gift_tables t where t.id = pg_temp.nb_id('gifttable:yearend'))
on conflict do nothing;

-- ── Named placements (household trigger sets household_id) ─────────────────
insert into public.fr_gift_table_placements
  (id, org_id, gift_table_id, level_id, constituent_id, opportunity_id, target_amount,
   capacity_score, affinity_score, connection_score, readiness_score, warm_path, why_note,
   status, next_step, next_step_due, owner, created_at, updated_at)
select pg_temp.nb_id('gtp:yearend:' || p.k), pg_temp.nb_org(), pg_temp.nb_id('gifttable:yearend'),
       pg_temp.nb_id('gtl:yearend:' || p.lvl), pg_temp.s35_con(p.con),
       (select id from public.opportunities where id = pg_temp.nb_id('opp:' || p.opp) and org_id = pg_temp.nb_org()),
       p.target, p.cs, p.afs, p.cns, p.rs, p.warm, p.why, p.status, p.next, p.due, p.owner,
       pg_temp.ts(p.created, '10:30'), pg_temp.ts(p.touched, '15:40')
from (values
  ('wu', '01', 'wu', 'wu', null::numeric, 5::smallint, 3::smallint, 4::smallint, 4::smallint,
   'Toured Pathways with Monique Jackson last month; Monique knows her from the Harbor Health foundation council.'::text,
   'Liquidity event this year; gives to workforce programs; her mother was a nurse.'::text, 'cultivating'::text, null::text, null::date, 'remi'::text, -44, -11),
  ('chen', '01', 'chen_margaret', null, 50000, 5, 5, 5, 5,
   'Margaret and David have given every year since their daughter tutored at Launchpad.',
   'Year two installment of the $150K pledge is due in December; credited to this table.', 'ready',
   'Confirm the December transfer and invite them to the donor breakfast', pg_temp.d(6), 'remi', -44, -4),
  ('okafor', '02', 'okafor', 'okafor', null, 4, 4, 3, 3,
   'Immigrated at 14; a summer job at a bank changed his path. Luis''s internship story is the opener.',
   'Gave $25K last year after the gala; lapsed this year so far.', 'cultivating', null, null, 'remi', -44, -7),
  ('harrington', '02', 'bd_harrington', null, 20000, 5, 5, 5, 5,
   'Board chair. Pledged the second half of her annual gift at the annual meeting.',
   'Gives $40K a year in two halves; the December half is this table''s.', 'ready',
   'Confirm the December gift date and whether she will host the donor breakfast', pg_temp.d(3), 'remi', -44, -6),
  ('goldberg', '02', 'goldberg', 'won_goldberg', null, 4, 5, 3, 5,
   'Retired teacher; gives through his DAF at Bay Legacy Giving Fund.',
   'Quiet-phase lead gift arrived nine days ago; credited here.', 'ready',
   'Thank-you call from Remi (overdue), then a handwritten note', pg_temp.d(-2), 'remi', -40, -9),
  ('halvorsen', '02', 'pl_halvorsen', 'halvorsen', null, 4, 2, 4, 2,
   'Celeste''s neighbor; came to the gala as Celeste''s guest.',
   'Stretch level: asking for $25K once she has seen a Redline job site.', 'prospect', null, null, 'priya', -40, -18),
  ('pacific', '02', 'pacific_summit', 'pacific_ye_match', null, 5, 5, 5, 4,
   'Daniel Osei (board vice chair) is carrying the match inside the bank.',
   'A dollar-for-dollar year-end match, announced in the letter.', 'cultivating', null, null, 'priya', -40, -5),
  ('bell', '03', 'bell', 'bell', null, 3, 5, 3, 5,
   'Gives every December after the letter. Prefers a letter to a call.',
   'Ten years of December gifts at $10K.', 'ready', null, null, 'priya', -44, -15),
  ('alvarez', '03', 'alvarez_ricardo', 'alvarez', null, 3, 5, 4, 4,
   'Ricardo hires Summer Works interns in his kitchens; Elena volunteers in Mentor Circles.',
   'Gala table two years running; first year-end ask.', 'cultivating', null, null, 'priya', -44, -12),
  ('patel', '03', 'bd_patel', 'patel', null, 4, 2, 4, 3,
   'New director; his onboarding coffee is the natural moment.',
   'One of two directors who have not yet given this year.', 'prospect', null, null, 'remi', -44, -21),
  ('kinetic', '03', 'kinetic', 'kinetic_match', null, 5, 5, 5, 5,
   'Priscilla Gomez owns the partnership; twelve Kinetic mentors are already in.',
   'Employee giving match up to $15K through December 31.', 'ready', null, null, 'priya', -25, -2),
  ('ramos', '04', 'bd_ramos', 'ramos', null, 2, 4, 5, 4,
   'Board secretary; Celeste is making the call.',
   'Late on his board gift, not reluctant.', 'ready', null, null, 'remi', -44, -30),
  ('nakamura', '04', 'bd_nakamura', null, 5000, 4, 5, 5, 5,
   'Mentors two IT fellows himself.',
   'His half of the $10K GivingTuesday board match with Celeste (forecast in Finance with GivingTuesday).', 'ready', null, null, 'priya', -40, -38)
) as p(k, lvl, con, opp, target, cs, afs, cns, rs, warm, why, status, next, due, owner, created, touched)
where pg_temp.s35_con(p.con) is not null
  and exists (select 1 from public.fr_gift_table_levels l where l.id = pg_temp.nb_id('gtl:yearend:' || p.lvl))
on conflict do nothing;

-- ── Data-driven placements: last year's renewals at $1K–$5K, chosen from
--    whatever donors and gifts Section 3a created (deterministic, so a re-run
--    selects the same people; a second household member is skipped by the
--    household unique index). ──────────────────────────────────────────────
insert into public.fr_gift_table_placements
  (id, org_id, gift_table_id, level_id, constituent_id, opportunity_id, target_amount,
   capacity_score, affinity_score, connection_score, readiness_score, warm_path, why_note,
   status, next_step, next_step_due, owner, created_at, updated_at)
select pg_temp.nb_id('gtp:yearend:' || x.cid::text), pg_temp.nb_org(), pg_temp.nb_id('gifttable:yearend'),
       pg_temp.nb_id('gtl:yearend:' || x.lvl), x.cid, null,
       case x.lvl when '04' then 5000 when '05' then 2500 else 1000 end,
       case x.lvl when '04' then 4 when '05' then 3 else 3 end,
       least(5, 1 + x.yrs)::smallint,
       (1 + floor(pg_temp.rnd('s35:conn:' || x.cid) * 4))::smallint,
       (2 + floor(pg_temp.rnd('s35:ready:' || x.cid) * 3))::smallint,
       case when x.tags && array['mentor','mentor_circles'] then 'Mentor Circles volunteer; Simone can make the introduction.'
            when x.tags && array['gala'] then 'Came to the gala; Jordan has been her contact since.'
            when x.tags && array['alumni_parent'] then 'Alumni parent; their kid went through Launchpad.' end,
       'Largest gift in the last two years: $' || to_char(x.maxamt, 'FM999,999') || ' (' || to_char(x.maxdate, 'FMMon YYYY') || ').',
       case when x.rn = 3 and x.lvl = '04' then 'declined'
            when pg_temp.rnd('s35:status:' || x.cid) < .35 then 'ready'
            when pg_temp.rnd('s35:status:' || x.cid) < .75 then 'cultivating' else 'prospect' end,
       case when x.rn = 3 and x.lvl = '04' then null
            when pg_temp.rnd('s35:next:' || x.cid) < .75 then pg_temp.pick(array[
              'Personal note with the year-end letter',
              'Call the week after the letter lands',
              'Invite to the donor breakfast',
              'Ask to renew at last year''s level',
              'Ask to step up one level',
              'Thank-you call first, then the ask'], 's35:nextw:' || x.cid) end,
       case when x.rn = 3 and x.lvl = '04' then null
            when pg_temp.rnd('s35:next:' || x.cid) < .75 then pg_temp.d(15 + floor(pg_temp.rnd('s35:due:' || x.cid) * 30)::int) end,
       case when x.lvl = '04' then 'priya' else pg_temp.pick(array['jordan','jordan','priya'], 's35:own:' || x.cid) end,
       pg_temp.ts(-30 + floor(pg_temp.rnd('s35:pc:' || x.cid) * 10)::int, '11:10'),
       pg_temp.ts(-20 + floor(pg_temp.rnd('s35:pt:' || x.cid) * 12)::int, '14:25')
from (
  select s.*, row_number() over (partition by s.lvl order by md5('s35:' || s.cid::text)) as rn
  from (
    select c.id as cid, c.tags,
           max(g.amount) as maxamt,
           (array_agg(g.gift_date order by g.amount desc, g.gift_date desc))[1] as maxdate,
           count(distinct extract(year from g.gift_date))::int as yrs,
           case when max(g.amount) >= 4000 and max(g.amount) < 7500 then '04'
                when max(g.amount) >= 2000 and max(g.amount) < 4000 then '05'
                when max(g.amount) >= 1000 and max(g.amount) < 2000 then '06' end as lvl
    from public.constituents c
    join public.gifts g on g.constituent_id = c.id and g.org_id = c.org_id
    where c.org_id = pg_temp.nb_org() and c.type = 'person' and not c.do_not_contact and c.archived_at is null
      and g.gift_date >= pg_temp.d(-730)
      and c.id not in (select pg_temp.nb_id('con:' || k) from unnest(array[
            'bd_harrington','bd_osei','bd_lim','bd_ramos','bd_freeman','bd_nakamura','bd_jackson','bd_patel','bd_brooks',
            'po_bayview','po_hollis','po_meridian','po_sequoia','po_eastshore','chen_margaret','chen_david','okafor','wu',
            'alvarez_ricardo','alvarez_elena','goldberg','bell','pl_halvorsen']) k)
    group by c.id, c.tags
  ) s
  where s.lvl is not null
) x
where x.rn <= case x.lvl when '04' then 8 when '05' then 14 else 16 end
  and exists (select 1 from public.fr_gift_table_levels l where l.id = pg_temp.nb_id('gtl:yearend:' || x.lvl))
on conflict do nothing;

-- ── Credits: money already committed or landed that belongs to this table ──
insert into public.fr_gift_table_credits (id, org_id, gift_table_id, source_type, source_id, placement_id, attributed_by, note, created_at)
select pg_temp.nb_id('gtc:yearend:' || c.k), pg_temp.nb_org(), pg_temp.nb_id('gifttable:yearend'), c.st, c.sid,
       (select id from public.fr_gift_table_placements where id = pg_temp.nb_id('gtp:yearend:' || c.pk)),
       'priya', c.note, pg_temp.ts(c.created, '12:15')
from (values
  ('chen', 'pledge', pg_temp.nb_id('pledge:chen'), 'chen', 'Year-two installment ($50K) is due inside this window.', -40),
  ('goldberg', 'gift', pg_temp.nb_id('gift:goldberg_daf'), 'goldberg', 'Quiet-phase lead gift through his DAF.', -8),
  ('harrington', 'pledge', pg_temp.nb_id('pledge:harrington'), 'harrington', 'December half of her annual gift.', -40)
) as c(k, st, sid, pk, note, created)
where (c.st = 'pledge' and exists (select 1 from public.pledges p where p.id = c.sid and p.org_id = pg_temp.nb_org()))
   or (c.st = 'gift' and exists (select 1 from public.gifts g where g.id = c.sid and g.org_id = pg_temp.nb_org()))
on conflict do nothing;

-- Up to three in-window gifts from data-driven placements are already
-- credited; the rest stay as "possible matches" for the demo.
insert into public.fr_gift_table_credits (id, org_id, gift_table_id, source_type, source_id, placement_id, attributed_by, note, created_at)
select pg_temp.nb_id('gtc:yearend:gift:' || x.gid::text), pg_temp.nb_org(), pg_temp.nb_id('gifttable:yearend'), 'gift', x.gid, x.pid,
       'jordan', 'Renewed early, before the letter.', pg_temp.ts(-2, '10:05')
from (
  select g.id as gid, p.id as pid,
         row_number() over (order by g.amount desc, md5(g.id::text)) as rn
  from public.fr_gift_table_placements p
  join public.gifts g on g.constituent_id = p.constituent_id and g.org_id = p.org_id
  where p.gift_table_id = pg_temp.nb_id('gifttable:yearend') and p.opportunity_id is null
    and p.level_id in (pg_temp.nb_id('gtl:yearend:04'), pg_temp.nb_id('gtl:yearend:05'), pg_temp.nb_id('gtl:yearend:06'))
    and g.gift_date between pg_temp.d(-44) and pg_temp.d(-1)
) x
where x.rn <= 3
on conflict do nothing;

-- ── Plan ↔ campaigns (this org's campaigns only; first link wins) ──────────
update public.campaigns c
   set plan_strategy_id = pg_temp.nb_id('frplan:' || m.s)
  from (values ('camp:yearend', 'cur:yearend'), ('camp:gala', 'cur:gala'),
               ('camp:annual', 'cur:annual'), ('camp:summer', 'cur:corporate')) as m(c, s)
 where c.id = pg_temp.nb_id(m.c) and c.org_id = pg_temp.nb_org() and c.plan_strategy_id is null
   and exists (select 1 from public.fr_plan_strategies f where f.id = pg_temp.nb_id('frplan:' || m.s));

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Prospect research: the bench, scores, briefs, research runs.
--    No hubspot ids (this org has no HubSpot), so the bench list's Score
--    column (keyed by hubspot_contact_id) stays blank; the profile shows them.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.fr_prospects
  (id, org_id, hubspot_contact_id, type, source, name, email, org_name, status, strategy_note,
   constituent_id, opportunity_id, notes, created_by, created_at, updated_at)
select pg_temp.nb_id('prospect:' || p.k), pg_temp.nb_org(), null, p.t, p.src, p.n, p.email, p.org, p.status, p.note,
       case when p.con is null then null else pg_temp.s35_con(p.con) end,
       case when p.opp is null then null else (select id from public.opportunities where id = pg_temp.nb_id('opp:' || p.opp)) end,
       p.notes, p.by, pg_temp.ts(p.created, '10:00'), pg_temp.ts(p.touched, '16:20')
from (values
  ('wu', 'individual', 'research', 'Jennifer Wu', 'jennifer.wu@example.com', null::text, 'promoted',
   'Recent liquidity event from a health-tech sale; gives to workforce programs through a DAF; her mother was a nurse. Healthcare track is the fit.',
   'wu'::text, 'wu'::text, 'Promoted after her Pathways tour.'::text, 'remi', -95, -70),
  ('sequoia', 'foundation', 'research', 'Sequoia Trust for Education', 'hello@example.org', 'Sequoia Trust for Education', 'promoted',
   'Peninsula education trust moving into career pathways; $50K–$150K first grants; likes co-funding with a national lead.',
   'sequoia', 'sequoia', null, 'remi', -45, -35),
  ('lumenfield', 'corporate', 'manual', 'Lumenfield Systems', 'lumenfield.giving@example.com', 'Lumenfield Systems', 'promoted',
   'Cloud infrastructure company hiring entry-level support staff; new head of impact.',
   'pl_lumenfield', 'lumenfield', null, 'priya', -55, -40),
  ('lakeside', 'corporate', 'research', 'Lakeside Medical Group', 'careers@example.org', 'Lakeside Medical Group', 'promoted',
   'Fourteen East Bay clinics; chronic medical-assistant shortage; no youth pathway partner yet.',
   'pl_lakeside', 'lakeside', null, 'priya', -42, -30),
  ('marlowe', 'foundation', 'research', 'The Marlowe Foundation', 'grants@example.net', 'The Marlowe Foundation', 'active',
   'Funds allied-health career pathways in the East Bay; grants of $50K–$150K; rolling LOIs.',
   null, null, 'Brief came back last night; Lena to read before Friday.', 'remi', -9, -1),
  ('alcott', 'individual', 'research', 'Daniel and Ruth Alcott', null, null, 'active',
   'Piedmont neighbors of Celeste Harrington; their family foundation gives to Oakland education.',
   null, null, 'First research run came back too thin; rerun with the family foundation name.', 'remi', -24, -20),
  ('takahara', 'individual', 'manual', 'Owen Takahara', 'owen.takahara@example.com', 'Kinetic Labs', 'active',
   'VP Engineering at Kinetic Labs; mentors two fellows. Ken Nakamura suggests a personal ask after the holidays.',
   null, null, null, 'priya', -33, -33),
  ('fontaine', 'individual', 'research', 'Delia Fontaine', null, null, 'active',
   'Retired hospital CFO; sits on two East Bay health nonprofit boards. Possible healthcare track advisor before donor.',
   null, null, null, 'remi', -28, -26),
  ('orchard', 'foundation', 'research', 'Orchard Hill Community Fund', 'office@example.org', 'Orchard Hill Community Fund', 'active',
   'Small family fund focused on San Leandro; could co-fund the expansion with Meridian.',
   null, null, null, 'remi', -21, -19),
  ('northgate', 'corporate', 'manual', 'Northgate Credit Union', 'community@example.com', 'Northgate Credit Union', 'active',
   'Hosted two Summer Works interns this year; financial-literacy workshops are the cultivation path.',
   null, null, null, 'priya', -50, -44),
  ('marchetti', 'individual', 'manual', 'Elliot Marchetti', 'elliot.marchetti@example.com', null, 'active',
   'Referred by Ravi Patel; early-stage investor interested in employer-paid training models.',
   null, null, 'Ravi offered to bring him to the board retreat site visit.', 'remi', -18, -18),
  ('cardenas', 'foundation', 'research', 'Cardenas Family Foundation', null, 'Cardenas Family Foundation', 'disqualified',
   'Youth employment funder that looked like a fit on paper.',
   null, null, 'Disqualified: funds only in the Central Valley; their executive director confirmed by phone.', 'remi', -70, -64)
) as p(k, t, src, n, email, org, status, note, con, opp, notes, by, created, touched)
on conflict do nothing;

insert into public.fr_prospect_scores
  (id, org_id, prospect_id, hubspot_contact_id, score_capacity, score_likelihood, score_alignment, score_relationship,
   score_strategic_leverage, score_stage_fit, score_energy_suck, notes, scored_by, scored_at, created_at, updated_at)
select pg_temp.nb_id('pscore:' || s.k), pg_temp.nb_org(), pg_temp.nb_id('prospect:' || s.k), null,
       s.cap, s.lik, s.ali, s.rel, s.lev, s.fit, s.nrg, s.notes, 'remi', pg_temp.ts(s.at, '17:30'),
       pg_temp.ts(s.at, '17:30'), pg_temp.ts(s.at, '17:30')
from (values
  ('wu',         9::smallint, 7::smallint, 9::smallint, 6::smallint, 7::smallint, 8::smallint, 3::smallint, 'Capacity is real and recent. Relationship is one tour deep; Monique is the bridge.', -72),
  ('sequoia',    8, 6, 8, 5, 8, 7, 2, 'Strategic: a second San Leandro funder makes the Meridian ask stronger.', -36),
  ('lumenfield', 7, 5, 6, 4, 6, 6, 4, 'Said no once on timing. The apprenticeship framing fits their hiring problem.', -41),
  ('lakeside',   7, 5, 8, 3, 6, 5, 4, 'Alignment is obvious; we have no relationship yet.', -31),
  ('marlowe',    8, 6, 9, 2, 6, 8, 3, 'Best healthcare-track fit on the bench. Cold, but they take LOIs.', -1),
  ('alcott',     7, 4, 6, 6, 4, 4, 3, 'Warm through Celeste; research is thin.', -19),
  ('takahara',   6, 6, 7, 7, 5, 5, 2, null, -32),
  ('fontaine',   6, 4, 7, 4, 6, 4, 3, null, -25),
  ('orchard',    4, 5, 8, 3, 7, 6, 2, 'Small, but San Leandro-only: a natural co-funder.', -19),
  ('northgate',  4, 6, 6, 6, 4, 6, 2, null, -44),
  ('marchetti',  6, 4, 5, 5, 6, 3, 4, null, -17),
  ('cardenas',   6, 1, 4, 1, 2, 1, 6, 'Geography rules them out.', -64)
) as s(k, cap, lik, ali, rel, lev, fit, nrg, notes, at)
on conflict do nothing;

-- Briefs follow lib/agents/funder-research/types.ts BriefContent exactly.
insert into public.fr_prospect_briefs
  (id, org_id, prospect_id, hubspot_contact_id, content, template_version, status, generated_at, notes, created_by, created_at, updated_at)
select pg_temp.nb_id('pbrief:' || b.k), pg_temp.nb_org(), pg_temp.nb_id('prospect:' || b.k), null,
       replace(replace(b.body, '@Y1@', (extract(year from pg_temp.d(0))::int - 1)::text),
               '@Y0@', extract(year from pg_temp.d(0))::int::text)::jsonb,
       'v1', b.status, b.gen, b.notes, 'agent', b.gen, b.upd
from (values
('wu', 'final', pg_temp.ts(-80, '14:06'), pg_temp.ts(-73, '09:10'), 'Reviewed by Remi before the tour.', $j$
{
  "snapshot": "Jennifer Wu co-founded a home-health scheduling company that sold this year. She now gives through a donor-advised fund and has funded two Bay Area workforce programs at the $50K to $100K level. Her mother was a nurse, and nursing careers come up in nearly every public interview she gives. Best fit: a two-year naming gift for the Pathways healthcare track.",
  "what_they_care_about": {
    "mission_statement": null,
    "funding_priorities": ["Healthcare workforce, especially nursing and allied health", "Women and first-generation workers entering skilled jobs", "Programs that report placement and wage outcomes"],
    "recent_grants": [
      {"recipient": "An East Bay nursing-assistant training nonprofit", "amount": "$75,000", "purpose": "CNA cohort scholarships", "year": "@Y1@"},
      {"recipient": "A San Francisco community college foundation", "amount": "$50,000", "purpose": "Emergency aid for allied-health students", "year": "@Y1@"}
    ],
    "public_statements": "In a podcast interview she said the best thing a donor can fund is the gap between a training program and a first paycheck.",
    "what_they_dont_fund": "Galas and awareness campaigns; she has said she skips event asks."
  },
  "how_we_fit": {
    "framing_note": "Lead with the healthcare track as a pipeline into paid clinical jobs, not as a youth program.",
    "matching_priorities": ["Pathways healthcare track: CNA and medical-assistant certifications", "Placement and starting-wage data at 90 days", "Clinical rotations at Harbor Health"],
    "our_matching_stories": ["Keisha Brown, Cohort 7: clinical rotation at Harbor Health with her CNA exam coming up", "Cohort 6 healthcare fellows: credential pass rate and starting wages above $22 an hour"],
    "honest_gaps": ["The healthcare cohort is 12 fellows; she may ask how it grows", "We do not yet track wages past 180 days"]
  },
  "people": {
    "primary_contact": {"name": "Jennifer Wu", "title": "Co-founder (former); donor-advised fund holder", "professional_background": "Built and sold a home-health scheduling company; earlier ran operations at a hospital system.", "connection_to_youth_education_bayarea": "Grew up in San Francisco; her mother was a nurse at a county hospital."},
    "board_members": [],
    "staff_of_note": []
  },
  "giving_profile": {
    "annual_giving": "Estimated $300K to $500K a year through her DAF since the sale",
    "grant_size_range": "$25K to $100K",
    "decision_cadence": "Decides personally and moves quickly after a site visit",
    "application_process": "No application. A short proposal or one-pager after a conversation."
  },
  "mutual_connections": [
    {"name": "Monique Jackson", "how_connected": "Both sit on the Harbor Health foundation advisory council", "source": "Harbor Health foundation annual report", "recent_touch_if_any": "Monique offered to join a Pathways tour"},
    {"name": "Ken Nakamura", "how_connected": "Same angel-investor network", "source": "Investor network member list", "recent_touch_if_any": null}
  ],
  "meeting_playbook": {
    "open_questions": ["Would she want her name on the track, or her mother's?", "One year or two?", "Does she want to meet fellows first, or see the numbers first?"],
    "ready_stories": [
      {"title": "Keisha's rotation", "narrative_2_3_sentences": "Keisha started Pathways stocking shelves overnight. Twelve weeks in, she is on a clinical rotation at Harbor Health and sits her CNA exam next month.", "punchline_the_so_what": "The fellowship turns a shift job into a credential and a clinical career.", "when_to_use_it": "Open with it."}
    ],
    "one_thing_to_learn": "Whether her giving runs on a calendar-year or a fiscal-year budget.",
    "suggested_next_ask": "$100K over two years to name the Pathways healthcare track."
  },
  "source_notes_and_gaps": {
    "sources": ["Company acquisition announcement", "Podcast interview on workforce philanthropy", "Harbor Health foundation annual report", "Grantee annual reports that thank her DAF"],
    "gaps": ["No public 990: she gives through a DAF, so totals are estimates", "Unclear whether her spouse is part of giving decisions"]
  },
  "raw_research_notes": "Three public interviews mention nursing careers. Two workforce grantees thank her DAF by name. No board seats at youth organizations. Lives in Pacific Heights; office in SoMa."
}
$j$),
('sequoia', 'final', pg_temp.ts(-38, '11:42'), pg_temp.ts(-36, '08:30'), null, $j$
{
  "snapshot": "Sequoia Trust for Education is a Peninsula family trust giving about $4M a year, historically to K-12 literacy. Its newest strategy adds career pathways for high schoolers, with first grants of $50K to $150K. Arthur Feld, the executive director, prefers to co-fund alongside a larger lead funder.",
  "what_they_care_about": {
    "mission_statement": "Every student leaves high school with a plan and the skills to carry it out.",
    "funding_priorities": ["High school career pathways", "Programs inside school districts", "Co-funding with a national or regional lead"],
    "recent_grants": [
      {"recipient": "A Peninsula high school career academy", "amount": "$120,000", "purpose": "Two-year pathway pilot", "year": "@Y1@"},
      {"recipient": "A Bay Area college-access nonprofit", "amount": "$75,000", "purpose": "Senior-year planning", "year": "@Y0@"}
    ],
    "public_statements": "The trust's strategy page says it will 'follow district demand, not invent it.'",
    "what_they_dont_fund": "Capital campaigns and out-of-school programs with no district partner."
  },
  "how_we_fit": {
    "framing_note": "San Leandro Unified asked us to open a fourth Launchpad site. That is district demand, and Meridian is the lead ask.",
    "matching_priorities": ["Launchpad runs inside three high schools today", "San Leandro is a district-requested expansion", "We report attendance, credit recovery, and post-graduation plans"],
    "our_matching_stories": ["Luis Ortega: Launchpad senior, bank internship, applying to Cal State East Bay"],
    "honest_gaps": ["Our Oakland sites are outside their historic Peninsula footprint", "The Meridian decision is still pending"]
  },
  "people": {
    "primary_contact": {"name": "Arthur Feld", "title": "Executive Director", "professional_background": "Former district superintendent; led the trust's move into career pathways.", "connection_to_youth_education_bayarea": "Thirty years in Bay Area public schools."},
    "board_members": [{"name": "Two family trustees", "title": "Trustees", "professional_background": "Second-generation family members", "connection_to_youth_education_bayarea": null}],
    "staff_of_note": [{"name": "Yvonne Adair", "title": "Grants Associate", "professional_background": null, "connection_to_youth_education_bayarea": null}]
  },
  "giving_profile": {
    "annual_giving": "About $4M a year",
    "grant_size_range": "$50K to $150K for first grants",
    "decision_cadence": "Trustees meet three times a year",
    "application_process": "Invitation only after a first meeting; short proposal"
  },
  "mutual_connections": [
    {"name": "Celeste Harrington", "how_connected": "Served together on a regional education council", "source": "Council roster", "recent_touch_if_any": "Celeste emailed Arthur to set up the intro"}
  ],
  "meeting_playbook": {
    "open_questions": ["Would they consider an Oakland-adjacent district?", "Do they co-fund with national foundations, or only regional ones?", "Which trustee meeting could hear a proposal?"],
    "ready_stories": [
      {"title": "A district asked", "narrative_2_3_sentences": "San Leandro's career-ed director visited Eastlake twice and asked us to come. The district has the students and the space; we have the model and the employers.", "punchline_the_so_what": "This is growth the district asked for, not growth we are pushing.", "when_to_use_it": "When Arthur asks why San Leandro."}
    ],
    "one_thing_to_learn": "Whether a Meridian yes makes them more or less likely to join.",
    "suggested_next_ask": "Invitation to submit for $100K over two years as the second San Leandro funder."
  },
  "source_notes_and_gaps": {
    "sources": ["Trust website and strategy page", "Most recent public 990-PF", "Regional education council roster"],
    "gaps": ["Trustee meeting dates for next year are not public"]
  },
  "raw_research_notes": "990-PF shows 41 grants last year, median $60K. Three career-pathway grants in the last 18 months, all with district partners."
}
$j$),
('marlowe', 'draft', pg_temp.ts(-1, '21:44'), pg_temp.ts(-1, '21:44'), null, $j$
{
  "snapshot": "The Marlowe Foundation funds allied-health career pathways in Alameda and Contra Costa counties, about $2.5M a year in grants of $50K to $150K. It takes rolling LOIs and has no current youth pathway grantee in Oakland. Strong fit for the healthcare track; no relationship yet.",
  "what_they_care_about": {
    "mission_statement": "Build a healthcare workforce that looks like the communities it serves.",
    "funding_priorities": ["Allied-health training: CNA, medical assistant, phlebotomy", "Paid clinical placements", "Programs with employer partners"],
    "recent_grants": [
      {"recipient": "A Richmond medical-assistant training program", "amount": "$100,000", "purpose": "Two cohorts plus job placement", "year": "@Y1@"},
      {"recipient": "A community clinic network", "amount": "$60,000", "purpose": "Clinical externships", "year": "@Y1@"}
    ],
    "public_statements": "Their annual letter calls entry-level clinical roles 'the front door to a middle-class career.'",
    "what_they_dont_fund": "Four-year degree scholarships and general operating support for new grantees."
  },
  "how_we_fit": {
    "framing_note": "Program support for the healthcare track, with Harbor Health as the employer partner.",
    "matching_priorities": ["CNA and medical-assistant certifications", "Clinical rotations at Harbor Health", "Placement and wage data at 90 days"],
    "our_matching_stories": ["Keisha Brown's clinical rotation"],
    "honest_gaps": ["We have one clinical employer partner today; Lakeside Medical is in early talks", "First-time grantee: expect program support, not operating"]
  },
  "people": {
    "primary_contact": {"name": "Program Officer, Health Workforce", "title": "Program Officer", "professional_background": "Former nurse educator", "connection_to_youth_education_bayarea": null},
    "board_members": [],
    "staff_of_note": []
  },
  "giving_profile": {
    "annual_giving": "About $2.5M a year",
    "grant_size_range": "$50K to $150K",
    "decision_cadence": "Quarterly board meetings",
    "application_process": "Rolling two-page LOI, then an invited proposal"
  },
  "mutual_connections": [],
  "meeting_playbook": {
    "open_questions": ["Do they fund fellows under 21?", "Would they count Harbor Health rotations as paid placements?"],
    "ready_stories": [],
    "one_thing_to_learn": "Whether an LOI this quarter could reach the spring board meeting.",
    "suggested_next_ask": "Two-page LOI for $80K toward the next healthcare cohort."
  },
  "source_notes_and_gaps": {
    "sources": ["Foundation website and annual letter", "Most recent public 990-PF"],
    "gaps": ["Program officer name not public", "No mutual connections found in our records"]
  },
  "raw_research_notes": "Twelve allied-health grants in the last two years; none to a youth-serving organization in Oakland."
}
$j$)
) as b(k, status, gen, upd, notes, body)
on conflict do nothing;

insert into public.research_runs (id, org_id, prospect_id, status, started_by, brief_id, error, created_at, updated_at, finished_at)
select pg_temp.nb_id('rrun:' || r.k), pg_temp.nb_org(), pg_temp.nb_id('prospect:' || r.p), r.status, pg_temp.nb_user(r.by),
       case when r.brief then pg_temp.nb_id('pbrief:' || r.p) end, r.err, r.started, r.finished, r.finished
from (values
  ('wu', 'wu', 'completed', 'remi', true, null::text, pg_temp.ts(-80, '14:02'), pg_temp.ts(-80, '14:06')),
  ('sequoia', 'sequoia', 'completed', 'remi', true, null, pg_temp.ts(-38, '11:38'), pg_temp.ts(-38, '11:42')),
  ('alcott', 'alcott', 'failed', 'remi', false,
   'The public record was too thin to write a useful brief. Add the family foundation name or a city and run it again.',
   pg_temp.ts(-20, '16:05'), pg_temp.ts(-20, '16:08')),
  ('marlowe', 'marlowe', 'completed', 'remi', true, null, pg_temp.ts(-1, '21:40'), pg_temp.ts(-1, '21:44'))
) as r(k, p, status, by, brief, err, started, finished)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Next-best-action suggestions (open default + corporate asks only).
--    Today's batch ran last night, after Remi last looked; an older batch
--    gives the follow-through stats (applied vs. dismissed).
-- ════════════════════════════════════════════════════════════════════════════
insert into public.fr_nba_suggestions
  (id, org_id, opportunity_id, constituent_id, batch_id, priority, action, rationale, channel, suggested_due, status, created_at, decided_at, decided_by)
select pg_temp.nb_id('nba:' || n.k), pg_temp.nb_org(), pg_temp.nb_id('opp:' || n.opp),
       (select constituent_id from public.opportunities where id = pg_temp.nb_id('opp:' || n.opp)),
       pg_temp.nb_id('nba:batch:' || n.b), n.pri, n.action, n.why, n.ch, n.due, n.status, n.created, n.decided,
       case when n.decided is null then null else 'remi' end
from (values
  ('b2_okafor', '2', 'okafor', 1, 'Call Nnamdi today and ask for lunch next week',
   'Gave $25K last year; no gift this year and no logged touch in four months. Prefers a call.', 'call', pg_temp.d(0), 'suggested', pg_temp.ts(-1, '19:05'), null::timestamptz),
  ('b2_wu', '2', 'wu', 2, 'Book the ask meeting for the healthcare-track naming gift',
   'Meeting complete; $100K ask ready; next step due in four days.', 'meeting', pg_temp.d(4), 'suggested', pg_temp.ts(-1, '19:05'), null),
  ('b2_ramos', '2', 'ramos', 3, 'Have Celeste call Victor about his board gift',
   'Asked six weeks ago; the next step is two days overdue; board giving is at 7 of 9.', 'call', pg_temp.d(1), 'suggested', pg_temp.ts(-1, '19:05'), null),
  ('b2_sequoia', '2', 'sequoia', 4, 'Send Arthur the Launchpad outcomes brief before the intro meeting',
   'First meeting in three days; he is a former superintendent and will ask for data.', 'email', pg_temp.d(1), 'suggested', pg_temp.ts(-1, '19:05'), null),
  ('b2_alvarez', '2', 'alvarez', 5, 'Confirm lunch with Ricardo and Elena; bring a kitchen intern story',
   'Lunch confirmation is a day overdue; two gala tables, no year-end ask yet.', 'call', pg_temp.d(1), 'suggested', pg_temp.ts(-1, '19:05'), null),
  ('b2_pacific', '2', 'pacific_renewal', 6, 'Ask Daniel when the bank locks next year''s sponsorship budget',
   'Proposal went in ten days ago; renewal is $10K larger than last year.', 'email', pg_temp.d(3), 'suggested', pg_temp.ts(-1, '19:05'), null),
  ('b1_okafor', '1', 'okafor', 1, 'Send Nnamdi the gala anniversary note',
   'Lapsed; last real conversation in the spring.', 'email', pg_temp.d(-12), 'superseded', pg_temp.ts(-15, '09:12'), null),
  ('b1_bell', '1', 'bell', 2, 'Schedule Remi''s handwritten note to ride with the year-end letter',
   'Gives every December after the letter.', 'note', pg_temp.d(-10), 'applied', pg_temp.ts(-15, '09:12'), pg_temp.ts(-14, '10:20')),
  ('b1_wu', '1', 'wu', 3, 'Send the healthcare-track one-pager after her tour',
   'Toured Pathways; strong interest in nursing careers.', 'email', pg_temp.d(-12), 'applied', pg_temp.ts(-15, '09:12'), pg_temp.ts(-14, '10:22')),
  ('b1_meridian', '1', 'meridian', 4, 'Send Camille the outcomes appendix she asked about',
   'Proposal under review; she flagged the 90-day data.', 'email', pg_temp.d(-13), 'applied', pg_temp.ts(-15, '09:12'), pg_temp.ts(-15, '11:40')),
  ('b1_patel', '1', 'patel', 5, 'Ask Ravi for $25K at his next visit',
   'New director with investor capacity.', 'meeting', pg_temp.d(-8), 'dismissed', pg_temp.ts(-15, '09:12'), pg_temp.ts(-14, '10:25'))
) as n(k, b, opp, pri, action, why, ch, due, status, created, decided)
where exists (select 1 from public.opportunities o where o.id = pg_temp.nb_id('opp:' || n.opp))
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Agent activity log (research briefs, NBA batches, angle discovery).
--    Small token counts: the research route budgets on this table monthly.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.fr_agent_activity_log
  (id, org_id, created_at, created_by, triggered_by, action_type, hubspot_contact_id, target_id, target_type,
   prompt_summary, model_used, tokens_input, tokens_output, duration_ms, status, error_message, metadata)
select pg_temp.nb_id('agentlog:' || l.k), pg_temp.nb_org(), l.at, 'agent', 'remi', l.act, null, l.target, l.ttype,
       l.summary, 'claude-sonnet-4-6', l.tin, l.tout, l.ms, l.status, l.err, l.meta::jsonb
from (values
  ('brief_wu', pg_temp.ts(-80, '14:06'), 'research_brief', pg_temp.nb_id('pbrief:wu'), 'brief', 'Funder research brief: Jennifer Wu', 26810, 5940, 238000, 'success', null::text, '{"web_search_count": 9}'),
  ('brief_sequoia', pg_temp.ts(-38, '11:42'), 'research_brief', pg_temp.nb_id('pbrief:sequoia'), 'brief', 'Funder research brief: Sequoia Trust for Education', 24120, 6210, 251000, 'success', null, '{"web_search_count": 8}'),
  ('brief_alcott', pg_temp.ts(-20, '16:08'), 'research_brief', null::uuid, 'brief', 'Funder research brief: Daniel and Ruth Alcott', 9800, 410, 172000, 'failed', 'Public footprint too thin for a brief.', '{"web_search_count": 7}'),
  ('brief_marlowe', pg_temp.ts(-1, '21:44'), 'research_brief', pg_temp.nb_id('pbrief:marlowe'), 'brief', 'Funder research brief: The Marlowe Foundation', 22950, 5480, 226000, 'success', null, '{"web_search_count": 8}'),
  ('nba_b1', pg_temp.ts(-15, '09:12'), 'other', null, 'opportunity', 'Next best actions across 14 open asks', 8120, 1460, 21000, 'success', null, '{"candidates": 14}'),
  ('nba_b2', pg_temp.ts(-1, '19:05'), 'other', null, 'opportunity', 'Next best actions across 22 open asks', 9940, 1720, 24000, 'success', null, '{"candidates": 22}'),
  ('discover_health', pg_temp.ts(-31, '15:20'), 'other', null, null, 'Prospect discovery for the Healthcare Workforce angle', 18400, 2950, 96000, 'success', null, '{"angle": "healthcare-workforce", "found": 4}')
) as l(k, at, act, target, ttype, summary, tin, tout, ms, status, err, meta)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 10. Funding-opportunity triage list (legacy discovery table).
-- ════════════════════════════════════════════════════════════════════════════
insert into public.fr_funding_opportunities
  (id, org_id, name, domain, ein, summary, match_score, score_factors, discovered_via, discovered_at, triage_status,
   promoted_to_hubspot_id, notes, created_by, created_at, updated_at)
select pg_temp.nb_id('fundopp:' || f.k), pg_temp.nb_org(), f.n, f.dom, null, f.summary, f.score, f.factors::jsonb, f.via,
       pg_temp.ts(f.at, '15:25'), f.triage, null, f.notes, 'remi', pg_temp.ts(f.at, '15:25'), pg_temp.ts(f.touched, '11:00')
from (values
  ('marlowe', 'The Marlowe Foundation', 'marlowe.example.org', 'Allied-health career pathways in the East Bay; rolling LOIs.', 86::smallint,
   '{"geography": 9, "program_fit": 9, "grant_size": 8}', 'web_search', -31, 'qualified', 'Moved to the prospect bench and researched.', -9),
  ('orchard', 'Orchard Hill Community Fund', 'orchardhill.example.org', 'Small family fund focused on San Leandro.', 71,
   '{"geography": 10, "program_fit": 7, "grant_size": 4}', 'foundation_directory', -25, 'researching', null, -19),
  ('westbridge', 'Westbridge Health Fund', 'westbridge.example.net', 'Hospital-affiliated fund; nurse pipeline grants.', 64,
   '{"geography": 6, "program_fit": 8, "grant_size": 6}', 'web_search', -31, 'new', null, -31),
  ('cardenas', 'Cardenas Family Foundation', 'cardenas.example.org', 'Youth employment, Central Valley only.', 22,
   '{"geography": 1, "program_fit": 7, "grant_size": 5}', '990_scrape', -70, 'rejected', 'Geography rules them out.', -64)
) as f(k, n, dom, summary, score, factors, via, at, triage, notes, touched)
on conflict do nothing;


commit;
