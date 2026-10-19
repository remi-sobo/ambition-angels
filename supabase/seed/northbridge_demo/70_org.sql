-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 7 — Organization: board (roster, meetings, agenda, minutes,
--             resolutions, follow-ups, attendance/RSVPs, COI, director
--             questions/notes/shared notes/prep), compliance calendar +
--             filing history, documents + entity links, staff goals/KPIs +
--             snapshots, 360 review cycles (competencies, feedback, manager
--             notes, summaries).
--
-- Keys (nb_id): bm:<board key> · boardmtg:<prev3|prev2|consent_patel|prev|
--   next|retreat> · agenda:<mtg>:<pos> · res:<key> · fu:<key> · comp:<key> ·
--   compfile:<key> · doc:<key> · goal:<handle>:<n> · staffkpi:<handle>:<n> ·
--   revcomp:<key> · revcycle:<midyear|annual_prev> · revfb:<cycle>:<subj>:<rater>
--
-- Notes for the integrator
--   * Board meetings carry BOTH shapes the app reads: the V1 jsonb columns
--     (agenda / attendance / minutes text, /admin/board) and the normalized
--     portal tables (agenda_items, minutes, meeting_attendance, …, /board).
--   * Approved staff goals: the staff_goals_guard_approval trigger reads
--     auth.uid(); each approved batch runs with request.jwt.claims set to the
--     goal owner's actual manager (Remi for directors, Tasha/Miguel/Priya for
--     their reports). Remi's own goals were approved by the board (resolution
--     res:prev_ed_goals) and are recorded in-app by Tasha (staff.manage).
--     The claims are cleared right after.
--   * Documents are metadata only: storage_path points into the
--     bloomos-documents bucket, but no file is uploaded (Open/Download will
--     fail for these rows).
--   * No audit_log rows (its monthly partitions do not follow a re-anchor).
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ── Section-local helpers (pg_temp: nothing persists) ───────────────────────
create or replace function pg_temp.s7_fy(dt date) returns int language sql immutable
  as $$ select extract(year from dt)::int + case when extract(month from dt) >= 7 then 1 else 0 end $$;
-- 'FY27' for the fiscal year containing dt
create or replace function pg_temp.s7_fyd(dt date) returns text language sql immutable
  as $$ select 'FY' || lpad((pg_temp.s7_fy(dt) % 100)::text, 2, '0') $$;
-- 'FY27' for the current fiscal year + off
create or replace function pg_temp.s7_fyl(off int) returns text language sql stable
  as $$ select 'FY' || lpad(((pg_temp.fy() + off) % 100)::text, 2, '0') $$;
-- 'FY27 Q2'
create or replace function pg_temp.s7_fq(dt date) returns text language sql immutable
  as $$ select pg_temp.s7_fyd(dt) || ' Q' || (((extract(month from dt)::int + 5) % 12) / 3 + 1) $$;
-- 'November 12'
create or replace function pg_temp.s7_md(n int) returns text language sql stable
  as $$ select to_char(pg_temp.d(n), 'FMMonth FMDD') $$;
-- A signing date n days from the anchor, clamped into the anchor's calendar
-- year (the board pages test COI currency against January 1).
create or replace function pg_temp.s7_coi(n int) returns date language sql stable
  as $$ select least(pg_temp.d(-1), greatest(pg_temp.d(n),
             make_date(extract(year from pg_temp.d(0))::int, 1, 4) + (abs(n) % 9))) $$;
-- Same, clamped into the previous calendar year.
create or replace function pg_temp.s7_coi_prev(n int) returns date language sql stable
  as $$ select least(make_date(extract(year from pg_temp.d(0))::int - 1, 12, 20),
                     greatest(pg_temp.d(n), make_date(extract(year from pg_temp.d(0))::int - 1, 1, 4) + (abs(n) % 9))) $$;
-- V1 attendance jsonb: [{member_id, present}]
create or replace function pg_temp.s7_att(present text[], absent text[]) returns jsonb language sql immutable
  as $$ select coalesce(jsonb_agg(jsonb_build_object('member_id', pg_temp.nb_id('bm:' || k), 'present', p) order by o), '[]'::jsonb)
        from (select k, true as p, i as o from unnest(present) with ordinality u(k, i)
              union all
              select k, false, 100 + i from unnest(absent) with ordinality u(k, i)) x $$;
-- kpiStatusFor (lib/admin/staff/metrics.ts), up-is-good
create or replace function pg_temp.s7_kpi_status(cur numeric, tgt numeric) returns text language sql immutable
  as $$ select case when cur is null then 'not_started'
                    when tgt is null or tgt = 0 then 'on_track'
                    when cur / tgt >= 1 then 'done'
                    when cur / tgt >= 0.7 then 'on_track'
                    when cur / tgt >= 0.4 then 'at_risk'
                    else 'behind' end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- BOARD
-- ════════════════════════════════════════════════════════════════════════════

-- ── Roster: the nine directors, linked to their donor records ───────────────
insert into public.board_members
  (id, org_id, constituent_id, name, email, phone, officer_role, title, affiliation, bio, notes,
   term_start, term_end, term_number, coi_signed_at, status, checklist, is_staff, is_voting,
   receives_shared_notes, created_at, updated_at)
select pg_temp.nb_id('bm:' || b.k), pg_temp.nb_org(), pg_temp.nb_id('con:bd_' || b.k),
       b.name, b.email, b.phone, b.role, b.title, b.aff, b.bio, b.notes,
       pg_temp.d(b.ts), pg_temp.d(b.te), b.tn,
       case when b.coi is null then null else pg_temp.s7_coi(b.coi) end,
       'active', b.checklist, false, true, b.k = 'harrington',
       pg_temp.ts(b.since, '10:00'), pg_temp.ts(b.touched, '15:30')
from (values
  ('harrington', 'Celeste Harrington', 'celeste.harrington@example.com', '(510) 555-0101', 'chair', 'Board Chair',
   'Retired Chief Technology Officer',
   'Celeste spent 25 years in enterprise software, the last eight as a CTO. She grew up in East Oakland and got her first job through a neighbor''s referral; she wants every Northbridge young person to have that neighbor. She chairs the Development Committee and hosts the spring donor dinner.',
   'Gives $40K a year: $20K received this year, $20K pledged for year-end. Prefers a call before board meetings to preview hard items.',
   -409, 686, 3, -44, '[]'::jsonb, -365 * 7, -6),
  ('osei', 'Daniel Osei', 'daniel.osei@example.com', '(510) 555-0102', 'vice_chair', 'Vice Chair',
   'SVP, Commercial Banking, Pacific Summit Bank',
   'Daniel leads commercial banking for Pacific Summit Bank in the East Bay and championed the bank''s Summer Works presenting sponsorship. He hires interns into branch operations every summer.',
   'Champion for the $60K Pacific Summit renewal. Exploring a bank match for the Year-End campaign. Discloses the bank relationship on any banking or reserve vote.',
   -774, 321, 2, -43, '[]'::jsonb, -365 * 5, -12),
  ('lim', 'Grace Lim', 'grace.lim@example.com', '(510) 555-0103', 'treasurer', 'Treasurer; Chair, Finance & Audit Committee',
   'Audit partner (CPA), regional accounting firm',
   'Grace is a CPA and audit partner who believes a well-run back office is how a youth program earns the right to grow. She chairs the Finance & Audit Committee and reviews every quarterly close with Kwame.',
   'Recused from the auditor selection (her firm was invited to propose). Wants restricted vs. unrestricted cash shown separately in every packet.',
   -409, 686, 2, -44, '[]'::jsonb, -365 * 4, -3),
  ('ramos', 'Victor Ramos', 'victor.ramos@example.com', '(510) 555-0104', 'secretary', 'Secretary',
   'Employment attorney',
   'Victor practices employment law in Oakland and was a Summer Works employer before joining the board. He reviews internship agreements and HR policies pro bono and signs the minute book as Secretary.',
   'Re-elected to a second term at the annual meeting. FY gift not yet made; Celeste is following up. Needs to confirm his mailing address for the Statement of Information.',
   -44, 1051, 2, -40, '[]'::jsonb, -365 * 3 - 90, -40),
  ('freeman', 'Dr. Alicia Freeman', 'alicia.freeman@example.com', '(510) 555-0105', 'member', 'Director; Chair, Program Committee',
   'Retired Principal, Eastlake High School',
   'Dr. Freeman led Eastlake High School for eleven years and watched Launchpad change its senior class. She chairs the Program Committee and visits every Launchpad site each fall.',
   'Stepping off the board when her term ends to chair the new alumni advisory council. Retreat agenda includes her succession on the Program Committee.',
   -1022, 73, 2, -38, '[]'::jsonb, -365 * 6, -20),
  ('nakamura', 'Ken Nakamura', 'ken.nakamura@example.com', '(415) 555-0106', 'member', 'Director',
   'Founder, logistics software startup',
   'Ken founded a logistics software company and was the first in his family to work in tech. He brought Kinetic Labs in as a partner and mentors two Pathways fellows himself.',
   'Hosted the Kinetic Labs mentor recruiting lunch (12 employee mentors). Often travels; joins by video.',
   -774, 321, 1, -42, '[]'::jsonb, -365 * 2 - 30, -9),
  ('jackson', 'Monique Jackson', 'monique.jackson@example.com', '(510) 555-0107', 'member', 'Director',
   'VP, Community Health, Harbor Health Partners',
   'Monique runs community health programs at Harbor Health Partners and opened the clinical placements for the Pathways healthcare track. She sees Pathways as the health system''s best pipeline for local hires.',
   'First term ends in ' || to_char(pg_temp.d(151), 'FMMonth') || '; she has agreed to stand for a second term. Introduced two healthcare employers this fall.',
   -944, 151, 1, -36, '[]'::jsonb, -365 * 2 - 200, -15),
  ('patel', 'Ravi Patel', 'ravi.patel@example.com', '(650) 555-0108', 'member', 'Director',
   'Early-stage investor',
   'Ravi invests in early-stage companies and joined the board three months ago. He wants to help Northbridge build an earned-revenue line with employers.',
   'New director, onboarding in progress. Conflict-of-interest disclosure and FY gift outstanding. Site visits to Launchpad and Pathways being scheduled.',
   -95, 1000, 1, null,
   jsonb_build_array(
     jsonb_build_object('id', 'p1', 'text', 'Orientation with Remi and Tasha', 'done', true),
     jsonb_build_object('id', 'p2', 'text', 'Sign the board member agreement', 'done', true),
     jsonb_build_object('id', 'p3', 'text', 'Read the bylaws, strategic plan and last year''s 990', 'done', true),
     jsonb_build_object('id', 'p4', 'text', 'Coffee with the Chair', 'done', true),
     jsonb_build_object('id', 'p5', 'text', 'Board portal sign-in and calendar invites', 'done', true),
     jsonb_build_object('id', 'p6', 'text', 'Sign the annual conflict-of-interest disclosure', 'done', false),
     jsonb_build_object('id', 'p7', 'text', 'Site visit: Launchpad at Eastlake High School', 'done', false),
     jsonb_build_object('id', 'p8', 'text', 'Site visit: Pathways skills lab', 'done', false),
     jsonb_build_object('id', 'p9', 'text', 'Join a committee (Development or Finance & Audit)', 'done', false),
     jsonb_build_object('id', 'p10', 'text', 'Make a personally meaningful gift this fiscal year', 'done', false)),
   -95, -21),
  ('brooks', 'Theo Brooks', 'theo.brooks@example.com', '(510) 555-0109', 'member', 'Director (youth seat)',
   'Network Technician; Pathways Cohort 3 alum',
   'Theo holds the board''s youth seat. He came through Pathways Cohort 3, earned his network certifications, and now works as a network technician. He says Northbridge is the reason he has a career instead of a job.',
   'Youth seat runs two-year terms. Organizing the fellows'' panel for the retreat.',
   -409, 321, 2, -44, '[]'::jsonb, -365 * 2 - 60, -30)
) as b(k, name, email, phone, role, title, aff, bio, notes, ts, te, tn, coi, checklist, since, touched)
on conflict do nothing;

-- ── Annual conflict-of-interest disclosures (portal reads by calendar year) ──
insert into public.coi_disclosures (id, org_id, board_member_id, year, status, signed_at)
select pg_temp.nb_id('coi:' || c.k || ':cur'), pg_temp.nb_org(), pg_temp.nb_id('bm:' || c.k),
       extract(year from pg_temp.d(0))::int,
       case when c.n is null then 'outstanding' else 'signed' end,
       case when c.n is null then null else pg_temp.s7_coi(c.n) end
from (values ('harrington', -44), ('osei', -43), ('lim', -44), ('ramos', -40), ('freeman', -38),
             ('nakamura', -42), ('jackson', -36), ('brooks', -44), ('patel', null::int)) as c(k, n)
on conflict do nothing;

insert into public.coi_disclosures (id, org_id, board_member_id, year, status, signed_at)
select pg_temp.nb_id('coi:' || c.k || ':prev'), pg_temp.nb_org(), pg_temp.nb_id('bm:' || c.k),
       extract(year from pg_temp.d(0))::int - 1, 'signed', pg_temp.s7_coi_prev(c.n)
from (values ('harrington', -409), ('osei', -409), ('lim', -408), ('ramos', -405), ('freeman', -409),
             ('nakamura', -402), ('jackson', -404), ('brooks', -409)) as c(k, n)
on conflict do nothing;

-- ── Agenda content (one source for agenda_items AND the V1 agenda jsonb) ────
create temp table if not exists s7_agenda (
  mkey text, pos int, label text, title text, description text, owner text, minutes int,
  item_type text, status text, v1_kind text, brief jsonb
) on commit drop;
truncate s7_agenda;

