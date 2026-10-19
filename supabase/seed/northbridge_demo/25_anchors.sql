-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2.5 — Anchor entities every later section references by key:
--   households, named constituents (board, funders, program officers, major
--   donors), partners (school sites, employers, community), cohorts, and the
--   five named participants. Bulk rows belong to the domain sections.
-- ════════════════════════════════════════════════════════════════════════════
begin;

insert into public.households (id, org_id, name, salutation, created_at)
values
  (pg_temp.nb_id('hh:chen'),    pg_temp.nb_org(), 'Chen Household',    'Margaret and David',  pg_temp.ts(-365 * 5, '09:00')),
  (pg_temp.nb_id('hh:alvarez'), pg_temp.nb_org(), 'Alvarez Household', 'Ricardo and Elena',   pg_temp.ts(-365 * 2 - 40, '09:00'))
on conflict do nothing;

-- ── People ──────────────────────────────────────────────────────────────────
insert into public.constituents
  (id, org_id, type, first_name, last_name, emails, phones, street, city, state, postal_code,
   tags, household_id, source, notes, why_matters, preferred_ack_channel, custom_fields, created_at, updated_at)
select pg_temp.nb_id('con:' || c.k), pg_temp.nb_org(), 'person', c.fn, c.ln,
       array[c.email], array[c.phone], c.street, c.city, 'CA', c.zip,
       c.tags, case when c.hh is null then null else pg_temp.nb_id('hh:' || c.hh) end,
       'manual', c.notes, c.why, c.ack, c.cf, pg_temp.ts(c.since, '10:00'), pg_temp.ts(c.touched, '16:00')
