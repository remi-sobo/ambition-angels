-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — Programs, participants, partners
--   partners (22 more: employers, community, prospects) + contacts for every
--   partner + interactions (site check-ins, employer calls, Fruitvale Hub MOU
--   renewal, San Leandro pilot), ~270 participants (students) with registry
--   custom fields, applications (Pathways Cohort 8 intake + Launchpad late
--   enrollment), cohort memberships, sessions (held history + next two weeks),
--   deterministic attendance, and a short audit timeline for the five named
--   participants. Enriches the Section 2.5 anchors (this org only).
--
-- Story knobs (bible §4, §6, §7):
--   * Launchpad: 3 site cohorts, Mon–Thu, ~120 enrolled. Laurel Ridge dips over
--     the last 3 weeks (bell-schedule change: later start, more late/absent).
--   * David Tran: absent 6 of his last 10 marks, the last 3 in a row.
--   * Pathways 7: 36 fellows (IT 14 / healthcare 12 / trades 10), Fridays.
--     Pathways 6: 34 graduates; placement outcome recorded in each note.
--   * Summer Works: 85 completed interns at 22 employers (weekly workshops).
--   * Mentor Circles: 48 matched youth, monthly second-Tuesday circles.
--   * Intake: 40 Cohort 8 applications (incl. Jalen Price) + 4 Launchpad late.
--   * One past session left unrecorded (Bayshore, latest Launchpad day at
--     least 2 days back) so "record attendance" surfaces once; one future
--     Laurel session canceled (minimum day). No past canceled sessions: the
--     briefing counts any past session without marks as missing attendance.
--
-- Not seeded on purpose: program_partners. /api/admin/programs reads that
-- table with the service-role client and NO org filter (legacy AA dashboard),
-- so any row here would show on Ambition Angels' own admin.
--
-- Attendance rows are inserted in two passes for physical order: one mark per
-- held session first, then the rest newest-first (several app reads take the
-- first 1000 rows unordered; see the section report).
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ── Section-local helpers (pg_temp: nothing persists) ──────────────────────
-- nth ISO weekday (1=Mon … 7=Sun) of a month; last such weekday of a month.
create or replace function pg_temp.nb5_nth_dow(y int, m int, dow int, n int) returns date
  language sql immutable
  as $$ select (make_date(y, m, 1) + ((dow - extract(isodow from make_date(y, m, 1))::int + 7) % 7) + 7 * (n - 1))::date $$;
create or replace function pg_temp.nb5_last_dow(y int, m int, dow int) returns date
  language sql immutable
  as $$ select (x - ((extract(isodow from x)::int - dow + 7) % 7))::date
        from (select (make_date(y, m, 1) + interval '1 month - 1 day')::date x) s $$;

-- School/office closure calendar (Oakland-style school year), by rule.
create or replace function pg_temp.nb5_closed(d date) returns boolean language sql immutable
  as $$ select d = pg_temp.nb5_nth_dow(y, 9, 1, 1)                                   -- Labor Day
            or (m = 11 and dd = 11)                                                   -- Veterans Day
            or d between pg_temp.nb5_nth_dow(y, 11, 4, 4) - 3
                     and pg_temp.nb5_nth_dow(y, 11, 4, 4) + 1                         -- Thanksgiving week
            or (m = 12 and dd >= 21) or (m = 1 and dd <= 2)                           -- winter break
            or d = pg_temp.nb5_nth_dow(y, 1, 1, 3)                                    -- MLK Day
            or d = pg_temp.nb5_nth_dow(y, 2, 1, 3)                                    -- Presidents' Day
            or d between date_trunc('week', make_date(y, 3, 31))::date
                     and date_trunc('week', make_date(y, 3, 31))::date + 4            -- spring break
            or d = pg_temp.nb5_last_dow(y, 5, 1)                                      -- Memorial Day
            or (m = 6 and dd = 19)                                                    -- Juneteenth
            or (m = 7 and dd = 4) or (m = 7 and dd = 3 and extract(isodow from d) = 5) -- July 4th (observed)
        from (select extract(year from d)::int y, extract(month from d)::int m, extract(day from d)::int dd) p $$;

-- Day offset (relative to the anchor) of Summer Works day k / school-year day k.
create or replace function pg_temp.nb5_sw(k int) returns int language sql stable
  as $$ select (pg_temp.summer_start() - pg_temp.nb_anchor()) + k $$;
create or replace function pg_temp.nb5_sy(k int) returns int language sql stable
  as $$ select (pg_temp.sy_start() - pg_temp.nb_anchor()) + k $$;

-- Mentor Circles kickoff: first Tuesday on/after the cohort start.
create or replace function pg_temp.nb5_mc_kickoff() returns date language sql stable
  as $$ select d + ((2 - extract(isodow from d)::int + 7) % 7)
        from (select pg_temp.sy_start() + 21 d) x $$;

-- Partner fit rubric (app/admin/partners/_lib/rubric.ts): seven 0–5 scores in
-- a fixed order → score_factors jsonb, and the 0–100 priority score.
create or replace function pg_temp.nb5_rubric(s text) returns jsonb language sql immutable
  as $$ select jsonb_object_agg(k, v::int)
        from unnest(array['geography','student_volume','execution_readiness','funding_connectivity',
                          'collab_fundraising','relational_fit','population_fit'],
                    string_to_array(s, ',')) as t(k, v) $$;
create or replace function pg_temp.nb5_score(s text) returns int language sql immutable
  as $$ select round(avg(v::numeric) / 5 * 100)::int from unnest(string_to_array(s, ',')) v $$;

-- audit_log is range-partitioned and production only has a few monthly
-- partitions: true when some partition covers ts (bounds read from the catalog).
create or replace function pg_temp.nb5_audit_ok(t timestamptz) returns boolean language sql stable
  as $$ select exists (
          select 1
          from pg_inherits i
          join pg_class c on c.oid = i.inhrelid
          cross join lateral regexp_match(pg_get_expr(c.relpartbound, c.oid),
                                          $r$FROM \('([^']+)'\) TO \('([^']+)'\)$r$) b
          where i.inhparent = 'public.audit_log'::regclass
            and t >= b[1]::timestamptz and t < b[2]::timestamptz) $$;

-- ════════════════════════════════════════════════════════════════════════════
-- PARTNERS
-- ════════════════════════════════════════════════════════════════════════════