insert into s7_agenda values
  -- prev3: last FY Q3 regular meeting
  ('prev3', 1, '5:30', 'Call to order, quorum, agenda review', 'Seven of eight directors expected.', 'Celeste Harrington', 5, 'information', 'done', 'normal', null),
  ('prev3', 2, '5:35', 'Consent agenda', 'Approve the minutes of the previous meeting and accept the Q2 financial statements.', 'Victor Ramos', 5, 'decision', 'done', 'consent',
   jsonb_build_object('decision', 'Approve the prior minutes and accept the Q2 financial statements.', 'recommends', 'Approve as one motion.',
     'motion', 'That the Board approve the minutes of the previous meeting and accept the second-quarter financial statements.')),
  ('prev3', 3, '5:40', 'Executive Director report', 'Mid-year revenue, Launchpad attendance, and the Eastshore Workforce Development Board invitation.', 'Remi Sobomehin', 20, 'information', 'done', 'normal', null),
  ('prev3', 4, '6:00', 'Northbridge Rising Gala: sponsorships and tables', 'Where we stand against the $275,000 goal; one ask of every director.', 'Priya Natarajan', 15, 'discussion', 'done', 'normal', null),
  ('prev3', 5, '6:15', 'Pathways Cohort 6 mid-year outcomes', 'Credentials earned, retention, and the final placement round.', 'Andre Mitchell', 15, 'information', 'done', 'normal', null),
  ('prev3', 6, '6:30', 'Meridian Foundation letter of inquiry', 'Authorize a letter of inquiry for a fourth Launchpad site in San Leandro.', 'Remi Sobomehin', 25, 'decision', 'done', 'normal',
   jsonb_build_object('decision', 'Authorize a letter of inquiry to the Meridian Foundation for up to $300,000 over two years.', 'recommends', 'Approve.',
     'why', 'Meridian opens its national cycle next quarter and funds new sites, which none of our current funders do.',
     'motion', 'That the Board authorize the Executive Director to submit a letter of inquiry to the Meridian Foundation for Youth Opportunity for up to $300,000 over two years to support a fourth Launchpad site in San Leandro.')),
  ('prev3', 7, '6:55', 'Adjourn', null, 'Celeste Harrington', 5, 'information', 'done', 'normal', null),

  -- prev2: last FY Q4 meeting, interim budget + reserve policy
  ('prev2', 1, '9:00', 'Call to order, quorum, agenda review', null, 'Celeste Harrington', 5, 'information', 'done', 'normal', null),
  ('prev2', 2, '9:05', 'Consent agenda', 'Approve the minutes of the previous meeting and accept the Q3 financial statements.', 'Victor Ramos', 5, 'decision', 'done', 'consent',
   jsonb_build_object('decision', 'Approve the prior minutes and accept the Q3 financial statements.', 'recommends', 'Approve as one motion.',
     'motion', 'That the Board approve the minutes of the previous meeting and accept the third-quarter financial statements.')),
  ('prev2', 3, '9:10', 'Executive Director report and gala results', 'Gala results, Summer Works placements, Cohort 6 graduation.', 'Remi Sobomehin', 25, 'information', 'done', 'normal', null),
  ('prev2', 4, '9:35', 'Interim budget and spending authority', 'Two large revenue lines confirm later this year; interim authority until the final budget at the annual meeting.', 'Grace Lim', 30, 'decision', 'done', 'normal',
   jsonb_build_object('decision', 'Adopt interim spending authority at the current run rate until the final budget is adopted.', 'recommends', 'Approve.',
     'why', 'The state Youth Opportunity award and the Hollis renewal confirm before the annual meeting; a budget adopted now would be rewritten then.',
     'motion', 'That the Board authorize spending at the current fiscal year''s monthly run rate until a final operating budget is adopted, no later than the annual meeting.')),
  ('prev2', 5, '10:05', 'Operating reserve policy and the Opportunity Reserve', 'Six-month reserve target; designate $250,000 of unrestricted net assets.', 'Grace Lim', 30, 'decision', 'done', 'normal',
   jsonb_build_object('decision', 'Adopt the Operating Reserve Policy and designate $250,000 as the Opportunity Reserve.', 'recommends', 'Approve.',
     'tradeoff', 'Designated dollars are not available for programs without a board vote, which is the point, and also the cost.',
     'motion', 'That the Board adopt the Operating Reserve Policy as presented, set a reserve target of six months of operating expenses, and designate $250,000 of unrestricted net assets as the Opportunity Reserve.')),
  ('prev2', 6, '10:35', 'Executive Director goals for the new fiscal year', 'First discussion; adoption at the annual meeting.', 'Celeste Harrington', 20, 'discussion', 'done', 'normal', null),
  ('prev2', 7, '10:55', 'Adjourn', null, 'Celeste Harrington', 5, 'information', 'done', 'normal', null),

  -- consent_patel: action by written consent
  ('consent_patel', 1, null, 'Elect Ravi Patel to the Board of Directors', 'Three-year term; circulated to all eight directors by the Secretary.', 'Victor Ramos', null, 'decision', 'done', 'normal',
   jsonb_build_object('decision', 'Elect Ravi Patel to a three-year term.',
     'motion', 'That Ravi Patel is elected to the Board of Directors for a three-year term.')),

  -- prev: this FY Q1 + annual meeting
  ('prev', 1, '9:00', 'Call to order, quorum, welcome Ravi Patel', null, 'Celeste Harrington', 5, 'information', 'done', 'normal', null),
  ('prev', 2, '9:05', 'Consent agenda', 'Approve the ' || to_char(pg_temp.d(-135), 'FMMonth') || ' minutes, ratify the written consent electing Ravi Patel, and accept the preliminary year-end financials.', 'Victor Ramos', 5, 'decision', 'done', 'consent',
   jsonb_build_object('decision', 'Approve the ' || to_char(pg_temp.d(-135), 'FMMonth') || ' minutes, ratify the written consent, and accept the preliminary year-end financial statements.', 'recommends', 'Approve as one motion.',
     'motion', 'That the Board approve the minutes of the ' || to_char(pg_temp.d(-135), 'FMMonth') || ' meeting, ratify the action by written consent electing Ravi Patel, and accept the preliminary year-end financial statements.')),
  ('prev', 3, '9:10', 'Annual meeting: officers and director elections', 'Officer slate for the year; Victor Ramos stands for a second term.', 'Victor Ramos', 10, 'decision', 'done', 'normal',
   jsonb_build_object('decision', 'Elect the officer slate and re-elect Victor Ramos as a director.', 'recommends', 'Approve the slate as presented.',
     'motion', 'That the Board elect Celeste Harrington as Chair, Daniel Osei as Vice Chair, Grace Lim as Treasurer and Victor Ramos as Secretary for the coming year, and re-elect Victor Ramos as a director for a second three-year term.')),
  ('prev', 4, '9:20', 'Operating budget for the fiscal year', '$3.55M revenue and $3.40M expense, with the surplus going to the Opportunity Reserve.', 'Grace Lim, Kwame Asante', 35, 'decision', 'done', 'normal',
   jsonb_build_object('decision', 'Adopt the final operating budget.', 'recommends', 'Approve.',
     'why', 'Both large revenue lines are now confirmed, and the auditors need an adopted budget before fieldwork.',
     'tradeoff', 'A $150,000 planned surplus builds the reserve but holds the San Leandro site to planning dollars only this year.',
     'motion', 'That the Board adopt the operating budget of $3,400,000 in expenses and $3,550,000 in revenue, including a planned $150,000 contribution to the Opportunity Reserve.')),
  ('prev', 5, '9:55', 'Audit engagement', 'Finance & Audit Committee recommendation after the RFP.', 'Victor Ramos', 10, 'decision', 'done', 'normal',
   jsonb_build_object('decision', 'Engage Linden & Rook LLP as independent auditor for last fiscal year.', 'recommends', 'Approve.',
     'motion', 'That the Board engage Linden & Rook LLP to audit last fiscal year''s financial statements, at a fee not to exceed $38,500.')),
  ('prev', 6, '10:05', 'Executive Director goals', 'Four goals drafted with the Chair after the last meeting.', 'Celeste Harrington', 10, 'decision', 'done', 'normal',
   jsonb_build_object('decision', 'Approve the Executive Director''s goals for the fiscal year.', 'recommends', 'Approve.',
     'motion', 'That the Board approve the Executive Director''s goals for the fiscal year as presented.')),
  ('prev', 7, '10:15', 'Executive Director report', 'Summer Works results, Pathways Cohort 7 launch, Meridian proposal timeline.', 'Remi Sobomehin', 25, 'information', 'done', 'normal', null),
  ('prev', 8, '10:40', 'Conflict-of-interest disclosures and board giving', 'Annual disclosures handed out; giving goal is 100 percent by December 31.', 'Celeste Harrington', 10, 'information', 'done', 'normal', null),
  ('prev', 9, '10:50', 'Adjourn', null, 'Celeste Harrington', 5, 'information', 'done', 'normal', null),

  -- next: agenda being built
  ('next', 1, '5:30', 'Call to order, quorum, agenda review', 'Any director may add an item here.', 'Celeste Harrington', 5, 'information', 'upcoming', 'normal', null),
  ('next', 2, '5:35', 'Consent agenda', 'One motion: adopt the revised Child Safeguarding Policy and accept the annual conflict-of-interest disclosures. Any director may pull an item.', 'Victor Ramos', 5, 'decision', 'upcoming', 'consent',
   jsonb_build_object('decision', 'Adopt the revised Child Safeguarding Policy and accept the annual conflict-of-interest disclosures.', 'recommends', 'Approve as one motion.',
     'why', 'The revision adds the two-adult rule for virtual mentoring and updates mandated-reporter steps; Victor has reviewed it.',
     'motion', 'That the Board adopt the Child Safeguarding Policy as revised and accept the directors'' annual conflict-of-interest disclosures.')),
  ('next', 3, '5:40', 'Executive Director report', 'The packet carries the detail; this block is for questions. One thing to surface live: Laurel Ridge attendance and what we are doing about it.', 'Remi Sobomehin', 20, 'information', 'upcoming', 'normal', null),
  ('next', 4, '6:00', 'Audit update', 'Fieldwork status, the PBC list, and the timeline to a draft report for the Finance & Audit Committee.', 'Grace Lim, Kwame Asante', 10, 'information', 'upcoming', 'normal', null),
  ('next', 5, '6:10', 'First-quarter financials and reserve progress', 'Revenue on budget, expenses slightly under, reserve at about 5.5 months against a 6-month target.', 'Kwame Asante', 15, 'decision', 'upcoming', 'normal',
   jsonb_build_object('decision', 'Accept the first-quarter financial statements.', 'recommends', 'Accept.',
     'why', 'Revenue is on budget and expenses are 3 percent under plan. Restricted and unrestricted cash are shown separately this quarter, as Grace asked.',
     'motion', 'That the Board accept the first-quarter financial statements as presented.')),
  ('next', 6, '6:25', 'Meridian and the San Leandro expansion', 'The main work of the meeting. Open on readiness, then the money, then the motion.', 'Remi Sobomehin, Miguel Arreola', 35, 'decision', 'upcoming', 'normal',
   jsonb_build_object(
     'question', 'If Meridian says yes, are we ready to open a San Leandro site next fall, and what do we do if it says no?',
     'subtitle', '35 of the 115 minutes are on this. The motion is a conditional go, and the condition is where your judgment matters.',
     'decision', 'Authorize staff to sign the San Leandro Unified MOU for a fall pilot site, contingent on $250,000 in new two-year funding.',
     'recommends', 'Approve the conditional go, with the Meridian decision as the first test of the condition.',
     'why', 'The district needs a signed MOU within two months to hold a classroom and a site lead for fall. Meridian decides around ' || pg_temp.s7_md(35) || '.',
     'tradeoff', 'Signing early holds the site but commits staff time before the money is certain. Waiting a year keeps the budget clean, and the district may give the slot to another provider.',
     'considerations', jsonb_build_array(
       jsonb_build_object('label', 'The money', 'note', 'Meridian ($300,000 over two years) is the lead. Sequoia Trust and a Kinetic Labs expansion are the backups.'),
       jsonb_build_object('label', 'The site', 'note', 'San Leandro Unified has offered a classroom and a counselor liaison. The MOU draft is in the materials.'),
       jsonb_build_object('label', 'The team', 'note', 'One program coordinator and a part-time site lead; Rosa supervises in year one.')),
     'motion', 'That the Board authorize the Executive Director to execute a memorandum of understanding with San Leandro Unified for a Launchpad pilot site beginning next fall, contingent on securing at least $250,000 in new two-year funding before signing.')),
  ('next', 7, '7:00', 'Year-End campaign', '$400,000 goal; launch in two weeks. Each director brings two names; Daniel on a possible bank match.', 'Priya Natarajan', 15, 'discussion', 'upcoming', 'normal', null),
  ('next', 8, '7:15', 'Board giving, retreat planning, adjourn', 'Seven of nine directors have given this fiscal year. Retreat logistics and the fellows'' panel.', 'Celeste Harrington', 10, 'discussion', 'upcoming', 'normal', null),

  -- retreat: draft agenda
  ('retreat', 1, '9:00', 'Where we are: the strategic plan at its midpoint', 'What we said we would do, what happened, what we learned.', 'Remi Sobomehin', 45, 'discussion', 'upcoming', 'normal', null),
  ('retreat', 2, '9:45', 'Fellows panel: three voices from Pathways', 'Moderated by Theo Brooks. No slides.', 'Theo Brooks', 30, 'demonstration', 'upcoming', 'normal', null),
  ('retreat', 3, '10:30', 'Growth choices: San Leandro and an employer-fee model', 'Two growth paths and what each asks of the board.', 'Ravi Patel, Remi Sobomehin', 60, 'discussion', 'upcoming', 'normal', null),
  ('retreat', 4, '11:30', 'Board recruitment and Program Committee succession', 'Three open seats over two years, the youth seat, and Dr. Freeman''s transition.', 'Celeste Harrington', 45, 'discussion', 'upcoming', 'normal', null),
  ('retreat', 5, '1:00', 'Site visit: Pathways skills lab', 'Fellows run the tour.', 'Andre Mitchell', 60, 'information', 'upcoming', 'normal', null);

-- ── Meetings (V1 jsonb columns + portal columns) ────────────────────────────
insert into public.board_meetings
  (id, org_id, meeting_date, title, fiscal_label, meeting_type, starts_at, ends_at, location, zoom_url, zoom_room,
   status, quorum_required, quorum_met, minutes_status, approved_at, published_at, agenda, attendance, minutes,
   headline_stats, created_at, updated_at)
select pg_temp.nb_id('boardmtg:' || m.k), pg_temp.nb_org(), pg_temp.d(m.dd), m.title, pg_temp.s7_fq(pg_temp.d(m.dd)), m.mtype,
       case when m.st is null then null else pg_temp.ts(m.dd, m.st) end,
       case when m.et is null then null else pg_temp.ts(m.dd, m.et) end,
       m.loc, m.zoom, m.zroom, m.status, 5, m.quorum, m.mstatus,
       case when m.appr is null then null else pg_temp.ts(m.appr, '20:15') end,
       case when m.pub is null then null else pg_temp.ts(m.pub, '16:00') end,
       coalesce((select jsonb_agg(jsonb_build_object('title', a.title, 'kind', a.v1_kind, 'notes', coalesce(a.description, '')) order by a.pos)
                 from s7_agenda a where a.mkey = m.k), '[]'::jsonb),
       m.att, m.mtext, m.stats,
       pg_temp.ts(m.created, '11:00'), pg_temp.ts(m.updated, '17:00')
from (values
  ('prev3', -229, pg_temp.s7_fq(pg_temp.d(-229)) || ' Board Meeting', 'regular', '17:30', '19:30',
   'Northbridge HQ, 1450 Harbor Light Way, Oakland, and Zoom', 'https://zoom.example/j/84522100193', '845 2210 0193',
   'closed', true, 'approved', -135, -236,
   pg_temp.s7_att(array['harrington','osei','lim','ramos','freeman','jackson','brooks'], array['nakamura']),
   'Called to order 5:34 PM by Celeste Harrington; 7 of 8 directors present, quorum met.' || chr(10) ||
   'Consent agenda (prior minutes, Q2 financials): moved Lim, seconded Freeman, carried 7-0.' || chr(10) ||
   'ED report: revenue 4% ahead of budget at mid-year; Launchpad attendance 87%; Eastshore WDB invited a Pathways contract proposal.' || chr(10) ||
   'Gala: $190K committed toward the $275K goal; every director to fill or sell a table.' || chr(10) ||
   'Meridian LOI for a San Leandro site (up to $300K over two years): moved Osei, seconded Jackson, carried 7-0. Dr. Freeman asked that the district commit a site lead first.' || chr(10) ||
   'Adjourned 7:21 PM.',
   '[]'::jsonb, -250, -135),
  ('prev2', -135, pg_temp.s7_fq(pg_temp.d(-135)) || ' Board Meeting', 'budget', '09:00', '11:30',
   'Northbridge HQ, 1450 Harbor Light Way, Oakland, and Zoom', 'https://zoom.example/j/84522100193', '845 2210 0193',
   'closed', true, 'approved', -44, -142,
   pg_temp.s7_att(array['harrington','osei','lim','ramos','freeman','nakamura','brooks'], array['jackson']),
   'Called to order 9:03 AM; 7 of 8 directors present, quorum met.' || chr(10) ||
   'Consent agenda (prior minutes, Q3 financials): moved Ramos, seconded Brooks, carried 7-0.' || chr(10) ||
   'Gala raised $285,000 gross against a $275,000 goal. Summer Works fully placed: 85 interns at 22 employers.' || chr(10) ||
   'Interim spending authority at the current run rate until the final budget at the annual meeting: moved Lim, seconded Harrington, carried 7-0.' || chr(10) ||
   'Operating Reserve Policy, six-month target, $250,000 Opportunity Reserve: moved Lim, seconded Nakamura, carried 6-0; Osei abstained (reserve held at Pacific Summit Bank).' || chr(10) ||
   'ED goals: first discussion; adoption at the annual meeting.' || chr(10) ||
   'Adjourned 11:22 AM.',
   '[]'::jsonb, -160, -44),
  ('consent_patel', -95, 'Action by written consent: director election', 'consent', null, null,
   'By written consent (no meeting)', null, null,
   'closed', null, 'approved', -44, -100,
   '[]'::jsonb,
   'Unanimous written consent of the eight directors then serving: Ravi Patel elected to a three-year term. Ratified on the consent agenda of the annual meeting.',
   '[]'::jsonb, -100, -44),
  ('prev', -44, pg_temp.s7_fq(pg_temp.d(-44)) || ' Board Meeting and Annual Meeting', 'annual', '09:00', '11:45',
   'Northbridge HQ, 1450 Harbor Light Way, Oakland, and Zoom', 'https://zoom.example/j/84522100193', '845 2210 0193',
   'closed', true, 'approved', -31, -51,
   pg_temp.s7_att(array['harrington','osei','lim','ramos','nakamura','jackson','patel','brooks'], array['freeman']),
   'Called to order 9:04 AM; 8 of 9 directors present, quorum met. Ravi Patel welcomed to his first meeting.' || chr(10) ||
   'Consent agenda (' || to_char(pg_temp.d(-135), 'FMMonth') || ' minutes, ratify the Patel written consent, preliminary year-end financials): moved Jackson, seconded Ramos, carried 8-0.' || chr(10) ||
   'Annual meeting: Harrington Chair, Osei Vice Chair, Lim Treasurer, Ramos Secretary; Ramos re-elected for a second term. Moved Nakamura, seconded Brooks, carried 8-0.' || chr(10) ||
   'Operating budget adopted: $3.55M revenue, $3.40M expense, $150K to the Opportunity Reserve. Moved Lim, seconded Osei, carried 8-0.' || chr(10) ||
   'Audit: engage Linden & Rook LLP, fee not to exceed $38,500. Moved Ramos, seconded Jackson, carried 7-0; Lim recused.' || chr(10) ||
   'ED goals approved: moved Harrington, seconded Patel, carried 8-0.' || chr(10) ||
   'ED report: Summer Works 85 interns, 94% completion; Pathways Cohort 7 began with 36 fellows; Meridian full proposal due ' || pg_temp.s7_md(-21) || '.' || chr(10) ||
   'Annual COI disclosures distributed; board giving goal 100% by December 31.' || chr(10) ||
   'Adjourned 11:48 AM. Minutes approved by email vote of the directors so the auditors could rely on the budget and engagement resolutions.',
   jsonb_build_array(
     jsonb_build_object('value', '$1.48M', 'label', 'Cash on hand', 'note', 'At the last month-end close. About 5.3 months of operating expenses.'),
     jsonb_build_object('value', '61%', 'label', 'Revenue secured', 'note', 'Of the $3.55M budget, received or committed.'),
     jsonb_build_object('value', '85', 'label', 'Summer Works interns', 'note', 'At 22 employers, 94 percent completion.')),
   -60, -31),
  ('next', 24, case when pg_temp.s7_fq(pg_temp.d(24)) = pg_temp.s7_fq(pg_temp.d(-44)) then to_char(pg_temp.d(24), 'FMMonth') else pg_temp.s7_fq(pg_temp.d(24)) end || ' Board Meeting', 'regular', '17:30', '19:30',
   'Pacific Summit Bank, 1 Bay Plaza, 12th-floor boardroom (host: Daniel Osei), and Zoom', 'https://zoom.example/j/84522100193', '845 2210 0193',
   'upcoming', null, 'draft', null, null,
   '[]'::jsonb, null,
   jsonb_build_array(
     jsonb_build_object('value', '$1.55M', 'label', 'Cash on hand', 'note', 'About 5.5 months of operating expenses, against the board''s 6-month reserve target.'),
     jsonb_build_object('value', '68%', 'label', 'Revenue secured', 'note', 'Of the $3.55M budget, received or committed to date.'),
     jsonb_build_object('value', '$1.1M', 'label', 'Open pipeline', 'note', 'About 25 opportunities, $520K weighted. Meridian ($300K) decides around ' || pg_temp.s7_md(35) || '.')),
   -40, -1),
  ('retreat', 54, 'Board and staff planning retreat', 'special', '09:00', '15:00',
   'Fruitvale Hub Community Center, Oakland', null, null,
   'upcoming', null, 'draft', null, null,
   '[]'::jsonb, null, '[]'::jsonb, -30, -6)
) as m(k, dd, title, mtype, st, et, loc, zoom, zroom, status, quorum, mstatus, appr, pub, att, mtext, stats, created, updated)
on conflict do nothing;

insert into public.agenda_items
  (id, org_id, meeting_id, position, starts_at_label, title, description, owner, duration_minutes, item_type, status, brief, created_at, updated_at)
select pg_temp.nb_id('agenda:' || a.mkey || ':' || a.pos), pg_temp.nb_org(), pg_temp.nb_id('boardmtg:' || a.mkey), a.pos, a.label,
       a.title, a.description, a.owner, a.minutes, a.item_type, a.status, a.brief,
       pg_temp.ts(case a.mkey when 'prev3' then -240 when 'prev2' then -150 when 'consent_patel' then -100
                              when 'prev' then -58 when 'next' then -9 else -6 end, '14:00'),
       pg_temp.ts(case a.mkey when 'prev3' then -229 when 'prev2' then -135 when 'consent_patel' then -95
                              when 'prev' then -44 when 'next' then -1 else -6 end, '16:00')
from s7_agenda a
on conflict do nothing;

-- ── Minutes (structured, portal) ────────────────────────────────────────────
insert into public.minutes
  (id, org_id, meeting_id, body, called_to_order_at, adjourned_at, quorum_met, approved_at, approved_by_meeting_id,
   signed_by, signed_at, created_at, updated_at)