from (values
  -- board
  ('bd_harrington', 'Celeste', 'Harrington', 'celeste.harrington@example.com', '(510) 555-0101', '38 Crestmont Dr', 'Oakland', '94619',
   array['board','major_donor','board_chair'], null, 'Board chair since the strategic plan launch. Retired CTO; hosts the spring donor dinner.',
   'Grew up in East Oakland; her first job came through a neighbor''s referral and she wants every Northbridge kid to have that neighbor.', 'call',
   '{"affinity":"Youth employment"}'::jsonb, -365 * 7, -6),
  ('bd_osei', 'Daniel', 'Osei', 'daniel.osei@example.com', '(510) 555-0102', '210 Vernon St', 'Oakland', '94610',
   array['board','corporate_champion'], null, 'SVP, Commercial Banking at Pacific Summit Bank. Champion for the bank''s Summer Works sponsorship.',
   'Hires Summer Works interns every year and says they outwork his analysts.', 'email', '{"affinity":"Career mentoring","employer_partner":true}'::jsonb, -365 * 5, -12),
  ('bd_lim', 'Grace', 'Lim', 'grace.lim@example.com', '(510) 555-0103', '4410 Park Blvd', 'Oakland', '94602',
   array['board','finance_committee'], null, 'Treasurer; chairs Finance & Audit. CPA, partner at a regional accounting firm.',
   'Believes a well-run back office is how a youth program earns the right to grow.', 'email', '{}'::jsonb, -365 * 4, -3),
  ('bd_ramos', 'Victor', 'Ramos', 'victor.ramos@example.com', '(510) 555-0104', '77 Linda Ave', 'Piedmont', '94611',
   array['board'], null, 'Secretary. Employment attorney; reviews internship agreements pro bono.',
   'Former Summer Works employer turned board member.', 'email', '{}'::jsonb, -365 * 3 - 90, -40),
  ('bd_freeman', 'Alicia', 'Freeman', 'alicia.freeman@example.com', '(510) 555-0105', '1820 Mountain Blvd', 'Oakland', '94611',
   array['board','program_committee'], null, 'Dr. Freeman, retired principal of Eastlake High School; chairs the Program committee.',
   'Watched Launchpad change the senior class at Eastlake.', 'letter', '{"affinity":"Education equity"}'::jsonb, -365 * 6, -20),
  ('bd_nakamura', 'Ken', 'Nakamura', 'ken.nakamura@example.com', '(415) 555-0106', '500 Embarcadero Apt 9C', 'Oakland', '94607',
   array['board','major_donor'], null, 'Founder of a logistics software startup; brought Kinetic Labs in as a partner.',
   'First in his family to work in tech; mentors two Pathways fellows himself.', 'email', '{"affinity":"Career mentoring"}'::jsonb, -365 * 2 - 30, -9),
  ('bd_jackson', 'Monique', 'Jackson', 'monique.jackson@example.com', '(510) 555-0107', '3300 Lakeshore Ave', 'Oakland', '94610',
   array['board'], null, 'VP, Community Health at Harbor Health Partners. Opened the healthcare track''s clinical placements.',
   'Sees Pathways as the health system''s best pipeline for local hires.', 'email', '{}'::jsonb, -365 * 2 - 200, -15),
  ('bd_patel', 'Ravi', 'Patel', 'ravi.patel@example.com', '(650) 555-0108', '12 Sea View Ave', 'Piedmont', '94611',
   array['board','new_board'], null, 'Joined the board three months ago. Early-stage investor; onboarding in progress.',
   'Wants to help Northbridge build an earned-revenue line with employers.', 'email', '{}'::jsonb, -95, -21),
  ('bd_brooks', 'Theo', 'Brooks', 'theo.brooks@example.com', '(510) 555-0109', '880 Brockhurst St', 'Oakland', '94608',
   array['board','alumni','youth_seat'], null, 'Youth board seat. Pathways Cohort 3 graduate, now a network technician.',
   'Says Northbridge is the reason he has a career instead of a job.', 'text', '{"affinity":"Alumni family"}'::jsonb, -365 * 4 - 60, -30),
  -- program officers / funder contacts
  ('po_bayview', 'Janelle', 'Ortiz', 'jortiz@example.org', '(510) 555-0120', '1 Kaiser Plaza Ste 400', 'Oakland', '94612',
   array['program_officer','foundation_contact'], null, 'Senior Program Officer, Economic Mobility, Bayview Community Foundation.', null, 'email', '{}'::jsonb, -365 * 3, -7),
  ('po_hollis', 'Martin', 'Hollis-Reyes', 'mhollisreyes@example.org', '(415) 555-0121', '101 Second St', 'San Francisco', '94105',
   array['program_officer','foundation_contact','family_trustee'], null, 'Trustee and program lead, The Hollis Family Foundation.', null, 'email', '{}'::jsonb, -365 * 2, -18),
  ('po_meridian', 'Camille', 'Washington', 'cwashington@example.org', '(212) 555-0122', '250 Park Ave S', 'New York', '10003',
   array['program_officer','foundation_contact'], null, 'Program Director, Youth Opportunity, Meridian Foundation.', null, 'email', '{}'::jsonb, -200, -21),
  ('po_sequoia', 'Arthur', 'Feld', 'afeld@example.org', '(650) 555-0123', '2600 Sand Hill Rd', 'Menlo Park', '94025',
   array['program_officer','foundation_contact'], null, 'Executive Director, Sequoia Trust for Education.', null, 'email', '{}'::jsonb, -35, -4),
  ('po_eastshore', 'Denise', 'Holloway', 'dholloway@example.org', '(510) 555-0124', '1212 Broadway 8th Fl', 'Oakland', '94612',
   array['funder_contact','government'], null, 'Contract Manager, Eastshore Workforce Development Board.', null, 'email', '{}'::jsonb, -365, -12),
  -- major individual donors
  ('chen_margaret', 'Margaret', 'Chen', 'margaret.chen@example.com', '(510) 555-0130', '45 Sotelo Ave', 'Piedmont', '94611',
   array['major_donor','pledge','family_foundation'], 'chen', 'Margaret leads the household''s giving; David joins for site visits. $150K three-year pledge.',
   'Their daughter tutored at Launchpad in college; they have given every year since.', 'letter', '{"affinity":"Education equity"}'::jsonb, -365 * 5, -25),
  ('chen_david', 'David', 'Chen', 'david.chen@example.com', '(510) 555-0131', '45 Sotelo Ave', 'Piedmont', '94611',
   array['major_donor'], 'chen', 'Engineer; likes data. Ask Ben for the outcomes one-pager before visits.', null, 'email', '{}'::jsonb, -365 * 5, -60),
  ('okafor', 'Nnamdi', 'Okafor', 'nnamdi.okafor@example.com', '(510) 555-0132', '6100 Ascot Dr', 'Oakland', '94611',
   array['major_donor','lybunt'], null, 'Gave $25K last fiscal year after the gala; nothing yet this year. Prefers a call, not email.',
   'Immigrated at 14; a summer job at a bank changed his path.', 'call', '{"affinity":"Youth employment"}'::jsonb, -365 * 3, -120),
  ('wu', 'Jennifer', 'Wu', 'jennifer.wu@example.com', '(415) 555-0133', '2201 Pacific Ave', 'San Francisco', '94115',
   array['major_donor_prospect','prospect_research'], null, 'Surfaced by prospect research: recent liquidity event, gives to workforce programs. Toured Pathways last month.',
   'Interested in the healthcare track; her mother was a nurse.', 'email', '{"affinity":"Youth employment"}'::jsonb, -120, -11),
  ('alvarez_ricardo', 'Ricardo', 'Alvarez', 'ricardo.alvarez@example.com', '(510) 555-0134', '3910 Fruitvale Ave', 'Oakland', '94602',
   array['major_donor','gala'], 'alvarez', 'Owns three restaurants in Fruitvale; bought a gala table two years running.', 'Hires Summer Works interns in his kitchens.', 'in_person',
   '{"affinity":"Oakland roots","employer_partner":true}'::jsonb, -365 * 2 - 40, -165),
  ('alvarez_elena', 'Elena', 'Alvarez', 'elena.alvarez@example.com', '(510) 555-0135', '3910 Fruitvale Ave', 'Oakland', '94602',
   array['major_donor','gala','mentor'], 'alvarez', 'Mentor Circles volunteer.', null, 'in_person', '{"mentor_status":"Matched"}'::jsonb, -365 * 2 - 40, -33),
  ('goldberg', 'Aaron', 'Goldberg', 'aaron.goldberg@example.com', '(510) 555-0136', '25 Hampton Rd', 'Piedmont', '94611',
   array['major_donor','daf_donor'], null, 'Gives through his donor-advised fund at Bay Legacy Giving Fund. $20K arrived 9 days ago; not yet thanked.',
   'Retired teacher; cares about the kids nobody else calls back.', 'letter', '{}'::jsonb, -365 * 4, -9),
  ('bell', 'Sarah', 'Bell', 'sarah.bell@example.com', '(510) 555-0137', '640 Mandana Blvd', 'Oakland', '94610',
   array['major_donor','year_end_donor'], null, 'Gives $10K every December, usually after the year-end letter.', null, 'letter', '{}'::jsonb, -365 * 6, -300)
) as c(k, fn, ln, email, phone, street, city, zip, tags, hh, notes, why, ack, cf, since, touched)
on conflict do nothing;