-- New partners (the anchors' ten rows already exist). MOU dates: Summer Works
-- host agreements run summer to summer; two expire inside 90 days, one has
-- lapsed (renewal queue on the partners board).
create temp table nb5_partner_new on commit drop as
select * from (values
  -- key, name, kind, status, champion, champ_email, champ_role, teens, program_type, mou, mou_start(off), mou_end(off), data_agreement(off), referral, notes, city, region, domain, rubric, source, created(off), constituent
  ('casa_alvarez',     'Casa Alvarez Restaurant Group',        'company',   'active',   'Ricardo Alvarez',     'ricardo.alvarez@example.com', 'Owner',                         '6',    'Summer Works employer',                  'signed', pg_temp.nb5_sw(-45), 70,                    null::int, 'Gala table host; introduced by Priya',            'Three Fruitvale restaurants. Interns rotate through front of house, kitchen prep, and inventory. Ricardo wants one intern in the back office next summer.', 'Oakland', 'Fruitvale',   'casaalvarez.example.com',    '5,3,4,3,3,5,5', null,          -365 * 2,  'alvarez_ricardo'),
  ('lakeshore_cu',     'Lakeshore Community Credit Union',     'company',   'active',   'Carla Whitfield',     'cwhitfield@example.com',      'Member Services Manager',       '4',    'Summer Works employer',                  'signed', pg_temp.nb5_sw(-45), pg_temp.nb5_sw(364),   null,      null,                                             'Member-services interns at the Lakeshore branch. Offering a financial-coaching session for Pathways fellows this fall.', 'Oakland', 'Lakeshore', 'lakeshorecu.example.com',    '5,2,4,3,3,4,4', null,          -365 * 3,  null),
  ('oakhaven_medical', 'Oakhaven Medical Group',               'company',   'active',   'Dr. Farah Siddiqui',  'fsiddiqui@example.com',       'Clinic Operations Director',    '4',    'Summer Works + Pathways healthcare',     'signed', pg_temp.nb5_sw(-45), 45,                    null,      null,                                             'Community clinic group. Front-desk interns in summer; medical-assistant externships for Pathways fellows. Host agreement renewal out for signature.', 'Oakland', 'East Oakland', 'oakhavenmedical.example.com', '5,2,4,3,3,4,5', null,          -365 * 2,  null),
  ('brightline_solar', 'Brightline Solar Installers',          'company',   'active',   'Wesley Grant',        'wgrant@example.com',          'Install Operations Manager',    '4',    'Summer Works + trades placements',       'signed', pg_temp.nb5_sw(-45), pg_temp.nb5_sw(364),   null,      null,                                             'Residential solar installer. Summer install helpers; wants two Cohort 7 trades fellows on spring crews.', 'San Leandro', 'San Leandro', 'brightlinesolar.example.com', '4,2,4,2,3,4,4', null,          -365 * 2,  null),
  ('port_city',        'Port City Logistics',                  'company',   'active',   'Angela Moreno',       'amoreno@example.com',         'HR Business Partner',           '5',    'Summer Works employer',                  'signed', pg_temp.nb5_sw(-45), pg_temp.nb5_sw(364),   null,      null,                                             'Warehouse and dispatch interns near the port. Asks for interns 18+ so they can earn a forklift certification.', 'Oakland', 'West Oakland', 'portcitylogistics.example.com', '5,3,4,2,2,4,4', null,       -365 * 4,  null),
  ('tidewater',        'Tidewater Engineering',                'company',   'active',   'Paul Nakashima',      'pnakashima@example.com',      'Principal Engineer',            '3',    'Summer Works employer',                  'signed', pg_temp.nb5_sw(-410), -20,                  null,      null,                                             'Civil engineering firm. Interns supported a stormwater survey. Host agreement has lapsed; renew before next summer.', 'Oakland', 'Downtown', 'tidewatereng.example.com',     '4,1,4,3,2,3,3', null,          -365 * 3,  null),
  ('bayline_electric', 'Bayline Electrical Contractors',       'company',   'active',   'Rosalind Pierce',     'rpierce@example.com',         'Apprenticeship Coordinator',    '3',    'Summer Works + trades placements',       'signed', pg_temp.nb5_sw(-45), pg_temp.nb5_sw(364),   null,      null,                                             'Union electrical contractor. Summer helpers; interviewing Cohort 7 trades fellows for apprentice spots after OSHA-10.', 'Oakland', 'Jack London', 'baylineelectric.example.com', '5,2,4,3,3,4,5', null,          -365 * 2,  null),
  ('fruitvale_dental', 'Fruitvale Family Dental',              'company',   'active',   'Dr. Ana Lucero',      'alucero@example.com',         'Practice Owner',                '2',    'Summer Works employer',                  'signed', pg_temp.nb5_sw(-45), pg_temp.nb5_sw(364),   null,      null,                                             'Neighborhood dental practice; hired a Cohort 6 graduate as a dental assistant.', 'Oakland', 'Fruitvale', 'fruitvaledental.example.com', '5,1,3,2,2,4,5', null,           -365 * 2,  null),
  ('mosaic_media',     'Mosaic Media Studio',                  'company',   'active',   'Devon Ashby',         'dashby@example.com',          'Creative Director',             '3',    'Summer Works employer',                  'signed', pg_temp.nb5_sw(-45), pg_temp.nb5_sw(364),   null,      null,                                             'Design and social media studio. Interns produced the photo set used in the year-end appeal.', 'Oakland', 'Downtown', 'mosaicmedia.example.com',      '4,1,3,3,3,4,3', null,          -365,      null),
  ('evergreen_senior', 'Evergreen Terrace Senior Living',      'company',   'active',   'Patricia Lomeli',     'plomeli@example.com',         'Director of Nursing',           '4',    'Summer Works + Pathways CNA placements', 'signed', pg_temp.nb5_sw(-45), pg_temp.nb5_sw(364),   null,      null,                                             'Assisted-living community. Hired two Cohort 6 CNAs; wants first look at Cohort 7 healthcare fellows in spring.', 'San Leandro', 'San Leandro', 'evergreenterrace.example.com', '4,2,4,2,2,5,4', null,         -365 * 2,  null),
  ('bytebridge',       'ByteBridge IT Services',               'company',   'active',   'Sanjay Mehta',        'smehta@example.com',          'Service Desk Manager',          '3',    'Summer Works + Pathways IT placements',  'signed', pg_temp.nb5_sw(-45), pg_temp.nb5_sw(364),   null,      'Eastshore WDB employer breakfast',               'Managed IT provider for small businesses. Three Cohort 6 hires, all past probation.', 'Oakland', 'Downtown', 'bytebridge.example.com', '4,2,5,3,3,5,4', null,                -365 * 2,  null),
  ('lumen',            'Lumen Software',                       'company',   'active',   'Erica Lindqvist',     'elindqvist@example.com',      'People Operations Lead',        '2',    'Summer Works employer',                  'signed', pg_temp.nb5_sw(-45), pg_temp.nb5_sw(364),   null,      'Introduced by Ken Nakamura (board)',             'Software company. QA-testing interns; considering a fall internship for one Pathways fellow.', 'San Francisco', 'SF / remote', 'lumensoftware.example.com', '2,1,4,4,3,3,3', null,          -365,      null),
  ('estuary_hotel',    'Estuary Point Hotel',                  'company',   'active',   'Gloria Benitez',      'gbenitez@example.com',        'General Manager',               '4',    'Summer Works employer',                  'signed', pg_temp.nb5_sw(-45), pg_temp.nb5_sw(364),   null,      null,                                             'Waterfront hotel. Guest-services interns; hired one part-time at the front desk.', 'Oakland', 'Jack London', 'estuarypoint.example.com', '5,2,3,2,2,3,4', null,                  -365 * 3,  null),
  ('baycrest_animal',  'Bay Crest Animal Hospital',            'company',   'active',   'Dr. Helen Choi',      'hchoi@example.com',           'Medical Director',              '2',    'Summer Works employer',                  'signed', pg_temp.nb5_sw(-45), pg_temp.nb5_sw(364),   null,      null,                                             'Veterinary hospital. Veterinary-assistant interns.', 'Oakland', 'Lakeshore', 'baycrestvet.example.com', '5,1,3,1,2,3,3', null,                                                  -365,      null),
  ('westside_auto',    'Westside Auto Collision',              'company',   'active',   'Rudy Castaneda',      'rcastaneda@example.com',      'Shop Owner',                    '2',    'Summer Works employer',                  'signed', pg_temp.nb5_sw(-45), pg_temp.nb5_sw(364),   null,      null,                                             'Body shop. Hired a Cohort 6 trades graduate as a technician trainee. Prefers interns with a driver''s license.', 'Oakland', 'West Oakland', 'westsideauto.example.com', '5,1,3,1,1,3,4', null,           -365 * 2,  null),
  ('skyline_data',     'Skyline Data Center',                  'company',   'outreach', 'Monica Ferreira',     'mferreira@example.com',       'Site Operations Manager',       null,   'Pathways IT placements (proposed)',      'none',   null,                null,                  null,      'Eastshore WDB employer breakfast',               'Met at the employer breakfast. Interested in two IT fellows and three Summer Works interns. Site tour next month.', 'San Leandro', 'San Leandro', 'skylinedc.example.com', '4,2,4,3,2,2,3', null,           -9,        null),
  ('cornerstone_supply','Cornerstone Builders Supply',         'company',   'outreach', 'Jerome Whitley',      'jwhitley@example.com',        'Branch Manager',                null,   'Summer Works employer (proposed)',       'none',   null,                null,                  null,      'Summer Works employer recruitment list',         'Building-materials supplier. Warehouse and counter-sales roles at the San Leandro branch.', 'San Leandro', 'San Leandro', 'cornerstonesupply.example.com', '4,2,3,2,2,2,3', null,      -17,       null),
  ('metro_print',      'Metro Print & Copy',                   'company',   'lapsed',   'Steve Albright',      'salbright@example.com',       'Owner',                         '1',    'Summer Works employer',                  'signed', pg_temp.nb5_sw(-410), pg_temp.nb5_sw(-46),  null,      null,                                             'Hosted interns for four summers, then moved operations to Sacramento. Keep warm for referrals.', 'Oakland', 'Downtown', 'metroprint.example.com', '1,1,3,1,1,4,3', null,                  -365 * 5,  null),
  ('bridgeway',        'Bridgeway Family Resource Center',     'nonprofit', 'active',   'Yolanda Banks',       'ybanks@example.org',          'Youth Case Management Lead',    '15',   'Referral partner (Pathways + Launchpad)', 'signed', pg_temp.nb5_sy(-60), pg_temp.nb5_sy(305),    pg_temp.nb5_sy(-58), null,                                       'Family resource center in East Oakland. Refers young adults to Pathways and families to Launchpad; helps with childcare and benefits.', 'Oakland', 'East Oakland', 'bridgewayfrc.example.org', '5,3,4,3,3,5,5', null,  -365 * 4,  null),
  ('open_table',       'Open Table Food Collective',           'nonprofit', 'active',   'Kimberly Ngata',      'kngata@example.org',          'Programs Coordinator',          null,   'Food support for participants',          'none',   null,                null,                  null,      null,                                             'Grocery cards for families with food needs and weekly snack boxes for Launchpad sites.', 'Oakland', 'Fruitvale', 'opentablefood.example.org', '5,2,4,2,3,4,5', null,                     -365 * 2,  null),
  ('eastshore_cc',     'Eastshore Community College',          'school',    'active',   'Dr. Raymond Ellison', 'rellison@example.org',        'Dean, Workforce Programs',      '36',   'Pathways certification training',        'signed', pg_temp.nb5_sy(-30), pg_temp.nb5_sy(335),    pg_temp.nb5_sy(-28), null,                                       'Training partner for Pathways certifications: CNA, CompTIA A+, and OSHA-10 / NCCER Core. Proctors the CNA skills exam.', 'Oakland', 'Downtown', 'eastshorecc.example.org', '5,4,5,3,3,4,4', null,               -365 * 6,  null),
  ('marina_gate',      'Marina Gate High School',              'school',    'outreach', 'Ms. Teresa Vu',       'tvu@example.org',             'Assistant Principal',           '45',   'Launchpad Academy (proposed)',           'none',   null,                null,                  null,      'San Leandro Unified pilot',                      'Proposed fourth Launchpad site if the San Leandro pilot is approved. Career center available Mon–Thu.', 'San Leandro', 'San Leandro', null, '4,4,3,3,3,3,4', null,                                             -15,       null),
  ('rising_roots',     'Rising Roots Youth Collective',        'nonprofit', 'prospect', 'Asha Delacroix',      'asha@example.org',            'Founder & Director',            '25-50','After-school',                           'none',   null,                null,                  null,      'Instagram',                                      null, 'Oakland', 'West Oakland', null, null, 'signup_form', -3, null),
  ('harmony_arts',     'Harmony Arts Academy',                 'school',    'prospect', 'Owen Castillo',       'ocastillo@example.org',       'School Counselor',              '50-100','In-school',                             'none',   null,                null,                  null,      'Referred by Dr. Freeman',                        null, 'Oakland', 'Downtown', null, null, 'signup_form', -1, null)
) as v(k, n, kind, status, champ, champ_email, champ_role, teens, ptype, mou, mou_s, mou_e, dsa, referral, notes, city, region, domain, rubric, src, created, con);

-- Rubric + website for the ten anchors (they already have status/MOU/champion).
create temp table nb5_partner_anchor on commit drop as
select * from (values
  ('eastlake',       '5,5,5,3,3,5,5', 'eastlakehs.example.org'),
  ('laurel',         '5,4,3,2,2,4,5', 'laurelridgehs.example.org'),
  ('bayshore',       '5,4,4,3,3,4,5', 'bayshoreacademy.example.org'),
  ('sanleandro',     '4,5,3,4,4,3,4', 'slusd-careered.example.org'),
  ('pacific_summit', '5,3,5,5,4,5,4', 'pacificsummitbank.example.com'),
  ('kinetic',        '4,3,5,5,4,5,4', 'kineticlabs.example.com'),
  ('harbor',         '5,3,5,4,4,5,4', 'harborhealth.example.org'),
  ('redline',        '5,2,4,3,3,4,5', 'redlinebuilders.example.com'),
  ('library',        '5,3,4,2,3,4,5', 'eastshorelibrary.example.org'),
  ('fruit_center',   '5,3,4,2,2,4,5', 'fruitvalehub.example.org')
) as v(k, rubric, domain);

-- Contacts: every partner has its champion as the primary contact, plus the
-- people the team actually works with there.
create temp table nb5_contacts on commit drop as
select * from (values
  ('eastlake', 1, 'Tamika', 'Reed', 'treed@example.org', '(510) 555-0172', 'Assistant Principal', array['champion','administrator'], 'Launchpad champion since the site opened. Prefers a quick check-in after school on the first Tuesday of the month.', true, -365 * 3),
  ('eastlake', 2, 'Lorraine', 'Hughes', 'lhughes@example.org', '(510) 555-0173', 'College & Career Counselor', array['counselor'], 'Runs senior FAFSA tracking; send her our list before each library night.', false, -365 * 2),
  ('eastlake', 3, 'Kevin', 'Duong', 'kduong@example.org', '(510) 555-0174', 'Office Manager', array['operations'], 'Room keys, custodial coverage, and the late-bus list.', false, -365),
  ('laurel', 1, 'Jason', 'Whitaker', 'jwhitaker@example.org', '(510) 555-0175', 'College & Career Lead', array['champion'], null, true, -365 * 3),
  ('laurel', 2, 'Michelle', 'Ayala', 'mayala@example.org', '(510) 555-0176', 'Assistant Principal', array['administrator','bell_schedule'], 'Owns the bell schedule and after-school space decisions.', false, -365),
  ('laurel', 3, 'Renee', 'Carter', 'rcarter@example.org', '(510) 555-0177', 'Counselor', array['counselor'], null, false, -200),
  ('bayshore', 1, 'Nia', 'Coleman', 'ncoleman@example.org', '(510) 555-0178', 'Principal', array['champion','administrator'], 'Wants a mid-year outcomes summary each January.', true, -365 * 3),
  ('bayshore', 2, 'Andres', 'Villalobos', 'avillalobos@example.org', '(510) 555-0179', 'Counselor', array['counselor'], 'Main source of 9th-grade referrals.', false, -365 * 2),
  ('bayshore', 3, 'Lisa', 'Ngo', 'lngo@example.org', '(510) 555-0180', 'Office Manager', array['operations'], null, false, -365),
  ('sanleandro', 1, 'Laura', 'Kim', 'lkim@example.org', '(510) 555-0181', 'Director of Career Education', array['champion'], 'Driving the pilot inside the district. Introduced by Dr. Freeman.', true, -44),
  ('sanleandro', 2, 'Gregory', 'Hale', 'ghale@example.org', '(510) 555-0182', 'Assistant Superintendent, Educational Services', array['executive'], 'Decision-maker on the pilot budget.', false, -15),
  ('sanleandro', 3, 'Paula', 'Estrada', 'pestrada@example.org', '(510) 555-0183', 'CTE Coordinator', array['cte'], null, false, -29),
  ('pacific_summit', 1, 'Daniel', 'Osei', 'daniel.osei@example.com', '(510) 555-0102', 'SVP, Commercial Banking (board vice chair)', array['champion','board'], 'Board vice chair and the bank''s internal champion.', true, -365 * 5),
  ('pacific_summit', 2, 'Lauren', 'Fitch', 'lfitch@example.com', '(510) 555-0184', 'Early Careers Program Manager', array['intern_supervisor','hr'], 'Coordinates intern placements across branches.', false, -365 * 2),
  ('pacific_summit', 3, 'Marco', 'Bellini', 'mbellini@example.com', '(510) 555-0185', 'Branch Manager, Fruitvale', array['intern_supervisor'], null, false, -365),
  ('kinetic', 1, 'Priscilla', 'Gomez', 'pgomez@example.com', '(415) 555-0186', 'Head of Social Impact', array['champion'], 'Owns the pledge and the mentor program.', true, -365 * 2),
  ('kinetic', 2, 'Tyler', 'Brandt', 'tbrandt@example.com', '(415) 555-0187', 'IT Support Manager', array['hiring_manager'], 'Amara Johnson''s manager. Wants two more referrals from Cohort 7.', false, -365),
  ('kinetic', 3, 'Naomi', 'Fujita', 'nfujita@example.com', '(415) 555-0188', 'Employee Volunteer Lead', array['mentors'], '12 Kinetic mentors this year.', false, -300),
  ('harbor', 1, 'Monique', 'Jackson', 'monique.jackson@example.com', '(510) 555-0107', 'VP, Community Health (board)', array['champion','board'], null, true, -365 * 2),
  ('harbor', 2, 'Carmen', 'Ibarra', 'cibarra@example.org', '(510) 555-0189', 'Clinical Education Manager', array['clinical'], 'Supervises the healthcare fellows'' clinical rotations.', false, -365),
  ('harbor', 3, 'Derek', 'Lyons', 'dlyons@example.org', '(510) 555-0190', 'Talent Acquisition Partner', array['hiring_manager'], null, false, -120),
  ('redline', 1, 'Tom', 'Brennan', 'tbrennan@example.com', '(510) 555-0191', 'Field Operations Manager', array['champion'], 'Hosts the job-site visits. Referred Jalen Price.', true, -365 * 2),
  ('redline', 2, 'Luz', 'Mendoza', 'lmendoza@example.com', '(510) 555-0192', 'Safety & Training Coordinator', array['training'], 'Schedules OSHA-10 for the trades fellows.', false, -365),
  ('redline', 3, 'Frank', 'DeLuca', 'fdeluca@example.com', '(510) 555-0193', 'Site Superintendent', array['site_supervisor'], null, false, -200),
  ('library', 1, 'Grace', 'Okonkwo', 'gokonkwo@example.org', '(510) 555-0194', 'Teen Services Manager', array['champion'], 'Hosts library-aide interns and the FAFSA nights.', true, -365 * 3),
  ('library', 2, 'Eli', 'Navarro', 'enavarro@example.org', '(510) 555-0195', 'Branch Manager, Main Library', array[]::text[], null, false, -365),
  ('fruit_center', 1, 'Hector', 'Ruiz', 'hruiz@example.org', '(510) 555-0196', 'Program Director', array['champion'], 'Signs the MOU; renewal in draft.', true, -365 * 3),
  ('fruit_center', 2, 'Sandra', 'Lowe', 'slowe@example.org', '(510) 555-0197', 'Facilities & Rentals Coordinator', array['facilities'], 'Room bookings and storage.', false, -365),
  ('casa_alvarez', 1, 'Ricardo', 'Alvarez', 'ricardo.alvarez@example.com', '(510) 555-0134', 'Owner', array['champion','donor'], 'Also a gala table host.', true, -365 * 2),
  ('casa_alvarez', 2, 'Marisa', 'Quintero', 'mquintero@example.com', '(341) 555-0110', 'General Manager, Fruitvale location', array['intern_supervisor'], null, false, -365),
  ('lakeshore_cu', 1, 'Carla', 'Whitfield', 'cwhitfield@example.com', '(341) 555-0111', 'Member Services Manager', array['champion','intern_supervisor'], null, true, -365 * 3),
  ('lakeshore_cu', 2, 'Howard', 'Kwan', 'hkwan@example.com', '(341) 555-0112', 'VP, Community Relations', array['executive'], null, false, -365),
  ('oakhaven_medical', 1, 'Farah', 'Siddiqui', 'fsiddiqui@example.com', '(341) 555-0113', 'Clinic Operations Director', array['champion'], 'Signs the host agreement.', true, -365 * 2),
  ('oakhaven_medical', 2, 'Joanne', 'Petrakis', 'jpetrakis@example.com', '(341) 555-0114', 'Practice Manager', array['intern_supervisor'], 'Coordinates the medical-assistant externships.', false, -365),
  ('brightline_solar', 1, 'Wesley', 'Grant', 'wgrant@example.com', '(341) 555-0115', 'Install Operations Manager', array['champion','hiring_manager'], null, true, -365 * 2),
  ('brightline_solar', 2, 'Nina', 'Okoye', 'nokoye@example.com', '(341) 555-0116', 'HR Coordinator', array['hr'], 'Timesheets and evaluations.', false, -365),
  ('port_city', 1, 'Angela', 'Moreno', 'amoreno@example.com', '(341) 555-0117', 'HR Business Partner', array['champion'], null, true, -365 * 4),
  ('port_city', 2, 'Raul', 'Espinoza', 'respinoza@example.com', '(341) 555-0118', 'Warehouse Operations Supervisor', array['intern_supervisor'], null, false, -365),
  ('tidewater', 1, 'Paul', 'Nakashima', 'pnakashima@example.com', '(341) 555-0119', 'Principal Engineer', array['champion'], null, true, -365 * 3),
  ('tidewater', 2, 'Irene', 'Kowalski', 'ikowalski@example.com', '(341) 555-0120', 'Office Manager', array['operations'], 'Handles the host agreement paperwork.', false, -365),
  ('bayline_electric', 1, 'Rosalind', 'Pierce', 'rpierce@example.com', '(341) 555-0121', 'Apprenticeship Coordinator', array['champion','hiring_manager'], null, true, -365 * 2),
  ('bayline_electric', 2, 'Gary', 'Lindholm', 'glindholm@example.com', '(341) 555-0122', 'Owner', array['executive'], null, false, -365 * 2),
  ('fruitvale_dental', 1, 'Ana', 'Lucero', 'alucero@example.com', '(341) 555-0123', 'Practice Owner', array['champion'], null, true, -365 * 2),
  ('fruitvale_dental', 2, 'Yesica', 'Duarte', 'yduarte@example.com', '(341) 555-0124', 'Office Manager', array['intern_supervisor'], null, false, -365),
  ('mosaic_media', 1, 'Devon', 'Ashby', 'dashby@example.com', '(341) 555-0125', 'Creative Director', array['champion'], null, true, -365),
  ('evergreen_senior', 1, 'Patricia', 'Lomeli', 'plomeli@example.com', '(341) 555-0126', 'Director of Nursing', array['champion','hiring_manager'], 'Hires CNAs directly from the healthcare track.', true, -365 * 2),
  ('evergreen_senior', 2, 'Samuel', 'Adeyemi', 'sadeyemi@example.com', '(341) 555-0127', 'Executive Director', array['executive'], null, false, -365),
  ('bytebridge', 1, 'Sanjay', 'Mehta', 'smehta@example.com', '(341) 555-0128', 'Service Desk Manager', array['champion','hiring_manager'], null, true, -365 * 2),
  ('bytebridge', 2, 'Kristen', 'Shaw', 'kshaw@example.com', '(341) 555-0129', 'Recruiting Lead', array['hr'], null, false, -365),
  ('lumen', 1, 'Erica', 'Lindqvist', 'elindqvist@example.com', '(415) 555-0130', 'People Operations Lead', array['champion'], null, true, -365),
  ('estuary_hotel', 1, 'Gloria', 'Benitez', 'gbenitez@example.com', '(341) 555-0131', 'General Manager', array['champion'], null, true, -365 * 3),
  ('estuary_hotel', 2, 'Felix', 'Romano', 'fromano@example.com', '(341) 555-0132', 'Front Office Manager', array['intern_supervisor'], null, false, -365),
  ('baycrest_animal', 1, 'Helen', 'Choi', 'hchoi@example.com', '(341) 555-0133', 'Medical Director', array['champion'], null, true, -365),
  ('westside_auto', 1, 'Rudy', 'Castaneda', 'rcastaneda@example.com', '(341) 555-0134', 'Shop Owner', array['champion'], null, true, -365 * 2),
  ('skyline_data', 1, 'Monica', 'Ferreira', 'mferreira@example.com', '(341) 555-0135', 'Site Operations Manager', array['champion'], 'Met at the Eastshore WDB employer breakfast.', true, -9),
  ('cornerstone_supply', 1, 'Jerome', 'Whitley', 'jwhitley@example.com', '(341) 555-0136', 'Branch Manager', array['champion'], null, true, -17),
  ('metro_print', 1, 'Steve', 'Albright', 'salbright@example.com', '(341) 555-0137', 'Owner', array['champion'], 'Relocated to Sacramento.', true, -365 * 5),
  ('bridgeway', 1, 'Yolanda', 'Banks', 'ybanks@example.org', '(341) 555-0138', 'Youth Case Management Lead', array['champion','referrals'], 'Sends referrals with signed consent forms.', true, -365 * 4),
  ('bridgeway', 2, 'Terrence', 'Holt', 'tholt@example.org', '(341) 555-0139', 'Executive Director', array['executive'], null, false, -365 * 2),
  ('open_table', 1, 'Kimberly', 'Ngata', 'kngata@example.org', '(341) 555-0140', 'Programs Coordinator', array['champion'], null, true, -365 * 2),
  ('eastshore_cc', 1, 'Raymond', 'Ellison', 'rellison@example.org', '(341) 555-0141', 'Dean, Workforce Programs', array['champion','executive'], null, true, -365 * 6),
  ('eastshore_cc', 2, 'Joy', 'Mbatha', 'jmbatha@example.org', '(341) 555-0142', 'CNA Program Director', array['instructor'], 'Schedules the CNA skills exam and practice labs.', false, -365 * 2),
  ('eastshore_cc', 3, 'Chris', 'Albers', 'calbers@example.org', '(341) 555-0143', 'IT Certification Instructor', array['instructor'], 'Teaches the CompTIA A+ prep for the IT fellows.', false, -365),
  ('marina_gate', 1, 'Teresa', 'Vu', 'tvu@example.org', '(341) 555-0144', 'Assistant Principal', array['champion'], null, true, -15),
  ('rising_roots', 1, 'Asha', 'Delacroix', 'asha@example.org', '(341) 555-0145', 'Founder & Director', array['champion'], null, true, -3),
  ('harmony_arts', 1, 'Owen', 'Castillo', 'ocastillo@example.org', '(341) 555-0146', 'School Counselor', array['champion'], null, true, -1)
) as v(pk, n, fn, ln, email, phone, title, tags, notes, is_primary, created);

-- Activity timeline. occurred_at is a Pacific wall-clock time relative to the
-- anchor; the latest touch per partner becomes its last_touch_at.
create temp table nb5_ints on commit drop as
select row_number() over () as n, * from (values
  ('eastlake', 1, 'meeting', pg_temp.ts(-6, '15:10'), 'rosa', 'Monthly site check-in with Tamika. Roster is at 42 with two on a waitlist. She will hold Room 204 until 6pm on Wednesdays so seniors can stay for college applications.'),
  ('eastlake', 2, 'email', pg_temp.ts(-19, '10:25'), 'rosa', 'Sent Lorraine the list of 14 seniors who still need FAFSA help. She is booking them into the library FAFSA nights.'),
  ('eastlake', 1, 'meeting', pg_temp.ts(-34, '14:00'), 'rosa', 'Fall walkthrough: data-sharing agreement on file, sign-in binder retired in favor of the BloomOS roster, two Kinetic volunteer tutors confirmed for Tuesdays.'),
  ('eastlake', 3, 'call', pg_temp.ts(-46, '09:40'), 'rosa', 'Sorted after-hours custodial coverage and room keys for Mon–Thu sessions.'),
  ('eastlake', 1, 'meeting', pg_temp.ts(pg_temp.nb5_sy(-20), '11:00'), 'miguel', 'Annual planning with Tamika: target 42 students, keep Industry Thursdays, add a spring family night.'),
  ('eastlake', 1, 'event', pg_temp.ts(pg_temp.nb5_sw(-30), '17:30'), 'rosa', 'Spring showcase: 11 seniors presented their career plans to families and the principal.'),
  ('laurel', 1, 'email', pg_temp.ts(-1, '19:20'), 'rosa', 'Jason sent the seventh-period athletics list and the updated bell schedule. Cross-checking it against our absence list before Thursday.'),
  ('laurel', 2, 'meeting', pg_temp.ts(-3, '13:30'), 'rosa', 'Met Dr. Ayala about the attendance dip. Since the bell schedule changed, dismissal is 3:35, so students reach the library 15 to 20 minutes late and several now leave for jobs. Proposed a 4:00 start Tue–Thu with a snack; she is taking it to the principal Friday.'),
  ('laurel', 1, 'call', pg_temp.ts(-10, '16:05'), 'rosa', 'Flagged three students with repeat absences, including David Tran. Jason is looping in counselors and will call home.'),
  ('laurel', 1, 'email', pg_temp.ts(-22, '08:15'), 'rosa', 'Laurel Ridge announced a new bell schedule starting Monday. Moved our start to 3:45 to match dismissal.'),
  ('laurel', 3, 'email', pg_temp.ts(-30, '12:00'), 'rosa', 'Renee referred two juniors who want help with summer job applications.'),
  ('laurel', 1, 'meeting', pg_temp.ts(pg_temp.nb5_sy(-18), '10:30'), 'rosa', 'Fall kickoff: library confirmed Mon–Thu, 38 seats, counselor referrals open.'),
  ('bayshore', 1, 'meeting', pg_temp.ts(-10, '14:45'), 'rosa', 'Quarterly check-in with Dr. Coleman. Attendance holding near 88%. She wants Launchpad seniors to present at the January family night.'),
  ('bayshore', 2, 'email', pg_temp.ts(-24, '11:10'), 'rosa', 'Andres referred three 9th graders; enrollment packets went home with guardian contact forms.'),
  ('bayshore', 3, 'call', pg_temp.ts(-38, '09:15'), 'rosa', 'Confirmed Room 12 for the year and the late-bus pass list for Launchpad students.'),
  ('bayshore', 1, 'meeting', pg_temp.ts(pg_temp.nb5_sy(-15), '13:00'), 'miguel', 'Third-year renewal: MOU and data agreement signed. Dr. Coleman asked for a mid-year outcomes summary.'),
  ('sanleandro', 1, 'email', pg_temp.ts(-8, '17:05'), 'miguel', 'Sent Laura the pilot MOU draft and a one-page budget for a fourth Launchpad site next fall. She takes it to the superintendent''s cabinet next week.'),
  ('sanleandro', 2, 'meeting', pg_temp.ts(-15, '10:00'), 'remi', 'Pilot design meeting with Laura Kim and Dr. Hale: one high school (Marina Gate) next fall, about 45 students, district provides space and a teacher-liaison stipend. The remaining gap is roughly $140K, which the Meridian proposal would cover in year one.'),
  ('sanleandro', 3, 'meeting', pg_temp.ts(-29, '15:30'), 'miguel', 'Laura and Paula visited Launchpad at Eastlake and sat in on Industry Thursday. Paula wants the pilot aligned with the district''s CTE pathways.'),
  ('sanleandro', 1, 'call', pg_temp.ts(-44, '11:30'), 'remi', 'Intro call with Laura Kim, made by Dr. Freeman. The district wants an after-school career program at one high school next year.'),
  ('pacific_summit', 1, 'meeting', pg_temp.ts(-12, '12:00'), 'priya', 'Summer Works debrief and next-summer planning with Daniel and Lauren. The bank wants 10 interns next summer (up from 8) and a financial-literacy workshop. Priya is drafting the $60K renewal.'),
  ('pacific_summit', 2, 'email', pg_temp.ts(-37, '09:50'), 'simone', 'Sent intern outcome summaries: 8 of 8 completed; two were offered part-time teller roles for the school year.'),
  ('pacific_summit', 3, 'meeting', pg_temp.ts(pg_temp.nb5_sw(24), '11:00'), 'simone', 'Mid-summer check-in at the Fruitvale branch. All 8 interns on track; Marco singled out Luis Ortega for running the lobby greeter rotation.'),
  ('pacific_summit', 1, 'event', pg_temp.ts(pg_temp.nb5_sw(0), '09:30'), 'simone', 'Daniel welcomed the Summer Works cohort at orientation as presenting sponsor.'),
  ('pacific_summit', 1, 'call', pg_temp.ts(-140, '14:00'), 'priya', 'Daniel confirmed the $50K presenting sponsorship; payment processed this week.'),
  ('kinetic', 3, 'email', pg_temp.ts(-27, '10:40'), 'simone', 'Naomi confirmed 12 Kinetic mentors for this year''s Mentor Circles and sent the background-check roster.'),
  ('kinetic', 1, 'meeting', pg_temp.ts(-30, '13:00'), 'priya', 'Quarterly partnership check-in. First pledge installment received. Kinetic will interview two Cohort 7 IT fellows for spring help-desk roles.'),
  ('kinetic', 2, 'email', pg_temp.ts(-58, '16:20'), 'andre', '90-day check-in on Amara Johnson. Tyler called her one of the strongest first-year techs on the team and asked for two more referrals from Cohort 7.'),
  ('kinetic', 2, 'call', pg_temp.ts(-95, '11:15'), 'andre', 'Amara Johnson accepted the IT help-desk technician offer at $28/hr. Starts in two weeks.'),
  ('harbor', 2, 'meeting', pg_temp.ts(-9, '10:00'), 'andre', 'Clinical rotation check-in for the 12 healthcare fellows. Keisha Brown is on track for her CNA exam; Carmen offered a skills-lab practice session the week before.'),
  ('harbor', 1, 'email', pg_temp.ts(-40, '15:30'), 'remi', 'Community-benefit grant payment received. Remi sent Monique a thank-you and a photo from the healthcare track.'),
  ('harbor', 3, 'meeting', pg_temp.ts(-55, '14:00'), 'andre', 'Hiring pipeline conversation: Harbor wants first look at Cohort 7 CNA graduates for its float pool.'),
  ('harbor', 2, 'meeting', pg_temp.ts(pg_temp.nb5_sw(10), '09:00'), 'simone', 'Summer Works patient-services interns started at the North Oakland campus.'),
  ('redline', 1, 'meeting', pg_temp.ts(-22, '09:30'), 'andre', 'Job-site visit at the Embarcadero project with the 10 trades fellows. Tom referred Jalen Price, a laborer on the crew, to apply for Cohort 8.'),
  ('redline', 2, 'email', pg_temp.ts(-62, '10:00'), 'andre', 'Luz confirmed OSHA-10 dates for the Cohort 7 trades fellows.'),
  ('redline', 1, 'email', pg_temp.ts(-75, '13:20'), 'priya', '$25K gift received. Tom asked for a photo of the fellows for the company newsletter.'),
  ('library', 1, 'email', pg_temp.ts(-16, '11:45'), 'rosa', 'Confirmed two FAFSA nights at the main branch: ' || to_char(pg_temp.d(9), 'Mon FMDD') || ' and ' || to_char(pg_temp.d(16), 'Mon FMDD') || '. Grace is providing laptops and a Spanish-speaking volunteer.'),
  ('library', 1, 'meeting', pg_temp.ts(-50, '14:30'), 'simone', 'Summer Works wrap with Grace: all 8 library-aide interns completed. She wants 10 next summer.'),
  ('library', 2, 'event', pg_temp.ts(pg_temp.nb5_sw(31), '18:00'), 'simone', 'Hosted the mid-summer intern showcase in the community room.'),
  ('fruit_center', 2, 'call', pg_temp.ts(-6, '10:20'), 'simone', 'Sandra confirmed the second-Tuesday room booking through June and storage for circle supplies.'),
  ('fruit_center', 1, 'email', pg_temp.ts(-14, '16:40'), 'tasha', 'MOU renewal: Hector sent the center''s updated insurance requirements. Tasha is drafting the renewal with the new rental rate.'),
  ('fruit_center', 1, 'event', pg_temp.ts(pg_temp.nb5_mc_kickoff() - pg_temp.nb_anchor(), '18:00'), 'simone', 'Mentor Circles kickoff and match night: 46 youth and 44 mentors in the main hall.'),
  ('fruit_center', 1, 'meeting', pg_temp.ts(pg_temp.nb5_sy(-25), '11:00'), 'simone', 'Planning for the year: second Tuesdays, 6 to 7:30pm. Hector asked us to update the MOU with the new rental rate.'),
  ('casa_alvarez', 1, 'call', pg_temp.ts(-12, '15:00'), 'simone', 'Renewal call with Ricardo. He will host 6 interns again and wants one in the back office. The host agreement ends soon; renewal on its way.'),
  ('casa_alvarez', 2, 'meeting', pg_temp.ts(pg_temp.nb5_sw(17), '14:00'), 'simone', 'Mid-summer site visit at the Fruitvale location. Interns rotating front of house, kitchen prep, and inventory.'),
  ('casa_alvarez', 1, 'event', pg_temp.ts(-165, '18:30'), 'priya', 'Ricardo hosted a table at the gala and pitched other restaurant owners on hosting interns.'),
  ('lakeshore_cu', 1, 'email', pg_temp.ts(-20, '09:30'), 'simone', 'Carla offered a financial-coaching session for Pathways fellows; scheduling it for a Friday in November.'),
  ('lakeshore_cu', 1, 'meeting', pg_temp.ts(pg_temp.nb5_sw(20), '11:00'), 'simone', 'Mid-summer check-in: four member-services interns, all on track.'),
  ('oakhaven_medical', 1, 'email', pg_temp.ts(-8, '13:15'), 'simone', 'Sent the host-agreement renewal for next summer. Dr. Siddiqui will sign after their budget meeting.'),
  ('oakhaven_medical', 2, 'call', pg_temp.ts(-33, '10:45'), 'andre', 'Joanne confirmed two medical-assistant externships for Cohort 7 starting in January.'),
  ('oakhaven_medical', 1, 'meeting', pg_temp.ts(pg_temp.nb5_sw(18), '15:00'), 'simone', 'Summer check-in at the clinic: front-desk interns learning scheduling and intake.'),
  ('brightline_solar', 1, 'call', pg_temp.ts(-25, '14:30'), 'andre', 'Wesley wants two Cohort 7 trades fellows for spring install crews once OSHA-10 is done.'),
  ('brightline_solar', 2, 'email', pg_temp.ts(pg_temp.nb5_sw(40), '10:00'), 'simone', 'Nina sent final timesheets and supervisor evaluations for the four interns.'),
  ('port_city', 1, 'meeting', pg_temp.ts(-5, '11:30'), 'simone', 'Next-summer planning with Angela: five warehouse operations slots plus one IT role. She asked for interns 18+ for forklift certification.'),
  ('port_city', 2, 'call', pg_temp.ts(pg_temp.nb5_sw(15), '08:45'), 'simone', 'Raul reported a safety-orientation gap for two interns; we added a refresher at the Friday workshop.'),
  ('tidewater', 1, 'email', pg_temp.ts(-48, '16:00'), 'simone', 'Thank-you note and intern evaluations sent. Paul is open to hosting again, but the host agreement needs renewal first.'),
  ('tidewater', 1, 'meeting', pg_temp.ts(pg_temp.nb5_sw(22), '12:00'), 'simone', 'Site visit: three engineering interns working on a stormwater survey.'),
  ('bayline_electric', 1, 'call', pg_temp.ts(-18, '09:00'), 'andre', 'Rosalind will interview two Cohort 7 trades fellows for apprentice spots after OSHA-10.'),
  ('bayline_electric', 2, 'email', pg_temp.ts(pg_temp.nb5_sw(41), '14:10'), 'simone', 'Gary thanked us for the summer helpers and asked to stay on the host list.'),
  ('fruitvale_dental', 1, 'meeting', pg_temp.ts(-62, '12:30'), 'simone', 'End-of-summer debrief; Dr. Lucero will take two interns again.'),
  ('mosaic_media', 1, 'email', pg_temp.ts(-55, '10:00'), 'simone', 'Devon sent the interns'' portfolio pieces for the year-end appeal; Jordan has them.'),
  ('evergreen_senior', 1, 'call', pg_temp.ts(-11, '13:00'), 'andre', 'Patricia hired two Cohort 6 CNAs this summer and wants first look at Cohort 7''s healthcare fellows in spring.'),
  ('evergreen_senior', 2, 'meeting', pg_temp.ts(pg_temp.nb5_sw(25), '10:30'), 'simone', 'Samuel toured with the four Summer Works resident-care aides; all completed food-handler cards.'),
  ('bytebridge', 1, 'call', pg_temp.ts(-26, '15:45'), 'andre', 'Sanjay confirmed all three Cohort 6 hires are past probation. He wants to interview Cohort 7 IT fellows in March.'),
  ('bytebridge', 2, 'email', pg_temp.ts(-80, '09:20'), 'andre', 'Kristen sent offer letters for two help-desk technicians from Cohort 6.'),
  ('lumen', 1, 'email', pg_temp.ts(-66, '11:00'), 'simone', 'Erica sent intern evaluations and is considering a fall internship for one Pathways fellow.'),
  ('estuary_hotel', 1, 'meeting', pg_temp.ts(-71, '15:00'), 'simone', 'End-of-summer debrief with Gloria: four interns completed, one hired part-time at the front desk.'),
  ('baycrest_animal', 1, 'email', pg_temp.ts(-69, '09:45'), 'simone', 'Dr. Choi sent thank-you notes for both interns.'),
  ('westside_auto', 1, 'call', pg_temp.ts(-74, '16:30'), 'simone', 'Rudy will host again if we can send interns with a driver''s license.'),
  ('skyline_data', 1, 'email', pg_temp.ts(-2, '14:20'), 'miguel', 'Sent the partnership one-pager and Cohort 6 placement numbers. Site tour pencilled in for next month.'),
  ('skyline_data', 1, 'meeting', pg_temp.ts(-9, '08:00'), 'miguel', 'Met Monica at the Eastshore WDB employer breakfast. Interested in two IT fellows and three Summer Works interns.'),
  ('cornerstone_supply', 1, 'call', pg_temp.ts(-17, '10:30'), 'simone', 'Call from the Summer Works employer list. Jerome is interested in warehouse and counter-sales interns at the San Leandro branch.'),
  ('metro_print', 1, 'email', pg_temp.ts(-240, '12:00'), 'simone', 'Steve let us know the shop is relocating to Sacramento; no interns this summer. Keep warm for referrals.'),
  ('bridgeway', 1, 'email', pg_temp.ts(-2, '09:10'), 'andre', 'Yolanda referred two young adults for Cohort 8 and asked about childcare support for Friday cohort days.'),
  ('bridgeway', 2, 'meeting', pg_temp.ts(-41, '14:00'), 'miguel', 'Annual referral-partner meeting: Bridgeway referred 9 participants last year. Consent form for data sharing updated.'),
  ('open_table', 1, 'call', pg_temp.ts(-13, '11:20'), 'rosa', 'Kimberly will drop weekly snack boxes at Laurel Ridge to support the later start time.'),
  ('open_table', 1, 'meeting', pg_temp.ts(-52, '10:00'), 'tasha', 'Set up monthly grocery cards for families flagged with food needs.'),
  ('eastshore_cc', 2, 'meeting', pg_temp.ts(-7, '13:00'), 'andre', 'Joy confirmed the CNA exam date for the healthcare fellows: ' || to_char(pg_temp.d(30), 'Mon FMDD') || '. Skills lab open the week before.'),
  ('eastshore_cc', 3, 'email', pg_temp.ts(-19, '15:30'), 'andre', 'Chris shared A+ Core 1 practice scores for the IT fellows; four below 70% get extra lab hours.'),
  ('eastshore_cc', 1, 'meeting', pg_temp.ts(pg_temp.nb5_sy(-30), '10:00'), 'miguel', 'Renewed the training agreement for Cohort 7: CNA, CompTIA A+, and OSHA-10 / NCCER Core.'),
  ('marina_gate', 1, 'meeting', pg_temp.ts(-15, '14:30'), 'remi', 'Joined the San Leandro pilot meeting. Teresa offered the career center for Mon–Thu sessions if the pilot is approved.'),
  ('rising_roots', null, 'note', pg_temp.ts(-3, '20:10'), null, 'Signed up through the program-partner form: youth arts and leadership program in West Oakland, 25 to 50 teens. Wants to co-host a career night.'),
  ('harmony_arts', null, 'note', pg_temp.ts(-1, '21:05'), null, 'Signed up through the program-partner form: counselor at a downtown arts high school, 50 to 100 teens. Referred by Dr. Freeman.')
) as v(pk, cn, kind, at, by_, notes);

insert into public.partners
  (id, org_id, constituent_id, name, kind, status, champion_name, champion_email, champion_role,
   teen_count, program_type, mou_status, mou_start, mou_end, data_agreement_signed, referral, notes,
   last_touch_at, external_source, city, region, domain, priority_score, score_factors, created_at, updated_at)
select pg_temp.nb_id('partner:' || p.k), pg_temp.nb_org(),
       case when p.con is null then null else pg_temp.nb_id('con:' || p.con) end,
       p.n, p.kind, p.status, p.champ, p.champ_email, p.champ_role, p.teens, p.ptype, p.mou,
       case when p.mou_s is null then null else pg_temp.d(p.mou_s) end,
       case when p.mou_e is null then null else pg_temp.d(p.mou_e) end,
       case when p.dsa is null then null else pg_temp.d(p.dsa) end,
       p.referral, p.notes,
       (select max((i.at at time zone 'America/Los_Angeles')::date) from nb5_ints i where i.pk = p.k),
       p.src, p.city, p.region, p.domain,
       case when p.rubric is null then null else pg_temp.nb5_score(p.rubric) end,
       case when p.rubric is null then null else pg_temp.nb5_rubric(p.rubric) end,
       pg_temp.ts(p.created, '10:00'),
       coalesce((select max(i.at) from nb5_ints i where i.pk = p.k), pg_temp.ts(p.created, '10:00'))
from nb5_partner_new p
on conflict do nothing;

-- Anchors: rubric, website, and last touch from the activity timeline (this
-- org's rows only).
update public.partners p
set score_factors  = pg_temp.nb5_rubric(a.rubric),
    priority_score = pg_temp.nb5_score(a.rubric),
    domain         = a.domain,
    last_touch_at  = (select max((i.at at time zone 'America/Los_Angeles')::date) from nb5_ints i where i.pk = a.k)
from nb5_partner_anchor a
where p.org_id = pg_temp.nb_org()
  and p.id = pg_temp.nb_id('partner:' || a.k)
  and (p.score_factors is distinct from pg_temp.nb5_rubric(a.rubric)
       or p.domain is distinct from a.domain
       or p.last_touch_at is distinct from (select max((i.at at time zone 'America/Los_Angeles')::date) from nb5_ints i where i.pk = a.k));

insert into public.partner_contacts
  (id, org_id, partner_id, first_name, last_name, email, phone, title, tags, notes, is_primary,
   last_touch_at, created_at, updated_at)
select pg_temp.nb_id('pcontact:' || c.pk || ':' || c.n), pg_temp.nb_org(), pg_temp.nb_id('partner:' || c.pk),
       c.fn, c.ln, c.email, c.phone, c.title, c.tags, c.notes, c.is_primary,
       (select max((i.at at time zone 'America/Los_Angeles')::date) from nb5_ints i where i.pk = c.pk and i.cn = c.n),
       pg_temp.ts(c.created, '10:00'),
       coalesce((select max(i.at) from nb5_ints i where i.pk = c.pk and i.cn = c.n), pg_temp.ts(c.created, '10:00'))
from nb5_contacts c
on conflict do nothing;

insert into public.partner_interactions
  (id, org_id, partner_id, contact_id, kind, occurred_at, notes, logged_by, created_at)
select pg_temp.nb_id('pint:' || i.pk || ':' || i.n), pg_temp.nb_org(), pg_temp.nb_id('partner:' || i.pk),
       case when i.cn is null then null else pg_temp.nb_id('pcontact:' || i.pk || ':' || i.cn) end,
       i.kind, i.at, i.notes, i.by_, i.at + interval '20 minutes'
from nb5_ints i
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- PARTICIPANTS — the plan (temp), then students
-- ════════════════════════════════════════════════════════════════════════════
-- Bulk participants b001…b267 by index range (named five are the anchors):
--   001–040 Launchpad Eastlake · 041–076 Laurel Ridge · 077–116 Bayshore
--   117–118 Launchpad late enrollees (accepted applications)
--   119–122 Launchpad withdrawn this fall
--   123–157 Pathways 7 fellows · 158–159 Pathways 7 withdrawn
--   160–192 Pathways 6 graduates · 193–198 Pathways 6 withdrawn
--   199–201 Summer Works withdrawn · 202–247 Summer Works completers (not in
--     another program now; 202–217 also Mentor Circles, 218–222 applied to
--     Cohort 8, 223–224 accepted early into Cohort 8)
--   248–281 Mentor Circles only (272–281 joined in October, awaiting a match)
--   282–289 inquiries
-- Mentor Circles roster: 58 (48 matched + 10 awaiting a mentor), mostly youth
-- not in another program, so ~208 participants are in the enrolled stage.
create temp table nb5_people on commit drop as
with nm as (
  select array[
    'Aaliyah','Jamal','Imani','Darius','Malik','Zuri','Tyrese','Kiara','Jasmine','Marcus','Destiny','Isaiah','Aniyah','Terrell','Ebony','Khalil','Brianna','DeShawn','Tiana','Xavier',
    'Rashad','Amani','Kendrick','Taliyah','Elijah','Laila','Micah','Josiah','Precious','Trevon','Ayanna','Desmond','Keon','Jada','Mateo','Sofia','Diego','Valeria','Carlos','Camila',
    'Alejandro','Ximena','Javier','Daniela','Adrian','Lucia','Emilio','Gabriela','Andres','Mariana','Jesus','Isabella','Natalia','Fernando','Paola','Cristian','Yesenia','Joaquin','Leticia','Marco',
    'Alondra','Rafael','Esmeralda','Santiago','Guadalupe','Itzel','Brandon','Karla','Oscar','Viviana','Ivan','Jazmin','Minh','Kevin','Mei','Bao','Vivian','Tuan','Jenny','Sokha',
    'Arjun','Hana','Ethan','Kalani','Leilani','Tevita','Mele','Ryan','Annie','Phuong','Huy','Thao','Sione','Malia','Noah','Ava','Liam','Chloe','Owen','Maya',
    'Caleb','Zoe','Nathan','Ella','Gabriel','Hannah','Lucas','Riley','Yusuf','Amira','Omar','Layla','Abdi','Hodan','Kofi','Ama','Tariq','Samira','Selam','Dawit'] f,
  array[
    'Williams','Jones','Davis','Harris','Robinson','Walker','Thomas','Moore','Taylor','Lewis','Allen','Young','King','Wright','Scott','Green','Baker','Adams','Nelson','Carter',
    'Turner','Phillips','Campbell','Parker','Evans','Edwards','Collins','Stewart','Morris','Rogers','Cook','Murphy','Bailey','Cooper','Richardson','Howard','Ward','Peterson','Gray','James',
    'Watson','Sanders','Bennett','Barnes','Ross','Henderson','Jenkins','Perry','Powell','Hughes','Garcia','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Perez','Sanchez','Ramirez','Torres',
    'Rivera','Diaz','Cruz','Morales','Reyes','Gutierrez','Chavez','Mendoza','Castillo','Vargas','Romero','Herrera','Medina','Aguilar','Vasquez','Castro','Jimenez','Moreno','Salazar','Contreras',
    'Navarro','Rojas','Soto','Avila','Cervantes','Ochoa','Zamora','Nguyen','Le','Pham','Huynh','Vo','Wong','Lee','Kim','Liu','Huang','Lam','Chan','Truong',
    'Dang','Saechao','Saelee','Phan','Tupou','Fifita','Fonoti','Mahe','Vea','Singh','Kaur','Mensah','Abebe','Tesfaye','Haile','Hassan','Ali','Mohamed','Farah'] l,
  array[
    'Patricia','Yolanda','Teresa','Gloria','Angela','Michelle','Sandra','Veronica','Lakisha','Tonya','Rosalinda','Maribel','Thuy','Lan','Mai','Fatima','Hawa','Lupe','Robert','Anthony',
    'Raymond','Curtis','Gerardo','Jose','Ernesto','Hung','Darnell','Cynthia','Renee','Carmen','Silvia','Norma','Diane','Felicia','Shanice','Latoya','Esperanza','Beatriz','Ngoc','Hien',
    'Mulu','Tigist','Salote','Ana','Rochelle','Bernard','Leonard','Miriam','Sergio','Wanda'] g
),
b as (
  select i, 'b' || lpad(i::text, 3, '0') as k,
         case when i <= 40 then 'lp' when i <= 76 then 'lp' when i <= 116 then 'lp'
              when i <= 118 then 'lp_late' when i <= 122 then 'lp_drop'
              when i <= 157 then 'pw7' when i <= 159 then 'pw7_drop'
              when i <= 192 then 'pw6' when i <= 198 then 'pw6_drop'
              when i <= 201 then 'sw_drop' when i <= 247 then 'sw' when i <= 281 then 'mc' else 'inq' end as seg,
         case when i <= 40 or i in (117, 119) then 'eastlake'
              when i <= 76 or i in (118, 120, 121) then 'laurel'
              when i <= 116 or i = 122 then 'bayshore' end as site,
         nm.f[1 + (i * 7) % array_length(nm.f, 1)] as fn,
         nm.l[1 + (i * 11 + i / array_length(nm.f, 1)) % array_length(nm.l, 1)] as ln,
         nm.g[1 + (i * 13) % array_length(nm.g, 1)] as gfn,
         nm.l[1 + (i * 29 + 5) % array_length(nm.l, 1)] as gln_alt
  from generate_series(1, 289) i, nm
),
b2 as (
  select b.*,
         -- grade (Launchpad 9–12; late enrollees are underclassmen)
         case when seg in ('lp', 'lp_drop') then (9 + i % 4)::text
              when seg = 'lp_late' then case when i = 117 then '9' else '10' end
              when seg in ('pw7', 'pw7_drop', 'pw6', 'pw6_drop') then case when pg_temp.rnd('pse:' || k) < 0.3 then 'Post-secondary' else 'Not in school' end
              when seg in ('sw', 'sw_drop') then case when pg_temp.rnd('swg:' || k) < 0.35 then '12' when pg_temp.rnd('swg:' || k) < 0.55 then 'Post-secondary' else 'Not in school' end
              when seg = 'mc' then (array['10','11','12','12','Not in school'])[1 + (i % 5)]
              else (array['9','10','11','12','Not in school','Post-secondary'])[1 + (i % 6)] end as grade,
         -- Pathways tracks: P7 IT 14 / healthcare 12 / trades 10 (with Keisha); P6 IT 13 / HC 11 / trades 10 (with Amara)
         case when seg = 'pw7' then case when i - 122 <= 14 then 'IT support' when i - 122 <= 25 then 'Healthcare' else 'Building trades' end
              when seg = 'pw7_drop' then case when i = 158 then 'IT support' else 'Building trades' end
              when seg = 'pw6' then case when i - 159 <= 12 then 'IT support' when i - 159 <= 23 then 'Healthcare' else 'Building trades' end
              when seg = 'pw6_drop' then (array['IT support','Healthcare','Building trades'])[1 + i % 3] end as pw_track
  from b
),
-- Summer Works picks among current Launchpad juniors/seniors (27) and the
-- first 11 Pathways 7 fellows (the summer-to-fellowship pipeline).
lp_sw as (
  select k from (select k, row_number() over (order by pg_temp.rnd('lpsw:' || k)) rn
                 from b2 where seg = 'lp' and grade in ('11', '12')) x where rn <= 27
),
lp_mc as (
  select k from (select k, row_number() over (order by pg_temp.rnd('lpmc:' || k)) rn
                 from b2 where seg = 'lp' and k not in ('b045', 'b057', 'b069')) x where rn <= 5
),
plan as (
  select b2.k, b2.i, b2.fn, b2.ln, b2.seg, b2.site, b2.grade, b2.pw_track, b2.gfn, b2.gln_alt,
         case when seg in ('lp', 'lp_late') then 'enrolled' when seg = 'lp_drop' then 'dropped' end as lp,
         case when seg = 'pw7' then 'enrolled' when seg = 'pw7_drop' then 'dropped' end as pw7,
         case when seg = 'pw6' then 'completed' when seg = 'pw6_drop' then 'dropped' end as pw6,
         case when seg = 'sw' or b2.k in (select k from lp_sw) or (seg = 'pw7' and i <= 133) then 'completed'
              when seg = 'sw_drop' then 'dropped' end as sw,
         (b2.k in (select k from lp_mc) or (seg = 'pw7' and i between 140 and 141)
            or (seg = 'sw' and i <= 217) or seg = 'mc') as mc,
         case when i between 218 and 222 then 'open' when i in (223, 224) then 'accepted' end as pw8
  from b2
),
named as (
  select * from (values
    ('amara',  0, 'Amara',  'Johnson', 'named', null::text, 'Post-secondary', 'IT support', null::text, null::text, null::text, null::text, 'completed', null::text, false, null::text),
    ('luis',   0, 'Luis',   'Ortega',  'named', 'eastlake', '12',            null,          null, null, 'enrolled', null, null, 'completed', true,  null),
    ('keisha', 0, 'Keisha', 'Brown',   'named', null,       'Post-secondary', 'Healthcare', null, null, null, 'enrolled', null, null, false, null),
    ('david',  0, 'David',  'Tran',    'named', 'laurel',   '11',            null,          null, null, 'enrolled', null, null, null, false, null),
    ('jalen',  0, 'Jalen',  'Price',   'named', null,       'Not in school', 'Building trades', null, null, null, null, null, null, false, 'open')
  ) v(k, i, fn, ln, seg, site, grade, pw_track, gfn, gln_alt, lp, pw7, pw6, sw, mc, pw8)
),
allp as (
  select k, i, fn, ln, seg, site, grade, pw_track, gfn, gln_alt, lp, pw7, pw6, sw, mc, pw8 from plan
  union all
  select k, i, fn, ln, seg, site, grade, pw_track, gfn, gln_alt, lp, pw7, pw6, sw, mc, pw8 from named
),
-- Summer Works host slots: 85 completers across 22 employers (Luis takes a
-- Pacific Summit slot); the three who left early were at three of them.
slots as (
  select row_number() over () as slot, e
  from (select unnest(array[
          'pacific_summit','pacific_summit','pacific_summit','pacific_summit','pacific_summit','pacific_summit','pacific_summit','pacific_summit',
          'library','library','library','library','library','library','library','library',
          'harbor','harbor','harbor','harbor','harbor','harbor',
          'casa_alvarez','casa_alvarez','casa_alvarez','casa_alvarez','casa_alvarez','casa_alvarez',
          'redline','redline','redline','redline','redline',
          'port_city','port_city','port_city','port_city','port_city',
          'kinetic','kinetic','kinetic','kinetic',
          'lakeshore_cu','lakeshore_cu','lakeshore_cu','lakeshore_cu',
          'oakhaven_medical','oakhaven_medical','oakhaven_medical','oakhaven_medical',
          'brightline_solar','brightline_solar','brightline_solar','brightline_solar',
          'evergreen_senior','evergreen_senior','evergreen_senior','evergreen_senior',
          'estuary_hotel','estuary_hotel','estuary_hotel','estuary_hotel',
          'tidewater','tidewater','tidewater',
          'bayline_electric','bayline_electric','bayline_electric',
          'mosaic_media','mosaic_media','mosaic_media',
          'bytebridge','bytebridge','bytebridge',
          'fruitvale_dental','fruitvale_dental','lumen','lumen','baycrest_animal','baycrest_animal',
          'westside_auto','westside_auto','fruit_center','fruit_center','bridgeway']) e) x
),
sw_order as (
  select k, row_number() over (order by case when k = 'luis' then 0 else 1 end, pg_temp.rnd('swo:' || k)) as slot
  from allp where sw = 'completed'
)
select p.*,
       coalesce(s.e, case p.i when 199 then 'port_city' when 200 then 'estuary_hotel' when 201 then 'casa_alvarez' end) as sw_emp
from allp p
left join sw_order o on o.k = p.k
left join slots s on s.slot = o.slot;

-- Derived per-person fields: track, stage, employer role, placement outcome.
alter table nb5_people
  add column track text, add column stage text, add column sw_role text,
  add column placed_emp text, add column outcome text, add column wage numeric;

update nb5_people set sw_role = case sw_emp
    when 'pacific_summit' then 'branch operations intern' when 'library' then 'library aide'
    when 'harbor' then 'patient services intern' when 'casa_alvarez' then 'restaurant operations intern'
    when 'redline' then 'construction trades intern' when 'port_city' then 'warehouse operations intern'
    when 'kinetic' then 'IT support intern' when 'lakeshore_cu' then 'member services intern'
    when 'oakhaven_medical' then 'clinic front-desk intern' when 'brightline_solar' then 'solar install helper'
    when 'evergreen_senior' then 'resident care aide' when 'estuary_hotel' then 'guest services intern'
    when 'tidewater' then 'engineering intern' when 'bayline_electric' then 'electrical helper'
    when 'mosaic_media' then 'design and social media intern' when 'bytebridge' then 'help-desk intern'
    when 'fruitvale_dental' then 'dental office intern' when 'lumen' then 'QA testing intern'
    when 'baycrest_animal' then 'veterinary assistant intern' when 'westside_auto' then 'auto body shop helper'
    when 'fruit_center' then 'youth programs assistant' when 'bridgeway' then 'family resource intern' end
where sw_emp is not null;

update nb5_people set track = coalesce(pw_track,
    case when sw_emp in ('kinetic','bytebridge','lumen') then 'IT support'
         when sw_emp in ('harbor','oakhaven_medical','evergreen_senior','fruitvale_dental','baycrest_animal') then 'Healthcare'
         when sw_emp in ('redline','brightline_solar','bayline_electric','westside_auto','port_city') then 'Building trades'
         when sw_emp in ('pacific_summit','lakeshore_cu','casa_alvarez','estuary_hotel','mosaic_media','tidewater') then 'Business & finance'
         when sw_emp is not null then 'Undecided' end,
    (array['IT support','Healthcare','Building trades','Business & finance','Undecided','Undecided'])[1 + floor(pg_temp.rnd('trk:' || k) * 6)::int]);
update nb5_people set track = 'Business & finance' where k = 'luis';
-- Cohort 8 applicants / early admits are 18–24, out of high school, on one of
-- the three Pathways tracks.
update nb5_people
set grade = case when k <> 'b222' and pg_temp.rnd('p8g:' || k) < 0.4 then 'Post-secondary' else 'Not in school' end,  -- b222 is finishing a GED
    track = case when track in ('IT support', 'Healthcare', 'Building trades') then track
                 else (array['IT support', 'Healthcare', 'Building trades'])[1 + i % 3] end
where pw8 is not null and seg <> 'named';
update nb5_people set track = 'IT support' where k = 'david';

update nb5_people set stage = case
    when lp = 'enrolled' or pw7 = 'enrolled' or mc or pw8 = 'accepted' then 'enrolled'
    when pw8 = 'open' then 'applied'
    when pw6 = 'completed' or sw = 'completed' then 'alumni'
    when lp = 'dropped' or pw7 = 'dropped' or pw6 = 'dropped' or sw = 'dropped' then 'withdrawn'
    else 'inquiry' end;

-- Pathways 6 outcomes (27 of 34 placed incl. Amara, 4 in school, 3 searching).
update nb5_people p set placed_emp = o.emp, outcome = o.outcome, wage = o.wage
from (values
  -- IT (j 1–12)
  (160, 'kinetic', 'placed', 25.00), (161, 'bytebridge', 'placed', 24.50), (162, 'bytebridge', 'placed', 24.00),
  (163, 'bytebridge', 'placed', 23.50), (164, 'lumen', 'placed', 27.00), (165, 'lakeshore_cu', 'placed', 22.50),
  (166, 'port_city', 'placed', 23.00), (167, 'eastshore_cc', 'placed', 22.00), (168, 'harbor', 'placed', 24.00),
  (169, null, 'school', null), (170, null, 'school', null), (171, null, 'searching', null),
  -- Healthcare (j 13–23)
  (172, 'harbor', 'placed', 24.50), (173, 'harbor', 'placed', 24.50), (174, 'harbor', 'placed', 23.75),
  (175, 'oakhaven_medical', 'placed', 22.50), (176, 'oakhaven_medical', 'placed', 22.00), (177, 'evergreen_senior', 'placed', 23.50),
  (178, 'evergreen_senior', 'placed', 23.50), (179, 'evergreen_senior', 'placed', 23.00), (180, 'fruitvale_dental', 'placed', 21.50),
  (181, null, 'school', null), (182, null, 'searching', null),
  -- Building trades (j 24–33)
  (183, 'redline', 'placed', 26.00), (184, 'redline', 'placed', 25.00), (185, 'redline', 'placed', 25.00),
  (186, 'bayline_electric', 'placed', 27.50), (187, 'bayline_electric', 'placed', 26.50), (188, 'brightline_solar', 'placed', 24.00),
  (189, 'brightline_solar', 'placed', 23.50), (190, 'westside_auto', 'placed', 21.00), (191, null, 'school', null),
  (192, null, 'searching', null)
) as o(i, emp, outcome, wage)
where p.i = o.i and p.seg = 'pw6';
update nb5_people set placed_emp = 'kinetic', outcome = 'placed', wage = 28.00 where k = 'amara';

-- Contact + profile fields per person (registry keys only: the profile editor
-- rejects any custom_fields key that has no custom_field_defs row).
alter table nb5_people
  add column email text, add column phone text, add column guardian_name text, add column guardian_phone text,
  add column school text, add column neighborhood text, add column first_gen boolean, add column needs text[],
  add column notes text, add column created_off int;

update nb5_people p set
  neighborhood = case
      when site = 'eastlake' then (array['East Oakland','East Oakland','East Oakland','Fruitvale','Downtown'])[1 + floor(pg_temp.rnd('nb:' || k) * 5)::int]
      when site = 'laurel'   then (array['Fruitvale','Fruitvale','San Leandro','East Oakland'])[1 + floor(pg_temp.rnd('nb:' || k) * 4)::int]
      when site = 'bayshore' then (array['West Oakland','West Oakland','West Oakland','Downtown','Other'])[1 + floor(pg_temp.rnd('nb:' || k) * 5)::int]
      else (array['East Oakland','Fruitvale','West Oakland','Downtown','San Leandro','East Oakland','Fruitvale'])[1 + floor(pg_temp.rnd('nb:' || k) * 7)::int] end,
  first_gen = pg_temp.rnd('fg:' || k) < 0.68,
  email = case when k in ('b028', 'b084') then null
               when grade = '9' and pg_temp.rnd('em:' || k) < 0.25 then null
               else lower(fn) || '.' || lower(ln) || '@example.net' end,
  phone = case when pg_temp.rnd('ph:' || k) < 0.6
               then (array['(510)','(341)'])[1 + i % 2] || ' 555-01' || lpad(((i * 37) % 100)::text, 2, '0') end,
  school = case
      when site = 'eastlake' then 'Eastlake High School'
      when site = 'laurel' then 'Laurel Ridge High School'
      when site = 'bayshore' then 'Bayshore Academy'
      when grade in ('9','10','11','12') then (array['Cedar Point High School','Marina Gate High School','Juniper Hill High School','Bay Crest Charter High'])[1 + i % 4]
      when grade = 'Post-secondary' then 'Eastshore Community College' end
where seg <> 'named';

-- Guardians (minors) / emergency contacts (adults), with a few deliberate gaps:
-- b028 and b084 have no email and no guardian phone (the overview's "no
-- contact" flag); b033, b061 and four fellows are missing a guardian phone.
update nb5_people set
  guardian_name = case when k in ('b028', 'b125', 'b131', 'b138', 'b151') then null
                       when grade in ('9','10','11','12') or pg_temp.rnd('ec:' || k) < 0.85
                       then gfn || ' ' || case when pg_temp.rnd('gl:' || k) < 0.85 then ln else gln_alt end end,
  guardian_phone = case when k in ('b028', 'b084', 'b033', 'b061', 'b125', 'b131', 'b138', 'b151') then null
                        else (array['(510)','(341)','(925)','(510)'])[1 + i % 4] || ' 555-01' || lpad(((i * 53 + 7) % 100)::text, 2, '0') end
where seg <> 'named';
update nb5_people set guardian_phone = null where guardian_name is null and seg <> 'named';

update nb5_people set needs = x.needs
from (
  select k, array_remove(array[
           case when pg_temp.rnd('n1:' || k) < 0.22 then case when seg like 'lp%' then 'Tutoring' else 'Transit pass' end end,
           case when pg_temp.rnd('n2:' || k) < 0.14 then 'Laptop' end,
           case when pg_temp.rnd('n3:' || k) < 0.10 then 'Food' end,
           case when seg like 'pw%' and pg_temp.rnd('n4:' || k) < 0.18 then 'Work clothing' end,
           case when seg like 'pw%' and pg_temp.rnd('n5:' || k) < 0.08 then 'Childcare' end,
           case when seg like 'lp%' and pg_temp.rnd('n6:' || k) < 0.12 then 'Transit pass' end], null) as needs
  from nb5_people where seg <> 'named') x
where nb5_people.k = x.k and cardinality(x.needs) > 0;

-- Created (days from anchor): when each person first came into Northbridge.
update nb5_people set created_off = case
    when seg in ('lp', 'lp_drop') and grade = '9' then pg_temp.nb5_sy(-12 - floor(pg_temp.rnd('cr:' || k) * 25)::int)
    when seg in ('lp', 'lp_drop') then pg_temp.nb5_sy(-365 * (grade::int - 9) - 10 - floor(pg_temp.rnd('cr:' || k) * 60)::int)
    when seg = 'lp_late' then case when k = 'b117' then -20 else -15 end
    when seg in ('pw7', 'pw7_drop') and sw = 'completed' then pg_temp.nb5_sw(-45 - floor(pg_temp.rnd('cr:' || k) * 20)::int)
    when seg in ('pw7', 'pw7_drop') then pg_temp.nb5_sy(-50 - floor(pg_temp.rnd('cr:' || k) * 70)::int)
    when seg in ('pw6', 'pw6_drop') then pg_temp.nb5_sy(-414 - floor(pg_temp.rnd('cr:' || k) * 80)::int)
    when seg in ('sw', 'sw_drop') then pg_temp.nb5_sw(-40 - floor(pg_temp.rnd('cr:' || k) * 40)::int)
    when seg = 'mc' then (pg_temp.nb5_mc_kickoff() - pg_temp.nb_anchor()) - 5 - floor(pg_temp.rnd('cr:' || k) * 20)::int
    when seg = 'inq' then -3 - floor(pg_temp.rnd('cr:' || k) * 40)::int end
where seg <> 'named';

-- Notes: what a program manager would actually write down.
with pn as (select k, pg_temp.nb_id('partner:' || k) id from (select distinct sw_emp k from nb5_people where sw_emp is not null
                                                              union select distinct placed_emp from nb5_people where placed_emp is not null) e),
     names as (select pn.k, p.name from pn join public.partners p on p.id = pn.id and p.org_id = pg_temp.nb_org()),
     lp_notes as (select array[
        'Wants to explore healthcare; signed up for the Harbor Health job shadow.',
        'Loaner laptop issued in September; returns it in June.',
        'Working on college essays with a Kinetic volunteer tutor.',
        'Quiet in groups, strong one-on-one. Tutor says algebra is clicking.',
        'Interested in the building trades after the Redline site visit.',
        'Plays varsity basketball; attends Mon/Wed during season.',
        'Started the FAFSA with Rosa; still needs a parent tax form.',
        'Asked about Summer Works for next summer.',
        'Bus pass renewed in September.',
        'Wants to start a small business; picked the Business & finance track.',
        'Helps translate for Spanish-speaking families at sign-in.',
        'Took the IT Fundamentals practice test: 71%.',
        'First time on the honor roll.',
        'Leads the Thursday warm-up now. Big change from September.'] a),
     pw7_notes as (select array[
        'Studying for CompTIA A+ Core 1; practice score 78%.',
        'Clinical rotation at Harbor Health on Tuesdays and Thursdays.',
        'OSHA-10 complete; pre-apprenticeship placement at Redline on Mon/Wed.',
        'Needs childcare on Fridays; Bridgeway referral in progress.',
        'Used the work-clothing voucher for site boots.',
        'Interviewing with Kinetic Labs for a spring help-desk role.',
        'Medical-assistant externship at Oakhaven starts in January.',
        'First in the family to earn a certification.',
        'Co-facilitates the Friday check-in. Strong peer leader.',
        'Bayline Electrical wants to interview after OSHA-10.'] a),
     mc_notes as (select array[
        'Matched with a Kinetic Labs mentor in September.',
        'Came through Bridgeway; stayed for the circle.',
        'Mentor is a Harbor Health nurse; talking about CNA programs.',
        'Wants help with a first resume before winter break.',
        'Matched with a Pacific Summit mentor; meets between circles too.'] a),
     inq_notes as (select array[
        'Referred by a Bridgeway case manager; invited to the next info session.',
        'Walked in during Mentor Circle night at Fruitvale Hub; follow-up call pending.',
        'Older brother is in Pathways Cohort 7; interested in Launchpad at Bayshore.',
        'Met at the library FAFSA night; wants Summer Works information.',
        'Signed the interest form at Laurel Ridge back-to-school night.',
        'Referred by Tom Brennan at Redline; interested in the trades track.',
        'Counselor at Cedar Point referred her for Mentor Circles.',
        'Asked about Cohort 8 at the Eastshore WDB job fair; too young until spring.',
        'Mom called after the Eastlake family night; wants a spot for next semester.',
        'Found us on Instagram; asked about paid summer work.'] a)
update nb5_people p set notes = case
    when p.k = 'b028' then 'Enrollment form came back without guardian contact or an email. Rosa is sending a new form home.'
    when p.k = 'b084' then 'Guardian listed but no phone or email on the form. Ask at Thursday pickup.'
    when p.k = 'b045' then 'Started a 4–8pm shift at a pizza place after the bell change; arriving late or not at all. Rosa is talking with the family about a Tue/Thu plan.'
    when p.k = 'b057' then 'Picks up a younger brother from middle school at 3:45 since the schedule moved. Asked if he can bring him along.'
    when p.k = 'b069' then 'Joined seventh-period soccer; the season ends mid-November. Wants to keep Launchpad on Mondays.'
    when p.k = 'b150' then 'Picked up overnight warehouse shifts and missed the last two cohort days. Andre is texting; hardship stipend check-in offered.'
    when p.k = 'b117' then 'Joined late through the intake form. Older sister is a Launchpad alum.'
    when p.k = 'b118' then 'Transferred to Laurel Ridge in October; joined Launchpad the next week.'
    when p.k = 'b119' then 'Family moved to Stockton in October. Records sent home; welcome back anytime.'
    when p.k = 'b120' then 'Withdrew to work afternoons at a family business. Rosa invited him back for spring.'
    when p.k = 'b121' then 'Transferred to a school across town; too far for after-school.'
    when p.k = 'b122' then 'Stopped coming after the first few weeks; counselor says she is doing well in class. Door stays open.'
    when p.k = 'b158' then 'Left in week 5 for a full-time IT job at a logistics company. Counted as an early placement.'
    when p.k = 'b159' then 'Moved to Sacramento with family in October.'
    when p.seg = 'pw6_drop' then (array[
        'Withdrew mid-year to work full-time; kept in touch through the alumni list.',
        'Left for family reasons in the winter.',
        'Withdrew after a health issue; invited to reapply.',
        'Took a full-time warehouse job in the spring.',
        'Moved out of the area in the spring.',
        'Stopped attending in the second half; Andre closed the file in May.'])[p.i - 192]
    when p.seg = 'sw_drop' then 'Left Summer Works in week ' || (p.i - 197) || ' (' || p.sw_role || ' at ' || (select n.name from names n where n.k = p.sw_emp) || ').'
    when p.seg = 'pw6' then 'Pathways Cohort 6 graduate (' || p.track || '). '
        || case p.track when 'IT support' then 'CompTIA A+ certified.'
                        when 'Healthcare' then case when p.i % 3 = 0 then 'Medical Assistant certificate.' else 'CNA certified.' end
                        else 'OSHA-10 and NCCER Core certified.' end
        || case p.outcome
             when 'placed' then ' Placed: ' || (select n.name from names n where n.k = p.placed_emp) || ', '
                  || case p.track when 'IT support' then (array['IT help-desk technician','desktop support technician','service desk analyst'])[1 + p.i % 3]
                                  when 'Healthcare' then case when p.placed_emp = 'fruitvale_dental' then 'dental assistant'
                                                              when p.i % 3 = 0 then 'medical assistant' else 'certified nursing assistant' end
                                  else case p.placed_emp when 'bayline_electric' then 'apprentice electrician' when 'brightline_solar' then 'solar installer'
                                                         when 'westside_auto' then 'auto body technician trainee' else 'pre-apprentice carpenter' end end
                  || ', $' || to_char(p.wage, 'FM90.00') || '/hr. 90-day check-in done.'
             when 'school' then ' Enrolled full-time at Eastshore Community College to continue in the field.'
             else ' Still job searching; Andre sends leads weekly.' end
    when p.sw is not null and p.sw_emp is not null then
        'Summer Works ' || extract(year from pg_temp.summer_start())::int || ': ' || p.sw_role || ' at '
        || (select n.name from names n where n.k = p.sw_emp) || '.'
        || case when p.seg = 'pw7' then ' Came straight into Pathways Cohort 7 (' || p.track || ').'
                when p.pw8 = 'open' then ' Applied to Pathways Cohort 8 (' || p.track || ').'
                when p.pw8 = 'accepted' then ' Accepted early into Pathways Cohort 8 (' || p.track || ').'
                when p.seg = 'lp' and pg_temp.rnd('lpn:' || p.k) < 0.5 then ' ' || (select a[1 + floor(pg_temp.rnd('lpn2:' || p.k) * array_length(a, 1))::int] from lp_notes)
                when p.seg = 'sw' then (array[' Supervisor rated reliability "exceeds."', ' Offered a part-time role through the school year.',
                                             ' Interested in Pathways next year.', ' Graduated from high school in June.', '', ''])[1 + floor(pg_temp.rnd('swn:' || p.k) * 6)::int]
                else '' end
    when p.seg in ('lp', 'lp_late') and pg_temp.rnd('lpn:' || p.k) < 0.45 then (select a[1 + floor(pg_temp.rnd('lpn2:' || p.k) * array_length(a, 1))::int] from lp_notes)
    when p.seg = 'pw7' and pg_temp.rnd('pwn:' || p.k) < 0.55 then (select a[1 + floor(pg_temp.rnd('pwn2:' || p.k) * array_length(a, 1))::int] from pw7_notes)
    when p.seg = 'mc' and p.i >= 272 then 'Joined the circle in ' || to_char(pg_temp.nb5_nth_dow(extract(year from pg_temp.nb5_mc_kickoff() + 31)::int, extract(month from pg_temp.nb5_mc_kickoff() + 31)::int, 2, 2), 'FMMonth') || '; waiting on a mentor match. Simone is lining up a volunteer.'
    when p.seg = 'mc' then (select a[1 + (p.i % array_length(a, 1))] from mc_notes)
    when p.seg = 'inq' then (select a[1 + (p.i - 282)] from inq_notes)
  end
where p.seg <> 'named';

-- ════════════════════════════════════════════════════════════════════════════
-- APPLICATIONS (staged; inserted after students for the student_id FK)
-- ════════════════════════════════════════════════════════════════════════════
-- Pathways Cohort 8 (40): 12 new, 15 eligible (screened / interview set),
-- 3 waitlisted, 3 offered, 2 accepted early, 3 declined, 2 ineligible.
-- Launchpad late enrollment (4): 2 accepted (now on site rosters), 1 offered,
-- 1 new. Rows tied to an existing participant take their name and contact
-- from the roster.
create temp table nb5_apps on commit drop as
select * from (values
  -- key, cohort, person key, first, last, status, priority, track, age, referral, motivation, screening_notes, created_off, created_time, offered_off, decided_off
  ('a01', 'pw8', 'b221', null, null, 'new', 1, null, 19, 'Summer Works alum', 'Summer Works showed me I like work where I am fixing something real. I want the certification so it turns into a career.', null, -4, '15:20', null::int, null::int),
  ('a02', 'pw8', null, 'Marquise', 'Fuller', 'new', 2, 'Building trades', 21, 'Instagram', 'I have been doing warehouse shifts since high school. I want a trade where I can grow, not just get by.', null, -1, '21:30', null, null),
  ('a03', 'pw8', null, 'Yadira', 'Solis', 'new', 2, 'Healthcare', 20, 'Friend in Cohort 7', 'My cousin did Pathways and now works at a hospital. I want that kind of stability for my son.', null, 0, '06:50', null, null),
  ('a04', 'pw8', null, 'Quentin', 'Ames', 'new', 2, 'IT support', 19, 'Eastshore Public Library', 'I fix everyone''s phones and laptops in my family. I want to get certified and get paid for it.', null, -2, '12:40', null, null),
  ('a05', 'pw8', null, 'Kassandra', 'Ibanez', 'new', 2, 'Healthcare', 22, 'Bridgeway Family Resource Center', 'I took care of my grandmother for two years. I want to turn that into a CNA license.', null, -3, '18:05', null, null),
  ('a06', 'pw8', null, 'Rolando', 'Fierro', 'new', 2, 'Building trades', 23, 'Redline Builders job site', 'I have done solar installs as a day laborer. I want the training and the certificate to back it up.', null, -5, '10:15', null, null),
  ('a07', 'pw8', null, 'Shanelle', 'Booker', 'new', 2, 'Healthcare', 24, 'Instagram', 'I worked a dental front desk and want to move into dental assisting.', null, -6, '20:45', null, null),
  ('a08', 'pw8', null, 'Hieu', 'Doan', 'new', 2, 'IT support', 18, 'Cedar Point High School counselor', 'I built my own computer from used parts. I want the A+ and a help-desk job.', null, -7, '16:30', null, null),
  ('a09', 'pw8', null, 'Talia', 'Faleolo', 'new', 3, 'Undecided', 20, 'Friend', 'I need a career, not another job. I am ready to show up every week.', null, -8, '11:55', null, null),
  ('a10', 'pw8', null, 'Desiree', 'Mims', 'new', 2, 'Healthcare', 21, 'Harbor Health job fair', 'I want to be a medical assistant and eventually go to nursing school.', null, -9, '09:25', null, null),
  ('a11', 'pw8', null, 'Arturo', 'Beltran', 'new', 2, 'Building trades', 22, 'Bridgeway Family Resource Center', 'Construction runs in my family but nobody ever got into the union. I want to be the first.', null, -10, '14:10', null, null),
  ('a12', 'pw8', null, 'Nadia', 'Rahman', 'new', 2, 'IT support', 19, 'Eastshore Community College', 'I want to learn networking and maybe cybersecurity later.', null, -11, '19:35', null, null),
  ('a13', 'pw8', 'jalen', null, null, 'eligible', 1, 'Building trades', 21, 'Redline Builders (Tom Brennan)', 'I visited a Redline job site and saw people who look like me running the crew. I want in.', 'Phone screen done (Andre). Strong referral from Tom Brennan at Redline. Interview to schedule this week.', -20, '13:00', null, null),
  ('a14', 'pw8', 'b218', null, null, 'eligible', 1, null, 19, 'Summer Works alum', 'I liked the work this summer and my supervisor said I should go for the certification.', 'Summer Works alum; supervisor reference on file. Interview ' || to_char(pg_temp.d(8), 'Dy Mon FMDD') || ', 10:00.', -26, '17:15', null, null),
  ('a15', 'pw8', 'b219', null, null, 'eligible', 1, null, 20, 'Summer Works alum', 'I want to be the first in my family with a professional certification.', 'Summer Works alum. Interview ' || to_char(pg_temp.d(9), 'Dy Mon FMDD') || ', 1:30pm.', -30, '10:40', null, null),
  ('a16', 'pw8', null, 'Jamarion', 'Pruitt', 'eligible', 2, 'IT support', 20, 'Friend in Cohort 7', 'My friend in Cohort 7 says the coaching is real. I want that kind of support.', 'Phone screen done. Interview ' || to_char(pg_temp.d(7), 'Dy Mon FMDD') || ', 11:00.', -12, '15:50', null, null),
  ('a17', 'pw8', null, 'Elisa', 'Montoya', 'eligible', 2, 'Healthcare', 22, 'Bridgeway Family Resource Center', 'I am a single mom and I need something that leads to full-time work with benefits.', 'Phone screen done; childcare need noted for Fridays. Interview ' || to_char(pg_temp.d(10), 'Dy Mon FMDD') || ', 9:30.', -14, '08:30', null, null),
  ('a18', 'pw8', null, 'Corey', 'Vance', 'eligible', 2, 'Building trades', 24, 'Eastshore WDB', 'I left community college to work full-time. I want a path that pays while I learn.', 'Phone screen done. Interview ' || to_char(pg_temp.d(11), 'Dy Mon FMDD') || ', 2:00pm.', -16, '12:05', null, null),
  ('a19', 'pw8', null, 'Brianda', 'Quezada', 'eligible', 2, 'Healthcare', 19, 'Instagram', 'I want to help people in my neighborhood get better care. A CNA license is how I start.', 'References requested; interview to schedule.', -18, '19:10', null, null),
  ('a20', 'pw8', null, 'Lamar', 'Hutchins', 'eligible', 2, 'IT support', 23, 'Eastshore WDB', 'I am tired of jobs that cut my hours with no notice. I want skills nobody can take away.', 'Phone screen done. Interview ' || to_char(pg_temp.d(14), 'Dy Mon FMDD') || ', 10:30.', -21, '11:20', null, null),
  ('a21', 'pw8', null, 'Tatyana', 'Greer', 'eligible', 2, 'Healthcare', 21, 'Harbor Health job fair', 'I want to work in a hospital lab someday. The healthcare track is my starting point.', 'Phone screen done. Interview ' || to_char(pg_temp.d(15), 'Dy Mon FMDD') || ', 1:00pm.', -24, '14:45', null, null),
  ('a22', 'pw8', null, 'Duc', 'Ly', 'eligible', 2, 'IT support', 18, 'Cedar Point High School counselor', 'I like solving problems and explaining things. People tell me I would be good at tech support.', 'References requested; interview to schedule.', -27, '16:00', null, null),
  ('a23', 'pw8', null, 'Felipe', 'Arce', 'eligible', 2, 'Building trades', 20, 'Friend', 'I want to be an electrician like my uncle. He told me to apply.', 'Phone screen done. Interview ' || to_char(pg_temp.d(16), 'Dy Mon FMDD') || ', 11:30.', -29, '09:45', null, null),
  ('a24', 'pw8', null, 'Shayla', 'Merritt', 'eligible', 3, 'Undecided', 22, 'Instagram', 'I want to prove to myself I can finish something big.', 'Reviewing: needs proof of Oakland or San Leandro residency.', -33, '18:20', null, null),
  ('a25', 'pw8', null, 'Isaac', 'Teklu', 'eligible', 2, 'IT support', 21, 'Bridgeway Family Resource Center', 'I have always liked computers but never had anyone show me how to turn it into a career.', 'Phone screen done. Interview ' || to_char(pg_temp.d(17), 'Dy Mon FMDD') || ', 3:00pm.', -36, '13:35', null, null),
  ('a26', 'pw8', null, 'Renata', 'Galvez', 'eligible', 2, 'Healthcare', 20, 'Oakhaven Medical Group', 'I am interested in medical billing and the business side of healthcare.', 'References requested; interview to schedule.', -38, '10:10', null, null),
  ('a27', 'pw8', null, 'Kiana', 'Lealao', 'eligible', 2, 'Building trades', 19, 'Summer Works info night', 'I am good with my hands and I like seeing a finished project. Electrical work interests me most.', 'Phone screen done. Interview ' || to_char(pg_temp.d(18), 'Dy Mon FMDD') || ', 10:00.', -40, '15:25', null, null),
  ('a28', 'pw8', 'b222', null, null, 'waitlisted', 1, null, 19, 'Summer Works alum', 'I got a lot out of the summer and I want to keep the momentum going.', 'Strong fit; finishing the GED in ' || to_char(pg_temp.d(50), 'FMMonth') || '. Holding a seat pending completion.', -25, '12:30', null, null),
  ('a29', 'pw8', null, 'Dominic', 'Ferris', 'waitlisted', 2, 'IT support', 17, 'Juniper Hill High School counselor', 'I want a plan for right after graduation.', 'Turns 18 in ' || to_char(pg_temp.d(100), 'FMMonth') || '; eligible by the start date. Confirm then.', -31, '16:45', null, null),
  ('a30', 'pw8', null, 'Paloma', 'Cuevas', 'waitlisted', 2, 'Healthcare', 22, 'Harbor Health job fair', 'I want to work at a hospital close to home so I can help my family.', 'Healthcare track is full for now; first in line if a seat opens.', -34, '09:05', null, null),
  ('a31', 'pw8', 'b220', null, null, 'offered', 1, null, 20, 'Summer Works alum', 'My summer supervisor said I was ready for more. I want to see how far I can go.', 'Strong interview; offer sent ' || to_char(pg_temp.d(-5), 'Mon FMDD') || '. Confirm by ' || to_char(pg_temp.d(9), 'Mon FMDD') || '.', -28, '11:40', -5, null),
  ('a32', 'pw8', null, 'Trinity', 'Waller', 'offered', 1, 'Healthcare', 21, 'Bridgeway Family Resource Center', 'I am aging out of foster care and I want a plan for what comes next.', 'Early interview; offer sent. Bridgeway is helping with housing paperwork.', -35, '14:20', -6, null),
  ('a33', 'pw8', null, 'Javon', 'Easley', 'offered', 1, 'Building trades', 22, 'Redline Builders job site', 'I want a job where I can grow into running a crew someday.', 'Early interview; offer sent. Tom Brennan reference.', -38, '10:00', -3, null),
  ('a34', 'pw8', 'b223', null, null, 'accepted', 1, null, 20, 'Summer Works alum', 'I want to keep building on what I started this summer.', 'Accepted early on a strong supervisor reference.', -40, '13:15', -10, -6),
  ('a35', 'pw8', 'b224', null, null, 'accepted', 1, null, 21, 'Summer Works alum', 'Summer Works was the first job where people expected a lot from me. I liked that.', 'Accepted early on a strong supervisor reference.', -42, '15:00', -9, -4),
  ('a36', 'pw8', null, 'Mario', 'Lugo', 'declined', 2, 'Building trades', 23, 'Eastshore WDB', 'I want to learn a trade the right way.', 'Took a full-time job at the port; encouraged to reapply for Cohort 9.', -36, '11:10', null, -8),
  ('a37', 'pw8', null, 'Keyana', 'Rhodes', 'declined', 2, 'Healthcare', 20, 'Instagram', 'I want to be a nurse and this is a good first step.', 'Moving to Sacramento in January; sent her two programs there.', -31, '17:30', null, -14),
  ('a38', 'pw8', null, 'Thanh', 'Ho', 'declined', 2, 'IT support', 19, 'Eastshore Community College', 'I want hands-on IT experience while I study.', 'Staying full-time in her college program this year; will reapply.', -37, '12:50', null, -10),
  ('a39', 'pw8', null, 'Lionel', 'Batiste', 'ineligible', 2, 'Building trades', 26, 'Friend', 'I need a fresh start and a real trade.', 'Age 26, outside the 18–24 range. Referred to Eastshore WDB adult services.', -27, '10:30', null, -24),
  ('a40', 'pw8', null, 'Ashanti', 'Coles', 'ineligible', 2, 'Healthcare', 21, 'Instagram', 'I want to work in healthcare.', 'Lives in Contra Costa County; referred to a program closer to home.', -18, '14:00', null, -15),
  ('l1', 'lp_eastlake', 'b117', null, null, 'accepted', 2, null, 14, 'Older sister (Launchpad alum)', 'My older sister did Launchpad and got a summer job through it.', 'Seat open at Eastlake; accepted.', -20, '16:10', -16, -13),
  ('l2', 'lp_laurel', 'b118', null, null, 'accepted', 2, null, 15, 'Laurel Ridge counselor', 'I just moved here and want help with homework and figuring out what I want to do.', 'Transfer student; counselor referral. Accepted.', -15, '12:25', -11, -9),
  ('l3', 'lp_bayshore', null, 'Zaire', 'Whitmore', 'offered', 2, 'IT support', 14, 'Bayshore counselor', 'I want to learn about jobs in computers. My counselor said this is the program.', 'Offer sent; waiting on the signed guardian form.', -7, '15:40', -3, null),
  ('l4', 'lp_laurel', null, 'Alexa', 'Duran', 'new', 2, 'Undecided', 15, 'Friends at Laurel Ridge', 'My friends go and they said the tutoring actually helps.', null, -2, '19:55', null, null)
) as v(k, ck, pk, fn, ln, status, priority, track, age, referral, motivation, notes, c_off, c_time, o_off, d_off);

-- ════════════════════════════════════════════════════════════════════════════
-- MEMBERSHIPS, SESSIONS, ATTENDANCE (staged so students can carry their real
-- last-activity date on insert)
-- ════════════════════════════════════════════════════════════════════════════
create temp table nb5_cohorts on commit drop as
select k, c.id, c.start_date, c.end_date, c.location
from unnest(array['lp_eastlake','lp_laurel','lp_bayshore','pw7','pw6','pw8','sw','mc']) k
join public.cohorts c on c.id = pg_temp.nb_id('cohort:' || k) and c.org_id = pg_temp.nb_org();

create temp table nb5_members on commit drop as
with m as (
  -- Launchpad
  select p.k, 'lp_' || p.site as ck,
         case when p.lp = 'dropped' then 'dropped' else 'enrolled' end as status,
         case when p.k = 'b117' then pg_temp.d(-12)
              when p.k = 'b118' then pg_temp.d(-8)
              when pg_temp.rnd('jn:' || p.k) < 0.12 then c.start_date + 1 + floor(pg_temp.rnd('jn2:' || p.k) * 6)::int
              else c.start_date end as joined_on,
         case p.k when 'b119' then greatest(c.start_date + 10, pg_temp.d(-25))
                  when 'b120' then greatest(c.start_date + 10, pg_temp.d(-18))
                  when 'b121' then greatest(c.start_date + 10, pg_temp.d(-31))
                  when 'b122' then greatest(c.start_date + 10, pg_temp.d(-11)) end as ended_on
  from nb5_people p join nb5_cohorts c on c.k = 'lp_' || p.site
  where p.lp is not null
  union all
  -- Pathways 7
  select p.k, 'pw7', case when p.pw7 = 'dropped' then 'dropped' else 'enrolled' end, c.start_date,
         case p.k when 'b158' then c.start_date + 35 when 'b159' then c.start_date + 49 end
  from nb5_people p join nb5_cohorts c on c.k = 'pw7' where p.pw7 is not null
  union all
  -- Pathways 6 (graduated)
  select p.k, 'pw6', case when p.pw6 = 'dropped' then 'dropped' else 'completed' end, c.start_date,
         case when p.pw6 = 'dropped' then c.start_date + (array[40, 75, 110, 150, 190, 230])[p.i - 192] else c.end_date end
  from nb5_people p join nb5_cohorts c on c.k = 'pw6' where p.pw6 is not null
  union all
  -- Summer Works (completed)
  select p.k, 'sw', case when p.sw = 'dropped' then 'dropped' else 'completed' end, c.start_date,
         case when p.sw = 'dropped' then c.start_date + (array[10, 17, 24])[p.i - 198] else c.end_date end
  from nb5_people p join nb5_cohorts c on c.k = 'sw' where p.sw is not null
  union all
  -- Mentor Circles: most matched at kickoff; the rest joined at the first
  -- monthly circle (the ten still awaiting a mentor among them).
  select p.k, 'mc', 'enrolled',
         case when p.i >= 272 or (p.k <> 'luis' and pg_temp.rnd('mcj:' || p.k) < 0.04)
              then pg_temp.nb5_nth_dow(extract(year from pg_temp.nb5_mc_kickoff() + 31)::int, extract(month from pg_temp.nb5_mc_kickoff() + 31)::int, 2, 2)
              else pg_temp.nb5_mc_kickoff() end,
         null::date
  from nb5_people p where p.mc
  union all
  -- Pathways 8 early admits (accepted applications)
  select p.k, 'pw8', 'enrolled', pg_temp.d(a.d_off), null::date
  from nb5_people p join nb5_apps a on a.pk = p.k and a.status = 'accepted' and a.ck = 'pw8'
)
select * from m;

-- Session calendars. Launchpad: Mon–Thu from the cohort start through the next
-- two weeks. Pathways: Fridays (weekly for the 10-week training phase, then
-- every other week), plus Cohort 6's graduation. Summer Works: Monday
-- orientation + six Friday workshops. Mentor Circles: kickoff, then second
-- Tuesdays. Cohort 8: orientation on its start date.
create temp table nb5_sessions on commit drop as
with lp as (
  select c.k as ck, d::date as sd, c.start_date
  from nb5_cohorts c
  cross join lateral generate_series(c.start_date, least(c.end_date, pg_temp.d(13)), interval '1 day') d
  where c.k like 'lp_%' and extract(isodow from d) between 1 and 4 and not pg_temp.nb5_closed(d::date)
),
pw as (
  select c.k as ck, f::date as sd, c.start_date,
         ((f::date - (c.start_date + ((5 - extract(isodow from c.start_date)::int + 7) % 7))) / 7) as wk
  from nb5_cohorts c
  cross join lateral generate_series(c.start_date + ((5 - extract(isodow from c.start_date)::int + 7) % 7),
                                     least(c.end_date - 3, pg_temp.d(13)), interval '7 days') f
  where c.k in ('pw7', 'pw6')
),
pw_kept as (
  select ck, sd, start_date, wk from pw
  where (wk < 10 or (wk - 10) % 2 = 0) and not pg_temp.nb5_closed(sd)
  union all
  select 'pw6', c.end_date - 2, c.start_date, null from nb5_cohorts c where c.k = 'pw6'
),
sw as (
  select 'sw'::text as ck,
         case when g = 0 then c.start_date
              when pg_temp.nb5_closed(c.start_date + 4 + 7 * g) then c.start_date + 3 + 7 * g
              else c.start_date + 4 + 7 * g end as sd, g
  from nb5_cohorts c cross join generate_series(0, 6) g where c.k = 'sw'
),
mc as (
  select 'mc'::text as ck, pg_temp.nb5_mc_kickoff() as sd
  union
  select 'mc', pg_temp.nb5_nth_dow(extract(year from m)::int, extract(month from m)::int, 2, 2)
  from nb5_cohorts c
  cross join lateral generate_series(date_trunc('month', pg_temp.nb5_mc_kickoff()) + interval '1 month',
                                     date_trunc('month', least(c.end_date, pg_temp.d(60))), interval '1 month') m
  where c.k = 'mc'
),
lp_t as (
  select ck, sd,
         row_number() over (partition by ck order by sd) as n,
         case extract(isodow from sd)::int
           when 1 then 'Homework lab + tutoring'
           when 2 then 'Career lab: ' || (array['What do you want to try?','Strengths and interests inventory','Resume basics','Interview practice',
                         'Budgeting your first paycheck','Workplace communication','Your online footprint','Exploring healthcare careers',
                         'Exploring the building trades','Tech careers 101','Networking without the awkward','Applying for summer jobs',
                         'College, trade school, or work?','Mock interviews','Career fair prep','Goal check-in'])[1 + ((sd - start_date) / 7) % 16]
           when 3 then 'Study hall + applications'
           else 'Industry Thursday: ' || (array['Nurse practitioner from Harbor Health','Redline Builders site superintendent','Kinetic Labs engineers Q&A',
                         'Pacific Summit Bank: banking basics','Alumni panel: Pathways graduates','Union electrician apprentice',
                         'Teen jobs at the library','Oakhaven Medical Group front office','Small-business owner from Casa Alvarez',
                         'How a warehouse runs (Port City Logistics)','Mock interviews with Kinetic volunteers','ByteBridge help-desk technicians',
                         'Design careers with Mosaic Media','Eastshore Community College counselor','Summer Works info session',
                         'Employer speed networking'])[1 + ((sd - start_date) / 7 + case ck when 'lp_laurel' then 5 when 'lp_bayshore' then 10 else 0 end) % 16]
         end as title,
         case when ck = 'lp_laurel' and sd >= pg_temp.wk(-3) then time '15:45' else time '15:30' end as st,
         case when ck = 'lp_laurel' and sd >= pg_temp.wk(-3) then time '17:45' else time '17:30' end as et
  from lp
),
pw_t as (
  select ck, sd, row_number() over (partition by ck order by sd) as n,
         case when wk is null then 'Graduation and placement celebration'
              else 'Fellowship Friday: ' || (array['Orientation and goal setting','Professional email and calendars','Track lab + certification study',
                         'Coaching one-on-ones','Resume workshop','Financial coaching: banking and credit','Employer site visits','Mock interviews',
                         'Track lab + practice exams','Workplace feedback and conflict','LinkedIn and references','Certification practice exam',
                         'Peer case consults','Employer panel','Job search sprint','Pay stubs, benefits, and taxes','Track lab + skills check',
                         'Mid-year reflection','Interview day prep','Placement planning'])[1 + (case when wk < 10 then wk else 10 + (wk - 10) / 2 end) % 20] end as title,
         case when wk is null then time '17:30' else time '09:30' end as st,
         case when wk is null then time '19:30' else time '15:00' end as et
  from pw_kept
),
sw_t as (
  select ck, sd, g + 1 as n,
         'Summer Works week ' || (g + 1) || ': ' || (array['Orientation: showing up like a pro','Workplace communication','Your first paycheck: banking 101',
                         'Mid-summer check-in and supervisor feedback','Career mapping','Updating your resume with summer experience',
                         'Showcase and closing celebration'])[g + 1] as title,
         case when g = 0 then time '09:00' else time '13:00' end as st,
         case when g = 0 then time '12:00' else time '15:30' end as et
  from sw
),
mc_t as (
  select ck, sd, row_number() over (order by sd) as n,
         case when sd = pg_temp.nb5_mc_kickoff() then 'Kickoff and match night'
              else 'Circle: ' || (array['New year, new plan','Applications season','Money talk: budgeting','Summer plans','Celebration circle',
                         'Closing circle','Summer check-in','Back to school','Kickoff','Setting goals for the year','Informational interviews',
                         'Gratitude and reflection'])[extract(month from sd)::int] end as title,
         time '18:00' as st, time '19:30' as et
  from mc
),
allt as (
  select * from lp_t union all select * from pw_t union all select * from sw_t union all select * from mc_t
  union all
  select 'pw8', c.start_date, 1, 'Orientation and welcome lunch', time '10:00', time '13:00' from nb5_cohorts c where c.k = 'pw8'
),
flags as (
  select (select max(sd) from lp where ck = 'lp_bayshore' and sd <= pg_temp.d(-2)) as unrecorded_day,
         (select min(sd) from lp where ck = 'lp_laurel' and sd >= pg_temp.d(8)) as canceled_day
)
select a.ck, a.n, a.sd, a.title, a.st, a.et,
       case when a.ck in ('pw7', 'pw6', 'pw8') then 'Northbridge HQ, Training Room'
            when a.ck = 'sw' then 'Northbridge HQ, Community Room'
            when a.ck = 'mc' then 'Fruitvale Hub, Main Hall'
            else c.location end as location,
       case when a.ck = 'lp_laurel' and a.sd = f.canceled_day then 'canceled'
            when a.ck = 'lp_bayshore' and a.sd = f.unrecorded_day then 'scheduled'
            when a.sd < pg_temp.d(0) then 'held'
            else 'scheduled' end as status,
       case when a.ck = 'lp_laurel' and a.sd = f.canceled_day then 'Canceled: minimum day for parent-teacher conferences. Families notified.'
            when a.ck = 'lp_laurel' and a.sd = pg_temp.wk(-3) then 'First day on the new bell schedule; moved start to 3:45.'
            when a.ck = 'lp_bayshore' and a.sd = f.unrecorded_day then 'Sub facilitator ran this one; paper sign-in sheet still to be entered.'
            when a.ck = 'pw7' and a.n = (select max(n) from pw_t where ck = 'pw7' and sd < pg_temp.d(0)) then 'Healthcare fellows got the CNA exam practice set; IT fellows took an A+ Core 1 practice test.'
            when a.ck = 'pw6' and a.title like 'Graduation%' then '34 graduates, families, and employer partners. Placement board unveiled.'
            when a.ck = 'mc' and a.title like 'Kickoff%' then '46 youth and 44 mentors; matches announced.'
       end as notes
from allt a
join nb5_cohorts c on c.k = a.ck
cross join flags f;

-- Attendance, deterministic. Each participant has a reliability tier;
-- Laurel Ridge loses ~16 points over the last three weeks (bell schedule);
-- people who later withdrew fade in their final three weeks. The overview's
-- "attendance drop" rule (2+ absences in the last three marks) is pinned to
-- the story: David Tran (3 of 3) plus three Laurel Ridge students and one
-- Pathways fellow (2 of 3); anyone else's last-three run is softened.
create temp table nb5_marks on commit drop as
with base as (
  select s.ck, s.n, s.sd, s.st, s.et, m.k, m.ended_on,
         case m.k when 'luis' then 0.97 when 'keisha' then 0.98 when 'amara' then 0.96 when 'david' then 0.92
           else case when pg_temp.rnd('rel:' || m.k) < 0.10 then 0.66 when pg_temp.rnd('rel:' || m.k) < 0.35 then 0.80 else 0.93 end end
         + case when s.ck in ('pw6', 'pw7') then 0.015 when s.ck = 'sw' then 0.01 when s.ck = 'mc' then -0.04 else 0 end
         - case when s.ck = 'lp_laurel' and s.sd >= pg_temp.d(-21) then 0.16 else 0 end
         - case when m.ended_on is not null and m.status = 'dropped' and s.sd > m.ended_on - 21 then 0.25 else 0 end as p,
         (s.ck = 'lp_laurel' and s.sd >= pg_temp.d(-21)) as dip,
         pg_temp.nb_id('session:' || s.ck || ':' || s.n) as session_id
  from nb5_sessions s
  join nb5_members m on m.ck = s.ck and m.joined_on <= s.sd and (m.ended_on is null or s.sd <= m.ended_on)
  where s.status = 'held'
),
raw as (
  select b.*,
         (pg_temp.rnd('ex:' || ck || ':' || n || ':' || k) < 0.03
            and not (k in ('david', 'b045', 'b057', 'b069', 'b150') and sd >= pg_temp.d(-42))) as excused,
         case when pg_temp.rnd('ab:' || ck || ':' || n || ':' || k) >= p then 'absent'
              when pg_temp.rnd('lt:' || ck || ':' || n || ':' || k) < case when dip then 0.22 else 0.07 end then 'late'
              else 'present' end as raw_status,
         ((sd + et)::timestamp + make_interval(mins => 5 + floor(pg_temp.rnd('rt:' || ck || ':' || n || ':' || k) * 30)::int))
            at time zone 'America/Los_Angeles' as recorded_at
  from base b
),
ranked as (
  select r.*,
         case when not excused then row_number() over (partition by k, excused order by recorded_at desc) end as rn
  from raw r
),
counted as (
  select r.*, count(*) filter (where rn <= 3 and raw_status = 'absent') over (partition by k) as absent3
  from ranked r
)
select ck, n, sd, k, session_id, recorded_at,
       case
         when excused then 'excused'
         when k = 'david' and rn <= 14 then case when rn in (1, 2, 3, 5, 7, 9) then 'absent' when rn = 8 then 'late' else 'present' end
         when k = 'b045' and rn <= 6 then (array['absent','late','absent','absent','present','late'])[rn]
         when k = 'b057' and rn <= 3 then (array['absent','absent','late'])[rn]
         when k = 'b069' and rn <= 3 then (array['late','absent','absent'])[rn]
         when k = 'b150' and rn <= 3 then (array['absent','absent','present'])[rn]
         when absent3 >= 2 and rn <= 2 and raw_status = 'absent' then case when dip then 'late' else 'present' end
         else raw_status end as status,
       case when ck in ('pw6', 'pw7') and pg_temp.rnd('md:' || ck || ':' || n || ':' || k) < 0.8 then 'qr'
            when ck = 'sw' and pg_temp.rnd('md:' || ck || ':' || n || ':' || k) < 0.7 then 'kiosk'
            when ck like 'lp_%' and pg_temp.rnd('md:' || ck || ':' || n || ':' || k) < 0.04 then 'admin'
            else 'roster' end as method,
       case when ck like 'lp_%' then 'rosa' when ck in ('pw6', 'pw7') then 'andre' else 'simone' end as recorded_by
from counted;

-- ════════════════════════════════════════════════════════════════════════════
-- INSERTS
-- ════════════════════════════════════════════════════════════════════════════
insert into public.students
  (id, org_id, first_name, last_name, email, phone, partner_id, location, stage, notes,
   last_activity_at, external_source, external_id, custom_fields, created_at, updated_at)
select pg_temp.nb_id('student:' || p.k), pg_temp.nb_org(), p.fn, p.ln, p.email, p.phone,
       case when p.site is not null then pg_temp.nb_id('partner:' || p.site)
            when p.placed_emp is not null then pg_temp.nb_id('partner:' || p.placed_emp) end,
       p.neighborhood, p.stage, p.notes,
       greatest(la.last_day, ap.app_day, pg_temp.d(p.created_off)),
       case when p.k in ('b117', 'b118') then 'application' end,
       case p.k when 'b117' then pg_temp.nb_id('app:l1')::text when 'b118' then pg_temp.nb_id('app:l2')::text end,
       jsonb_strip_nulls(jsonb_build_object(
         'grade', p.grade, 'school', p.school, 'track', p.track,
         'guardian_name', p.guardian_name, 'guardian_phone', p.guardian_phone,
         'first_gen', p.first_gen, 'neighborhood', p.neighborhood, 'needs', to_jsonb(p.needs))),
       pg_temp.ts(p.created_off, '11:00'),
       greatest(pg_temp.ts(p.created_off, '11:00'), la.last_ts, ap.app_ts)
from nb5_people p
left join lateral (
  select max(m.sd) filter (where m.status in ('present', 'late')) as last_day,
         max(m.recorded_at) as last_ts
  from nb5_marks m where m.k = p.k) la on true
left join lateral (
  select max(pg_temp.d(coalesce(a.d_off, a.o_off, a.c_off))) as app_day,
         max(pg_temp.ts(a.c_off, a.c_time)) as app_ts
  from nb5_apps a where a.pk = p.k) ap on true
where p.seg <> 'named'
on conflict do nothing;

insert into public.applications
  (id, org_id, cohort_id, student_id, first_name, last_name, email, phone, dob, grade, school, location,
   guardian_name, guardian_email, guardian_phone, motivation, referral, status, priority, screening_notes,
   offered_at, decided_at, external_source, created_at, updated_at)
select pg_temp.nb_id('app:' || a.k), pg_temp.nb_org(), pg_temp.nb_id('cohort:' || a.ck),
       s.id,
       coalesce(s.first_name, a.fn), coalesce(s.last_name, a.ln),
       coalesce(s.email, lower(a.fn) || '.' || lower(a.ln) || '@example.net'),
       coalesce(s.phone, (array['(510)','(341)'])[1 + length(a.k) % 2] || ' 555-01' || lpad((floor(pg_temp.rnd('aph:' || a.k) * 100))::text, 2, '0')),
       (pg_temp.d(0) - a.age * 365 - floor(pg_temp.rnd('dob:' || a.k) * 300)::int),
       coalesce(s.custom_fields ->> 'grade',
                case when a.ck like 'lp_%' then case when a.age <= 14 then '9' else '10' end
                     when a.age <= 18 then '12' else 'Not in school' end),
       coalesce(s.custom_fields ->> 'school',
                case a.ck when 'lp_bayshore' then 'Bayshore Academy' when 'lp_laurel' then 'Laurel Ridge High School' end,
                case when a.age <= 18 then 'Juniper Hill High School' end),
       coalesce(s.location, (array['East Oakland','Fruitvale','West Oakland','San Leandro','Downtown'])[1 + floor(pg_temp.rnd('aloc:' || a.k) * 5)::int]),
       case when a.ck like 'lp_%' or a.age < 18 then coalesce(s.custom_fields ->> 'guardian_name',
            (array['Tamara','Rosario','Denise','Luis','Monica'])[1 + length(a.k) % 5] || ' ' || a.ln) end,
       case when s.id is null and (a.ck like 'lp_%' or a.age < 18)
            then lower((array['Tamara','Rosario','Denise','Luis','Monica'])[1 + length(a.k) % 5]) || '.' || lower(a.ln) || '@example.com' end,
       case when a.ck like 'lp_%' or a.age < 18 then coalesce(s.custom_fields ->> 'guardian_phone',
            '(510) 555-01' || lpad((floor(pg_temp.rnd('agp:' || a.k) * 100))::text, 2, '0')) end,
       a.motivation, a.referral, a.status, a.priority, a.notes,
       case when a.o_off is not null then pg_temp.ts(a.o_off, '10:30') end,
       case when a.d_off is not null then pg_temp.ts(a.d_off, '14:00') end,
       'apply_form',
       pg_temp.ts(a.c_off, a.c_time),
       greatest(pg_temp.ts(a.c_off, a.c_time),
                coalesce(pg_temp.ts(a.d_off, '14:00'), pg_temp.ts(a.o_off, '10:30'), pg_temp.ts(a.c_off, a.c_time)),
                case when a.notes is not null and a.status in ('eligible', 'waitlisted') then pg_temp.ts(least(a.c_off + 3, 0), '16:00') end)
from nb5_apps a
left join public.students s on a.pk is not null and s.id = pg_temp.nb_id('student:' || a.pk) and s.org_id = pg_temp.nb_org()
on conflict do nothing;

insert into public.cohort_members (id, org_id, cohort_id, student_id, status, joined_on, ended_on, created_at)
select pg_temp.nb_id('cm:' || m.ck || ':' || m.k), pg_temp.nb_org(), pg_temp.nb_id('cohort:' || m.ck),
       pg_temp.nb_id('student:' || m.k), m.status, m.joined_on, m.ended_on,
       (m.joined_on::timestamp + time '09:00') at time zone 'America/Los_Angeles'
from nb5_members m
on conflict do nothing;

insert into public.cohort_sessions
  (id, org_id, cohort_id, session_date, title, starts_at, ends_at, location, status, notes, created_at, updated_at)
select pg_temp.nb_id('session:' || s.ck || ':' || s.n), pg_temp.nb_org(), pg_temp.nb_id('cohort:' || s.ck),
       s.sd, s.title, s.st, s.et, s.location, s.status, s.notes,
       (greatest(c.start_date - 10, s.sd - 21)::timestamp + time '09:00') at time zone 'America/Los_Angeles',
       coalesce((select max(m.recorded_at) from nb5_marks m where m.ck = s.ck and m.n = s.n),
                (greatest(c.start_date - 10, s.sd - 21)::timestamp + time '09:00') at time zone 'America/Los_Angeles')
from nb5_sessions s
join nb5_cohorts c on c.k = s.ck
on conflict do nothing;

-- Pass 1: one mark per held session, so any read of the first N rows still
-- sees every session as recorded.
insert into public.attendance (id, org_id, session_id, student_id, status, method, recorded_by, recorded_at)
select pg_temp.nb_id('att:' || m.ck || ':' || m.n || ':' || m.k), pg_temp.nb_org(), m.session_id,
       pg_temp.nb_id('student:' || m.k), m.status, m.method, m.recorded_by, m.recorded_at
from (select distinct on (session_id) * from nb5_marks order by session_id, k) m
order by m.sd desc
on conflict do nothing;

-- Pass 2: everything else, newest first.
insert into public.attendance (id, org_id, session_id, student_id, status, method, recorded_by, recorded_at)
select pg_temp.nb_id('att:' || m.ck || ':' || m.n || ':' || m.k), pg_temp.nb_org(), m.session_id,
       pg_temp.nb_id('student:' || m.k), m.status, m.method, m.recorded_by, m.recorded_at
from nb5_marks m
order by m.sd desc, m.recorded_at desc
on conflict do nothing;

-- ── Named participants (Section 2.5 rows, this org only) ───────────────────
-- David's last activity = his last attended session (the anchor guessed it).
update public.students s
set last_activity_at = x.d
from (select max(sd) d from nb5_marks where k = 'david' and status in ('present', 'late')) x
where s.org_id = pg_temp.nb_org() and s.id = pg_temp.nb_id('student:david')
  and x.d is not null and s.last_activity_at is distinct from x.d;

-- Luis's note named a real university; swap in the story's fictional one.
update public.students
set notes = replace(notes, 'Cal State East Bay', 'Eastshore State University')
where org_id = pg_temp.nb_org() and id = pg_temp.nb_id('student:luis') and notes like '%Cal State East Bay%';

-- ── Profile timelines (audit_log → EntityHistory) for the named five ───────
-- Only where a monthly partition covers the timestamp (production keeps a few
-- months); identity id, so idempotency is a not-exists on (entity, action, ts).
insert into public.audit_log (ts, org_id, actor_user_id, action, entity_type, entity_id, before, after)
select e.ts, pg_temp.nb_org(), pg_temp.nb_user(e.actor), e.action, 'student', pg_temp.nb_id('student:' || e.sk), e.before, e.after
from (
  select 'amara' sk, 'program.student.stage' action, pg_temp.ts((select end_date from nb5_cohorts where k = 'pw6') - pg_temp.nb_anchor(), '16:30') ts, 'andre' actor,
         '{"stage":"enrolled"}'::jsonb before, '{"stage":"alumni"}'::jsonb after
  union all
  select 'amara', 'program.student.update', pg_temp.ts(-93, '10:15'), 'andre', null,
         jsonb_build_object('notes', 'Pathways Cohort 6 graduate (IT support). CompTIA A+ certified. Hired by Kinetic Labs as an IT help-desk technician at $28/hr.')
  union all
  select 'amara', 'program.student.update', pg_temp.ts(-12, '15:40'), 'jordan', null,
         jsonb_build_object('notes', (select notes from public.students where id = pg_temp.nb_id('student:amara') and org_id = pg_temp.nb_org()))
  union all
  select 'luis', 'program.student.update', pg_temp.ts(pg_temp.nb5_sy(3), '16:00'), 'rosa', null,
         jsonb_build_object('custom_fields', jsonb_build_object('grade', '12', 'track', 'Business & finance'))
  union all
  select 'luis', 'program.student.update', pg_temp.ts(-4, '17:50'), 'rosa', null,
         jsonb_build_object('notes', (select notes from public.students where id = pg_temp.nb_id('student:luis') and org_id = pg_temp.nb_org()))
  union all
  select 'keisha', 'program.student.stage', pg_temp.ts((select start_date from nb5_cohorts where k = 'pw7') - pg_temp.nb_anchor(), '09:15'), 'andre',
         '{"stage":"applied"}'::jsonb, '{"stage":"enrolled"}'::jsonb
  union all
  select 'keisha', 'program.student.update', pg_temp.ts(-21, '11:00'), 'andre', null,
         jsonb_build_object('custom_fields', jsonb_build_object('needs', jsonb_build_array('Transit pass')))
  union all
  select 'keisha', 'program.student.update', pg_temp.ts(-7, '14:10'), 'andre', null,
         jsonb_build_object('notes', (select notes from public.students where id = pg_temp.nb_id('student:keisha') and org_id = pg_temp.nb_org()))
  union all
  select 'david', 'program.student.update', pg_temp.ts(-30, '17:40'), 'rosa', null,
         jsonb_build_object('custom_fields', jsonb_build_object('needs', jsonb_build_array('Laptop')))
  union all
  select 'david', 'program.student.update', pg_temp.ts(0, '07:40'), 'rosa',
         jsonb_build_object('notes', 'Launchpad junior at Laurel Ridge. Loaner laptop issued.'),
         jsonb_build_object('notes', (select notes from public.students where id = pg_temp.nb_id('student:david') and org_id = pg_temp.nb_org()))
  union all
  select 'jalen', 'program.student.create', pg_temp.ts(-20, '13:05'), 'andre', null,
         '{"first_name":"Jalen","last_name":"Price","stage":"applied"}'::jsonb
  union all
  select 'jalen', 'program.student.update', pg_temp.ts(-5, '10:20'), 'andre', null,
         jsonb_build_object('notes', (select notes from public.students where id = pg_temp.nb_id('student:jalen') and org_id = pg_temp.nb_org()))
) e
where pg_temp.nb5_audit_ok(e.ts)
  and not exists (select 1 from public.audit_log l
                  where l.org_id = pg_temp.nb_org() and l.entity_type = 'student'
                    and l.entity_id = pg_temp.nb_id('student:' || e.sk) and l.action = e.action and l.ts = e.ts);

commit;