values
  (pg_temp.nb_id('minutes:prev3'), pg_temp.nb_org(), pg_temp.nb_id('boardmtg:prev3'),
   jsonb_build_object(
     'present', jsonb_build_array('Celeste Harrington', 'Daniel Osei', 'Grace Lim', 'Victor Ramos', 'Dr. Alicia Freeman', 'Monique Jackson', 'Theo Brooks'),
     'absent', jsonb_build_array('Ken Nakamura'),
     'staff_present', jsonb_build_array('Remi Sobomehin', 'Tasha Greene', 'Miguel Arreola', 'Priya Natarajan'),
     'sections', jsonb_build_array(
       jsonb_build_object('type', 'heading', 'text', 'Call to order'),
       jsonb_build_object('type', 'paragraph', 'text', 'Celeste Harrington called the meeting to order at 5:34 PM. Seven of eight directors were present and a quorum was established. No changes to the agenda.'),
       jsonb_build_object('type', 'heading', 'text', 'Consent agenda'),
       jsonb_build_object('type', 'decision', 'motion', 'That the Board approve the minutes of the previous meeting and accept the second-quarter financial statements.',
         'moved_by', 'Grace Lim', 'seconded_by', 'Dr. Alicia Freeman', 'for', 7, 'against', 0, 'abstained', '[]'::jsonb, 'outcome', 'passed'),
       jsonb_build_object('type', 'heading', 'text', 'Executive Director report'),
       jsonb_build_object('type', 'paragraph', 'text', 'Remi reported revenue running 4 percent ahead of budget at mid-year, led by the Bayview general operating grant and corporate sponsorships. Launchpad attendance averaged 87 percent across the three sites. The Eastshore Workforce Development Board has invited Northbridge to propose a cost-reimbursement contract for Pathways.'),
       jsonb_build_object('type', 'heading', 'text', 'Northbridge Rising Gala'),
       jsonb_build_object('type', 'paragraph', 'text', 'Priya reported $190,000 in sponsorships and tables committed toward the $275,000 goal. Each director agreed to fill or sell one table. Daniel confirmed Pacific Summit Bank as presenting sponsor again.'),
       jsonb_build_object('type', 'heading', 'text', 'Pathways Cohort 6 mid-year outcomes'),
       jsonb_build_object('type', 'paragraph', 'text', 'Andre Mitchell reported 31 of 34 fellows active, 22 industry credentials earned so far, and employer commitments for 26 placement interviews in the final round. Monique offered to open two more clinical placements at Harbor Health.'),
       jsonb_build_object('type', 'heading', 'text', 'Meridian Foundation letter of inquiry'),
       jsonb_build_object('type', 'paragraph', 'text', 'Remi proposed a letter of inquiry to the Meridian Foundation for Youth Opportunity to fund a fourth Launchpad site in San Leandro. Dr. Freeman asked that the district commit a named site lead before any launch; Remi agreed to make that a condition.'),
       jsonb_build_object('type', 'decision', 'motion', 'That the Board authorize the Executive Director to submit a letter of inquiry to the Meridian Foundation for Youth Opportunity for up to $300,000 over two years to support a fourth Launchpad site in San Leandro.',
         'moved_by', 'Daniel Osei', 'seconded_by', 'Monique Jackson', 'for', 7, 'against', 0, 'abstained', '[]'::jsonb, 'outcome', 'passed'),
       jsonb_build_object('type', 'heading', 'text', 'Adjournment'),
       jsonb_build_object('type', 'paragraph', 'text', 'Adjourned at 7:21 PM.'))),
   '5:34 PM Pacific', '7:21 PM Pacific', true, pg_temp.ts(-135, '11:20'), pg_temp.nb_id('boardmtg:prev2'),
   'Victor Ramos, Secretary', pg_temp.ts(-130, '10:00'), pg_temp.ts(-226, '09:30'), pg_temp.ts(-130, '10:00')),

  (pg_temp.nb_id('minutes:prev2'), pg_temp.nb_org(), pg_temp.nb_id('boardmtg:prev2'),
   jsonb_build_object(
     'present', jsonb_build_array('Celeste Harrington', 'Daniel Osei', 'Grace Lim', 'Victor Ramos', 'Dr. Alicia Freeman', 'Ken Nakamura', 'Theo Brooks'),
     'absent', jsonb_build_array('Monique Jackson'),
     'staff_present', jsonb_build_array('Remi Sobomehin', 'Tasha Greene', 'Kwame Asante', 'Priya Natarajan', 'Miguel Arreola'),
     'sections', jsonb_build_array(
       jsonb_build_object('type', 'heading', 'text', 'Call to order'),
       jsonb_build_object('type', 'paragraph', 'text', 'Celeste Harrington called the meeting to order at 9:03 AM. Seven of eight directors were present and a quorum was established.'),
       jsonb_build_object('type', 'heading', 'text', 'Consent agenda'),
       jsonb_build_object('type', 'decision', 'motion', 'That the Board approve the minutes of the previous meeting and accept the third-quarter financial statements.',
         'moved_by', 'Victor Ramos', 'seconded_by', 'Theo Brooks', 'for', 7, 'against', 0, 'abstained', '[]'::jsonb, 'outcome', 'passed'),
       jsonb_build_object('type', 'heading', 'text', 'Executive Director report and gala results'),
       jsonb_build_object('type', 'paragraph', 'text', 'The Northbridge Rising Gala raised $285,000 gross against a $275,000 goal, the paddle raise alone $64,000. Summer Works is fully placed with 85 interns at 22 employers. Pathways Cohort 6 is in its final placement round; Andre expects at least 80 percent placement at 90 days.'),
       jsonb_build_object('type', 'heading', 'text', 'Interim budget and spending authority'),
       jsonb_build_object('type', 'paragraph', 'text', 'Grace Lim presented the Finance & Audit Committee''s recommendation. The state Youth Opportunity award and the Hollis renewal will not confirm until shortly before the annual meeting, so the committee recommended interim spending authority at the current run rate and a final budget at that meeting.'),
       jsonb_build_object('type', 'decision', 'motion', 'That the Board authorize spending at the current fiscal year''s monthly run rate until a final operating budget is adopted, no later than the annual meeting.',
         'moved_by', 'Grace Lim', 'seconded_by', 'Celeste Harrington', 'for', 7, 'against', 0, 'abstained', '[]'::jsonb, 'outcome', 'passed'),
       jsonb_build_object('type', 'heading', 'text', 'Operating reserve policy'),
       jsonb_build_object('type', 'paragraph', 'text', 'The committee recommended a reserve target of six months of operating expenses and a board-designated Opportunity Reserve. Daniel Osei disclosed that the reserve account is held at Pacific Summit Bank and abstained.'),
       jsonb_build_object('type', 'decision', 'motion', 'That the Board adopt the Operating Reserve Policy as presented, set a reserve target of six months of operating expenses, and designate $250,000 of unrestricted net assets as the Opportunity Reserve.',
         'moved_by', 'Grace Lim', 'seconded_by', 'Ken Nakamura', 'for', 6, 'against', 0, 'abstained', jsonb_build_array('Daniel Osei'), 'outcome', 'passed', 'note', 'Osei abstained; the reserve is held at Pacific Summit Bank'),
       jsonb_build_object('type', 'heading', 'text', 'Executive Director goals'),
       jsonb_build_object('type', 'paragraph', 'text', 'Directors discussed the shape of the Executive Director''s goals for the new year: reserves, multi-year funding, a growth decision on San Leandro, and personal stewardship of top donors. Celeste and Remi will bring final goals to the annual meeting.'),
       jsonb_build_object('type', 'heading', 'text', 'Adjournment'),
       jsonb_build_object('type', 'paragraph', 'text', 'Adjourned at 11:22 AM.'))),
   '9:03 AM Pacific', '11:22 AM Pacific', true, pg_temp.ts(-44, '11:46'), pg_temp.nb_id('boardmtg:prev'),
   'Victor Ramos, Secretary', pg_temp.ts(-40, '10:00'), pg_temp.ts(-131, '09:30'), pg_temp.ts(-40, '10:00')),

  (pg_temp.nb_id('minutes:consent_patel'), pg_temp.nb_org(), pg_temp.nb_id('boardmtg:consent_patel'),
   jsonb_build_object(
     'present', jsonb_build_array('Celeste Harrington', 'Daniel Osei', 'Grace Lim', 'Victor Ramos', 'Dr. Alicia Freeman', 'Ken Nakamura', 'Monique Jackson', 'Theo Brooks'),
     'absent', '[]'::jsonb,
     'staff_present', '[]'::jsonb,
     'sections', jsonb_build_array(
       jsonb_build_object('type', 'heading', 'text', 'Action by written consent'),
       jsonb_build_object('type', 'paragraph', 'text', 'The following action was taken by the unanimous written consent of the directors without a meeting, under the Bylaws and California Corporations Code Section 5211. The consent was circulated by the Secretary and all eight directors returned signed consents.'),
       jsonb_build_object('type', 'decision', 'motion', 'That Ravi Patel is elected to the Board of Directors for a three-year term.',
         'for', 8, 'against', 0, 'abstained', '[]'::jsonb, 'outcome', 'passed', 'note', 'Unanimous written consent; ratified at the annual meeting'))),
   null, null, null, pg_temp.ts(-44, '09:06'), pg_temp.nb_id('boardmtg:prev'),
   'Victor Ramos, Secretary', pg_temp.ts(-93, '12:00'), pg_temp.ts(-95, '12:00'), pg_temp.ts(-44, '09:06')),

  (pg_temp.nb_id('minutes:prev'), pg_temp.nb_org(), pg_temp.nb_id('boardmtg:prev'),
   jsonb_build_object(
     'present', jsonb_build_array('Celeste Harrington', 'Daniel Osei', 'Grace Lim', 'Victor Ramos', 'Ken Nakamura', 'Monique Jackson', 'Ravi Patel', 'Theo Brooks'),
     'absent', jsonb_build_array('Dr. Alicia Freeman'),
     'staff_present', jsonb_build_array('Remi Sobomehin', 'Tasha Greene', 'Kwame Asante', 'Priya Natarajan', 'Miguel Arreola'),
     'sections', jsonb_build_array(
       jsonb_build_object('type', 'heading', 'text', 'Call to order and welcome'),
       jsonb_build_object('type', 'paragraph', 'text', 'Celeste Harrington called the meeting to order at 9:04 AM. Eight of nine directors were present and a quorum was established. The board welcomed Ravi Patel to his first meeting.'),
       jsonb_build_object('type', 'heading', 'text', 'Consent agenda'),
       jsonb_build_object('type', 'decision', 'motion', 'That the Board approve the minutes of the ' || to_char(pg_temp.d(-135), 'FMMonth') || ' meeting, ratify the action by written consent electing Ravi Patel, and accept the preliminary year-end financial statements.',
         'moved_by', 'Monique Jackson', 'seconded_by', 'Victor Ramos', 'for', 8, 'against', 0, 'abstained', '[]'::jsonb, 'outcome', 'passed'),
       jsonb_build_object('type', 'heading', 'text', 'Annual meeting: officers and directors'),
       jsonb_build_object('type', 'paragraph', 'text', 'Victor Ramos presented the officer slate. Victor stood for a second three-year term as a director and left the room for the vote on his own seat.'),
       jsonb_build_object('type', 'decision', 'motion', 'That the Board elect Celeste Harrington as Chair, Daniel Osei as Vice Chair, Grace Lim as Treasurer and Victor Ramos as Secretary for the coming year, and re-elect Victor Ramos as a director for a second three-year term.',
         'moved_by', 'Ken Nakamura', 'seconded_by', 'Theo Brooks', 'for', 8, 'against', 0, 'abstained', '[]'::jsonb, 'outcome', 'passed'),
       jsonb_build_object('type', 'heading', 'text', 'Operating budget'),
       jsonb_build_object('type', 'paragraph', 'text', 'Grace Lim and Kwame Asante presented the final budget: $3.55 million in revenue and $3.40 million in expense, with the $150,000 surplus going to the Opportunity Reserve. Sixty-one percent of budgeted revenue was already received or committed. Ravi Patel asked how much of the remainder depends on renewals; Kwame walked through the renewal schedule by funder.'),
       jsonb_build_object('type', 'decision', 'motion', 'That the Board adopt the operating budget of $3,400,000 in expenses and $3,550,000 in revenue, including a planned $150,000 contribution to the Opportunity Reserve.',
         'moved_by', 'Grace Lim', 'seconded_by', 'Daniel Osei', 'for', 8, 'against', 0, 'abstained', '[]'::jsonb, 'outcome', 'passed'),
       jsonb_build_object('type', 'heading', 'text', 'Audit engagement'),
       jsonb_build_object('type', 'paragraph', 'text', 'Grace Lim recused herself from the auditor selection because her firm was invited to propose. Victor Ramos presented the Finance & Audit Committee''s recommendation of Linden & Rook LLP after a three-firm RFP. Fieldwork begins next month.'),
       jsonb_build_object('type', 'decision', 'motion', 'That the Board engage Linden & Rook LLP to audit last fiscal year''s financial statements, at a fee not to exceed $38,500.',
         'moved_by', 'Victor Ramos', 'seconded_by', 'Monique Jackson', 'for', 7, 'against', 0, 'abstained', jsonb_build_array('Grace Lim'), 'outcome', 'passed', 'note', 'Lim recused'),
       jsonb_build_object('type', 'heading', 'text', 'Executive Director goals'),
       jsonb_build_object('type', 'paragraph', 'text', 'The board reviewed Remi''s goals for the year: close the year at six months of operating reserves, secure $500,000 in new multi-year funding, bring a San Leandro site plan to the retreat, and personally steward the top 25 donors.'),
       jsonb_build_object('type', 'decision', 'motion', 'That the Board approve the Executive Director''s goals for the fiscal year as presented.',
         'moved_by', 'Celeste Harrington', 'seconded_by', 'Ravi Patel', 'for', 8, 'against', 0, 'abstained', '[]'::jsonb, 'outcome', 'passed'),
       jsonb_build_object('type', 'heading', 'text', 'Executive Director report'),
       jsonb_build_object('type', 'paragraph', 'text', 'Summer Works placed 85 interns at 22 employers with a 94 percent completion rate. Pathways Cohort 7 began with 36 fellows across the IT, healthcare and building-trades tracks. The Meridian full proposal is due ' || pg_temp.s7_md(-21) || '; Lena and Remi are drafting.'),
       jsonb_build_object('type', 'heading', 'text', 'Conflict of interest and board giving'),
       jsonb_build_object('type', 'paragraph', 'text', 'Tasha distributed the annual conflict-of-interest disclosures. Celeste reminded directors that the board''s goal is 100 percent giving participation by December 31.'),
       jsonb_build_object('type', 'heading', 'text', 'Adjournment'),
       jsonb_build_object('type', 'paragraph', 'text', 'Adjourned at 11:48 AM.'))),
   '9:04 AM Pacific', '11:48 AM Pacific', true, pg_temp.ts(-31, '20:15'), null,
   'Victor Ramos, Secretary', pg_temp.ts(-30, '09:00'), pg_temp.ts(-42, '10:30'), pg_temp.ts(-30, '09:00'))
on conflict do nothing;

-- ── Resolutions (decisions register) ────────────────────────────────────────
insert into public.resolutions
  (id, org_id, meeting_id, agenda_item_id, motion_text, moved_by, seconded_by, votes_for, votes_against, abstentions, passed, notes, created_at)
select pg_temp.nb_id('res:' || r.k), pg_temp.nb_org(), pg_temp.nb_id('boardmtg:' || r.m),
       pg_temp.nb_id('agenda:' || r.m || ':' || r.pos), r.motion, r.moved, r.seconded, r.vf, r.va, r.abst, true, r.notes,
       pg_temp.ts(r.dd, '19:00')
from (values
  ('prev3_consent', 'prev3', 2, 'That the Board approve the minutes of the previous meeting and accept the second-quarter financial statements.',
   'Grace Lim', 'Dr. Alicia Freeman', 7, 0, '{}'::text[], null, -229),
  ('prev3_meridian_loi', 'prev3', 6, 'That the Board authorize the Executive Director to submit a letter of inquiry to the Meridian Foundation for Youth Opportunity for up to $300,000 over two years to support a fourth Launchpad site in San Leandro.',
   'Daniel Osei', 'Monique Jackson', 7, 0, '{}'::text[], 'Condition from Dr. Freeman: the district names a site lead before any launch.', -229),
  ('prev2_consent', 'prev2', 2, 'That the Board approve the minutes of the previous meeting and accept the third-quarter financial statements.',
   'Victor Ramos', 'Theo Brooks', 7, 0, '{}'::text[], null, -135),
  ('prev2_interim_budget', 'prev2', 4, 'That the Board authorize spending at the current fiscal year''s monthly run rate until a final operating budget is adopted, no later than the annual meeting.',
   'Grace Lim', 'Celeste Harrington', 7, 0, '{}'::text[], 'Superseded by the operating budget adopted at the annual meeting.', -135),
  ('prev2_reserve', 'prev2', 5, 'That the Board adopt the Operating Reserve Policy as presented, set a reserve target of six months of operating expenses, and designate $250,000 of unrestricted net assets as the Opportunity Reserve.',
   'Grace Lim', 'Ken Nakamura', 6, 0, array['Daniel Osei'], 'Osei abstained; the reserve is held at Pacific Summit Bank.', -135),
  ('consent_patel', 'consent_patel', 1, 'That Ravi Patel is elected to the Board of Directors for a three-year term.',
   null, null, 8, 0, '{}'::text[], 'Adopted by unanimous written consent of the eight directors then serving; ratified on the consent agenda of the annual meeting.', -95),
  ('prev_consent', 'prev', 2, 'That the Board approve the minutes of the ' || to_char(pg_temp.d(-135), 'FMMonth') || ' meeting, ratify the action by written consent electing Ravi Patel, and accept the preliminary year-end financial statements.',
   'Monique Jackson', 'Victor Ramos', 8, 0, '{}'::text[], null, -44),
  ('prev_officers', 'prev', 3, 'That the Board elect Celeste Harrington as Chair, Daniel Osei as Vice Chair, Grace Lim as Treasurer and Victor Ramos as Secretary for the coming year, and re-elect Victor Ramos as a director for a second three-year term.',
   'Ken Nakamura', 'Theo Brooks', 8, 0, '{}'::text[], 'Ramos left the room for the vote on his own seat.', -44),
  ('prev_budget', 'prev', 4, 'That the Board adopt the operating budget of $3,400,000 in expenses and $3,550,000 in revenue, including a planned $150,000 contribution to the Opportunity Reserve.',
   'Grace Lim', 'Daniel Osei', 8, 0, '{}'::text[], null, -44),
  ('prev_audit_firm', 'prev', 5, 'That the Board engage Linden & Rook LLP to audit last fiscal year''s financial statements, at a fee not to exceed $38,500.',
   'Victor Ramos', 'Monique Jackson', 7, 0, array['Grace Lim'], 'Lim recused; her firm was invited to propose.', -44),
  ('prev_ed_goals', 'prev', 6, 'That the Board approve the Executive Director''s goals for the fiscal year as presented.',
   'Celeste Harrington', 'Ravi Patel', 8, 0, '{}'::text[], null, -44)
) as r(k, m, pos, motion, moved, seconded, vf, va, abst, notes, dd)
on conflict do nothing;

-- ── Follow-ups ("Since we last met"; meeting_id = the meeting they report to) ─
insert into public.follow_ups
  (id, org_id, meeting_id, source_meeting_id, description, owner, due_date, status, completed_at, note, created_at)
select pg_temp.nb_id('fu:' || f.k), pg_temp.nb_org(), pg_temp.nb_id('boardmtg:' || f.m), pg_temp.nb_id('boardmtg:' || f.src),
       f.descr, f.owner, case when f.due is null then null else pg_temp.d(f.due) end, f.status,
       case when f.done is null then null else pg_temp.ts(f.done, '15:00') end, f.note, pg_temp.ts(f.created, '13:00')