-- ── Organizations ───────────────────────────────────────────────────────────
insert into public.constituents
  (id, org_id, type, org_name, emails, phones, street, city, state, postal_code,
   tags, source, notes, why_matters, custom_fields, created_at, updated_at)
select pg_temp.nb_id('con:' || c.k), pg_temp.nb_org(), 'organization', c.n,
       array[c.email], array[c.phone], c.street, c.city, c.st, c.zip,
       c.tags, 'manual', c.notes, c.why, c.cf, pg_temp.ts(c.since, '10:00'), pg_temp.ts(c.touched, '16:00')
from (values
  ('bayview',        'Bayview Community Foundation',              'grants@example.org',      '(510) 555-0140', '1 Kaiser Plaza Ste 400', 'Oakland', 'CA', '94612',
   array['foundation','multi_year'], 'Three-year general operating partner. Annual report due each fall.', 'Our largest unrestricted funder.', '{}'::jsonb, -365 * 6, -7),
  ('hollis',         'The Hollis Family Foundation',              'info@example.org',        '(415) 555-0141', '101 Second St', 'San Francisco', 'CA', '94105',
   array['foundation','family_foundation'], 'Family foundation; funds Pathways. Two installments, second contingent on the interim report.', null, '{}'::jsonb, -365 * 2, -18),
  ('eastbay',        'East Bay Workforce Fund',                   'apply@example.org',       '(510) 555-0142', '1999 Harrison St', 'Oakland', 'CA', '94612',
   array['foundation','workforce'], 'Funds Summer Works stipends. Renewal cycle opens each winter.', null, '{}'::jsonb, -365 * 4, -20),
  ('eastshore_wdb',  'Eastshore Workforce Development Board',     'contracts@example.org',   '(510) 555-0143', '1212 Broadway 8th Fl', 'Oakland', 'CA', '94612',
   array['government','contract'], 'Public workforce board. Cost-reimbursement contract, invoiced quarterly.', null, '{}'::jsonb, -365, -12),
  ('ca_yoi',         'California Youth Opportunity Initiative',   'yoi@example.org',         '(916) 555-0144', '1500 Capitol Ave', 'Sacramento', 'CA', '95814',
   array['government','state'], 'State program; two-year award, annual tranches.', null, '{}'::jsonb, -365 - 100, -45),
  ('cypress',        'The Cypress Fund',                          'grants@example.net',      '(415) 555-0145', '1 Ferry Building', 'San Francisco', 'CA', '94111',
   array['foundation','renewal'], 'Funded Launchpad last year; invited a renewal LOI.', null, '{}'::jsonb, -365 * 2, -14),
  ('meridian',       'Meridian Foundation for Youth Opportunity', 'proposals@example.org',   '(212) 555-0146', '250 Park Ave S', 'New York', 'NY', '10003',
   array['foundation','national'], 'National funder; first-time proposal for $300K over two years. Decision expected in ~5 weeks.', 'Would fund the San Leandro expansion.', '{}'::jsonb, -200, -21),
  ('sequoia',        'Sequoia Trust for Education',               'hello@example.org',       '(650) 555-0147', '2600 Sand Hill Rd', 'Menlo Park', 'CA', '94025',
   array['foundation','prospect'], 'New prospect. Intro meeting in three days.', null, '{}'::jsonb, -35, -4),
  ('alder',          'Alder & Finch Foundation',                  'office@example.net',      '(510) 555-0148', '300 Frank H Ogawa Plaza', 'Oakland', 'CA', '94612',
   array['foundation','declined_last_year'], 'Declined last year''s $50K request (outside priorities). New strategy now includes workforce.', null, '{}'::jsonb, -365 * 2, -90),
  ('harbor',         'Harbor Health Partners',                    'community@example.org',   '(510) 555-0149', '2800 Telegraph Ave', 'Oakland', 'CA', '94609',
   array['corporate','health_system','employer_partner'], 'Community-benefit grant for the healthcare track plus clinical placements.', null, '{"employer_partner":true}'::jsonb, -365 * 2, -40),
  ('pacific_summit', 'Pacific Summit Bank',                       'giving@example.com',      '(510) 555-0150', '1 Bay Plaza', 'Oakland', 'CA', '94612',
   array['corporate','sponsor','employer_partner'], 'Summer Works presenting sponsor; hosts 8 interns every summer.', null, '{"employer_partner":true}'::jsonb, -365 * 5, -12),
  ('kinetic',        'Kinetic Labs',                              'impact@example.com',      '(415) 555-0151', '400 Townsend St', 'San Francisco', 'CA', '94107',
   array['corporate','sponsor','employer_partner','mentor_partner'], '$75K pledge this year in three installments; 12 employee mentors.', null, '{"employer_partner":true}'::jsonb, -365 * 2 - 30, -30),
  ('redline',        'Redline Builders',                          'office@example.com',      '(510) 555-0152', '2500 Embarcadero', 'Oakland', 'CA', '94606',
   array['corporate','employer_partner','trades'], 'General contractor; trades-track internships and a $25K gift.', null, '{"employer_partner":true}'::jsonb, -365 * 2, -75),
  ('legacy_daf',     'Bay Legacy Giving Fund',                    'grants@example.net',      '(415) 555-0153', '50 California St', 'San Francisco', 'CA', '94111',
   array['daf_sponsor'], 'Donor-advised fund sponsor. Gifts arrive with a donor recommendation letter.', null, '{}'::jsonb, -365 * 4, -9)
) as c(k, n, email, phone, street, city, st, zip, tags, notes, why, cf, since, touched)
on conflict do nothing;