from (values
  -- committed in June, reported at the annual meeting
  ('prev_budget_final', 'prev', 'prev2', 'Bring the final operating budget for adoption once the state award and the Hollis renewal confirm', 'Kwame Asante', -44, 'done', -47, 'Adopted at the annual meeting', -134),
  ('prev_audit_rfp', 'prev', 'prev2', 'Run the auditor RFP and bring a recommendation', 'Finance & Audit Committee', -44, 'done', -52, 'Linden & Rook LLP recommended and engaged', -134),
  ('prev_ed_goals', 'prev', 'prev2', 'Draft the Executive Director''s goals with the Chair', 'Remi Sobomehin, Celeste Harrington', -44, 'done', -60, null, -134),
  ('prev_health_employers', 'prev', 'prev2', 'Introduce two healthcare employers for Pathways clinical placements', 'Monique Jackson', -60, 'done', -70, 'Two placements opened at Harbor Health clinics', -134),
  -- committed at the annual meeting, reported at the next meeting
  ('next_audit_timeline', 'next', 'prev', 'Circulate the audit timeline and PBC status to the Finance & Audit Committee', 'Kwame Asante', 5, 'in_progress', null, 'Fieldwork under way; 6 of 10 PBC items delivered', -43),
  ('next_board_giving', 'next', 'prev', 'Confirm fiscal-year gifts or pledges (7 of 9 directors so far)', 'Victor Ramos, Ravi Patel', -5, 'overdue', null, 'Celeste following up personally', -43),
  ('next_patel_visits', 'next', 'prev', 'Schedule Ravi Patel''s site visits to Launchpad and Pathways', 'Remi Sobomehin', 9, 'in_progress', null, null, -43),
  ('next_sanleandro', 'next', 'prev', 'Bring San Leandro expansion options, with and without Meridian funding', 'Miguel Arreola', 17, 'in_progress', null, 'On this agenda as item 6', -43),
  ('next_safeguarding', 'next', 'prev', 'Revise the Child Safeguarding Policy for virtual mentoring', 'Tasha Greene', 17, 'done', -3, 'Redline posted to the materials; on the consent agenda', -43),
  ('next_kinetic_lunch', 'next', 'prev', 'Host a Kinetic Labs mentor recruiting lunch', 'Ken Nakamura', -20, 'done', -22, 'Twelve employee mentors signed up', -43),
  ('next_bank_match', 'next', 'prev', 'Explore a Pacific Summit Bank match for the Year-End campaign', 'Daniel Osei', 14, 'in_progress', null, null, -43),
  ('next_soi', 'next', 'prev', 'File the Statement of Information with the new officer slate', 'Kwame Asante', 4, 'in_progress', null, 'Waiting on the Secretary''s mailing address', -43)
) as f(k, m, src, descr, owner, due, status, done, note, created)
on conflict do nothing;

-- ── Attendance + RSVPs (portal) ─────────────────────────────────────────────
insert into public.meeting_attendance (id, org_id, meeting_id, board_member_id, rsvp, attended, is_staff, updated_at)
select pg_temp.nb_id('bmatt:' || a.m || ':' || a.k), pg_temp.nb_org(), pg_temp.nb_id('boardmtg:' || a.m), pg_temp.nb_id('bm:' || a.k),
       a.rsvp, a.attended, false, pg_temp.ts(a.upd, a.hhmi)
from (values
  ('prev3', 'harrington', 'yes', true, -229, '19:30'), ('prev3', 'osei', 'yes', true, -229, '19:30'), ('prev3', 'lim', 'yes', true, -229, '19:30'),
  ('prev3', 'ramos', 'yes', true, -229, '19:30'), ('prev3', 'freeman', 'yes', true, -229, '19:30'), ('prev3', 'nakamura', 'no', false, -229, '19:30'),
  ('prev3', 'jackson', 'yes', true, -229, '19:30'), ('prev3', 'brooks', 'yes', true, -229, '19:30'),
  ('prev2', 'harrington', 'yes', true, -135, '11:30'), ('prev2', 'osei', 'yes', true, -135, '11:30'), ('prev2', 'lim', 'yes', true, -135, '11:30'),
  ('prev2', 'ramos', 'yes', true, -135, '11:30'), ('prev2', 'freeman', 'yes', true, -135, '11:30'), ('prev2', 'nakamura', 'yes', true, -135, '11:30'),
  ('prev2', 'jackson', 'no', false, -135, '11:30'), ('prev2', 'brooks', 'yes', true, -135, '11:30'),
  ('prev', 'harrington', 'yes', true, -44, '11:50'), ('prev', 'osei', 'yes', true, -44, '11:50'), ('prev', 'lim', 'yes', true, -44, '11:50'),
  ('prev', 'ramos', 'yes', true, -44, '11:50'), ('prev', 'freeman', 'no', false, -44, '11:50'), ('prev', 'nakamura', 'yes', true, -44, '11:50'),
  ('prev', 'jackson', 'yes', true, -44, '11:50'), ('prev', 'patel', 'yes', true, -44, '11:50'), ('prev', 'brooks', 'yes', true, -44, '11:50'),
  ('next', 'harrington', 'yes', null, -8, '09:12'), ('next', 'osei', 'yes', null, -8, '13:40'), ('next', 'lim', 'yes', null, -7, '07:55'),
  ('next', 'ramos', 'yes', null, -5, '18:20'), ('next', 'freeman', 'yes', null, -6, '10:05'), ('next', 'nakamura', 'unsure', null, -4, '22:10'),
  ('next', 'jackson', 'no', null, -3, '12:30'), ('next', 'patel', 'yes', null, -2, '08:45'), ('next', 'brooks', null, null, -9, '09:00'),
  ('retreat', 'harrington', 'yes', null, -5, '09:00'), ('retreat', 'osei', null, null, -6, '09:00'), ('retreat', 'lim', 'yes', null, -4, '09:00'),
  ('retreat', 'ramos', null, null, -6, '09:00'), ('retreat', 'freeman', 'yes', null, -5, '09:00'), ('retreat', 'nakamura', null, null, -6, '09:00'),
  ('retreat', 'jackson', 'yes', null, -3, '09:00'), ('retreat', 'patel', 'yes', null, -2, '09:00'), ('retreat', 'brooks', 'yes', null, -4, '09:00')
) as a(m, k, rsvp, attended, upd, hhmi)
on conflict do nothing;

-- ── Director prep for the next meeting (each director sees only their own) ──
insert into public.prep_items (id, org_id, meeting_id, board_member_id, position, label, sub_label, href, minutes_est, completed_at)
select pg_temp.nb_id('prep:next:' || p.k || ':' || p.pos), pg_temp.nb_org(), pg_temp.nb_id('boardmtg:next'), pg_temp.nb_id('bm:' || p.k),
       p.pos, p.label, p.sub,
       case when p.anchor is null then p.href else '/board/meetings/' || pg_temp.nb_id('boardmtg:next') || p.anchor end,
       p.mins, case when p.done is null then null else pg_temp.ts(p.done, p.hhmi) end
from (
  select k, 1 as pos, 'Read the board packet' as label, 'Final packet posts ' || pg_temp.s7_md(17) || '. Item 6 is the decision.' as sub,
         null::text as href, '' as anchor, 25 as mins, null::int as done, '09:00' as hhmi
  from unnest(array['harrington','osei','lim','ramos','freeman','nakamura','jackson','patel','brooks']) k
  union all
  select k, 2, 'Review the first-quarter financial statements', 'Grace takes questions first. Restricted and unrestricted cash are shown separately.',
         null, '#item-5', 10,
         case k when 'lim' then -1 when 'harrington' then -3 when 'osei' then -2 end,
         case k when 'lim' then '22:10' else '19:30' end
  from unnest(array['harrington','osei','lim','ramos','freeman','nakamura','jackson','patel','brooks']) k
  union all
  select k, 3, 'Read the San Leandro expansion brief', 'Two pages: the site, the money, the risk.',
         null, '#item-6', 10,
         case k when 'harrington' then -2 when 'patel' then -1 when 'freeman' then -4 end, '20:00'
  from unnest(array['harrington','osei','lim','ramos','freeman','nakamura','jackson','patel','brooks']) k
  union all
  select k, 4, 'Bring two Year-End prospect names', 'People you will personally ask or introduce before December 31.',
         null, null, 5, case k when 'osei' then -2 end, '13:00'
  from unnest(array['harrington','osei','lim','ramos','freeman','nakamura','jackson','patel','brooks']) k
  union all
  select 'patel', 5, 'Sign your conflict-of-interest disclosure', 'The annual cycle; two minutes. Accepted on the consent agenda.',
         '/board/library', null, 2, null, '09:00'
  union all
  select k, 6, 'Make or pledge your fiscal-year gift', 'Board giving is at 7 of 9. Any amount counts toward participation.',
         null, null, 5, null, '09:00'
  from unnest(array['ramos','patel']) k
) p
on conflict do nothing;

-- ── Directors' questions on the materials (asker + board admins only) ───────
insert into public.member_questions (id, org_id, meeting_id, board_member_id, body, answered_at, answer_body, created_at)
select pg_temp.nb_id('mq:' || q.k), pg_temp.nb_org(), pg_temp.nb_id('boardmtg:next'), pg_temp.nb_id('bm:' || q.who), q.body,
       case when q.ans_d is null then null else pg_temp.ts(q.ans_d, q.ans_t) end, q.answer, pg_temp.ts(q.d, q.t)
from (values
  ('lim_restricted', 'lim', 'Can the Q1 statements show restricted and unrestricted cash separately? I want to see how much of the $1.55M is Pathways money we cannot move.',
   -6, '08:20', -5, '16:40', 'Yes. Kwame added a net-assets roll-forward page to the packet. Restricted cash is about $410K, mostly the Hollis and Eastshore Pathways dollars.'),
  ('patel_revenue_mix', 'patel', 'Is there a one-page view of our revenue mix by source? I would like to come to the retreat with ideas on employer fees for Summer Works.',
   -4, '21:05', -3, '10:15', 'Ben is pulling a one-pager for you: about 38 percent foundations, 24 percent government, 21 percent individuals, 17 percent corporate. Happy to walk through it before the retreat.'),
  ('freeman_district', 'freeman', 'For San Leandro, has the district committed a classroom and a named site lead, or are we still at the MOU draft? That was our condition in the spring.',
   -1, '20:30', null, null, null),
  ('osei_meridian_visit', 'osei', 'If Meridian asks for a site visit before they decide, the bank can host their program director at our Oakland office and we can drive to Eastlake from there. What is their timeline?',
   0, '06:55', null, null, null),
  ('brooks_fellows', 'brooks', 'Could two Cohort 7 fellows sit in for the Year-End item? Donors respond to them more than to us.',
   -2, '18:45', null, null, null)
) as q(k, who, body, d, t, ans_d, ans_t, answer)
on conflict do nothing;

-- ── Directors' private notes on agenda items (author-only by RLS) ───────────
insert into public.member_notes (id, org_id, meeting_id, agenda_item_id, board_member_id, body, updated_at)
select pg_temp.nb_id('mn:' || n.who || ':' || n.pos), pg_temp.nb_org(), pg_temp.nb_id('boardmtg:next'),
       pg_temp.nb_id('agenda:next:' || n.pos), pg_temp.nb_id('bm:' || n.who), n.body, pg_temp.ts(n.d, n.t)
from (values
  ('lim', 5, 'Ask Kwame for the restricted-cash roll-forward and the aging on the Eastshore receivable. Reserve at 5.5 months: what closes the gap by fiscal year-end?', -1, '22:20'),
  ('harrington', 6, 'Start with readiness, not money. If the district has not named a site lead, the motion should wait. Ask Miguel who supervises Rosa''s current sites if she takes San Leandro.', -2, '20:10'),
  ('osei', 7, 'Bank match: $25K is realistic if we announce it in the first week. Need the appeal date locked.', -1, '21:00'),
  ('freeman', 6, 'District site lead? Classroom confirmed in writing? Same bell schedule problem as Laurel Ridge?', -1, '20:40'),
  ('patel', 6, 'What does year three cost when Meridian ends? Is there an employer-fee piece we can build in from the start?', -1, '07:30')
) as n(who, pos, body, d, t)
on conflict do nothing;

-- ── Notes directors chose to send on (recipient: the Chair's inbox) ─────────
insert into public.shared_notes (id, org_id, meeting_id, agenda_item_id, board_member_id, body, created_at)
select pg_temp.nb_id('sn:' || s.k), pg_temp.nb_org(), pg_temp.nb_id('boardmtg:next'), pg_temp.nb_id('agenda:next:' || s.pos),
       pg_temp.nb_id('bm:' || s.who), s.body, pg_temp.ts(s.d, s.t)
from (values
  ('osei_match', 'osei', 7, 'Bank match: $25K is realistic if we announce it in the first week. Need the appeal date locked.', -1, '21:15'),
  ('freeman_district', 'freeman', 6, 'District site lead? Classroom confirmed in writing? Same bell schedule problem as Laurel Ridge?', -1, '20:45')
) as s(k, who, pos, body, d, t)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- COMPLIANCE
-- ════════════════════════════════════════════════════════════════════════════
insert into public.compliance_items
  (id, org_id, kind, title, jurisdiction, due_date, recur, status, assigned_to, assigned_to_id, notes,
   last_filed_at, checklist, why_it_matters, created_at, updated_at)
select pg_temp.nb_id('comp:' || c.k), pg_temp.nb_org(), c.kind, c.title, c.jur, pg_temp.d(c.due), c.recur, c.status,
       c.who, pg_temp.nb_user(c.who), c.notes,
       case when c.last is null then null else pg_temp.ts(c.last, '15:30') end,
       c.checklist, c.why, pg_temp.ts(c.created, '10:00'), pg_temp.ts(c.upd, c.upd_t)
from (values
  ('form990', 'form_990', 'Form 990: ' || pg_temp.s7_fyl(-1) || ' federal return', 'IRS', 208, 'annual', 'in_progress', 'kwame',
   'Extension filed (Form 8868), so the return is due ' || pg_temp.s7_md(208) || '. Linden & Rook prepares it from the audited statements; Kwame owns the schedules. Finance & Audit reviews the draft, and the full board receives a copy before filing (Part VI, line 11a).',
   -160,
   jsonb_build_array(
     jsonb_build_object('id', 'c1', 'text', 'File Form 8868 automatic extension', 'done', true),
     jsonb_build_object('id', 'c2', 'text', 'Audit fieldwork complete', 'done', false),
     jsonb_build_object('id', 'c3', 'text', 'Draft return from the audited trial balance', 'done', false),
     jsonb_build_object('id', 'c4', 'text', 'Schedule A public support test', 'done', false),
     jsonb_build_object('id', 'c5', 'text', 'Schedule B contributor list (kept confidential)', 'done', false),
     jsonb_build_object('id', 'c6', 'text', 'Confirm Part VI governance answers with Tasha', 'done', false),
     jsonb_build_object('id', 'c7', 'text', 'Finance & Audit Committee review', 'done', false),
     jsonb_build_object('id', 'c8', 'text', 'Board receives a copy before filing', 'done', false),
     jsonb_build_object('id', 'c9', 'text', 'E-file and post the public copy to Candid', 'done', false)),
   'Our public tax return. Funders, Candid and the state registry all read it, and three missed years would cost the exemption.',
   -900, -11, '16:00'),
  ('form8868', 'form_990', 'Form 8868: 990 extension (' || pg_temp.s7_fyl(-1) || ')', 'IRS', 27, 'none', 'filed', 'kwame',
   'Automatic six-month extension so the 990 can follow the audit. Accepted by the IRS; the return is now due ' || pg_temp.s7_md(208) || '.',
   -11, '[]'::jsonb, null, -40, -11, '16:05'),
  ('rrf1', 'state_charitable', 'CA Registry of Charities: RRF-1 renewal (' || pg_temp.s7_fyl(-1) || ')', 'CA', 208, 'annual', 'upcoming', 'kwame',
   'Due with the 990 on the extended date. Revenue is over $2 million, so the audited financial statements are filed with it. Registration fee is paid online at filing.',
   -150,
   jsonb_build_array(
     jsonb_build_object('id', 'c1', 'text', 'Pull the issued audit report', 'done', false),
     jsonb_build_object('id', 'c2', 'text', 'Complete the RRF-1 Part B questions', 'done', false),
     jsonb_build_object('id', 'c3', 'text', 'Attach the filed Form 990', 'done', false),
     jsonb_build_object('id', 'c4', 'text', 'Pay the registration fee', 'done', false)),
   'The Attorney General''s registry is what lets us solicit donations in California; a delinquent status is public on the registry search.',
   -900, -150, '15:30'),
  ('soi', 'corporate_report', 'CA Statement of Information (SI-100)', 'CA', 4, 'biennial', 'in_progress', 'kwame',
   'Due this week. The form is drafted with the officer slate elected at the annual meeting; waiting on Victor (Secretary) to confirm his mailing address. $20 fee. Left unfiled, the Secretary of State can add a $50 penalty and eventually suspend the corporation.',
   -736,
   jsonb_build_array(
     jsonb_build_object('id', 'c1', 'text', 'Confirm the officer slate (Chair, Treasurer, Secretary)', 'done', true),
     jsonb_build_object('id', 'c2', 'text', 'Confirm the agent for service of process', 'done', true),
     jsonb_build_object('id', 'c3', 'text', 'Victor confirms the Secretary mailing address', 'done', false),
     jsonb_build_object('id', 'c4', 'text', 'File online and pay the $20 fee', 'done', false),
     jsonb_build_object('id', 'c5', 'text', 'Save the filed copy to Documents', 'done', false)),
   'Keeps the corporation in good standing with the Secretary of State. A suspended nonprofit cannot sign contracts or receive grant payments.',
   -1100, -2, '11:40'),
  ('audit', 'custom', pg_temp.s7_fyl(-1) || ' independent audit', null, 52, 'annual', 'in_progress', 'tasha',
   'Fieldwork with Linden & Rook LLP runs for the next three weeks; the draft report goes to the Finance & Audit Committee by ' || pg_temp.s7_md(52) || '. Federal pass-through spending (the Eastshore contract) is under the Single Audit threshold this year. Kwame is working the PBC list; the checklist below mirrors it.',
   -313,
   jsonb_build_array(
     jsonb_build_object('id', 'c1', 'text', 'Trial balance and general ledger', 'done', true),
     jsonb_build_object('id', 'c2', 'text', 'Bank reconciliations, July through June', 'done', true),
     jsonb_build_object('id', 'c3', 'text', 'Grant agreements and award letters', 'done', true),
     jsonb_build_object('id', 'c4', 'text', 'Payroll registers and quarterly 941s', 'done', true),
     jsonb_build_object('id', 'c5', 'text', 'Pledges receivable schedule', 'done', true),
     jsonb_build_object('id', 'c6', 'text', 'Board minutes for the year', 'done', true),
     jsonb_build_object('id', 'c7', 'text', 'Restricted net asset roll-forward', 'done', false),
     jsonb_build_object('id', 'c8', 'text', 'Functional expense allocation', 'done', false),
     jsonb_build_object('id', 'c9', 'text', 'Fixed asset roll-forward', 'done', false),
     jsonb_build_object('id', 'c10', 'text', 'Management representation letter', 'done', false)),
   'The audit is what the 990, the state registry and every major funder rely on; Bayview and Meridian both ask for the latest audited statements.',
   -700, -1, '16:20'),
  ('oakland_btax', 'corporate_report', 'City of Oakland business tax certificate (nonprofit exemption)', 'Oakland', 133, 'annual', 'upcoming', 'kwame',
   'Annual renewal of the nonprofit exemption. Needs the IRS determination letter and the most recent 990.',
   -235, '[]'::jsonb, null, -1000, -235, '15:30'),
  ('ins_gl', 'insurance', 'General liability and umbrella renewal', null, 13, 'annual', 'in_progress', 'tasha',
   'Renewal quote came in about 6 percent higher (more program sites and participant hours). Grace has reviewed it. Bind by ' || pg_temp.s7_md(12) || ' and send new certificates to the three school sites, San Leandro Unified and the employer partners.',
   -352,
   jsonb_build_array(
     jsonb_build_object('id', 'c1', 'text', 'Renewal application with updated payroll and site list', 'done', true),
     jsonb_build_object('id', 'c2', 'text', 'Loss runs to the broker', 'done', true),
     jsonb_build_object('id', 'c3', 'text', 'Review the quote with the Treasurer', 'done', true),
     jsonb_build_object('id', 'c4', 'text', 'Bind coverage', 'done', false),
     jsonb_build_object('id', 'c5', 'text', 'Send certificates to school sites and employer partners', 'done', false)),
   'School districts and employers require a current certificate before youth can be on site; a lapse would pause Launchpad.',
   -1000, 0, '08:05'),
  ('ins_do', 'insurance', 'Directors and officers / employment practices renewal', null, 73, 'annual', 'upcoming', 'tasha',
   'Renews annually. The application lists the current board roster, so Ravi Patel is added this year.',
   -292, '[]'::jsonb, 'Protects directors personally; most candidates ask about it before they join.', -1000, -292, '15:30'),
  ('ins_wc', 'insurance', 'Workers'' compensation renewal and payroll audit', null, 255, 'annual', 'upcoming', 'tasha',
   'Covers staff and the Summer Works interns we employ directly. Last year''s payroll audit closed with a small refund.',
   -110, '[]'::jsonb, null, -1000, -110, '15:30'),
  ('safeguarding_policy', 'policy', 'Child Safeguarding Policy: annual board review', null, 24, 'annual', 'in_progress', 'tasha',
   'The revision adds the two-adult rule for virtual mentoring, updated mandated-reporter steps, and transport rules for Summer Works. On the consent agenda for the ' || pg_temp.s7_md(24) || ' board meeting.',
   -341,
   jsonb_build_array(
     jsonb_build_object('id', 'c1', 'text', 'Legal review (Victor Ramos)', 'done', true),
     jsonb_build_object('id', 'c2', 'text', 'Staff feedback round', 'done', true),
     jsonb_build_object('id', 'c3', 'text', 'Redline posted to board materials', 'done', true),
     jsonb_build_object('id', 'c4', 'text', 'Board adoption', 'done', false),
     jsonb_build_object('id', 'c5', 'text', 'Publish to staff and mentors', 'done', false)),
   'Every adult who works with our young people works under this policy; funders and school districts ask for it.',
   -800, -3, '17:10'),
  ('safeguarding_training', 'policy', 'Safeguarding and mandated-reporter training: staff and mentors', null, 73, 'annual', 'in_progress', 'tasha',
   'Annual certification for all staff and active mentors. Staff: 17 of 24 complete. Mentors: 38 of 54 complete. Simone is running two make-up sessions for mentors next month.',
   -292,
   jsonb_build_array(
     jsonb_build_object('id', 'c1', 'text', 'Assign the training to all staff', 'done', true),
     jsonb_build_object('id', 'c2', 'text', 'Assign the training to active mentors', 'done', true),
     jsonb_build_object('id', 'c3', 'text', 'Staff complete (17 of 24)', 'done', false),
     jsonb_build_object('id', 'c4', 'text', 'Mentors complete (38 of 54)', 'done', false),
     jsonb_build_object('id', 'c5', 'text', 'File completion certificates', 'done', false)),
   'California mandated-reporter rules apply to everyone who supervises minors in our programs.',
   -800, -4, '12:00'),
  ('livescan', 'custom', 'Live Scan clearance audit: mentors and volunteers', null, 40, 'quarterly', 'upcoming', 'tasha',
   'Quarterly check that every active mentor has a DOJ/FBI clearance on file before any one-on-one contact. Four new Kinetic Labs mentors are waiting on results and are not matched yet.',
   -50,
   jsonb_build_array(
     jsonb_build_object('id', 'c1', 'text', 'Export the active mentor list', 'done', false),
     jsonb_build_object('id', 'c2', 'text', 'Match it against the clearance log', 'done', false),
     jsonb_build_object('id', 'c3', 'text', 'Follow up on the 4 pending clearances', 'done', false),
     jsonb_build_object('id', 'c4', 'text', 'Tasha signs off', 'done', false)),
   'No unmatched or uncleared adult is ever alone with a young person. This is the check that proves it.',
   -700, -5, '11:20'),
  ('i9', 'custom', 'I-9 and E-Verify audit: Summer Works and stipended fellows', null, 227, 'annual', 'upcoming', 'tasha',
   'Every youth worker we employ needs an I-9 and an E-Verify case before day one, plus a work permit for anyone under 18. Last summer''s audit is complete; the next one runs before Summer Works onboarding.',
   -105, '[]'::jsonb, null, -700, -105, '15:30'),
  ('payroll_941', 'employment_tax', 'Quarterly payroll returns (Form 941 and CA DE 9)', 'IRS / CA EDD', 12, 'quarterly', 'upcoming', 'kwame',
   'The payroll provider files; Kwame reconciles deposits and wages to the general ledger before the due date.',
   -80, '[]'::jsonb, null, -1000, -80, '15:30'),
  ('form1099', 'employment_tax', 'Form 1099-NEC for contractors', 'IRS', 104, 'annual', 'upcoming', 'kwame',
   'Fourteen contractors last year (curriculum designers, photographers, workshop facilitators). Collect any missing W-9s before year-end.',
   -262, '[]'::jsonb, null, -1000, -262, '15:30'),
  ('coi_annual', 'policy', 'Annual board conflict-of-interest disclosures', null, 24, 'annual', 'in_progress', 'tasha',
   'Form 990 Part VI asks whether we monitor conflicts every year. Eight of nine directors have signed; Ravi Patel''s is outstanding (he joined the board in ' || to_char(pg_temp.d(-95), 'FMMonth') || '). Accepting the disclosures is on the consent agenda.',
   -336,
   jsonb_build_array(
     jsonb_build_object('id', 'c1', 'text', 'Send disclosure forms to all directors', 'done', true),
     jsonb_build_object('id', 'c2', 'text', 'Collect signed forms (8 of 9)', 'done', false),
     jsonb_build_object('id', 'c3', 'text', 'Review disclosures with the Chair', 'done', true),
     jsonb_build_object('id', 'c4', 'text', 'Board accepts the disclosures', 'done', false)),
   'Answers 990 Part VI line 12 and keeps votes like the reserve and audit decisions clean.',
   -800, -36, '14:00'),
  ('eastshore_reporting', 'contract', 'Eastshore WDB contract: quarterly performance report and invoice', 'Eastshore WDB', 78, 'quarterly', 'upcoming', 'lena',
   'Cost-reimbursement contract for Pathways: invoice with timesheets and the enrollment and placement report within 15 days of quarter-end. Q1 invoice ($105,000) submitted ' || pg_temp.s7_md(-12) || '; payment expected around ' || pg_temp.s7_md(30) || '.',
   -12,
   jsonb_build_array(
     jsonb_build_object('id', 'c1', 'text', 'Pull quarter expenses from the general ledger', 'done', false),
     jsonb_build_object('id', 'c2', 'text', 'Timesheets for Pathways staff', 'done', false),
     jsonb_build_object('id', 'c3', 'text', 'Enrollment and placement report', 'done', false),
     jsonb_build_object('id', 'c4', 'text', 'Submit through the WDB portal', 'done', false)),
   'We are paid only after we invoice; a late quarter delays $105,000 of Pathways cash.',
   -120, -12, '15:30'),
  ('harassment_training', 'policy', 'California harassment-prevention training (every two years)', 'CA', 196, 'biennial', 'upcoming', 'tasha',
   'All staff complete the state-required training every two years; supervisors take the two-hour version. New hires complete it within six months of starting.',
   -534, '[]'::jsonb, null, -1100, -534, '15:30'),
  ('eastshore_onboarding', 'contract', 'Eastshore WDB contract onboarding (W-9, insurance certificates, policy attestations)', 'Eastshore WDB', -100, 'none', 'filed', 'lena',
   'One-time contract onboarding: W-9, certificates naming the board as additional insured, and signed policy attestations.',
   -101, '[]'::jsonb, null, -130, -101, '15:30'),
  ('gala_permit', 'custom', 'Special event permit: Northbridge Rising Gala', 'Oakland', -180, 'none', 'waived', 'tasha',
   'Not needed: the venue held the assembly permit and served alcohol under its own license.',
   null, '[]'::jsonb, null, -230, -181, '15:30')
) as c(k, kind, title, jur, due, recur, status, who, notes, last, checklist, why, created, upd, upd_t)
on conflict do nothing;

-- Filing history: the permanent record the rolling calendar would otherwise erase.
insert into public.compliance_filings
  (id, org_id, item_id, filed_date, period_due_date, filed_by, confirmation, fee, notes, created_at, updated_at)
select pg_temp.nb_id('compfile:' || f.k), pg_temp.nb_org(), pg_temp.nb_id('comp:' || f.item), pg_temp.d(f.filed), pg_temp.d(f.period),
       f.who, f.conf, f.fee, f.notes, pg_temp.ts(f.filed, '15:30'), pg_temp.ts(f.filed, '15:30')
from (values
  ('form990_1', 'form990', -160, -157, 'kwame', 'IRS e-file accepted', null::numeric, 'Filed on extension after the audit; the board received a copy first.'),
  ('form990_2', 'form990', -525, -522, 'kwame', 'IRS e-file accepted', null, null),
  ('form8868_1', 'form8868', -11, 27, 'kwame', 'IRS e-file acknowledgment received', null, 'Automatic six-month extension granted.'),
  ('rrf1_1', 'rrf1', -150, -157, 'kwame', 'Online renewal confirmation', 200, 'Filed with the audited financial statements.'),
  ('rrf1_2', 'rrf1', -515, -522, 'kwame', 'Online renewal confirmation', 200, null),
  ('soi_1', 'soi', -736, -730, 'kwame', 'bizfile confirmation', 20, null),
  ('audit_1', 'audit', -313, -310, 'tasha', 'Audit report issued', null, 'Unmodified opinion; no material weaknesses. One management-letter comment on grant receivable aging, since resolved.'),
  ('audit_2', 'audit', -680, -675, 'tasha', 'Audit report issued', null, 'Unmodified opinion.'),
  ('oakland_1', 'oakland_btax', -235, -232, 'kwame', 'Exemption certificate renewed', null, null),
  ('oakland_2', 'oakland_btax', -600, -597, 'kwame', 'Exemption certificate renewed', null, null),
  ('ins_gl_1', 'ins_gl', -352, -352, 'tasha', 'Policy bound', null, 'Renewed with the same carrier; premium about $18,500. Certificates sent to all three school sites.'),
  ('ins_do_1', 'ins_do', -292, -292, 'tasha', 'Policy bound', null, '$2M D&O limit with EPL; premium about $6,900.'),
  ('ins_wc_1', 'ins_wc', -110, -110, 'tasha', 'Policy bound', null, 'Prior-year payroll audit closed with a $1,240 refund.'),
  ('safeguarding_policy_1', 'safeguarding_policy', -341, -341, 'tasha', 'Adopted by the board', null, 'Annual review; no changes that year.'),
  ('safeguarding_training_1', 'safeguarding_training', -292, -292, 'tasha', null, null, 'All 22 staff and 51 active mentors certified.'),
  ('livescan_1', 'livescan', -50, -50, 'tasha', null, null, 'All 51 active mentors cleared; 3 pending clearances held from matching until results came back.'),
  ('livescan_2', 'livescan', -141, -141, 'tasha', null, null, 'All active mentors cleared.'),
  ('livescan_3', 'livescan', -232, -232, 'tasha', null, null, 'Two clearances renewed after a name change.'),
  ('i9_1', 'i9', -105, -103, 'tasha', null, null, 'Audited 85 Summer Works I-9s and 36 fellows; two Section 2 corrections made the same week.'),
  ('payroll_941_1', 'payroll_941', -80, -80, 'kwame', 'Filed by payroll provider', null, 'Deposits reconciled to the general ledger.'),
  ('payroll_941_2', 'payroll_941', -172, -172, 'kwame', 'Filed by payroll provider', null, null),
  ('payroll_941_3', 'payroll_941', -263, -261, 'kwame', 'Filed by payroll provider', null, 'Includes the annual W-2 and DE 9 reconciliation.'),
  ('payroll_941_4', 'payroll_941', -353, -353, 'kwame', 'Filed by payroll provider', null, null),
  ('form1099_1', 'form1099', -262, -261, 'kwame', 'IRS FIRE submission accepted', null, 'Fourteen 1099-NECs.'),
  ('coi_annual_1', 'coi_annual', -336, -341, 'tasha', null, null, 'All eight directors signed.'),
  ('eastshore_reporting_1', 'eastshore_reporting', -12, -12, 'lena', 'Invoice NB-EWDB-Q1 · $105,000', null, 'Q1 report: 34 fellows enrolled, 31 active, 6 credentials earned. Submitted with timesheets.'),
  ('harassment_training_1', 'harassment_training', -534, -534, 'tasha', null, null, 'All staff complete; supervisors took the two-hour course.'),
  ('eastshore_onboarding_1', 'eastshore_onboarding', -101, -100, 'lena', 'Contract packet accepted by the WDB', null, null)
) as f(k, item, filed, period, who, conf, fee, notes)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- DOCUMENTS (metadata only; files are not uploaded to storage)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.documents
  (id, org_id, storage_path, filename, mime, size_bytes, title, doc_type, status, visibility, version, supersedes_id,
   expires_at, issued_at, uploaded_by, notes, created_at, updated_at)
select pg_temp.nb_id('doc:' || x.k), pg_temp.nb_org(),
       pg_temp.nb_org()::text || '/' || pg_temp.nb_id('doc:' || x.k)::text || '/' || x.fname,
       x.fname,
       case split_part(x.fname, '.', 2)
         when 'pdf' then 'application/pdf'
         when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
         when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
         when 'pptx' then 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
         else 'application/octet-stream' end,
       x.size, x.title, x.dtype, x.status, x.vis, x.ver,
       case when x.supersedes is null then null else pg_temp.nb_id('doc:' || x.supersedes) end,
       case when x.exp is null then null else pg_temp.d(x.exp) end,
       case when x.issued is null then null else pg_temp.d(x.issued) end,
       pg_temp.nb_user(x.who), x.notes, pg_temp.ts(x.created, x.ct), pg_temp.ts(x.upd, x.ct)
from (values
  -- governing documents and policies
  ('bylaws', 'Northbridge_Bylaws_Amended_and_Restated.pdf', 412000, 'Bylaws (amended and restated)', 'corporate', 'active', 'org', 3, null::text, null::int, -774, 'tasha',
   'Amended to add the youth board seat (two-year terms) and to allow board action by written consent.', -770, -770, '10:20'),
  ('articles', 'Articles_of_Incorporation.pdf', 236000, 'Articles of Incorporation', 'corporate', 'active', 'org', 1, null, null, null, 'tasha',
   'Filed with the California Secretary of State at founding (2011), with the 2016 name amendment.', -760, -760, '10:25'),
  ('irs_determination', 'IRS_Determination_Letter_501c3.pdf', 188000, 'IRS determination letter (501(c)(3))', 'corporate', 'active', 'org', 1, null, null, null, 'tasha',
   'Public charity under 509(a)(1) and 170(b)(1)(A)(vi).', -760, -760, '10:30'),
  ('coi_policy', 'Conflict_of_Interest_Policy.pdf', 164000, 'Conflict of Interest Policy', 'policy', 'active', 'org', 2, null, null, -409, 'tasha',
   'Annual disclosure form is attached as Appendix A.', -405, -405, '11:00'),
  ('reserve_policy', 'Operating_Reserve_Policy.pdf', 142000, 'Operating Reserve Policy', 'policy', 'active', 'org', 1, null, null, -135, 'kwame',
   'Six-month reserve target; the Opportunity Reserve is board-designated and released only by board vote.', -133, -133, '09:40'),
  ('safeguarding_policy', 'Child_Safeguarding_Policy.pdf', 520000, 'Child Safeguarding Policy (current)', 'policy', 'active', 'org', 4, null, null, -341, 'tasha',
   'In force until the board adopts the revision on the next consent agenda.', -339, -339, '14:10'),
  ('handbook_prev', 'Employee_Handbook_prior_edition.pdf', 1430000, 'Employee Handbook (prior edition)', 'policy', 'superseded', 'org', 3, null, null, -475, 'tasha',
   null, -470, -108, '10:00'),
  ('handbook', 'Employee_Handbook_' || extract(year from pg_temp.d(-110))::int || '.pdf', 1520000, 'Employee Handbook, ' || extract(year from pg_temp.d(-110))::int || ' edition', 'policy', 'active', 'org', 4, 'handbook_prev', null, -110, 'tasha',
   'Adds the hybrid-work section, the new PTO accrual, and the youth-worker supervision standards.', -108, -108, '10:05'),
  ('strategic_plan', 'Northbridge_Strategic_Plan.pdf', 3880000, 'Strategic Plan ' || pg_temp.s7_fyl(-2) || '–' || pg_temp.s7_fyl(1), 'report', 'active', 'org', 1, null, null, -500, 'remi',
   'Three goals: deepen outcomes, grow to a fourth site, and build a six-month reserve. The retreat reviews it at the midpoint.', -498, -498, '16:00'),
  ('strategic_plan_prev', 'Northbridge_Strategic_Plan_prior.pdf', 2950000, 'Strategic Plan (prior cycle)', 'report', 'archived', 'org', 1, null, null, -1600, 'remi',
   'Kept for reference; replaced by the current plan.', -1590, -498, '16:00'),
  -- finance and audit
  ('audit_fy_prev', 'Audited_Financial_Statements_' || pg_temp.s7_fyl(-2) || '.pdf', 2140000, pg_temp.s7_fyl(-2) || ' audited financial statements', 'financial', 'active', 'org', 1, null, null, -313, 'kwame',
   'Most recent issued audit: unmodified opinion. The ' || pg_temp.s7_fyl(-1) || ' audit is in fieldwork now.', -310, -310, '11:30'),
  ('audit_engagement', 'Linden_Rook_Engagement_Letter.pdf', 318000, pg_temp.s7_fyl(-1) || ' audit engagement letter (Linden & Rook LLP)', 'financial', 'active', 'org', 1, null, null, -40, 'kwame',
   'Fee not to exceed $38,500, as approved by the board. Fieldwork this month; draft report to Finance & Audit by ' || pg_temp.s7_md(52) || '.', -39, -39, '13:15'),
  ('pbc_list', 'Audit_PBC_List.xlsx', 96000, pg_temp.s7_fyl(-1) || ' audit PBC list (tracker)', 'financial', 'active', 'org', 1, null, null, null, 'kwame',
   'Six of ten items delivered. Restricted net asset roll-forward and functional allocation are next.', -18, -1, '16:20'),
  ('budget_fy', 'Operating_Budget_' || pg_temp.s7_fyl(0) || '.xlsx', 284000, pg_temp.s7_fyl(0) || ' operating budget (board-adopted)', 'financial', 'active', 'org', 2, null, null, -44, 'kwame',
   '$3.55M revenue, $3.40M expense, $150K planned contribution to the Opportunity Reserve.', -43, -43, '10:00'),
  ('q1_financials', 'Q1_Financial_Statements_DRAFT.pdf', 612000, pg_temp.s7_fyl(0) || ' Q1 financial statements (draft)', 'agenda:5', 'active', 'org', 1, null, null, null, 'kwame',
   'Includes the restricted vs. unrestricted cash roll-forward Grace asked for.', -4, -4, '17:45'),
  -- board meetings
  ('board_packet_next', 'Board_Packet_' || replace(pg_temp.s7_fq(pg_temp.d(24)), ' ', '_') || '_working_draft.pdf', 2460000, pg_temp.s7_fq(pg_temp.d(24)) || ' board packet (working draft)', 'board_packet', 'active', 'org', 1, null, null, null, 'tasha',
   'Draft v1: ED report and Q1 financials are in; the audit update and the San Leandro brief come next. Final packet due ' || pg_temp.s7_md(17) || '.', 0, 0, '07:40'),
  ('board_packet_prev', 'Board_Packet_' || replace(pg_temp.s7_fq(pg_temp.d(-44)), ' ', '_') || '.pdf', 3120000, pg_temp.s7_fq(pg_temp.d(-44)) || ' board packet and annual meeting materials', 'board_packet', 'active', 'org', 1, null, null, -51, 'tasha',
   null, -51, -51, '16:00'),
  ('minutes_prev', 'Minutes_' || replace(pg_temp.s7_fq(pg_temp.d(-44)), ' ', '_') || '_signed.pdf', 228000, 'Minutes: ' || pg_temp.s7_fq(pg_temp.d(-44)) || ' board meeting and annual meeting (approved)', 'minutes', 'active', 'org', 1, null, null, -31, 'tasha',
   'Approved by email vote of the directors; signed by Victor Ramos, Secretary.', -30, -30, '09:10'),
  ('minutes_prev2', 'Minutes_' || replace(pg_temp.s7_fq(pg_temp.d(-135)), ' ', '_') || '_signed.pdf', 204000, 'Minutes: ' || pg_temp.s7_fq(pg_temp.d(-135)) || ' board meeting (approved)', 'minutes', 'active', 'org', 1, null, null, -44, 'tasha',
   'Approved at the annual meeting.', -40, -40, '10:10'),
  ('safeguarding_redline', 'Child_Safeguarding_Policy_REDLINE.pdf', 548000, 'Child Safeguarding Policy: proposed revision (redline)', 'agenda:2', 'active', 'org', 5, null, null, null, 'tasha',
   'Changes: two-adult rule for virtual mentoring, mandated-reporter steps, Summer Works transport.', -3, -3, '17:10'),
  ('retreat_agenda', 'Board_Retreat_Draft_Agenda.docx', 88000, 'Board retreat: draft agenda and pre-read outline', 'board_packet', 'active', 'org', 1, null, null, null, 'remi',
   'Draft for Celeste''s review. Fellows panel moderated by Theo.', -6, -6, '15:20'),
  ('patel_agreement', 'Board_Member_Agreement_Patel.pdf', 132000, 'Board member agreement: Ravi Patel', 'other', 'active', 'org', 1, null, null, -95, 'remi',
   'Signed at orientation. Commitments: attendance, a personally meaningful gift, one committee.', -94, -94, '12:00'),
  -- compliance and insurance
  ('form990_prev', 'Form_990_' || pg_temp.s7_fyl(-2) || '_public.pdf', 1840000, 'Form 990 for ' || pg_temp.s7_fyl(-2) || ' (as filed, public copy)', 'compliance', 'active', 'org', 1, null, null, -160, 'kwame',
   'Public inspection copy (Schedule B donor names removed).', -159, -159, '10:00'),
  ('rrf1_prev', 'CA_RRF1_' || pg_temp.s7_fyl(-2) || '.pdf', 268000, 'CA RRF-1 for ' || pg_temp.s7_fyl(-2) || ' (as filed)', 'compliance', 'active', 'org', 1, null, null, -150, 'kwame',
   null, -150, -150, '11:00'),
  ('soi_prev', 'CA_Statement_of_Information_last_filed.pdf', 98000, 'CA Statement of Information (last filed)', 'compliance', 'active', 'org', 1, null, null, -736, 'kwame',
   'Shows the prior officer slate. The new filing is drafted.', -735, -735, '11:00'),
  ('ins_gl', 'COI_General_Liability.pdf', 156000, 'Certificate of insurance: general liability and umbrella', 'insurance', 'active', 'org', 1, null, 13, -352, 'tasha',
   'Renewal quote in hand; new certificate goes to schools and employers once bound.', -350, -350, '09:30'),
  ('ins_do', 'DO_EPL_Declarations.pdf', 342000, 'D&O and EPL policy declarations', 'insurance', 'active', 'org', 1, null, 73, -292, 'tasha',
   '$2M limit.', -290, -290, '09:30'),
  ('ins_wc', 'Workers_Comp_Certificate.pdf', 121000, 'Workers'' compensation certificate', 'insurance', 'active', 'org', 1, null, 255, -110, 'tasha',
   null, -108, -108, '09:30'),
  ('livescan_log', 'LiveScan_Clearance_Log.xlsx', 74000, 'Live Scan clearance log: mentors and volunteers', 'compliance', 'active', 'restricted', 1, null, null, null, 'tasha',
   'Restricted: contains background-check status. Updated with every new mentor.', -260, -5, '11:15'),
  ('i9_audit', 'I9_Audit_Summer_Works.pdf', 188000, 'I-9 audit summary: Summer Works and fellows', 'compliance', 'active', 'restricted', 1, null, null, -105, 'tasha',
   'Restricted HR record.', -104, -104, '14:00'),
  -- grants, contracts, agreements
  ('bayview_award', 'Bayview_Award_Letter_GOS.pdf', 286000, 'Bayview Community Foundation award letter: three-year general operating', 'award_letter', 'active', 'org', 1, null, null, -425, 'lena',
   '$750,000 over three years, $250,000 a year. Annual report due each fall.', -423, -423, '10:40'),
  ('hollis_agreement', 'Hollis_Grant_Agreement_Pathways.pdf', 342000, 'Hollis Family Foundation grant agreement (Pathways)', 'award_letter', 'active', 'org', 1, null, null, -110, 'lena',
   '$150,000 restricted to Pathways in two installments; the second is released on the interim report.', -108, -108, '10:40'),
  ('hollis_interim_draft', 'Hollis_Interim_Report_v2.docx', 118000, 'Hollis interim report (draft v2)', 'grant_narrative', 'active', 'org', 2, null, null, null, 'lena',
   'Narrative done; outcomes table waiting on Ben''s Cohort 7 numbers. Due ' || pg_temp.s7_md(12) || '.', -9, -1, '21:10'),
  ('workforce_contract', 'Eastshore_WDB_Contract_Pathways.pdf', 1260000, 'Eastshore WDB cost-reimbursement contract (Pathways)', 'award_letter', 'active', 'org', 1, null, null, -115, 'lena',
   '$420,000 this fiscal year, invoiced quarterly with timesheets and performance reports.', -113, -113, '10:45'),
  ('meridian_proposal', 'Meridian_Full_Proposal_San_Leandro.pdf', 1980000, 'Meridian Foundation full proposal: San Leandro expansion', 'grant_narrative', 'active', 'org', 1, null, null, -21, 'lena',
   '$300,000 over two years for a fourth Launchpad site. Decision expected in about five weeks.', -21, -21, '15:55'),
  ('harbor_award', 'Harbor_Health_Community_Benefit_Award.pdf', 204000, 'Harbor Health Partners community-benefit grant letter', 'award_letter', 'active', 'org', 1, null, null, -48, 'lena',
   '$40,000 for the Pathways healthcare track; paid.', -47, -47, '10:50'),
  ('eastbay_final_report', 'East_Bay_Workforce_Final_Report.pdf', 912000, 'East Bay Workforce Fund final report (Summer Works stipends)', 'report', 'active', 'org', 1, null, null, -20, 'lena',
   'Submitted on time. Renewal conversation opens in the winter cycle.', -20, -20, '16:30'),
  ('mou_eastlake', 'Eastlake_HS_Site_MOU.pdf', 176000, 'Eastlake High School site MOU (this school year)', 'mou', 'active', 'org', 1, null, null, (pg_temp.sy_start() - pg_temp.nb_anchor()) - 30, 'miguel',
   'Classroom 204, Monday through Thursday. Data-sharing agreement attached.', (pg_temp.sy_start() - pg_temp.nb_anchor()) - 28, (pg_temp.sy_start() - pg_temp.nb_anchor()) - 28, '10:00'),
  ('mou_sanleandro', 'San_Leandro_Unified_MOU_DRAFT.docx', 64000, 'San Leandro Unified MOU (draft for signature)', 'mou', 'active', 'org', 3, null, null, null, 'miguel',
   'Draft v3 with the district''s edits. Signing is contingent on the board''s conditional go.', -8, -8, '14:30'),
  ('pacific_summit_agreement', 'Pacific_Summit_Sponsorship_Agreement.pdf', 198000, 'Summer Works presenting sponsorship agreement: Pacific Summit Bank', 'mou', 'active', 'org', 1, null, null, -160, 'priya',
   '$50,000 presenting sponsorship plus 8 intern placements.', -158, -158, '11:20'),
  ('chen_pledge', 'Chen_Family_Pledge_Letter.pdf', 92000, 'Chen family pledge letter ($150,000 over three years)', 'award_letter', 'active', 'restricted', 1, null, null, -400, 'priya',
   'Restricted: donor correspondence. $50,000 a year; this year''s installment is due in about six weeks.', -398, -398, '11:30'),
  ('goldberg_daf_letter', 'Bay_Legacy_Grant_Letter_Goldberg.pdf', 84000, 'Bay Legacy Giving Fund grant letter (Goldberg recommendation)', 'receipt', 'active', 'org', 1, null, null, -9, 'jordan',
   '$20,000 recommended by Aaron Goldberg. Thank-you to Aaron still outstanding.', -8, -8, '10:15')
) as x(k, fname, size, title, dtype, status, vis, ver, supersedes, exp, issued, who, notes, created, upd, ct)
order by (x.supersedes is not null)   -- superseded originals land before their replacements
on conflict do nothing;

insert into public.document_links (id, org_id, document_id, entity_type, entity_id, created_by, created_at)
select pg_temp.nb_id('doclink:' || l.doc || ':' || l.et || ':' || l.ek), pg_temp.nb_org(), pg_temp.nb_id('doc:' || l.doc),
       l.et, pg_temp.nb_id(l.ek), d.uploaded_by, d.created_at
from (values
  ('bylaws', 'board_meeting', 'boardmtg:retreat'),
  ('coi_policy', 'compliance_item', 'comp:coi_annual'),
  ('reserve_policy', 'board_meeting', 'boardmtg:prev2'),
  ('safeguarding_policy', 'compliance_item', 'comp:safeguarding_policy'),
  ('safeguarding_policy', 'compliance_item', 'comp:safeguarding_training'),
  ('handbook', 'compliance_item', 'comp:harassment_training'),
  ('strategic_plan', 'board_meeting', 'boardmtg:retreat'),
  ('strategic_plan', 'ops_project', 'proj:retreat'),
  ('audit_fy_prev', 'compliance_item', 'comp:audit'),
  ('audit_fy_prev', 'compliance_item', 'comp:rrf1'),
  ('audit_engagement', 'compliance_item', 'comp:audit'),
  ('audit_engagement', 'board_meeting', 'boardmtg:prev'),
  ('audit_engagement', 'ops_project', 'proj:audit'),
  ('pbc_list', 'compliance_item', 'comp:audit'),
  ('pbc_list', 'ops_project', 'proj:audit'),
  ('pbc_list', 'ops_task', 'task:audit_pbc'),
  ('budget_fy', 'board_meeting', 'boardmtg:prev'),
  ('q1_financials', 'board_meeting', 'boardmtg:next'),
  ('board_packet_next', 'board_meeting', 'boardmtg:next'),
  ('board_packet_next', 'ops_task', 'task:board_packet'),
  ('board_packet_prev', 'board_meeting', 'boardmtg:prev'),
  ('minutes_prev', 'board_meeting', 'boardmtg:prev'),
  ('minutes_prev2', 'board_meeting', 'boardmtg:prev2'),
  ('safeguarding_redline', 'board_meeting', 'boardmtg:next'),
  ('safeguarding_redline', 'compliance_item', 'comp:safeguarding_policy'),
  ('retreat_agenda', 'board_meeting', 'boardmtg:retreat'),
  ('retreat_agenda', 'ops_project', 'proj:retreat'),
  ('patel_agreement', 'board_member', 'bm:patel'),
  ('form990_prev', 'compliance_item', 'comp:form990'),
  ('rrf1_prev', 'compliance_item', 'comp:rrf1'),
  ('soi_prev', 'compliance_item', 'comp:soi'),
  ('ins_gl', 'compliance_item', 'comp:ins_gl'),
  ('ins_do', 'compliance_item', 'comp:ins_do'),
  ('ins_wc', 'compliance_item', 'comp:ins_wc'),
  ('livescan_log', 'compliance_item', 'comp:livescan'),
  ('livescan_log', 'program', 'prog:mentors'),
  ('i9_audit', 'compliance_item', 'comp:i9'),
  ('i9_audit', 'program', 'prog:summerworks'),
  ('bayview_award', 'grant', 'grant:bayview_gos'),
  ('bayview_award', 'constituent', 'con:bayview'),
  ('hollis_agreement', 'grant', 'grant:hollis_pathways'),
  ('hollis_agreement', 'constituent', 'con:hollis'),
  ('hollis_interim_draft', 'grant', 'grant:hollis_pathways'),
  ('hollis_interim_draft', 'ops_task', 'task:hollis_report'),
  ('workforce_contract', 'grant', 'grant:workforce_contract'),
  ('workforce_contract', 'constituent', 'con:eastshore_wdb'),
  ('workforce_contract', 'compliance_item', 'comp:eastshore_reporting'),
  ('meridian_proposal', 'opportunity', 'opp:meridian'),
  ('meridian_proposal', 'constituent', 'con:meridian'),
  ('meridian_proposal', 'board_meeting', 'boardmtg:next'),
  ('meridian_proposal', 'ops_project', 'proj:meridian'),
  ('harbor_award', 'grant', 'grant:harbor_health'),
  ('harbor_award', 'constituent', 'con:harbor'),
  ('eastbay_final_report', 'grant', 'grant:eastbay_workforce'),
  ('eastbay_final_report', 'opportunity', 'opp:eastbay_renewal'),
  ('mou_eastlake', 'partner', 'partner:eastlake'),
  ('mou_eastlake', 'cohort', 'cohort:lp_eastlake'),
  ('mou_sanleandro', 'partner', 'partner:sanleandro'),
  ('mou_sanleandro', 'board_meeting', 'boardmtg:next'),
  ('mou_sanleandro', 'ops_project', 'proj:sanleandro'),
  ('pacific_summit_agreement', 'constituent', 'con:pacific_summit'),
  ('pacific_summit_agreement', 'partner', 'partner:pacific_summit'),
  ('pacific_summit_agreement', 'gift', 'gift:pacific_summit'),
  ('chen_pledge', 'pledge', 'pledge:chen'),
  ('chen_pledge', 'constituent', 'con:chen_margaret'),
  ('goldberg_daf_letter', 'gift', 'gift:goldberg_daf'),
  ('goldberg_daf_letter', 'constituent', 'con:goldberg'),
  ('goldberg_daf_letter', 'constituent', 'con:legacy_daf')
) as l(doc, et, ek)
join public.documents d on d.id = pg_temp.nb_id('doc:' || l.doc)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- TEAM: review competencies, cycles, 360 feedback, notes, summaries
-- ════════════════════════════════════════════════════════════════════════════
insert into public.review_competencies (id, org_id, name, description, sort_order, active, created_at, updated_at)
select pg_temp.nb_id('revcomp:' || c.k), pg_temp.nb_org(), c.name, c.descr, c.o, true, pg_temp.ts(-150, '10:00'), pg_temp.ts(-150, '10:00')
from (values
  ('youth', 'Youth-centered judgment', 'Keeps young people''s interests, safety and voice at the center of decisions.', 1),
  ('ownership', 'Ownership and follow-through', 'Does what they said, on time, and raises problems early.', 2),
  ('collaboration', 'Collaboration', 'Makes teammates and partners more effective; shares credit and context.', 3),
  ('communication', 'Clear communication', 'Writes and speaks plainly; the right people know what they need to know.', 4),
  ('craft', 'Craft and quality', 'Work product is accurate, thoughtful and ready to use.', 5),
  ('growth', 'Learning and growth', 'Seeks feedback, adapts, and helps others grow.', 6)
) as c(k, name, descr, o)
on conflict do nothing;

insert into public.review_cycles
  (id, org_id, name, status, anonymity_mode, min_raters_for_anonymity, rating_scale_max, opens_on, closes_on, created_by, created_at, updated_at)
values
  (pg_temp.nb_id('revcycle:midyear'), pg_temp.nb_org(), pg_temp.s7_fyl(0) || ' mid-year 360', 'collecting', 'confidential', 3, 5,
   pg_temp.d(-12), pg_temp.d(16), pg_temp.nb_user('tasha'), pg_temp.ts(-14, '10:30'), pg_temp.ts(-12, '09:00')),
  (pg_temp.nb_id('revcycle:annual_prev'), pg_temp.nb_org(), pg_temp.s7_fyl(-1) || ' year-end review (self + manager)', 'closed', 'transparent', 3, 5,
   pg_temp.d(-140), pg_temp.d(-112), pg_temp.nb_user('tasha'), pg_temp.ts(-145, '10:30'), pg_temp.ts(-98, '17:00'))
on conflict do nothing;

-- Mid-year 360: the full assignment set the app's generator produces from the
-- chart (self, manager, upward, peers): 47 forms, 27 submitted so far.
insert into public.review_feedback
  (id, org_id, cycle_id, subject_staff_id, rater_staff_id, relationship, status, ratings, strengths, growth, comments,
   submitted_at, created_at, updated_at)
select pg_temp.nb_id('revfb:midyear:' || f.subj || ':' || f.rater), pg_temp.nb_org(), pg_temp.nb_id('revcycle:midyear'),
       pg_temp.nb_id('staff:' || f.subj), pg_temp.nb_id('staff:' || f.rater), f.rel, f.status,
       case when f.status = 'submitted' then
         (select jsonb_object_agg(pg_temp.nb_id('revcomp:' || ck)::text,
                   least(5, 3 + floor(pg_temp.rnd('revfb:midyear:' || f.subj || ':' || f.rater || ':' || ck) * 2.6)::int
                            + case when f.rel = 'self' and ck = 'growth' then 1 else 0 end))
          from unnest(array['youth','ownership','collaboration','communication','craft','growth']) ck)
       else '{}'::jsonb end,
       f.s, f.g, f.c,
       case when f.sd is null then null else pg_temp.ts(f.sd, f.st) end,
       pg_temp.ts(-12, '09:00'),
       case when f.sd is null then pg_temp.ts(-12, '09:00') else pg_temp.ts(f.sd, f.st) end
from (values
  -- self
  ('remi', 'remi', 'self', 'pending', null::text, null::text, null::text, null::int, null::text),
  ('tasha', 'tasha', 'self', 'submitted', 'Got the audit firm selected and the PBC list moving two weeks earlier than last year, and kept this review cycle on schedule.', 'I hold too much of compliance myself. I want Kwame owning the calendar end to end by fiscal year-end, with me as backup.', null, -9, '18:40'),
  ('miguel', 'miguel', 'self', 'pending', null, null, null, null, null),
  ('priya', 'priya', 'self', 'submitted', 'The pipeline is the healthiest it has been: Meridian submitted, Jennifer Wu ready for an ask, the Pacific Summit renewal on track.', 'Monthly giving is flat at 47 donors. I have not given it the attention the plan assumed.', 'I would like a standing quarterly pipeline review with Remi instead of ad hoc check-ins.', -7, '20:15'),
  ('kwame', 'kwame', 'self', 'submitted', 'Closed every month this fiscal year inside ten business days and built the budget model the board adopted.', 'I let the audit crowd out the Statement of Information; it is down to the wire and gets filed this week.', null, -5, '17:30'),
  ('ben', 'ben', 'self', 'submitted', 'Shipped the 90-day placement study for Cohort 6 and the outcomes dashboard the board asked for.', 'Intake completeness is at 88 percent. Program managers need to see the gaps weekly, not when I chase them.', null, -8, '16:05'),
  ('rosa', 'rosa', 'self', 'submitted', 'Eastlake and Bayshore are above 88 percent attendance, and family check-ins are now a weekly habit for flagged students.', 'Laurel Ridge dipped after the bell-schedule change and I was slow to escalate. David''s case taught me to call home sooner.', null, -6, '19:50'),
  ('andre', 'andre', 'self', 'submitted', 'Cohort 7 launched full, with 33 of 36 fellows active and 9 of 10 passing the first A+ exam.', 'Cohort 8 interviews are behind where I wanted. I need to block recruiting time instead of fitting it around coaching.', null, -4, '21:10'),
  ('simone', 'simone', 'self', 'pending', null, null, null, null, null),
  ('lena', 'lena', 'self', 'submitted', 'Every report this fiscal year has gone in on time, and the Meridian proposal is the strongest narrative we have written.', 'I want to start drafts earlier. The Hollis interim is in good shape but closer to the deadline than I like.', null, -10, '15:45'),
  ('jordan', 'jordan', 'self', 'pending', null, null, null, null, null),
  -- manager (downward)
  ('tasha', 'remi', 'manager', 'submitted', 'Tasha is the reason the board trusts our numbers. The audit transition, the safeguarding rewrite and this review cycle all moved because she moved them.', 'Delegate the compliance calendar. You should be reviewing it, not running it.', 'Let''s talk about succession for the audit lead role before spring.', -3, '21:30'),
  ('miguel', 'remi', 'manager', 'pending', null, null, null, null, null),
  ('priya', 'remi', 'manager', 'pending', null, null, null, null, null),
  ('kwame', 'tasha', 'manager', 'submitted', 'Monthly close is fast and clean, and the budget model held up to Grace''s questions line by line.', 'Treat the compliance calendar like the close: a standing weekly hour. The Statement of Information miss was avoidable.', null, -4, '18:00'),
  ('ben', 'tasha', 'manager', 'submitted', 'Ben turned the placement data into something funders quote back to us. The dashboard is used, not just built.', 'Be more directive with program managers about data quality; you have the standing to set the rule.', null, -4, '18:20'),
  ('rosa', 'miguel', 'manager', 'submitted', 'Rosa knows every student by name and the site partners trust her. Eastlake is our model site because of her.', 'Escalate earlier when a site slips. Laurel Ridge needed a plan a month before it got one.', null, -2, '17:15'),
  ('andre', 'miguel', 'manager', 'pending', null, null, null, null, null),
  ('simone', 'miguel', 'manager', 'pending', null, null, null, null, null),
  ('lena', 'priya', 'manager', 'submitted', 'Lena''s writing gets funded. Meridian is a first-time national funder and the proposal read like we had been partners for years.', 'Share drafts at 60 percent, not 95. More eyes earlier makes the deadlines less tight.', null, -6, '12:40'),
  ('jordan', 'priya', 'manager', 'pending', null, null, null, null, null),
  -- upward (reports rating their manager)
  ('remi', 'tasha', 'report', 'submitted', 'Remi sets direction clearly and backs his team in front of the board. The reserve policy was his push and it was the right one.', 'Decisions sometimes land in the hallway. I would like the big ones written down with owners so the whole team hears the same thing.', null, -8, '19:00'),
  ('remi', 'miguel', 'report', 'pending', null, null, null, null, null),
  ('remi', 'priya', 'report', 'submitted', 'Remi opens doors I cannot, and he makes the donor calls he says he will make.', 'Okafor and Wu are waiting on dates from you. When the ED calendar is full, tell me and I will cover or reschedule.', null, 0, '07:15'),
  ('tasha', 'kwame', 'report', 'submitted', 'Tasha protects my close week and gives clear priorities when the audit and the board both want things at once.', 'I would like more of the auditor relationship handed to me directly.', null, -5, '17:45'),
  ('tasha', 'ben', 'report', 'pending', null, null, null, null, null),
  ('miguel', 'rosa', 'report', 'submitted', 'Miguel listens and then actually changes things; the transit-pass fund came out of a site-visit conversation.', 'Our team meetings run long and drift. A tighter agenda would give me back an hour a week.', null, -6, '20:05'),
  ('miguel', 'andre', 'report', 'submitted', 'He gave me room to rebuild the Pathways employer list my way and backed me when Harbor changed its placement rules.', 'I would value more frequent one-on-ones during recruitment season.', null, -3, '22:00'),
  ('miguel', 'simone', 'report', 'pending', null, null, null, null, null),
  ('priya', 'lena', 'report', 'submitted', 'Priya is generous with credit and clear about what matters this week.', 'Asks sometimes change direction late. A shared grants-calendar review every Monday would help.', null, -10, '16:10'),
  ('priya', 'jordan', 'report', 'pending', null, null, null, null, null),
  -- peers (same manager)
  ('miguel', 'tasha', 'peer', 'submitted', 'Miguel''s program data arrives clean and on time for board packets, which is not true at most organizations.', 'Bring operations into site-expansion planning earlier. San Leandro has HR and insurance pieces.', null, -9, '18:55'),
  ('priya', 'tasha', 'peer', 'pending', null, null, null, null, null),
  ('tasha', 'miguel', 'peer', 'pending', null, null, null, null, null),
  ('priya', 'miguel', 'peer', 'pending', null, null, null, null, null),
  ('tasha', 'priya', 'peer', 'submitted', 'Tasha makes the hard operational calls without drama and explains them well to funders.', 'Development would benefit from seeing the compliance calendar; grant deadlines and filings collide in November.', null, -7, '20:30'),
  ('miguel', 'priya', 'peer', 'submitted', 'Miguel makes the program real for donors. Every site visit he hosts moves a gift forward.', 'We need program stories earlier in the year-end cycle. Could we set a monthly story hand-off?', null, -7, '20:40'),
  ('ben', 'kwame', 'peer', 'submitted', 'Ben answers data questions the same day and documents how he got the number.', 'Let''s agree on one source for participant counts so finance and programs stop reconciling two lists.', null, -5, '17:50'),
  ('kwame', 'ben', 'peer', 'pending', null, null, null, null, null),
  ('andre', 'rosa', 'peer', 'submitted', 'Andre''s employer relationships are the strongest on the team; fellows get real jobs.', 'Share the Pathways recruiting calendar with Launchpad. Our seniors are his best pipeline.', null, -6, '20:10'),
  ('simone', 'rosa', 'peer', 'pending', null, null, null, null, null),
  ('rosa', 'andre', 'peer', 'submitted', 'Rosa''s family-outreach model is something Pathways should copy.', 'I would love her to bring two Launchpad seniors to Cohort 8 info sessions each month.', null, -3, '22:15'),
  ('simone', 'andre', 'peer', 'submitted', 'Simone''s mentor matching is thoughtful; she remembers what each fellow actually wants.', 'Mentor background checks need a faster loop. Four Kinetic Labs mentors are still waiting.', null, -3, '22:25'),
  ('rosa', 'simone', 'peer', 'pending', null, null, null, null, null),
  ('andre', 'simone', 'peer', 'pending', null, null, null, null, null),
  ('jordan', 'lena', 'peer', 'submitted', 'Jordan''s events run smoothly and donors remember them.', 'Thank-you letters slip past 48 hours when events stack up. Let''s build a template bank before Year-End.', null, -1, '19:05'),
  ('lena', 'jordan', 'peer', 'pending', null, null, null, null, null)
) as f(subj, rater, rel, status, s, g, c, sd, st)
on conflict do nothing;

-- Last fiscal year's closed review: self + manager only (the team's first
-- full 360 is the mid-year cycle above).
insert into public.review_feedback
  (id, org_id, cycle_id, subject_staff_id, rater_staff_id, relationship, status, ratings, strengths, growth, comments,
   submitted_at, created_at, updated_at)