-- ── Partners: school sites, employers, community ────────────────────────────
insert into public.partners
  (id, org_id, constituent_id, name, kind, status, champion_name, champion_email, champion_role,
   teen_count, program_type, mou_status, mou_start, mou_end, data_agreement_signed, notes,
   last_touch_at, city, region, created_at, updated_at)
select pg_temp.nb_id('partner:' || p.k), pg_temp.nb_org(),
       case when p.con is null then null else pg_temp.nb_id('con:' || p.con) end,
       p.n, p.kind, p.status, p.champ, p.champ_email, p.champ_role, p.teens, p.ptype, p.mou,
       case when p.mou = 'signed' then pg_temp.sy_start() - 30 end,
       case when p.mou = 'signed' then pg_temp.sy_start() + 335 end,
       case when p.kind = 'school' and p.mou = 'signed' then pg_temp.sy_start() - 25 end,
       p.notes, pg_temp.d(p.touch), 'Oakland', p.region, pg_temp.ts(-365 * 3, '09:00'), pg_temp.ts(p.touch, '15:00')
from (values
  ('eastlake',       null,             'Eastlake High School',             'school',    'anchor',  'Ms. Tamika Reed',     'treed@example.org',      'Assistant Principal',    '42',  'Launchpad Academy',     'signed', 'Founding Launchpad site (since 2014). Classroom 204, Mon–Thu 3:30–5:30.', -6,  'East Oakland'),
  ('laurel',         null,             'Laurel Ridge High School',         'school',    'active',  'Mr. Jason Whitaker',  'jwhitaker@example.org',  'College & Career Lead',  '38',  'Launchpad Academy',     'signed', 'Attendance dipped after the bell-schedule change; Rosa is meeting the AP.', -3,  'Fruitvale'),
  ('bayshore',       null,             'Bayshore Academy',                 'school',    'active',  'Dr. Nia Coleman',     'ncoleman@example.org',   'Principal',              '40',  'Launchpad Academy',     'signed', 'Newest site (third year). Strong counselor partnership.', -10, 'West Oakland'),
  ('sanleandro',     null,             'San Leandro Unified (Career Ed)',  'district',  'pilot',   'Ms. Laura Kim',       'lkim@example.org',       'Director of Career Ed',  '60',  'Launchpad Academy',     'sent',   'Pilot for a fourth Launchpad site next school year (expansion the Meridian ask would fund).', -8, 'San Leandro'),
  ('pacific_summit', 'pacific_summit', 'Pacific Summit Bank',              'company',   'anchor',  'Daniel Osei',         'daniel.osei@example.com','SVP (board vice chair)', '8',   'Summer Works employer', 'signed', 'Presenting sponsor; 8 interns in branch ops and commercial banking.', -12, 'Downtown'),
  ('kinetic',        'kinetic',        'Kinetic Labs',                     'company',   'active',  'Priscilla Gomez',     'pgomez@example.com',     'Head of Social Impact',  '6',   'Pathways IT placements','signed', 'Hires IT-track fellows for help-desk roles; 12 employee mentors.', -30, 'SF / remote'),
  ('harbor',         'harbor',         'Harbor Health Partners',           'company',   'active',  'Monique Jackson',     'monique.jackson@example.com', 'VP Community Health (board)', '10', 'Pathways healthcare track', 'signed', 'Clinical placements for CNA and medical-assistant fellows.', -40, 'North Oakland'),
  ('redline',        'redline',        'Redline Builders',                 'company',   'active',  'Tom Brennan',         'tbrennan@example.com',   'Field Operations',       '5',   'Trades internships',    'signed', 'Pre-apprenticeship placements on two active job sites.', -75, 'Jack London'),
  ('library',        null,             'Eastshore Public Library',         'nonprofit', 'active',  'Grace Okonkwo',       'gokonkwo@example.org',   'Teen Services Manager',  '12',  'Summer Works employer', 'signed', 'Hosts library-aide interns and our FAFSA nights.', -50, 'East Oakland'),
  ('fruit_center',   null,             'Fruitvale Hub Community Center',   'nonprofit', 'active',  'Hector Ruiz',         'hruiz@example.org',      'Program Director',       '20',  'Mentor Circles venue',  'drafting','Monthly Mentor Circles venue; MOU renewal being drafted.', -14, 'Fruitvale')
) as p(k, con, n, kind, status, champ, champ_email, champ_role, teens, ptype, mou, notes, touch, region)
on conflict do nothing;