select pg_temp.nb_id('revfb:annual_prev:' || f.subj || ':' || f.rater), pg_temp.nb_org(), pg_temp.nb_id('revcycle:annual_prev'),
       pg_temp.nb_id('staff:' || f.subj), pg_temp.nb_id('staff:' || f.rater), f.rel, 'submitted',
       (select jsonb_object_agg(pg_temp.nb_id('revcomp:' || ck)::text,
                 least(5, 3 + floor(pg_temp.rnd('revfb:annual_prev:' || f.subj || ':' || f.rater || ':' || ck) * 2.7)::int))
        from unnest(array['youth','ownership','collaboration','communication','craft','growth']) ck),
       f.s, f.g, null, pg_temp.ts(f.sd, '17:00'), pg_temp.ts(-140, '09:00'), pg_temp.ts(f.sd, '17:00')
from (values
  ('remi', 'remi', 'self', 'Grew revenue 9 percent and kept the team whole through a hard stretch of renewals.', 'Too much fundraising still runs through me personally.', -128),
  ('tasha', 'tasha', 'self', 'The new finance and HR systems are live and payroll errors are down to zero.', 'Hand off more of the board logistics.', -130),
  ('miguel', 'miguel', 'self', 'Pathways Cohort 6 placement reached 84 percent at 90 days.', 'Spend more time developing my managers and less in the weeds.', -126),
  ('priya', 'priya', 'self', 'The gala beat its goal and corporate revenue grew 22 percent.', 'Grow the base of individual donors below $5,000.', -129),
  ('kwame', 'kwame', 'self', 'A clean audit with no adjustments.', 'Learn government cost-reimbursement accounting before the Eastshore contract starts.', -131),
  ('ben', 'ben', 'self', 'Built our first participant outcomes model.', 'Train staff to use the dashboards themselves.', -127),
  ('rosa', 'rosa', 'self', 'All three sites above 85 percent attendance for most of the year.', 'Delegate more to site coordinators.', -125),
  ('andre', 'andre', 'self', 'Twenty-six new employer partners in two years.', 'Write the employer playbook down.', -124),
  ('simone', 'simone', 'self', 'Matched 48 mentors in my first six months.', 'Improve mentor retention past one year.', -123),
  ('lena', 'lena', 'self', 'Submitted 19 proposals; 13 were funded.', 'Start drafting the big asks earlier.', -130),
  ('jordan', 'jordan', 'self', 'Ran gala logistics within two months of starting.', 'Build a real acknowledgments process.', -122),
  ('tasha', 'remi', 'manager', 'Built the operating backbone we needed: finance and HR systems, a clean audit, calm payroll.', 'Let others run board logistics so you can lead HR strategy.', -118),
  ('miguel', 'remi', 'manager', 'Our strongest outcomes year, and staff turnover in programs was zero.', 'Develop the three program managers so expansion does not run through you.', -118),
  ('priya', 'remi', 'manager', 'Gala over goal and a pipeline deeper than we have ever had.', 'Individual and monthly giving grew slower than plan.', -117),
  ('kwame', 'tasha', 'manager', 'Fast, accurate closes and an audit with no adjustments.', 'Ready to take on the auditor relationship and the compliance calendar.', -119),
  ('ben', 'tasha', 'manager', 'The placement study is now cited by funders.', 'Make the dashboards self-serve for program staff.', -119),
  ('rosa', 'miguel', 'manager', 'Rosa''s sites are the reason Launchpad attendance holds.', 'Escalate site issues earlier and delegate to coordinators.', -116),
  ('andre', 'miguel', 'manager', 'His employer network is a real organizational asset.', 'Document it so the relationships belong to Northbridge, not only to Andre.', -116),
  ('simone', 'miguel', 'manager', 'A strong first six months: 48 matches and a smooth Summer Works.', 'Watch summer workload; we add seasonal help next year.', -115),
  ('lena', 'priya', 'manager', 'Thirteen of nineteen proposals funded.', 'Bring drafts to me at the halfway point.', -117),
  ('jordan', 'priya', 'manager', 'Jumped into gala logistics weeks after starting and delivered.', 'Own the acknowledgment process end to end.', -117)
) as f(subj, rater, rel, s, g, sd)
on conflict do nothing;

insert into public.review_summaries (id, org_id, cycle_id, subject_staff_id, summary, author_staff_id, shared_at, created_at, updated_at)
select pg_temp.nb_id('revsum:annual_prev:' || s.subj), pg_temp.nb_org(), pg_temp.nb_id('revcycle:annual_prev'),
       pg_temp.nb_id('staff:' || s.subj), s.summary,
       case when s.author is null then null else pg_temp.nb_id('staff:' || s.author) end,
       pg_temp.ts(s.shared, '16:00'), pg_temp.ts(s.shared - 3, '15:00'), pg_temp.ts(s.shared, '16:00')
from (values
  ('remi', null::text, 'Reviewed by the board''s Executive Committee (Celeste Harrington and Grace Lim). Revenue grew 9 percent, the audit was clean, and Pathways placement reached 84 percent. For the year ahead: build the reserve toward six months and move more major-donor relationships to Priya so fundraising does not depend on one calendar.', -98),
  ('tasha', 'remi', 'An exceptional year building the operating backbone: finance and HR systems live, payroll clean, an audit with no findings. Next year: hand board logistics and compliance tracking to the team so Tasha can lead HR strategy.', -100),
  ('miguel', 'remi', 'Programs had their strongest outcomes year: Cohort 6 placement at 84 percent and Launchpad attendance above target at two of three sites. Growth area: develop the three program managers so expansion does not run through Miguel.', -100),
  ('priya', 'remi', 'The gala beat its goal and corporate revenue grew 22 percent; the pipeline is deep. Focus for the year: individual and monthly giving, which grew slower than plan.', -100),
  ('kwame', 'tasha', 'Fast, clean closes and an audit with no adjustments. Kwame is ready to take on the auditor relationship and the compliance calendar.', -101),
  ('ben', 'tasha', 'Ben built our first outcomes model and the placement study funders now cite. Next: make the dashboards self-serve for program staff.', -101),
  ('rosa', 'miguel', 'Rosa''s sites are why Launchpad attendance holds. Next year: delegate to site coordinators and escalate site issues sooner.', -102),
  ('andre', 'miguel', 'Andre''s employer network is a real asset. The ask for next year is an employer playbook so those relationships belong to the organization.', -102),
  ('simone', 'miguel', 'A strong first six months: 48 mentor matches and a smooth Summer Works. We will add seasonal help so summer is not two jobs at once.', -102),
  ('lena', 'priya', 'Thirteen of nineteen proposals funded. Start the big narratives earlier and share drafts at the halfway point.', -103),
  ('jordan', 'priya', 'Jordan delivered the gala logistics weeks after starting. Next: own the acknowledgment process end to end, including the 48-hour standard.', -103)
) as s(subj, author, summary, shared)
on conflict do nothing;

insert into public.review_manager_notes (id, org_id, cycle_id, subject_staff_id, notes, author_staff_id, created_at, updated_at)
select pg_temp.nb_id('revnote:' || n.cyc || ':' || n.subj), pg_temp.nb_org(), pg_temp.nb_id('revcycle:' || n.cyc),
       pg_temp.nb_id('staff:' || n.subj), n.notes, pg_temp.nb_id('staff:' || n.author), pg_temp.ts(n.d, '18:00'), pg_temp.ts(n.d, '18:00')