-- ── Cohorts ─────────────────────────────────────────────────────────────────
insert into public.cohorts
  (id, org_id, name, program, program_id, term, location, partner_id, capacity, start_date, end_date,
   status, accepting_applications, notes, created_at)
select pg_temp.nb_id('cohort:' || c.k), pg_temp.nb_org(), c.n, c.prog_name, pg_temp.nb_id('prog:' || c.prog),
       c.term, c.loc, case when c.partner is null then null else pg_temp.nb_id('partner:' || c.partner) end,
       c.cap, c.sd, c.ed, c.status, c.accepting, c.notes, pg_temp.ts(c.created, '09:00')
from (values
  ('lp_eastlake', 'Launchpad · Eastlake',      'Launchpad Academy',   'launchpad',   (pg_temp.sy_year() || '–' || (pg_temp.sy_year() + 1) % 100),  'Eastlake High School, Rm 204', 'eastlake', 45, pg_temp.sy_start() + 14, pg_temp.sy_start() + 290, 'active',    false, 'Mon–Thu 3:30–5:30.',                              (pg_temp.sy_start() - pg_temp.nb_anchor()) - 40),
  ('lp_laurel',   'Launchpad · Laurel Ridge',  'Launchpad Academy',   'launchpad',   (pg_temp.sy_year() || '–' || (pg_temp.sy_year() + 1) % 100),  'Laurel Ridge HS, Library',     'laurel',   40, pg_temp.sy_start() + 14, pg_temp.sy_start() + 290, 'active',    false, 'Mon–Thu 3:45–5:45 (new bell schedule).',          (pg_temp.sy_start() - pg_temp.nb_anchor()) - 40),
  ('lp_bayshore', 'Launchpad · Bayshore',      'Launchpad Academy',   'launchpad',   (pg_temp.sy_year() || '–' || (pg_temp.sy_year() + 1) % 100),  'Bayshore Academy, Rm 12',      'bayshore', 45, pg_temp.sy_start() + 14, pg_temp.sy_start() + 290, 'active',    false, 'Mon–Thu 3:30–5:30.',                              (pg_temp.sy_start() - pg_temp.nb_anchor()) - 40),
  ('pw7',         'Pathways Cohort 7',         'Pathways Fellowship', 'pathways',    'Cohort 7',     'Northbridge HQ + employer sites', null, 36, pg_temp.sy_start(), pg_temp.sy_start() + 364, 'active',    false, 'IT support (14), healthcare (12), building trades (10).', (pg_temp.sy_start() - pg_temp.nb_anchor()) - 75),
  ('pw6',         'Pathways Cohort 6',         'Pathways Fellowship', 'pathways',    'Cohort 6',     'Northbridge HQ + employer sites', null, 34, pg_temp.sy_start() - 364, pg_temp.summer_start() - 2, 'completed', false, 'Graduated in June; placement tracking at 90 days.', (pg_temp.sy_start() - pg_temp.nb_anchor()) - 440),
  ('pw8',         'Pathways Cohort 8',         'Pathways Fellowship', 'pathways',    'Cohort 8',     'Northbridge HQ + employer sites', null, 36, pg_temp.d(110), pg_temp.d(475), 'planning',  true,  'Spring start. Applications open; interviews in three weeks.', -45),
  ('sw',          'Summer Works',              'Summer Works',        'summerworks', 'Summer ' || extract(year from pg_temp.summer_start())::int, '22 employer sites', null, 90, pg_temp.summer_start(), pg_temp.summer_start() + 46, 'completed', false, '85 interns, 22 employers, $2.1K average stipend.', (pg_temp.summer_start() - pg_temp.nb_anchor()) - 90),
  ('mc',          'Mentor Circles',            'Mentor Circles',      'mentors',     (pg_temp.sy_year() || '–' || (pg_temp.sy_year() + 1) % 100), 'Fruitvale Hub Community Center', 'fruit_center', 60, pg_temp.sy_start() + 21, pg_temp.sy_start() + 300, 'active', true, 'Second Tuesday of every month, 6–7:30pm. Rolling mentor matches.', (pg_temp.sy_start() - pg_temp.nb_anchor()) - 30)
) as c(k, n, prog_name, prog, term, loc, partner, cap, sd, ed, status, accepting, notes, created)
on conflict do nothing;