from (values
  ('annual_prev', 'priya', 'remi', 'Compensation: approved a 4 percent adjustment at the start of the fiscal year. She asked about a Deputy Director title; revisit at mid-year.', -100),
  ('annual_prev', 'kwame', 'tasha', 'Ready for more. Hand him the auditor relationship this cycle and see how he carries it.', -101),
  ('annual_prev', 'simone', 'miguel', 'Strong first year. Watch summer workload: Summer Works plus Mentor Circles is two jobs in July.', -102),
  ('midyear', 'tasha', 'remi', 'Raise succession for the audit and compliance lead. Ask what she would drop to take on HR strategy, and whether Kwame is ready for the calendar.', -3),
  ('midyear', 'miguel', 'remi', 'Waiting on his self-review. Topics: San Leandro readiness, Laurel Ridge, and how Rosa''s load changes if she supervises a fourth site.', -2),
  ('midyear', 'priya', 'remi', 'Topics: monthly giving plan, the Wu ask timing, and the Deputy Director question from last cycle.', -2),
  ('midyear', 'kwame', 'tasha', 'The Statement of Information miss is a coaching conversation, not a performance issue. His PBC work has been excellent.', -4),
  ('midyear', 'rosa', 'miguel', 'Laurel Ridge plan is solid now. Recognize the family check-in model at the all-staff.', -2)
) as n(cyc, subj, author, notes, d)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- TEAM: goals (approval needs the approving manager's identity) and KPIs
-- ════════════════════════════════════════════════════════════════════════════
create temp table if not exists s7_goals (
  h text, n int, approver text, approval text, title text, description text, metric_type text,
  target numeric, cur numeric, unit text, target_d int, status text, created int, pgoal text
) on commit drop;
truncate s7_goals;

insert into s7_goals values
  -- Remi (ED): approved by the board at the annual meeting; recorded in-app by Tasha
  ('remi', 1, 'tasha', 'approved', 'Close the fiscal year with six months of operating reserves', 'Board reserve target. Cash today covers about 5.5 months.', 'numeric', 6, 5.5, 'months', 254, 'on_track', -60, 'reserves'),
  ('remi', 2, 'tasha', 'approved', 'Secure $500,000 in new multi-year funding', 'Meridian ($300K, decision pending) is the lead; Sequoia and the Wu ask are next.', 'numeric', 500000, 0, 'usd', 254, 'on_track', -60, 'diversify'),
  ('remi', 3, 'tasha', 'approved', 'Bring a San Leandro site plan to the board retreat', 'Conditional go on the next agenda; full plan at the retreat.', 'milestone', null, null, null, 66, 'on_track', -60, 'sanleandro'),
  ('remi', 4, 'tasha', 'approved', 'Personally steward the top 25 donors: two touches each this year', null, 'numeric', 50, 21, 'count', 254, 'at_risk', -60, 'floor'),
  -- Tasha (COO)
  ('tasha', 1, 'remi', 'approved', 'Clean audit with no material findings, report issued on schedule', 'Draft to Finance & Audit by ' || pg_temp.s7_md(52) || '.', 'milestone', null, null, null, 52, 'on_track', -70, null),
  ('tasha', 2, 'remi', 'approved', 'Adopt the revised safeguarding policy and reach 100% staff and mentor training', '17 of 24 staff and 38 of 54 mentors trained so far.', 'numeric', 100, 71, 'pct', 73, 'at_risk', -70, null),
  ('tasha', 3, 'remi', 'approved', 'Run the mid-year 360 for the whole team', 'Cycle open; 27 of 47 forms submitted.', 'milestone', null, null, null, 16, 'on_track', -70, 'team'),
  ('tasha', 4, 'remi', 'approved', 'Move HR files and I-9 records into the HR system', null, 'milestone', null, null, null, -30, 'done', -150, null),
  -- Miguel (Programs)
  ('miguel', 1, 'remi', 'approved', 'Hold 85% average attendance across Launchpad sites', 'Eastlake and Bayshore above 88%; Laurel Ridge at 74%.', 'numeric', 85, 86, 'pct', 254, 'on_track', -70, 'attendance'),
  ('miguel', 2, 'remi', 'approved', 'Place 80% of Pathways Cohort 6 graduates within 90 days', 'Final count: 84%.', 'numeric', 80, 84, 'pct', -20, 'done', -150, 'placement'),
  ('miguel', 3, 'remi', 'approved', 'Enroll a full Pathways Cohort 8 (36 fellows)', 'About 40 applications in; interviews over the next three weeks.', 'numeric', 36, 0, 'count', 110, 'on_track', -70, 'youth_served'),
  ('miguel', 4, 'remi', 'approved', 'Sign a site MOU with San Leandro Unified', 'MOU draft v3 with the district; signing depends on the board''s conditional go.', 'milestone', null, null, null, 75, 'at_risk', -70, 'sanleandro'),
  -- Priya (Development)
  ('priya', 1, 'remi', 'approved', 'Raise $3.55M toward the fiscal-year revenue budget', 'About 68% received or committed so far.', 'numeric', 3550000, 2414000, 'usd', 254, 'on_track', -70, 'floor'),
  ('priya', 2, 'remi', 'approved', 'Grow monthly donors from 45 to 75', 'Flat at 47 since the fiscal year began.', 'numeric', 75, 47, 'count', 254, 'at_risk', -70, 'diversify'),
  ('priya', 3, 'remi', 'approved', 'Move five new $25K+ prospects to an ask by mid-year', 'Wu is ready for an ask; Sequoia intro this week.', 'numeric', 5, 2, 'count', 160, 'on_track', -70, 'diversify'),
  ('priya', 4, 'remi', 'approved', 'Renew Pacific Summit Bank at $60,000', 'Daniel Osei is champion.', 'milestone', null, null, null, 120, 'on_track', -70, 'floor'),
  -- Kwame (Finance & Ops)
  ('kwame', 1, 'tasha', 'approved', 'Close each month within 10 business days', 'Every close this fiscal year on time.', 'numeric', 10, 8, 'days', 254, 'on_track', -70, null),
  ('kwame', 2, 'tasha', 'approved', 'Deliver the audit PBC list on schedule', '6 of 10 items delivered.', 'numeric', 10, 6, 'count', 5, 'at_risk', -40, null),
  ('kwame', 3, 'tasha', 'approved', 'Every compliance filing on time', 'The Statement of Information is due this week and still unfiled.', 'qualitative', null, null, null, 254, 'behind', -70, null),
  ('kwame', 4, 'tasha', 'approved', 'Invoice the Eastshore contract within 15 days of each quarter-end', 'Q1 invoice submitted on day 12.', 'qualitative', null, null, null, 254, 'on_track', -70, null),
  -- Ben (Data)
  ('ben', 1, 'tasha', 'approved', 'Launch the outcomes dashboard for the board and funders', null, 'milestone', null, null, null, 30, 'on_track', -70, null),
  ('ben', 2, 'tasha', 'approved', '95% of participant records with complete intake fields', 'At 88%; Laurel Ridge has the most gaps.', 'numeric', 95, 88, 'pct', 120, 'at_risk', -70, null),
  ('ben', 3, 'tasha', 'approved', 'Publish the Cohort 6 90-day placement study', null, 'milestone', null, null, null, -25, 'done', -150, 'placement'),
  -- Rosa (Launchpad)
  ('rosa', 1, 'miguel', 'approved', 'Bring Laurel Ridge attendance back above 80%', 'At 74% after the bell-schedule change; new 3:45 start agreed with the AP.', 'numeric', 80, 74, 'pct', 60, 'at_risk', -60, 'attendance'),
  ('rosa', 2, 'miguel', 'approved', 'Every senior submits three or more college or job applications by the deadline', '41% there so far.', 'numeric', 100, 41, 'pct', 120, 'on_track', -60, null),
  ('rosa', 3, 'miguel', 'proposed', 'Weekly family check-ins for every student with an attendance flag', 'Proposed at mid-year after the David Tran check-in.', 'qualitative', null, null, null, 254, 'on_track', -6, 'attendance'),
  -- Andre (Pathways)
  ('andre', 1, 'miguel', 'approved', 'Cohort 7 credential pass rate at 85% or higher', 'First A+ exam group: 9 of 10 passed. CNA exams next month.', 'numeric', 85, 90, 'pct', 254, 'on_track', -60, 'placement'),
  ('andre', 2, 'miguel', 'approved', 'Interview all Cohort 8 applicants', 'Interviews over the next three weeks.', 'numeric', 40, 6, 'count', 21, 'on_track', -45, 'youth_served'),
  ('andre', 3, 'miguel', 'approved', 'Add two new healthcare employer partners', 'One signed; one in conversation through Monique Jackson.', 'numeric', 2, 1, 'count', 150, 'on_track', -60, 'placement'),
  -- Simone (Summer Works + Mentor Circles)
  ('simone', 1, 'miguel', 'approved', 'Match 60 mentors in Mentor Circles', null, 'numeric', 60, 52, 'count', 120, 'on_track', -60, 'mentors'),
  ('simone', 2, 'miguel', 'approved', 'Recruit 25 Summer Works employers for next summer', '9 confirmed; Pacific Summit and Harbor returning.', 'numeric', 25, 9, 'count', 200, 'on_track', -60, 'summerworks'),
  ('simone', 3, 'miguel', 'proposed', 'Clear Live Scan for every new mentor within 10 days of applying', 'Four Kinetic Labs mentors waiting longer than that now.', 'qualitative', null, null, null, 120, 'at_risk', -5, null),
  -- Lena (Grants)
  ('lena', 1, 'priya', 'approved', 'Every grant report on time (12 this fiscal year)', '3 of 12 submitted, all on time.', 'numeric', 12, 3, 'count', 254, 'on_track', -70, null),
  ('lena', 2, 'priya', 'approved', 'Submit the Hollis interim report', 'Draft v2; waiting on Cohort 7 numbers from Ben.', 'milestone', null, null, null, 12, 'on_track', -40, null),
  ('lena', 3, 'priya', 'approved', 'Bring three new foundations to full proposal', 'Meridian submitted; Sequoia and Alder & Finch next.', 'numeric', 3, 1, 'count', 200, 'on_track', -70, 'diversify'),
  -- Jordan (Development & Events)
  ('jordan', 1, 'priya', 'approved', 'Year-End appeal in the mail on launch day', 'Letter draft with Priya; list cleanup under way.', 'milestone', null, null, null, 14, 'on_track', -50, 'floor'),
  ('jordan', 2, 'priya', 'approved', 'Thank every gift within 48 hours', 'Eight gifts are waiting on thank-yous, including a $20K DAF gift.', 'numeric', 95, 81, 'pct', 254, 'at_risk', -70, null),
  ('jordan', 3, 'priya', 'proposed', 'Plan a spring donor breakfast with Amara Johnson speaking', null, 'milestone', null, null, null, 180, 'not_started', -3, null),
  ('jordan', 4, 'priya', 'draft', 'Build a template bank for acknowledgment letters', 'Draft idea from Lena''s peer feedback.', 'qualitative', null, null, null, 45, 'not_started', -1, null);

-- Unapproved goals (proposed / draft) need no approver identity.
insert into public.staff_goals
  (id, org_id, staff_id, title, description, metric_type, target_value, current_value, unit, period, target_date,
   status, approval_status, sort_order, created_at, updated_at, linked_plan_goal_id)
select pg_temp.nb_id('goal:' || g.h || ':' || g.n), pg_temp.nb_org(), pg_temp.nb_id('staff:' || g.h), g.title, g.description, g.metric_type,
       g.target, g.cur, g.unit, pg_temp.s7_fyl(0),
       case when g.target_d = 254 then make_date(pg_temp.fy(), 6, 30) else pg_temp.d(g.target_d) end, g.status, g.approval, g.n,
       pg_temp.ts(g.created, '11:00'), pg_temp.ts(greatest(g.created, -3), '11:00'),
       case when g.pgoal is null then null else pg_temp.nb_id('pgoal:' || g.pgoal) end
from s7_goals g where g.approval <> 'approved'
on conflict do nothing;

-- Approved goals, one batch per approving manager. staff_goals_guard_approval
-- checks private.can_view_staff(goal owner) and owner <> auth.uid(), so each
-- batch runs as the person who actually approved it.
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.nb_user('remi'), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.nb_user('remi')::text, true);
end $$;
insert into public.staff_goals
  (id, org_id, staff_id, title, description, metric_type, target_value, current_value, unit, period, target_date,
   status, approval_status, sort_order, created_at, updated_at, linked_plan_goal_id)
select pg_temp.nb_id('goal:' || g.h || ':' || g.n), pg_temp.nb_org(), pg_temp.nb_id('staff:' || g.h), g.title, g.description, g.metric_type,
       g.target, g.cur, g.unit, pg_temp.s7_fyl(0),
       case when g.target_d = 254 then make_date(pg_temp.fy(), 6, 30) else pg_temp.d(g.target_d) end, g.status, g.approval, g.n,
       pg_temp.ts(g.created, '11:00'), pg_temp.ts(greatest(g.created, -14), '11:00'),
       case when g.pgoal is null then null else pg_temp.nb_id('pgoal:' || g.pgoal) end
from s7_goals g where g.approval = 'approved' and g.approver = 'remi'
on conflict do nothing;

do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.nb_user('tasha'), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.nb_user('tasha')::text, true);
end $$;
insert into public.staff_goals
  (id, org_id, staff_id, title, description, metric_type, target_value, current_value, unit, period, target_date,
   status, approval_status, sort_order, created_at, updated_at, linked_plan_goal_id)
select pg_temp.nb_id('goal:' || g.h || ':' || g.n), pg_temp.nb_org(), pg_temp.nb_id('staff:' || g.h), g.title, g.description, g.metric_type,
       g.target, g.cur, g.unit, pg_temp.s7_fyl(0),
       case when g.target_d = 254 then make_date(pg_temp.fy(), 6, 30) else pg_temp.d(g.target_d) end, g.status, g.approval, g.n,
       pg_temp.ts(g.created, '11:00'), pg_temp.ts(greatest(g.created, -14), '11:00'),
       case when g.pgoal is null then null else pg_temp.nb_id('pgoal:' || g.pgoal) end
from s7_goals g where g.approval = 'approved' and g.approver = 'tasha'
on conflict do nothing;

do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.nb_user('miguel'), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.nb_user('miguel')::text, true);
end $$;
insert into public.staff_goals
  (id, org_id, staff_id, title, description, metric_type, target_value, current_value, unit, period, target_date,
   status, approval_status, sort_order, created_at, updated_at, linked_plan_goal_id)
select pg_temp.nb_id('goal:' || g.h || ':' || g.n), pg_temp.nb_org(), pg_temp.nb_id('staff:' || g.h), g.title, g.description, g.metric_type,
       g.target, g.cur, g.unit, pg_temp.s7_fyl(0),
       case when g.target_d = 254 then make_date(pg_temp.fy(), 6, 30) else pg_temp.d(g.target_d) end, g.status, g.approval, g.n,
       pg_temp.ts(g.created, '11:00'), pg_temp.ts(greatest(g.created, -14), '11:00'),
       case when g.pgoal is null then null else pg_temp.nb_id('pgoal:' || g.pgoal) end
from s7_goals g where g.approval = 'approved' and g.approver = 'miguel'
on conflict do nothing;

do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.nb_user('priya'), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.nb_user('priya')::text, true);
end $$;
insert into public.staff_goals
  (id, org_id, staff_id, title, description, metric_type, target_value, current_value, unit, period, target_date,
   status, approval_status, sort_order, created_at, updated_at, linked_plan_goal_id)
select pg_temp.nb_id('goal:' || g.h || ':' || g.n), pg_temp.nb_org(), pg_temp.nb_id('staff:' || g.h), g.title, g.description, g.metric_type,
       g.target, g.cur, g.unit, pg_temp.s7_fyl(0),
       case when g.target_d = 254 then make_date(pg_temp.fy(), 6, 30) else pg_temp.d(g.target_d) end, g.status, g.approval, g.n,
       pg_temp.ts(g.created, '11:00'), pg_temp.ts(greatest(g.created, -14), '11:00'),
       case when g.pgoal is null then null else pg_temp.nb_id('pgoal:' || g.pgoal) end
from s7_goals g where g.approval = 'approved' and g.approver = 'priya'
on conflict do nothing;

do $$ begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- KPIs: current/status follow the app's kpiStatusFor rule; snapshots trace the
-- path to the current value (monthly or weekly by cadence).
create temp table if not exists s7_kpis (
  h text, n int, title text, unit text, target numeric, cur numeric, start_v numeric, cadence text,
  source text, mkey text, last_d int, created int
) on commit drop;
truncate s7_kpis;

insert into s7_kpis values
  ('remi', 1, 'Months of runway', 'months', 6, 5.5, 5.1, 'monthly', 'auto', 'cash_runway_months', -3, -100),
  ('remi', 2, 'Board giving participation', 'pct', 100, 78, 22, 'monthly', 'manual', null, -4, -100),
  ('remi', 3, 'Top-25 donor touches (fiscal year)', 'count', 50, 21, 2, 'monthly', 'manual', null, -2, -100),
  ('tasha', 1, 'Audit PBC items delivered', 'pct', 100, 60, 0, 'weekly', 'manual', null, -1, -45),
  ('tasha', 2, 'Compliance items filed on time (rolling 12 months)', 'pct', 100, 94, 100, 'monthly', 'manual', null, -5, -200),
  ('tasha', 3, 'Safeguarding training complete (staff and mentors)', 'pct', 100, 71, 8, 'weekly', 'manual', null, -4, -60),
  ('miguel', 1, 'Active participants', 'count', 280, 268, 205, 'monthly', 'auto', 'active_teens', -3, -200),
  ('miguel', 2, 'Launchpad average attendance', 'pct', 85, 86, 89, 'weekly', 'manual', null, -1, -60),
  ('priya', 1, 'Dollars raised (fiscal year)', 'usd', 3550000, 2414000, 610000, 'monthly', 'auto', 'dollars_raised_fy26', -3, -110),
  ('priya', 2, 'Weighted pipeline (fiscal year)', 'usd', 600000, 520000, 430000, 'monthly', 'auto', 'weighted_pipeline_fy26', -3, -110),
  ('priya', 3, 'Monthly donors', 'count', 75, 47, 45, 'monthly', 'manual', null, -6, -110),
  ('kwame', 1, 'Months closed within 10 business days (fiscal year)', 'pct', 100, 100, 100, 'monthly', 'manual', null, -9, -110),
  ('kwame', 2, 'Days of cash on hand', 'count', 180, 166, 152, 'monthly', 'manual', null, -3, -110),
  ('ben', 1, 'Participant records with complete intake fields', 'pct', 95, 88, 79, 'monthly', 'manual', null, -47, -200),
  ('ben', 2, 'Cohort 6 90-day survey response rate', 'pct', 80, 84, 35, 'weekly', 'manual', null, -18, -90),
  ('rosa', 1, 'Laurel Ridge attendance', 'pct', 85, 74, 88, 'weekly', 'manual', null, -1, -60),
  ('rosa', 2, 'Seniors with 3+ applications submitted', 'pct', 100, 41, 0, 'weekly', 'manual', null, -2, -60),
  ('andre', 1, 'Cohort 7 fellows active', 'count', 36, 33, 36, 'monthly', 'manual', null, -3, -60),
  ('andre', 2, 'Cohort 8 applications reviewed', 'count', 40, 29, 4, 'weekly', 'manual', null, -1, -40),
  ('simone', 1, 'Mentors matched', 'count', 60, 52, 31, 'monthly', 'manual', null, -4, -100),
  ('simone', 2, 'Summer Works employers confirmed (year-end target)', 'count', 12, 9, 1, 'monthly', 'manual', null, -5, -60),
  ('lena', 1, 'Grants submitted (YTD)', 'count', 14, 6, 1, 'monthly', 'auto', 'grants_submitted_ytd', -3, -110),
  ('lena', 2, 'Grant reports submitted on time', 'pct', 100, 100, 100, 'monthly', 'manual', null, -20, -110),
  ('jordan', 1, 'Gifts thanked within 48 hours', 'pct', 95, 81, 92, 'weekly', 'manual', null, -1, -100),
  ('jordan', 2, 'Year-End mailing list verified', 'pct', 100, 64, 0, 'weekly', 'manual', null, -2, -30);

insert into public.staff_kpis
  (id, org_id, staff_id, title, unit, target, current, cadence, source, linked_metric_key, status, last_updated_at, sort_order, created_at, updated_at)
select pg_temp.nb_id('staffkpi:' || k.h || ':' || k.n), pg_temp.nb_org(), pg_temp.nb_id('staff:' || k.h), k.title, k.unit, k.target, k.cur,
       k.cadence, k.source, k.mkey, pg_temp.s7_kpi_status(k.cur, k.target), pg_temp.ts(k.last_d, '09:00'), k.n,
       pg_temp.ts(k.created, '10:00'), pg_temp.ts(k.last_d, '09:00')
from s7_kpis k
on conflict do nothing;

-- Snapshot series: 6 monthly or 8 weekly points ending on the last update.
insert into public.staff_kpi_snapshots (org_id, kpi_id, captured_on, value, created_at)
select pg_temp.nb_org(), pg_temp.nb_id('staffkpi:' || k.h || ':' || k.n), p.captured_on,
       case when p.i = p.npts - 1 then k.cur
            when p.i = 0 then k.start_v
            else round((k.start_v + (k.cur - k.start_v) * p.i::numeric / (p.npts - 1)
                        + (pg_temp.rnd('kpisnap:' || k.h || ':' || k.n || ':' || p.i) - 0.5)
                          * abs(k.cur - k.start_v) * 0.15)::numeric,
                       case when k.unit = 'months' then 1 when k.unit = 'usd' then -3 else 0 end) end,
       p.captured_on::timestamp at time zone 'America/Los_Angeles' + interval '9 hours'
from s7_kpis k
cross join lateral (
  select i, npts, (pg_temp.d(k.last_d) - case when k.cadence = 'weekly' then 7 else 30 end * (npts - 1 - i)) as captured_on
  from (select case when k.cadence = 'weekly' then 8 else 6 end as npts) c,
       generate_series(0, (case when k.cadence = 'weekly' then 8 else 6 end) - 1) as i
) p
on conflict do nothing;

commit;