-- ── Named participants (the hero stories) ───────────────────────────────────
insert into public.students
  (id, org_id, first_name, last_name, email, phone, partner_id, location, stage, notes,
   last_activity_at, custom_fields, created_at, updated_at)
select pg_temp.nb_id('student:' || s.k), pg_temp.nb_org(), s.fn, s.ln, s.email, s.phone,
       case when s.partner is null then null else pg_temp.nb_id('partner:' || s.partner) end,
       s.loc, s.stage, s.notes, pg_temp.d(s.active), s.cf, pg_temp.ts(s.since, '11:00'), pg_temp.ts(s.active, '17:00')
from (values
  ('amara',  'Amara',  'Johnson', 'amara.j@example.net', '(510) 555-0160', null,       'East Oakland', 'alumni',
   'Pathways Cohort 6 graduate (IT support). CompTIA A+ certified. Hired by Kinetic Labs as an IT help-desk technician at $28/hr. Speaking at the Year-End donor breakfast.',
   -12, '{"grade":"Post-secondary","track":"IT support","first_gen":true,"neighborhood":"East Oakland"}'::jsonb, -365 * 2 - 30),
  ('luis',   'Luis',   'Ortega',  'luis.o@example.net',  '(510) 555-0161', 'eastlake', 'Fruitvale',    'enrolled',
   'Launchpad senior at Eastlake; Summer Works intern at Pacific Summit Bank last summer. Applying to Cal State East Bay (business).',
   -1, '{"grade":"12","school":"Eastlake High School","track":"Business & finance","first_gen":true,"neighborhood":"Fruitvale","guardian_name":"Marisol Ortega","guardian_phone":"(510) 555-0170"}'::jsonb, -365 * 3),
  ('keisha', 'Keisha', 'Brown',   'keisha.b@example.net','(510) 555-0162', null,       'West Oakland', 'enrolled',
   'Pathways Cohort 7, healthcare track. Clinical rotation at Harbor Health; CNA exam in 30 days. Needs a transit pass renewal.',
   -2, '{"grade":"Post-secondary","track":"Healthcare","first_gen":true,"neighborhood":"West Oakland","needs":["Transit pass"]}'::jsonb, -150),
  ('david',  'David',  'Tran',    'david.t@example.net', '(510) 555-0163', 'laurel',   'San Leandro',  'enrolled',
   'Launchpad junior at Laurel Ridge. Missed 6 of the last 10 sessions since starting a job at a grocery store; Rosa is checking in with his mom.',
   -16, '{"grade":"11","school":"Laurel Ridge High School","track":"IT support","neighborhood":"San Leandro","guardian_name":"Linh Tran","guardian_phone":"(510) 555-0171","needs":["Laptop"]}'::jsonb, -400),
  ('jalen',  'Jalen',  'Price',   'jalen.p@example.net', '(510) 555-0164', null,       'East Oakland', 'applied',
   'Applied to Pathways Cohort 8 (building trades). Referred by Redline Builders after a job-site visit. Interview to schedule.',
   -5, '{"grade":"Not in school","track":"Building trades","neighborhood":"East Oakland"}'::jsonb, -20)
) as s(k, fn, ln, email, phone, partner, loc, stage, notes, active, cf, since)
on conflict do nothing;

commit;
