-- ============================================================================
-- Young, Gifted & Black — demo tenant seed
-- Spec: specs/ygb-demo-tenant.md
--
-- A fully-backfilled fictional ~$500K/yr nonprofit (Black families on the SF
-- Peninsula; summer + weekend programming for kids) used for BloomOS demos.
-- Every person, funder, and number in this file is invented.
--
-- HOW TO APPLY: by hand (SQL editor / MCP), section by section, top to bottom.
-- NEVER move this into supabase/migrations/ — CI applies every migration to a
-- throwaway Postgres, and this seed writes auth.users.
--
-- Idempotent by construction: every row id is md5('ygb:<domain>:<key>')::uuid
-- and every insert is `on conflict do nothing`, so re-running any section is
-- safe. The org id everywhere is md5('ygb:org')::uuid.
--
-- Login: remisobo@gmail.com IS Raymond Williams (CEO). The auth user is
-- pre-created with a random password; sign in via "Forgot password?" (or
-- magic link) on the admin login screen.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — Org core: org, entitlements, terminology, stages, custom fields,
--             pipeline, programs, funds, campaigns, appeals, allowlist, fin_config
-- ════════════════════════════════════════════════════════════════════════════
begin;

insert into public.orgs (id, name, slug, settings)
values (md5('ygb:org')::uuid, 'Young, Gifted & Black', 'young-gifted-black', '{}'::jsonb)
on conflict do nothing;

-- Full-tier demo: every generic module + AI + coaching. No aa.* flags, ever.
insert into public.org_entitlements (org_id, feature_key, enabled, source)
select md5('ygb:org')::uuid, k, true, 'seed:ygb_demo'
from unnest(array[
  'modules.fundraising','modules.finance','modules.program','modules.ops',
  'modules.board','modules.compliance','modules.strategy','modules.staff',
  'modules.reviews','modules.partners','modules.meetings','modules.comms',
  'modules.messages','modules.documents','modules.metrics',
  'ai.reed','ai.prospect_research','coaching'
]) as k
on conflict do nothing;

insert into public.org_terminology (org_id, term_key, label)
select md5('ygb:org')::uuid, t.k, t.v
from (values
  ('student',   'Scholar'),
  ('cohort',    'Crew'),
  ('volunteer', 'Mentor'),
  ('partner',   'Community Partner'),
  ('staff',     'Team')
) as t(k, v)
on conflict do nothing;

-- Scholar lifecycle
insert into public.participant_stages (org_id, stage_key, label, sort_order, engaged, terminal, description)
select md5('ygb:org')::uuid, s.k, s.l, s.o, s.e, s.t, s.d
from (values
  ('interested',  'Interested',   1, false, false, 'Family has reached out or been referred; not yet applied.'),
  ('waitlist',    'Waitlist',     2, false, false, 'Applied; waiting for a seat in a Crew.'),
  ('enrolled',    'Enrolled',     3, true,  false, 'Active scholar in at least one program.'),
  ('alumni',      'Alumni',       4, false, true,  'Graduated out of the program.'),
  ('stepped_away','Stepped Away', 5, false, true,  'Family paused or left the program.')
) as s(k, l, o, e, t, d)
on conflict do nothing;

-- Scholar custom fields
insert into public.custom_field_defs (org_id, entity_type, key, label, field_type, options, required, sort_order)
select md5('ygb:org')::uuid, 'student', f.k, f.l, f.t, f.o, false, f.s
from (values
  ('grade',          'Grade',          'select', '["K","1","2","3","4","5","6","7","8","9","10","11","12"]'::jsonb, 1),
  ('school',         'School',         'text',   null::jsonb, 2),
  ('guardian_name',  'Guardian name',  'text',   null::jsonb, 3),
  ('guardian_phone', 'Guardian phone', 'phone',  null::jsonb, 4),
  ('guardian_email', 'Guardian email', 'email',  null::jsonb, 5),
  ('tshirt_size',    'T-shirt size',   'select', '["YS","YM","YL","AS","AM","AL","AXL"]'::jsonb, 6)
) as f(k, l, t, o, s)
on conflict do nothing;

-- Default fundraising pipeline (required: opportunities carries a composite FK
-- (org_id, pipeline, stage) -> pipeline_stages).
insert into public.pipelines (id, org_id, key, label, sort_order, is_default)
values (md5('ygb:pipeline:default')::uuid, md5('ygb:org')::uuid, 'default', 'Pipeline', 0, true)
on conflict do nothing;

insert into public.pipeline_stages (id, org_id, pipeline, key, label, sort_order, stage_type, probability_default)
select md5('ygb:pstage:'||v.key)::uuid, md5('ygb:org')::uuid, 'default', v.key, v.label, v.sort_order, v.stage_type, v.prob
from (values
  ('identified',            'Identified',                        1, 'open',    10),
  ('researched',            'Researched',                        2, 'open',    20),
  ('needs_appointment',     'Needs Appointment',                 3, 'open',    30),
  ('appointment_scheduled', 'Appointment Scheduled',             4, 'open',    40),
  ('meeting_complete',      'Meeting Complete / Ready for Ask',  5, 'open',    60),
  ('ask_made',              'Ask Made',                          6, 'open',    75),
  ('pledged',               'Pledged',                           7, 'open',    90),
  ('closed_won',            'Closed Won',                        8, 'won',    100),
  ('closed_lost',           'Closed Lost',                       9, 'lost',     0),
  ('on_hold',               'On Hold',                          10, 'on_hold', null::int)
) as v(key, label, sort_order, stage_type, prob)
on conflict do nothing;

insert into public.programs (id, org_id, name, description, active)
select md5('ygb:prog:'||p.k)::uuid, md5('ygb:org')::uuid, p.n, p.d, true
from (values
  ('saturday', 'Saturday Academy',     'School-year Saturday program: literacy, STEM, and Black history & identity, in grade-band Crews.'),
  ('summer',   'Freedom Summer Camp',  'Six-week summer day camp (June–July): academics in the morning, arts, sports, and field trips in the afternoon.'),
  ('village',  'Family Village Nights','Monthly gatherings for the whole family — dinner, community, and a parent circle.'),
  ('tlc',      'Teen Leadership Corps','High-school scholars serving as junior counselors and youth leaders, with stipends.')
) as p(k, n, d)
on conflict do nothing;

insert into public.funds (id, org_id, name, restricted)
select md5('ygb:fund:'||f.k)::uuid, md5('ygb:org')::uuid, f.n, f.r
from (values
  ('genop',       'General Operating',   false),
  ('summer',      'Freedom Summer Fund', true),
  ('scholarship', 'Scholarship Fund',    true)
) as f(k, n, r)
on conflict do nothing;

insert into public.campaigns (id, org_id, name, goal, starts_on, ends_on)
select md5('ygb:camp:'||c.k)::uuid, md5('ygb:org')::uuid, c.n, c.g, c.s, c.e
from (values
  ('vb2025', 'Village Builders 2025', 150000, date '2025-01-01', date '2025-12-31'),
  ('vb2026', 'Village Builders 2026', 200000, date '2026-01-01', date '2026-12-31')
) as c(k, n, g, s, e)
on conflict do nothing;

insert into public.appeals (id, org_id, campaign_id, name, source_code)
select md5('ygb:appeal:'||a.k)::uuid, md5('ygb:org')::uuid, md5('ygb:camp:'||a.c)::uuid, a.n, a.sc
from (values
  ('gt25',     'vb2025', 'GivingTuesday 2025',            'GT25'),
  ('spring26', 'vb2026', 'Spring Family Appeal 2026',     'SPR26'),
  ('gala26',   'vb2026', 'Juneteenth Jubilee Gala 2026',  'GALA26')
) as a(k, c, n, sc)
on conflict do nothing;

-- Access is allowlist-only (no email_domain rule — personal-email tenant).
insert into public.org_email_allowlist (email, org_id, role)
select e.email, md5('ygb:org')::uuid, e.role::org_role
from (values
  ('remisobo@gmail.com',      'owner'),
  ('denise@ygbpeninsula.org', 'admin'),
  ('alicia@ygbpeninsula.org', 'staff'),
  ('gloria@ygbpeninsula.org', 'finance'),
  ('marcus@ygbpeninsula.org', 'staff'),
  ('jamal@ygbpeninsula.org',  'staff')
) as e(email, role)
on conflict do nothing;

insert into public.fin_config
  (org_id, fiscal_year_start_month, current_year, fundraising_goal,
   cash_starting_balance, cash_starting_date, monthly_burn_baseline,
   forward_horizon_months, runway_target_months, cash_reconciled_at, last_reconciled_at)
values
  (md5('ygb:org')::uuid, 1, 2026, 500000,
   208435, date '2026-01-01', 41000,
   3, 6, timestamptz '2026-07-15 09:00:00-07', timestamptz '2026-07-15 09:00:00-07')
on conflict do nothing;

commit;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — Identity: auth users, profiles, memberships, staff org chart
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- Seven auth users: Raymond = remisobo@gmail.com (the demo login), five
-- teammates on the fictional @ygbpeninsula.org domain. Confirmed emails,
-- random bcrypt passwords (nobody knows them; Raymond's is set via the reset
-- flow, the teammates' never — their domain receives no mail).
-- The on_auth_user_created trigger grants memberships from the allowlist rows
-- seeded in Section 1; an explicit backstop insert follows anyway.
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   confirmation_token, recovery_token, email_change, email_change_token_new,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  md5('ygb:user:'||u.k)::uuid, 'authenticated', 'authenticated', u.email,
  extensions.crypt(md5(random()::text), extensions.gen_salt('bf')),
  now(), '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.name),
  now(), now()
from (values
  ('raymond', 'remisobo@gmail.com',      'Raymond Williams'),
  ('denise',  'denise@ygbpeninsula.org', 'Denise Carter'),
  ('alicia',  'alicia@ygbpeninsula.org', 'Alicia Fontaine'),
  ('gloria',  'gloria@ygbpeninsula.org', 'Gloria Hines'),
  ('marcus',  'marcus@ygbpeninsula.org', 'Marcus Boyd'),
  ('jamal',   'jamal@ygbpeninsula.org',  'Jamal Porter')
) as u(k, email, name)
on conflict do nothing;

insert into public.profiles (user_id, display_name)
select md5('ygb:user:'||u.k)::uuid, u.name
from (values
  ('raymond', 'Raymond Williams'),
  ('denise',  'Denise Carter'),
  ('alicia',  'Alicia Fontaine'),
  ('gloria',  'Gloria Hines'),
  ('marcus',  'Marcus Boyd'),
  ('jamal',   'Jamal Porter')
) as u(k, name)
on conflict do nothing;

-- Backstop (the trigger already did this if the users were just created).
insert into public.memberships (user_id, org_id, role)
select md5('ygb:user:'||m.k)::uuid, md5('ygb:org')::uuid, m.role::org_role
from (values
  ('raymond', 'owner'), ('denise', 'admin'), ('alicia', 'staff'),
  ('gloria', 'finance'), ('marcus', 'staff'), ('jamal', 'staff')
) as m(k, role)
on conflict do nothing;

-- Org chart. Raymond first (reports_to targets must already exist — the
-- validation trigger reads the table row-by-row).
insert into public.staff (id, org_id, user_id, full_name, title, reports_to, department, employment_type, start_date, sort_order)
values
  (md5('ygb:staff:raymond')::uuid, md5('ygb:org')::uuid, md5('ygb:user:raymond')::uuid,
   'Raymond Williams', 'Chief Executive Officer', null, 'Leadership', 'staff', date '2019-06-01', 1)
on conflict do nothing;

insert into public.staff (id, org_id, user_id, full_name, title, reports_to, department, employment_type, start_date, sort_order)
select md5('ygb:staff:'||s.k)::uuid, md5('ygb:org')::uuid, md5('ygb:user:'||s.k)::uuid,
       s.name, s.title, md5('ygb:staff:raymond')::uuid, s.dept, 'staff', s.sd, s.o
from (values
  ('denise', 'Denise Carter',   'Director of Programs',                    'Programs',    date '2021-08-16', 2),
  ('alicia', 'Alicia Fontaine', 'Development & Communications Manager',    'Development', date '2023-02-01', 3),
  ('gloria', 'Gloria Hines',    'Operations & Finance Manager (PT)',       'Operations',  date '2022-01-10', 4)
) as s(k, name, title, dept, sd, o)
on conflict do nothing;

insert into public.staff (id, org_id, user_id, full_name, title, reports_to, department, employment_type, start_date, sort_order)
select md5('ygb:staff:'||s.k)::uuid, md5('ygb:org')::uuid, md5('ygb:user:'||s.k)::uuid,
       s.name, s.title, md5('ygb:staff:denise')::uuid, 'Programs', 'staff', s.sd, s.o
from (values
  ('marcus', 'Marcus Boyd',  'Program Coordinator',                    date '2024-06-03', 5),
  ('jamal',  'Jamal Porter', 'Family Engagement Coordinator (PT)',     date '2025-09-02', 6)
) as s(k, name, title, sd, o)
on conflict do nothing;

commit;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — CRM: constituents, board, board meetings, partners, interactions
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- People
insert into public.constituents (id, org_id, type, first_name, last_name, emails, phones, city, state, tags, source, notes)
select md5('ygb:con:'||c.k)::uuid, md5('ygb:org')::uuid, 'person', c.fn, c.ln,
       case when c.em is null then '{}'::text[] else array[c.em] end,
       case when c.ph is null then '{}'::text[] else array[c.ph] end,
       c.city, 'CA', c.tags, 'manual', c.notes
from (values
  -- board (all donors too)
  ('holloway',  'Vanessa',  'Holloway',      'vholloway@example.com',  '(650) 555-0141', 'Menlo Park',     array['board','major_donor'], 'Board chair. Pediatrician. Anchor annual gift, $10K pledge paid quarterly.'),
  ('gaines',    'Terrence', 'Gaines',        'tgaines@example.com',    '(650) 555-0142', 'East Palo Alto', array['board','major_donor'], 'Vice chair. Engineering manager. $15K/3yr pledge with Aisha.'),
  ('okafor',    'Michelle', 'Okafor',        'mokafor@example.com',    '(650) 555-0143', 'San Mateo',      array['board'],               'Treasurer. CPA & wealth manager; referred our tax preparer.'),
  ('daniels',   'Curtis',   'Daniels',       'cdaniels@example.com',   '(650) 555-0144', 'East Palo Alto', array['board'],               'Secretary. Pastor, St. Mark AME — our anchor facility partner.'),
  ('brooks',    'Latoya',   'Brooks',        'lbrooks@example.com',    null,             'Redwood City',   array['board'],               'Biotech program manager. Leads the gala host committee.'),
  ('ellis',     'Damon',    'Ellis',         'dellis@example.com',     '(650) 555-0146', 'Menlo Park',     array['board'],               'Real-estate broker. Door-opener for local business sponsors.'),
  ('reyes',     'Simone',   'Reyes-Jackson', 'sreyesj@example.com',    null,             'East Palo Alto', array['board'],               'Attorney. Reviews MOUs and policies pro bono.'),
  -- major donors
  ('lawrence',  'Charles',  'Lawrence',      'clawrence@example.com',  '(650) 555-0151', 'Atherton',       array['major_donor','gala'],  'Retired tech exec; gives jointly with Karen. $25K in April; upgrade conversation open.'),
  ('whitfield', 'Andre',    'Whitfield',     'awhitfield@example.com', null,             'Palo Alto',      array['major_donor'],         'Gives appreciated stock each February.'),
  ('dubois',    'Renee',    'Dubois-Clark',  'rdclark@example.com',    '(650) 555-0153', 'Menlo Park',     array['major_donor','gala'],  'Gala table captain two years running.'),
  ('hollis',    'Gerald',   'Hollis',        'ghollis@example.com',    null,             'San Carlos',     array['major_donor','gala'],  'New this year via Damon Ellis.'),
  ('natarajan', 'Priya',    'Natarajan',     'pnatarajan@example.com', null,             'Palo Alto',      array['gala'],                'Ally donor; met at the 2025 showcase.'),
  ('kim',       'David',    'Kim',           'dkim@example.com',       null,             'Redwood City',   array['gala'],                'GivingTuesday and gala donor.'),
  -- community & monthly donors
  ('simmons',   'Angela',   'Simmons',       'asimmons@example.com',   null,             'East Palo Alto', array['monthly_donor'],       '$50/month since 2024.'),
  ('peoples',   'Robert',   'Peoples',       'rpeoples@example.com',   null,             'East Palo Alto', array['monthly_donor'],       '$25/month; retired teacher.'),
  ('montgomery','Keisha',   'Montgomery',    'kmontgomery@example.com',null,             'Menlo Park',     array['monthly_donor'],       '$100/month; alum parent.'),
  ('grantf',    'Felicia',  'Grant',         'fgrant@example.com',     null,             'Redwood City',   array['monthly_donor'],       '$50/month.'),
  ('baxter',    'Jerome',   'Baxter',        'jbaxter@example.com',    null,             'San Mateo',      array['monthly_donor'],       '$150/month; asks for zero recognition.'),
  ('ellison',   'Tamika',   'Ellison',       'tellison@example.com',   null,             'East Palo Alto', array['monthly_donor'],       'Card failed in June — plan paused, needs a call.'),
  ('jenkinsp',  'Darnell',  'Jenkins',       'djenkins@example.com',   '(650) 555-0161', 'East Palo Alto', array['monthly_donor','parent'], 'Scholar parent (Amara & Malik). $50/month.'),
  ('carverp',   'Yvette',   'Carver',        'ycarver@example.com',    '(650) 555-0162', 'East Palo Alto', array['parent'],              'Scholar parent (Zoe & Elijah). Gives at appeals.'),
  ('osei',      'Kwame',    'Osei',          'kosei@example.com',      null,             'Menlo Park',     array['gala'],                'First gift at the 2026 gala.'),
  ('fitz',      'Erica',    'Fitzgerald',    'efitzgerald@example.com',null,             'Burlingame',     array['gala'],                'Gala paddle raise; July follow-on gift.'),
  ('mason',     'Harold',   'Mason',         'hmason@example.com',     null,             'East Palo Alto', array[]::text[],              'Year-end and spring appeal donor.'),
  ('royce',     'Brianna',  'Royce',         'broyce@example.com',     null,             'Redwood City',   array['gala'],                'Came with the Dubois-Clark table.')
) as c(k, fn, ln, em, ph, city, tags, notes)
on conflict do nothing;

-- Organizations (funders, sponsors, partners-as-constituents)
insert into public.constituents (id, org_id, type, org_name, emails, city, state, tags, source, notes)
select md5('ygb:con:'||c.k)::uuid, md5('ygb:org')::uuid, 'organization', c.n,
       case when c.em is null then '{}'::text[] else array[c.em] end,
       c.city, 'CA', c.tags, 'manual', c.notes
from (values
  ('bayfront',  'Bayfront Community Foundation',           'grants@bayfrontcf.example.org',  'San Mateo',      array['foundation'],  'Anchor funder. $75K general operating, 2026. PO: Diane Castillo.'),
  ('sandhill',  'Sand Hill Family Foundation',             'info@sandhillff.example.org',    'Menlo Park',     array['foundation'],  '$50K capacity-building award, May 2026, paid July.'),
  ('copley',    'Copley Family Foundation',                'programs@copleyff.example.org',  'Palo Alto',      array['foundation'],  '$25K Saturday Academy proposal submitted June 20; decision expected September.'),
  ('westbay',   'Westbay Fund for Children',               'loi@westbayfund.example.org',    'San Francisco',  array['foundation'],  'New prospect via Vanessa Holloway. LOI due Aug 15 for Freedom Summer 2027.'),
  ('menlotech', 'Menlo Tech Gives',                        'giving@menlotech.example.com',   'Menlo Park',     array['corporate'],   'Corporate giving arm. Gala presenting sponsor; fall renewal conversation open.'),
  ('pcu',       'Peninsula Credit Union',                  'community@pcu.example.com',      'Redwood City',   array['corporate'],   'Gala sponsor two years running.'),
  ('county',    'San Mateo County — Youth Development Fund', null,                           'Redwood City',   array['government'],  '$60K FY26 award, restricted to Freedom Summer. Interim report submitted June 15.'),
  ('oakivy',    'Oak & Ivy Fund',                          null,                            'San Francisco',  array['foundation'],  'Researched: funds identity-affirming youth programs, $15–25K typical.'),
  ('techbridge','TechBridge Menlo',                        'csr@techbridge.example.com',     'Menlo Park',     array['corporate'],   'Declined 2026 gala sponsorship; keep for volunteer days.'),
  ('stmark',    'St. Mark AME Church',                     'office@stmarkame.example.org',   'East Palo Alto', array['partner'],     'Anchor facility partner; in-kind space valued ~$30K/yr.')
) as c(k, n, em, city, tags, notes)
on conflict do nothing;

-- Board of directors
insert into public.board_members (id, org_id, constituent_id, name, email, officer_role, term_start, term_end, term_number, coi_signed_at, status, notes)
select md5('ygb:board:'||b.k)::uuid, md5('ygb:org')::uuid, md5('ygb:con:'||b.k)::uuid,
       b.n, b.em, b.role, b.ts, b.te, b.tn, b.coi, 'active', b.notes
from (values
  ('holloway', 'Dr. Vanessa Holloway',   'vholloway@example.com', 'chair',      date '2023-01-01', date '2026-12-31', 2, date '2026-01-21', 'Pediatrician, Stanford Children''s. Chairs gala host committee with Latoya.'),
  ('gaines',   'Terrence Gaines',        'tgaines@example.com',   'vice_chair', date '2024-01-01', date '2026-12-31', 1, date '2026-01-21', 'Engineering manager. Leads the tech-sector sponsor push.'),
  ('okafor',   'Michelle Okafor',        'mokafor@example.com',   'treasurer',  date '2023-01-01', date '2026-12-31', 2, date '2026-01-21', 'CPA. Chairs finance committee; reviews the runway view monthly.'),
  ('daniels',  'Rev. Curtis Daniels',    'cdaniels@example.com',  'secretary',  date '2022-01-01', date '2026-12-31', 2, date '2026-01-21', 'Pastor, St. Mark AME.'),
  ('brooks',   'Latoya Brooks',          'lbrooks@example.com',   'member',     date '2025-01-01', date '2027-12-31', 1, date '2026-01-21', 'Biotech program manager.'),
  ('ellis',    'Damon Ellis',            'dellis@example.com',    'member',     date '2024-01-01', date '2026-12-31', 1, date '2026-03-18', 'Real-estate broker.'),
  ('reyes',    'Simone Reyes-Jackson',   'sreyesj@example.com',   'member',     date '2025-01-01', date '2027-12-31', 1, date '2026-01-21', 'Attorney (pro bono counsel).')
) as b(k, n, em, role, ts, te, tn, coi, notes)
on conflict do nothing;

-- Board meetings: Jan/Mar/May approved, Jul draft, Sep upcoming.
insert into public.board_meetings (id, org_id, meeting_date, title, agenda, attendance, quorum_met, minutes, minutes_status, approved_at)
select md5('ygb:bm:'||m.k)::uuid, md5('ygb:org')::uuid, m.d, m.t, m.agenda::jsonb,
       (select jsonb_agg(jsonb_build_object('member_id', md5('ygb:board:'||bk)::uuid, 'present', not (bk = any(m.absent))))
          from unnest(array['holloway','gaines','okafor','daniels','brooks','ellis','reyes']) bk),
       m.q, m.minutes, m.ms, m.appr
from (values
  ('2601', date '2026-01-21', 'Q1 board meeting',
   '[{"title":"Consent agenda: Nov minutes, policy calendar","kind":"consent","notes":""},{"title":"2026 budget adoption ($500K)","kind":"normal","notes":"Adopted unanimously"},{"title":"Fundraising: Village Builders 2026 kickoff","kind":"normal","notes":""},{"title":"Program: Saturday Academy mid-year report","kind":"normal","notes":""}]',
   array[]::text[], true,
   'Budget adopted at $500,000 with a contingency trigger reviewed by the finance committee. Gala date confirmed for June 14. Denise presented Saturday Academy mid-year attendance at 84%.',
   'approved', timestamptz '2026-03-18 19:05:00-07'),
  ('2603', date '2026-03-18', 'Q1.5 board meeting',
   '[{"title":"Consent agenda: Jan minutes","kind":"consent","notes":""},{"title":"Freedom Summer 2026 enrollment & staffing","kind":"normal","notes":""},{"title":"Gala host committee report","kind":"normal","notes":""},{"title":"990 engagement letter","kind":"normal","notes":"Okafor referral engaged"}]',
   array['ellis']::text[], true,
   'Freedom Summer on track for 55–60 scholars. Gala sponsorships at $18K committed. CPA engaged for FY25 990.',
   'approved', timestamptz '2026-05-20 19:02:00-07'),
  ('2605', date '2026-05-20', 'Q2 board meeting',
   '[{"title":"Consent agenda: Mar minutes","kind":"consent","notes":""},{"title":"Cash & runway review (Okafor)","kind":"normal","notes":""},{"title":"Sand Hill award announcement","kind":"normal","notes":"$50K capacity building"},{"title":"Gala run-of-show","kind":"normal","notes":""}]',
   array['reyes']::text[], true,
   'Okafor flagged the summer cash dip; board affirmed the 6-month reserve target and the fall pipeline plan. Sand Hill $50K award celebrated.',
   'approved', timestamptz '2026-07-15 19:10:00-07'),
  ('2607', date '2026-07-15', 'Q3 board meeting',
   '[{"title":"Consent agenda: May minutes","kind":"consent","notes":""},{"title":"Gala results: $52K individual + sponsors","kind":"normal","notes":""},{"title":"Freedom Summer week-4 report","kind":"normal","notes":""},{"title":"Fall fundraising: closing the gap to $500K","kind":"normal","notes":"Westbay LOI, Copley decision, year-end appeal"}]',
   array['brooks']::text[], true,
   'DRAFT — Gala netted ~$40K after costs. Freedom Summer at 59 scholars, attendance strong. Board reviewed the path to the $500K goal: $347K received or committed, $148K in the pipeline (~$95K weighted) — Westbay LOI and the Copley decision are the near-term plays.',
   'draft', null),
  ('2609', date '2026-09-16', 'Q3.5 board meeting',
   '[{"title":"Consent agenda: Jul minutes","kind":"consent","notes":""},{"title":"Board retreat: 2027–29 strategy refresh","kind":"normal","notes":""},{"title":"Saturday Academy 2026–27 launch report","kind":"normal","notes":""},{"title":"990 draft review","kind":"normal","notes":""}]',
   array[]::text[], null, null, 'draft', null)
) as m(k, d, t, agenda, absent, q, minutes, ms, appr)
on conflict do nothing;

-- Community partners
insert into public.partners (id, org_id, constituent_id, name, kind, status, champion_name, champion_email, champion_role, program_type, mou_status, mou_start, mou_end, city, notes, last_touch_at)
select md5('ygb:partner:'||p.k)::uuid, md5('ygb:org')::uuid,
       case when p.con is null then null else md5('ygb:con:'||p.con)::uuid end,
       p.n, p.kind, p.status, p.cn, p.ce, p.cr, p.pt, p.ms, p.mou, p.me, p.city, p.notes, p.lt
from (values
  ('stmark',     'stmark', 'St. Mark AME Church',                  'nonprofit', 'anchor',   'Rev. Curtis Daniels', 'cdaniels@example.com',    'Pastor',                        'Facility host',      'signed', date '2024-08-01', date '2027-07-31', 'East Palo Alto', 'Home base: Saturday Academy, Freedom Summer, and Village Nights run in the fellowship hall. In-kind space ~$30K/yr.', date '2026-07-10'),
  ('ravenswood', null,     'Ravenswood City School District',      'district',  'active',   'Dr. Elaine Mosley',   'emosley@example.org',     'Dir. of Community Engagement',  'Recruitment',        'signed', date '2025-09-01', date '2026-08-31', 'East Palo Alto', 'Flyers + counselor referrals across district schools; back-to-school-night tabling each fall.', date '2026-06-05'),
  ('bellehaven', null,     'Belle Haven Elementary',               'school',    'active',   'Ms. Dana Whitcomb',   'dwhitcomb@example.org',   'Counselor',                     'Referrals',          'signed', date '2025-09-01', date '2026-08-31', 'Menlo Park',     'Largest single source of scholar referrals.', date '2026-05-28'),
  ('bayside',    null,     'Bayside Community Center',             'nonprofit', 'pilot',    'Luis Herrera',        'lherrera@example.org',    'Program Director',              'Satellite site',     'drafting', null, null,                       'Redwood City',   'Pilot: could host a Redwood City Saturday Crew in 2027.', date '2026-06-30'),
  ('pbpn',       null,     'Peninsula Black Professionals Network','nonprofit', 'active',   'Camille Wright',      'cwright@example.org',     'Chapter President',             'Mentor pipeline',    'none',   null, null,                       'San Mateo',      '14 mentors sourced for Saturday Academy and career days.', date '2026-04-18'),
  ('techbridge', 'techbridge', 'TechBridge Menlo',                 'company',   'outreach', 'Priya Shah',          'pshah@techbridge.example.com', 'CSR Lead',                 'Volunteers',         'none',   null, null,                       'Menlo Park',     'Declined gala sponsorship; interested in employee volunteer days instead.', date '2026-05-12')
) as p(k, con, n, kind, status, cn, ce, cr, pt, ms, mou, me, city, notes, lt)
on conflict do nothing;

-- Relationship touches
insert into public.interactions (id, org_id, constituent_id, kind, occurred_at, notes, logged_by, direction, subject)
select md5('ygb:int:'||i.k)::uuid, md5('ygb:org')::uuid, md5('ygb:con:'||i.con)::uuid,
       i.kind, i.at, i.notes, i.by, i.dir, i.subj
from (values
  ('bay-0708',  'bayfront',  'call',    timestamptz '2026-07-08 10:30:00-07', 'Quarterly check-in with Diane. Flagged interim report lands July 31; she hinted at a possible multi-year conversation for 2027. Invite her to the Freedom Summer closing ceremony.', 'Alicia Fontaine', 'outbound', 'Q3 check-in'),
  ('west-0625', 'westbay',   'meeting', timestamptz '2026-06-25 14:00:00-07', 'Intro meeting (Vanessa opened the door). Program officer Marcus Lin wants the LOI to lead with family-engagement outcomes, not just academics. LOI due Aug 15.', 'Raymond Williams', 'outbound', 'Intro — Freedom Summer 2027'),
  ('law-0716',  'lawrence',  'note',    timestamptz '2026-07-16 09:00:00-07', 'Karen emailed: dinner on Aug 7 confirmed. Goal: invite them to anchor the Scholarship Fund at $50K. Bring one-pager + scholar story.', 'Raymond Williams', null, 'Upgrade dinner prep'),
  ('holl-0710', 'holloway',  'meeting', timestamptz '2026-07-10 08:00:00-07', 'Monthly chair 1:1. Aligned on retreat agenda (2027–29 strategy refresh) and the fall gap plan. She will personally follow up with Westbay after the LOI goes in.', 'Raymond Williams', 'outbound', 'Chair 1:1'),
  ('cnty-0615', 'county',    'email',   timestamptz '2026-06-15 16:20:00-07', 'Submitted FY26 interim report: 59 scholars enrolled for summer, 92% from EPA/Belle Haven. Second payment ($30K) releases after September review.', 'Gloria Hines', 'outbound', 'Interim report submitted'),
  ('mtg-0701',  'menlotech', 'email',   timestamptz '2026-07-01 11:00:00-07', 'Thanked them for presenting sponsorship; opened the fall renewal conversation ($10K ask). Their giving window opens Sept 1.', 'Alicia Fontaine', 'outbound', 'Renewal — fall window'),
  ('whit-0212', 'whitfield', 'call',    timestamptz '2026-02-12 15:00:00-07', 'Thank-you call for the stock gift. He prefers no public recognition. Interested in mentoring a TLC teen next year.', 'Raymond Williams', 'outbound', 'Stock gift thank-you'),
  ('cop-0620',  'copley',    'note',    timestamptz '2026-06-20 12:00:00-07', 'Saturday Academy expansion proposal submitted ($25K). Decision expected at their September docket.', 'Alicia Fontaine', null, 'Proposal submitted'),
  ('pcu-0403',  'pcu',       'meeting', timestamptz '2026-04-03 09:30:00-07', 'Sponsorship meeting: renewed at $10K (gala). Branch manager wants a financial-literacy workshop for Village Night this fall.', 'Alicia Fontaine', 'outbound', 'Gala sponsorship'),
  ('sand-0528', 'sandhill',  'call',    timestamptz '2026-05-28 13:00:00-07', 'Award call: $50K unrestricted capacity-building. They specifically cited the board''s giving participation (100%) as a factor.', 'Raymond Williams', 'inbound', 'Award notification'),
  ('gala-ok',   'okafor',    'event',   timestamptz '2026-06-14 18:00:00-07', 'Attended Juneteenth Jubilee Gala; gave $5,000.', 'Alicia Fontaine', null, 'Juneteenth Jubilee Gala'),
  ('gala-du',   'dubois',    'event',   timestamptz '2026-06-14 18:00:00-07', 'Table captain; her table gave $9,750 combined.', 'Alicia Fontaine', null, 'Juneteenth Jubilee Gala'),
  ('gala-os',   'osei',      'event',   timestamptz '2026-06-14 18:00:00-07', 'First-time donor at the paddle raise. Send welcome packet.', 'Alicia Fontaine', null, 'Juneteenth Jubilee Gala'),
  ('gala-ho',   'hollis',    'event',   timestamptz '2026-06-14 18:00:00-07', 'Came via Damon Ellis; $3,500 paddle raise. Wants a program tour.', 'Alicia Fontaine', null, 'Juneteenth Jubilee Gala'),
  ('ell-0702',  'ellison',   'note',    timestamptz '2026-07-02 10:00:00-07', 'Monthly gift card declined twice (June). Jamal knows the family — soft outreach, no dunning email.', 'Alicia Fontaine', null, 'Monthly plan paused'),
  ('jenk-0523', 'jenkinsp',  'call',    timestamptz '2026-05-23 17:30:00-07', 'Darnell offered to speak at the gala about what Saturday mornings mean to Amara and Malik. He crushed it.', 'Jamal Porter', 'outbound', 'Gala parent speaker'),
  ('oak-0611',  'oakivy',    'note',    timestamptz '2026-06-11 09:00:00-07', 'Research: funds identity-affirming youth programs in the Bay, $15–25K typical first grants, rolling LOIs. Warm path: their trustee spoke at PBPN in March.', 'Alicia Fontaine', null, 'Prospect research')
) as i(k, con, kind, at, notes, by, dir, subj)
on conflict do nothing;

commit;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — Money in: recurring plans, pledges, gifts, pledge payments,
--             grants (+payments/requirements), asks, opportunities
-- ════════════════════════════════════════════════════════════════════════════
begin;

insert into public.recurring_plans (id, org_id, constituent_id, amount, frequency, status, last_charged_at, last_payment_failed_at)
select md5('ygb:rp:'||r.k)::uuid, md5('ygb:org')::uuid, md5('ygb:con:'||r.k)::uuid,
       r.amt, 'monthly', r.status, r.lc, r.lf
from (values
  ('simmons',    50,  'active', timestamptz '2026-07-01 06:00:00-07', null::timestamptz),
  ('peoples',    25,  'active', timestamptz '2026-07-01 06:00:00-07', null),
  ('montgomery', 100, 'active', timestamptz '2026-07-01 06:00:00-07', null),
  ('grantf',     50,  'active', timestamptz '2026-07-01 06:00:00-07', null),
  ('baxter',     150, 'active', timestamptz '2026-07-01 06:00:00-07', null),
  ('jenkinsp',   50,  'active', timestamptz '2026-07-01 06:00:00-07', null),
  ('ellison',    25,  'paused', timestamptz '2026-05-01 06:00:00-07', timestamptz '2026-06-02 06:00:00-07')
) as r(k, amt, status, lc, lf)
on conflict do nothing;

insert into public.pledges (id, org_id, constituent_id, total_amount, installment_count, frequency, start_date, campaign_id, fund_id, status, notes)
select md5('ygb:pledge:'||p.k)::uuid, md5('ygb:org')::uuid, md5('ygb:con:'||p.con)::uuid,
       p.total, p.n, p.freq, p.sd, md5('ygb:camp:'||p.camp)::uuid, md5('ygb:fund:genop')::uuid, 'active', p.notes
from (values
  ('gaines',   'gaines',   15000, 3, 'annually',  date '2025-03-01', 'vb2025', 'Terrence & Aisha Gaines — $5K/yr for three years.'),
  ('holloway', 'holloway', 10000, 4, 'quarterly', date '2026-01-15', 'vb2026', 'Board chair annual pledge, paid quarterly.')
) as p(k, con, total, n, freq, sd, camp, notes)
on conflict do nothing;

-- Gifts. FY2025 history first, then FY2026. Monthly-donor gifts carry their plan.
insert into public.gifts (id, org_id, constituent_id, amount, gift_date, method, fund_id, campaign_id, appeal_id, recurring_plan_id, acknowledgment_status, acknowledged_at, notes)
select md5('ygb:gift:'||g.k)::uuid, md5('ygb:org')::uuid, md5('ygb:con:'||g.con)::uuid,
       g.amt, g.d, g.m,
       md5('ygb:fund:'||g.fund)::uuid,
       case when g.camp is null then null else md5('ygb:camp:'||g.camp)::uuid end,
       case when g.appeal is null then null else md5('ygb:appeal:'||g.appeal)::uuid end,
       case when g.rp is null then null else md5('ygb:rp:'||g.rp)::uuid end,
       g.ack, g.ackat, g.notes
from (values
  -- ── FY2025 ──
  ('bayfront25',   'bayfront',  60000, date '2025-02-15', 'ach',   'genop',  'vb2025', null::text, null::text, 'sent', timestamptz '2025-02-20 09:00:00-08', 'FY25 general operating grant.'),
  ('county25',     'county',    55000, date '2025-03-10', 'ach',   'summer', 'vb2025', null, null, 'sent', timestamptz '2025-03-14 09:00:00-08', 'FY25 Youth Development Fund (restricted: Freedom Summer).'),
  ('menlotech25',  'menlotech', 20000, date '2025-06-10', 'check', 'genop',  'vb2025', null, null, 'sent', timestamptz '2025-06-13 09:00:00-07', '2025 gala presenting sponsor.'),
  ('pcu25',        'pcu',        7500, date '2025-06-10', 'check', 'genop',  'vb2025', null, null, 'sent', timestamptz '2025-06-13 09:00:00-07', '2025 gala sponsor.'),
  ('gaines25',     'gaines',     5000, date '2025-03-03', 'check', 'genop',  'vb2025', null, null, 'sent', timestamptz '2025-03-05 09:00:00-08', 'Pledge installment 1 of 3.'),
  ('lawrence25',   'lawrence',  20000, date '2025-04-20', 'stock', 'genop',  'vb2025', null, null, 'sent', timestamptz '2025-04-24 09:00:00-07', null),
  ('whitfield25',  'whitfield', 10000, date '2025-02-01', 'stock', 'genop',  'vb2025', null, null, 'sent', timestamptz '2025-02-05 09:00:00-08', null),
  ('holloway25',   'holloway',  10000, date '2025-05-15', 'check', 'genop',  'vb2025', null, null, 'sent', timestamptz '2025-05-19 09:00:00-07', null),
  ('okafor25',     'okafor',     5000, date '2025-11-30', 'card',  'genop',  'vb2025', null, null, 'sent', timestamptz '2025-12-02 09:00:00-08', null),
  ('ellis25',      'ellis',      2500, date '2025-12-15', 'card',  'genop',  'vb2025', null, null, 'sent', timestamptz '2025-12-17 09:00:00-08', null),
  ('daniels25',    'daniels',    1000, date '2025-12-20', 'check', 'genop',  'vb2025', null, null, 'sent', timestamptz '2025-12-23 09:00:00-08', null),
  ('brooks25',     'brooks',     1500, date '2025-12-02', 'card',  'genop',  'vb2025', 'gt25', null, 'sent', timestamptz '2025-12-04 09:00:00-08', 'GivingTuesday.'),
  ('reyes25',      'reyes',      2000, date '2025-12-02', 'card',  'genop',  'vb2025', 'gt25', null, 'sent', timestamptz '2025-12-04 09:00:00-08', 'GivingTuesday.'),
  ('dubois25',     'dubois',     5000, date '2025-12-02', 'card',  'genop',  'vb2025', 'gt25', null, 'sent', timestamptz '2025-12-04 09:00:00-08', 'GivingTuesday match captain.'),
  ('kim25',        'kim',        2500, date '2025-12-02', 'card',  'genop',  'vb2025', 'gt25', null, 'sent', timestamptz '2025-12-04 09:00:00-08', 'GivingTuesday.'),
  ('mason25',      'mason',      1000, date '2025-12-28', 'check', 'genop',  'vb2025', null, null, 'sent', timestamptz '2025-12-31 09:00:00-08', 'Year-end.'),
  ('natarajan25',  'natarajan',  3000, date '2025-12-31', 'card',  'genop',  'vb2025', null, null, 'sent', timestamptz '2026-01-03 09:00:00-08', 'Year-end.'),
  -- ── FY2026: grants & majors ──
  ('bayfront26a',  'bayfront',  37500, date '2026-01-15', 'ach',   'genop',  'vb2026', null, null, 'sent', timestamptz '2026-01-19 09:00:00-08', 'Grant payment 1 of 2.'),
  ('county26a',    'county',    30000, date '2026-02-10', 'ach',   'summer', 'vb2026', null, null, 'sent', timestamptz '2026-02-12 09:00:00-08', 'Grant payment 1 of 2 (restricted: Freedom Summer).'),
  ('sandhill26',   'sandhill',  50000, date '2026-07-02', 'ach',   'genop',  'vb2026', null, null, 'sent', timestamptz '2026-07-06 09:00:00-07', 'Capacity-building award, paid in full.'),
  ('holloway26q1', 'holloway',   2500, date '2026-01-15', 'check', 'genop',  'vb2026', null, null, 'sent', timestamptz '2026-01-20 09:00:00-08', 'Pledge Q1.'),
  ('holloway26q2', 'holloway',   2500, date '2026-04-15', 'check', 'genop',  'vb2026', null, null, 'sent', timestamptz '2026-04-17 09:00:00-07', 'Pledge Q2.'),
  ('gaines26',     'gaines',     5000, date '2026-03-02', 'check', 'genop',  'vb2026', null, null, 'sent', timestamptz '2026-03-05 09:00:00-08', 'Pledge installment 2 of 3.'),
  ('whitfield26',  'whitfield', 10000, date '2026-02-06', 'stock', 'genop',  'vb2026', null, null, 'sent', timestamptz '2026-02-12 09:00:00-08', 'Appreciated stock.'),
  ('lawrence26',   'lawrence',  25000, date '2026-04-22', 'stock', 'genop',  'vb2026', null, null, 'sent', timestamptz '2026-04-27 09:00:00-07', 'Chip & Karen — annual gift.'),
  -- ── FY2026: spring appeal ──
  ('daniels26',    'daniels',     500, date '2026-04-28', 'check', 'genop',  'vb2026', 'spring26', null, 'sent', timestamptz '2026-05-01 09:00:00-07', null),
  ('brooks26',     'brooks',     1000, date '2026-05-05', 'card',  'genop',  'vb2026', 'spring26', null, 'sent', timestamptz '2026-05-07 09:00:00-07', null),
  ('carver26',     'carverp',     250, date '2026-05-06', 'card',  'genop',  'vb2026', 'spring26', null, 'sent', timestamptz '2026-05-08 09:00:00-07', 'Scholar parent.'),
  ('mason26',      'mason',       500, date '2026-05-10', 'check', 'genop',  'vb2026', 'spring26', null, 'sent', timestamptz '2026-05-13 09:00:00-07', null),
  ('kim26',        'kim',        1000, date '2026-05-12', 'card',  'genop',  'vb2026', 'spring26', null, 'sent', timestamptz '2026-05-14 09:00:00-07', null),
  -- ── FY2026: Juneteenth Jubilee Gala (Jun 14) ──
  ('pcu26',        'pcu',       10000, date '2026-06-14', 'check', 'genop',  'vb2026', 'gala26', null, 'sent', timestamptz '2026-06-18 09:00:00-07', 'Gala sponsor.'),
  ('menlotech26',  'menlotech', 15000, date '2026-06-14', 'ach',   'genop',  'vb2026', 'gala26', null, 'sent', timestamptz '2026-06-18 09:00:00-07', 'Presenting sponsor.'),
  ('okafor26',     'okafor',     5000, date '2026-06-14', 'card',  'genop',  'vb2026', 'gala26', null, 'sent', timestamptz '2026-06-19 09:00:00-07', null),
  ('ellis26',      'ellis',      2500, date '2026-06-14', 'card',  'genop',  'vb2026', 'gala26', null, 'sent', timestamptz '2026-06-19 09:00:00-07', null),
  ('reyes26',      'reyes',      2500, date '2026-06-14', 'card',  'genop',  'vb2026', 'gala26', null, 'sent', timestamptz '2026-06-19 09:00:00-07', null),
  ('dubois26',     'dubois',     5000, date '2026-06-14', 'card',  'genop',  'vb2026', 'gala26', null, 'sent', timestamptz '2026-06-19 09:00:00-07', 'Table captain.'),
  ('gaines26g',    'gaines',     2000, date '2026-06-14', 'card',  'genop',  'vb2026', 'gala26', null, 'sent', timestamptz '2026-06-19 09:00:00-07', 'Paddle raise (above pledge).'),
  ('hollis26',     'hollis',     3500, date '2026-06-14', 'card',  'scholarship', 'vb2026', 'gala26', null, 'sent', timestamptz '2026-06-19 09:00:00-07', 'Paddle raise — directed to Scholarship Fund.'),
  ('natarajan26',  'natarajan',  2000, date '2026-06-14', 'card',  'genop',  'vb2026', 'gala26', null, 'sent', timestamptz '2026-06-19 09:00:00-07', null),
  ('osei26',       'osei',       1500, date '2026-06-14', 'card',  'genop',  'vb2026', 'gala26', null, 'sent', timestamptz '2026-06-19 09:00:00-07', 'First gift.'),
  ('fitz26',       'fitz',       1000, date '2026-06-14', 'card',  'genop',  'vb2026', 'gala26', null, 'sent', timestamptz '2026-06-19 09:00:00-07', null),
  ('royce26',      'royce',       750, date '2026-06-14', 'card',  'genop',  'vb2026', 'gala26', null, 'sent', timestamptz '2026-06-19 09:00:00-07', null),
  ('baxter26g',    'baxter',      500, date '2026-06-14', 'card',  'genop',  'vb2026', 'gala26', null, 'sent', timestamptz '2026-06-19 09:00:00-07', 'Above his monthly plan.'),
  ('simmons26g',   'simmons',     250, date '2026-06-14', 'card',  'genop',  'vb2026', 'gala26', null, 'sent', timestamptz '2026-06-19 09:00:00-07', null),
  -- ── FY2026: July gifts, some deliberately awaiting acknowledgment ──
  ('fitz26jul',    'fitz',        250, date '2026-07-12', 'card',  'genop',  'vb2026', null, null, 'pending', null, 'Follow-on after the gala.'),
  ('carver26jul',  'carverp',     500, date '2026-07-15', 'check', 'scholarship', 'vb2026', null, null, 'pending', null, 'For another family''s camp seat.'),
  ('hollis26jul',  'hollis',     1000, date '2026-07-16', 'ach',   'genop',  'vb2026', null, null, 'pending', null, 'After his program tour.')
) as g(k, con, amt, d, m, fund, camp, appeal, rp, ack, ackat, notes)
on conflict do nothing;

-- Monthly-donor gifts: May, June, July for each active plan.
insert into public.gifts (id, org_id, constituent_id, amount, gift_date, method, fund_id, campaign_id, recurring_plan_id, acknowledgment_status, notes)
select md5('ygb:gift:rp:'||p.k||':'||mo)::uuid, md5('ygb:org')::uuid, md5('ygb:con:'||p.k)::uuid,
       p.amt, make_date(2026, mo, 1), 'card', md5('ygb:fund:genop')::uuid, md5('ygb:camp:vb2026')::uuid,
       md5('ygb:rp:'||p.k)::uuid, 'not_required', 'Monthly gift.'
from (values
  ('simmons', 50), ('peoples', 25), ('montgomery', 100),
  ('grantf', 50), ('baxter', 150), ('jenkinsp', 50)
) as p(k, amt),
generate_series(5, 7) as mo
on conflict do nothing;

-- Pledge payment schedules, linked to the gifts above.
insert into public.pledge_payments (id, org_id, pledge_id, due_date, expected_amount, status, gift_id, paid_at)
select md5('ygb:pp:'||p.k)::uuid, md5('ygb:org')::uuid, md5('ygb:pledge:'||p.pl)::uuid,
       p.due, p.amt, p.status,
       case when p.gift is null then null else md5('ygb:gift:'||p.gift)::uuid end, p.paid
from (values
  ('gaines-1',   'gaines',   date '2025-03-01', 5000, 'paid',      'gaines25',     timestamptz '2025-03-03 09:00:00-08'),
  ('gaines-2',   'gaines',   date '2026-03-01', 5000, 'paid',      'gaines26',     timestamptz '2026-03-02 09:00:00-08'),
  ('gaines-3',   'gaines',   date '2027-03-01', 5000, 'scheduled', null::text,     null::timestamptz),
  ('holloway-1', 'holloway', date '2026-01-15', 2500, 'paid',      'holloway26q1', timestamptz '2026-01-15 09:00:00-08'),
  ('holloway-2', 'holloway', date '2026-04-15', 2500, 'paid',      'holloway26q2', timestamptz '2026-04-15 09:00:00-07'),
  ('holloway-3', 'holloway', date '2026-07-15', 2500, 'scheduled', null,           null),   -- 5 days overdue: the stewardship nudge
  ('holloway-4', 'holloway', date '2026-10-15', 2500, 'scheduled', null,           null)
) as p(k, pl, due, amt, status, gift, paid)
on conflict do nothing;

-- Grants
insert into public.grants (id, org_id, funder_id, name, stage, amount_requested, amount_awarded, restrictions, fund_id, period_start, period_end, program, owner, notes)
select md5('ygb:grant:'||g.k)::uuid, md5('ygb:org')::uuid, md5('ygb:con:'||g.funder)::uuid,
       g.n, g.stage, g.req, g.awd, g.restr,
       case when g.fund is null then null else md5('ygb:fund:'||g.fund)::uuid end,
       g.ps, g.pe, g.prog, g.owner, g.notes
from (values
  ('bayfront', 'bayfront', 'General operating support 2026',  'active',    75000, 75000::numeric, null::text,                    'genop',  date '2026-01-01', date '2026-12-31', null::text,            'Alicia Fontaine', 'Anchor grant, year 2 of relationship. PO Diane Castillo; hinted at multi-year for 2027.'),
  ('county',   'county',   'Youth Development Fund FY26',     'active',    60000, 60000,          'Freedom Summer Camp only',    'summer', date '2026-01-01', date '2026-12-31', 'Freedom Summer Camp', 'Gloria Hines',    'Interim report submitted Jun 15; payment 2 releases after September review.'),
  ('sandhill', 'sandhill', 'Capacity building 2026',          'active',    50000, 50000,          null,                          'genop',  date '2026-06-01', date '2027-05-31', null,                  'Raymond Williams', 'Unrestricted. They cited 100% board giving as a decision factor.'),
  ('copley',   'copley',   'Saturday Academy expansion',      'submitted', 25000, null,           null,                          null,     date '2026-09-01', date '2027-08-31', 'Saturday Academy',    'Raymond Williams', 'Submitted Jun 20; September docket.'),
  ('westbay',  'westbay',  'Freedom Summer 2027',             'loi',       40000, null,           'Freedom Summer Camp only',    null,     date '2027-01-01', date '2027-12-31', 'Freedom Summer Camp', 'Alicia Fontaine', 'LOI due Aug 15. Lead with family-engagement outcomes per PO guidance.')
) as g(k, funder, n, stage, req, awd, restr, fund, ps, pe, prog, owner, notes)
on conflict do nothing;

insert into public.grant_payments (id, org_id, grant_id, due_date, expected_amount, status, gift_id, received_at, notes)
select md5('ygb:gp:'||p.k)::uuid, md5('ygb:org')::uuid, md5('ygb:grant:'||p.g)::uuid,
       p.due, p.amt, p.status,
       case when p.gift is null then null else md5('ygb:gift:'||p.gift)::uuid end, p.rcv, p.notes
from (values
  ('bay-1',  'bayfront', date '2026-01-15', 37500, 'received',  'bayfront26a', timestamptz '2026-01-15 09:00:00-08', null::text),
  ('bay-2',  'bayfront', date '2026-08-15', 37500, 'scheduled', null::text,    null::timestamptz,                    'Releases after the July 31 interim report.'),
  ('cnty-1', 'county',   date '2026-02-10', 30000, 'received',  'county26a',   timestamptz '2026-02-10 09:00:00-08', null),
  ('cnty-2', 'county',   date '2026-09-15', 30000, 'scheduled', null,          null,                                 'Releases after September program review.'),
  ('sand-1', 'sandhill', date '2026-07-02', 50000, 'received',  'sandhill26',  timestamptz '2026-07-02 09:00:00-07', 'Paid in full.')
) as p(k, g, due, amt, status, gift, rcv, notes)
on conflict do nothing;

insert into public.grant_requirements (id, org_id, grant_id, kind, label, due_date, status, submitted_at, notes)
select md5('ygb:gr:'||r.k)::uuid, md5('ygb:org')::uuid, md5('ygb:grant:'||r.g)::uuid,
       r.kind, r.label, r.due, r.status, r.sub, r.notes
from (values
  ('bay-int',   'bayfront', 'interim_report',   'Mid-year narrative + financials', date '2026-07-31', 'in_progress', null::timestamptz, 'Gates the $37.5K August payment. Alicia drafting; Gloria owns financials.'),
  ('bay-fin',   'bayfront', 'final_report',     'Year-end report',                 date '2027-01-31', 'upcoming',    null, null::text),
  ('cnty-int',  'county',   'interim_report',   'FY26 interim report',             date '2026-06-15', 'submitted',   timestamptz '2026-06-15 16:20:00-07', 'Submitted on time.'),
  ('cnty-fin',  'county',   'final_report',     'FY26 final program report',       date '2026-10-15', 'upcoming',    null, null),
  ('cnty-finl', 'county',   'financial_report', 'FY26 expenditure report',         date '2026-10-15', 'upcoming',    null, 'Restricted-fund ledger export.'),
  ('sand-fin',  'sandhill', 'final_report',     'Capacity-building outcomes memo', date '2027-06-30', 'upcoming',    null, null),
  ('cop-app',   'copley',   'application',      'Full proposal',                   date '2026-06-30', 'submitted',   timestamptz '2026-06-20 12:00:00-07', null),
  ('west-loi',  'westbay',  'loi',              'Letter of inquiry',               date '2026-08-15', 'in_progress', null, 'Lead with family-engagement outcomes.')
) as r(k, g, kind, label, due, status, sub, notes)
on conflict do nothing;

insert into public.asks (id, org_id, funder_id, form, title, amount_requested, ask_date, status, amount_committed, decided_on, owner, grant_id)
select md5('ygb:ask:'||a.k)::uuid, md5('ygb:org')::uuid, md5('ygb:con:'||a.funder)::uuid,
       a.form, a.title, a.req, a.d, a.status, a.cmt, a.dec, a.owner,
       case when a.grantk is null then null else md5('ygb:grant:'||a.grantk)::uuid end
from (values
  ('copley',    'copley',    'grant_proposal',        'Saturday Academy expansion',      25000, date '2026-06-20', 'submitted', null::numeric, null::date,       'Raymond Williams', 'copley'),
  ('westbay',   'westbay',   'loi',                   'Freedom Summer 2027 LOI',         40000, date '2026-08-15', 'draft',     null,          null,             'Alicia Fontaine',  'westbay'),
  ('menlotech', 'menlotech', 'corporate_sponsorship', 'Gala presenting sponsorship',     15000, date '2026-03-20', 'awarded',   15000,         date '2026-05-01','Alicia Fontaine',  null)
) as a(k, funder, form, title, req, d, status, cmt, dec, owner, grantk)
on conflict do nothing;

-- Pipeline (default 10-stage set; composite FK proves the stages exist).
insert into public.opportunities (id, org_id, constituent_id, name, pipeline, stage, ask_amount, expected_close, probability, capacity_rating, affinity_rating, owner, next_step, next_step_due, notes)
select md5('ygb:opp:'||o.k)::uuid, md5('ygb:org')::uuid, md5('ygb:con:'||o.con)::uuid,
       o.n, 'default', o.stage, o.amt, o.close, o.prob, o.cap, o.aff, o.owner, o.next, o.nextdue, o.notes
from (values
  ('westbay',     'westbay',    'Westbay Fund — Freedom Summer 2027',       'meeting_complete',      40000, date '2026-11-15', 60, 4, 3, 'Alicia Fontaine',  'Submit LOI',                          date '2026-08-15', 'PO wants family-engagement outcomes front and center. Vanessa follows up after submission.'),
  ('copley',      'copley',     'Copley — Saturday Academy expansion',      'ask_made',              25000, date '2026-09-30', 75, 3, 4, 'Raymond Williams', 'Check in ahead of September docket',  date '2026-09-02', 'Proposal in. Their program officer visited a Saturday session in May.'),
  ('menlotech',   'menlotech',  'Menlo Tech Gives — fall renewal',          'ask_made',              10000, date '2026-10-15', 75, 4, 4, 'Alicia Fontaine',  'Renewal proposal when window opens',  date '2026-09-01', 'Giving window opens Sept 1. Presenting sponsor in June — warm.'),
  ('lawrence',    'lawrence',   'Lawrence family — Scholarship Fund anchor','appointment_scheduled', 50000, date '2026-12-15', 40, 5, 5, 'Raymond Williams', 'Dinner with Chip & Karen',            date '2026-08-07', 'Goal: anchor the Scholarship Fund at $50K. Bring one-pager + a scholar story.'),
  ('oakivy',      'oakivy',     'Oak & Ivy Fund — first grant',             'researched',            20000, date '2027-02-28', 20, 3, 3, 'Alicia Fontaine',  'Warm intro via PBPN trustee',         date '2026-09-15', 'Rolling LOIs; identity-affirming youth programs are their center lane.'),
  ('pcu',         'pcu',        'Peninsula Credit Union — 2027 sponsorship','identified',            10000, date '2027-06-01', 10, 3, 4, 'Alicia Fontaine',  'Fall financial-literacy Village Night as cultivation', date '2026-10-30', 'They asked for the workshop — deliver that first.'),
  ('sandhill',    'sandhill',   'Sand Hill — capacity building 2026',       'closed_won',            50000, date '2026-05-28', 100, 4, 4, 'Raymond Williams', null::text,                            null::date,        'Won May 28; paid July 2.'),
  ('techbridge',  'techbridge', 'TechBridge — gala sponsorship',            'closed_lost',            5000, date '2026-05-01', 0,  2, 2, 'Alicia Fontaine',  null,                                  null,              'Declined — budget cycle. Pivot to employee volunteer days.')
) as o(k, con, n, stage, amt, close, prob, cap, aff, owner, next, nextdue, notes)
on conflict do nothing;

commit;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — Program: scholars, crews, memberships, sessions, attendance
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ~43 scholars. custom_fields keys match the Section 1 registry.
insert into public.students (id, org_id, first_name, last_name, stage, partner_id, location, custom_fields, notes, last_activity_at)
select md5('ygb:stu:'||s.k)::uuid, md5('ygb:org')::uuid, s.fn, s.ln, s.stage,
       case when s.school = 'Belle Haven Elementary' then md5('ygb:partner:bellehaven')::uuid else null end,
       s.city,
       jsonb_build_object(
         'grade', s.grade, 'school', s.school,
         'guardian_name', s.gn, 'guardian_phone', s.gp,
         'guardian_email', s.ge, 'tshirt_size', s.ts),
       s.notes, s.la
from (values
  -- K–2 (Freedom Summer Juniors / Rising Scholars)
  ('amara-jenkins',  'Amara',   'Jenkins',   'enrolled', '2', 'Belle Haven Elementary',   'East Palo Alto', 'Darnell Jenkins',  '(650) 555-0161', 'djenkins@example.com',  'YS', 'Sibling: Malik. Dad speaks at events.', date '2026-07-17'),
  ('zoe-carver',     'Zoe',     'Carver',    'enrolled', '1', 'Bayside Elementary',       'East Palo Alto', 'Yvette Carver',    '(650) 555-0162', 'ycarver@example.com',   'YS', 'Sibling: Elijah.', date '2026-07-17'),
  ('micah-thompson', 'Micah',   'Thompson',  'enrolled', 'K', 'Belle Haven Elementary',   'Menlo Park',     'Renata Thompson',  '(650) 555-0163', 'rthompson@example.com', 'YS', null, date '2026-07-17'),
  ('sanaa-whitaker', 'Sanaa',   'Whitaker',  'enrolled', '1', 'Redwood Grove Elementary', 'Redwood City',   'Denise Whitaker',  '(650) 555-0164', 'dwhitaker@example.com', 'YS', null, date '2026-07-17'),
  ('josiah-green',   'Josiah',  'Green',     'enrolled', 'K', 'Belle Haven Elementary',   'Menlo Park',     'Patrice Green',    '(650) 555-0165', 'pgreen@example.com',    'YS', null, date '2026-07-17'),
  ('imani-fields',   'Imani',   'Fields',    'enrolled', '2', 'Bayside Elementary',       'East Palo Alto', 'Roderick Fields',  '(650) 555-0166', 'rfields@example.com',   'YM', 'Sibling: Emmett (alumni).', date '2026-07-17'),
  ('xavier-dunbar',  'Xavier',  'Dunbar',    'enrolled', '2', 'Peninsula Prep K-8',       'East Palo Alto', 'Chantel Dunbar',   '(650) 555-0167', 'cdunbar@example.com',   'YM', null, date '2026-07-17'),
  ('layla-broussard','Layla',   'Broussard', 'enrolled', '1', 'Belle Haven Elementary',   'Menlo Park',     'Andre Broussard',  '(650) 555-0168', 'abroussard@example.com','YS', null, date '2026-07-17'),
  ('caleb-winters',  'Caleb',   'Winters',   'enrolled', 'K', 'Redwood Grove Elementary', 'Redwood City',   'Monique Winters',  '(650) 555-0169', 'mwinters@example.com',  'YS', null, date '2026-07-17'),
  ('aaliyah-sparks', 'Aaliyah', 'Sparks',    'enrolled', '2', 'Bayside Elementary',       'East Palo Alto', 'Jasmine Sparks',   '(650) 555-0170', 'jsparks@example.com',   'YM', null, date '2026-07-17'),
  -- 3–5 (Freedom Summer Juniors / Griot Scholars)
  ('malik-jenkins',  'Malik',   'Jenkins',   'enrolled', '5', 'Belle Haven Elementary',   'East Palo Alto', 'Darnell Jenkins',  '(650) 555-0161', 'djenkins@example.com',  'YL', 'Sibling: Amara.', date '2026-07-17'),
  ('elijah-carver',  'Elijah',  'Carver',    'enrolled', '4', 'Bayside Elementary',       'East Palo Alto', 'Yvette Carver',    '(650) 555-0162', 'ycarver@example.com',   'YM', 'Sibling: Zoe.', date '2026-07-17'),
  ('destiny-cole',   'Destiny', 'Cole',      'enrolled', '3', 'Belle Haven Elementary',   'Menlo Park',     'Sharonda Cole',    '(650) 555-0171', 'scole@example.com',     'YM', null, date '2026-07-17'),
  ('isaiah-freeman', 'Isaiah',  'Freeman',   'enrolled', '4', 'Peninsula Prep K-8',       'East Palo Alto', 'Gerald Freeman',   '(650) 555-0172', 'gfreeman@example.com',  'YM', null, date '2026-07-17'),
  ('nyla-patterson', 'Nyla',    'Patterson', 'enrolled', '5', 'Redwood Grove Elementary', 'Redwood City',   'Alicia Patterson', '(650) 555-0173', 'apatterson@example.com','YL', null, date '2026-07-17'),
  ('deandre-chambers','DeAndre','Chambers',  'enrolled', '3', 'Belle Haven Elementary',   'Menlo Park',     'Tasha Chambers',   '(650) 555-0174', 'tchambers@example.com', 'YM', null, date '2026-07-17'),
  ('maya-lofton',    'Maya',    'Lofton',    'enrolled', '4', 'Bayside Elementary',       'East Palo Alto', 'Vernon Lofton',    '(650) 555-0175', 'vlofton@example.com',   'YM', null, date '2026-07-17'),
  ('jaylen-rhodes',  'Jaylen',  'Rhodes',    'enrolled', '5', 'Peninsula Prep K-8',       'East Palo Alto', 'Kimberly Rhodes',  '(650) 555-0176', 'krhodes@example.com',   'YL', null, date '2026-07-17'),
  ('trinity-vaughn', 'Trinity', 'Vaughn',    'enrolled', '3', 'Belle Haven Elementary',   'Menlo Park',     'Darius Vaughn',    '(650) 555-0177', 'dvaughn@example.com',   'YM', null, date '2026-07-17'),
  ('amir-bostic',    'Amir',    'Bostic',    'enrolled', '4', 'Redwood Grove Elementary', 'Redwood City',   'Felice Bostic',    '(650) 555-0178', 'fbostic@example.com',   'YM', null, date '2026-07-17'),
  -- 6–8 (Freedom Summer Seniors / Legacy Scholars)
  ('nia-marshall',   'Nia',     'Marshall',  'enrolled', '7', 'Cesar Chavez Academy',     'East Palo Alto', 'Tanya Marshall',   '(650) 555-0179', 'tmarshall@example.com', 'AS', 'Sibling: Jordan (TLC).', date '2026-07-17'),
  ('kayla-prescott', 'Kayla',   'Prescott',  'enrolled', '6', 'Cesar Chavez Academy',     'East Palo Alto', 'Danielle Prescott','(650) 555-0180', 'dprescott@example.com', 'AS', null, date '2026-07-17'),
  ('darius-mack',    'Darius',  'Mack',      'enrolled', '8', 'Peninsula Prep K-8',       'East Palo Alto', 'Regina Mack',      '(650) 555-0181', 'rmack@example.com',     'AM', null, date '2026-07-17'),
  ('jasmine-otis',   'Jasmine', 'Otis',      'enrolled', '6', 'Cesar Chavez Academy',     'East Palo Alto', 'Howard Otis',      '(650) 555-0182', 'hotis@example.com',     'AS', null, date '2026-07-17'),
  ('malachi-turner', 'Malachi', 'Turner',    'enrolled', '7', 'Hillview Middle School',   'Menlo Park',     'Bernice Turner',   '(650) 555-0183', 'bturner@example.com',   'AM', null, date '2026-07-17'),
  ('zion-abernathy', 'Zion',    'Abernathy', 'enrolled', '8', 'Cesar Chavez Academy',     'East Palo Alto', 'Yolanda Abernathy','(650) 555-0184', 'yabernathy@example.com','AM', null, date '2026-07-17'),
  ('serena-watkins', 'Serena',  'Watkins',   'enrolled', '6', 'Hillview Middle School',   'Menlo Park',     'Curtis Watkins',   '(650) 555-0185', 'cwatkins@example.com',  'AS', null, date '2026-07-17'),
  ('andre-little',   'Andre',   'Little',    'enrolled', '7', 'Cesar Chavez Academy',     'East Palo Alto', 'Paulette Little',  '(650) 555-0186', 'plittle@example.com',   'AM', null, date '2026-07-17'),
  ('brianna-foxx',   'Brianna', 'Foxx',      'enrolled', '8', 'Peninsula Prep K-8',       'East Palo Alto', 'Marcus Foxx',      '(650) 555-0187', 'mfoxx@example.com',     'AM', null, date '2026-07-17'),
  ('quincy-sherman', 'Quincy',  'Sherman',   'enrolled', '6', 'Cesar Chavez Academy',     'East Palo Alto', 'Loretta Sherman',  '(650) 555-0188', 'lsherman@example.com',  'AS', null, date '2026-07-17'),
  -- 9–12 (Teen Leadership Corps)
  ('jordan-marshall','Jordan',  'Marshall',  'enrolled', '9',  'Menlo-Atherton High',     'East Palo Alto', 'Tanya Marshall',   '(650) 555-0179', 'tmarshall@example.com', 'AM', 'Sibling: Nia. Junior counselor, Juniors crew.', date '2026-07-15'),
  ('tamara-ross',    'Tamara',  'Ross',      'enrolled', '10', 'Menlo-Atherton High',     'Menlo Park',     'Vivian Ross',      '(650) 555-0189', 'vross@example.com',     'AM', 'Junior counselor, Juniors crew.', date '2026-07-15'),
  ('devon-sinclair', 'Devon',   'Sinclair',  'enrolled', '11', 'Woodside High',           'Redwood City',   'Charmaine Sinclair','(650) 555-0190','csinclair@example.com', 'AL', 'Junior counselor, Seniors crew.', date '2026-07-15'),
  ('alexis-grimes',  'Alexis',  'Grimes',    'enrolled', '10', 'Menlo-Atherton High',     'East Palo Alto', 'Byron Grimes',     '(650) 555-0191', 'bgrimes@example.com',   'AM', 'Junior counselor, Seniors crew.', date '2026-07-15'),
  ('kobe-wheeler',   'Kobe',    'Wheeler',   'enrolled', '9',  'Sequoia High',            'Redwood City',   'Latrice Wheeler',  '(650) 555-0192', 'lwheeler@example.com',  'AM', 'Junior counselor, Juniors crew.', date '2026-07-15'),
  ('simone-pratt',   'Simone',  'Pratt',     'enrolled', '12', 'Menlo-Atherton High',     'East Palo Alto', 'Odessa Pratt',     '(650) 555-0193', 'opratt@example.com',    'AS', 'Corps captain; college apps this fall.', date '2026-07-15'),
  -- Interested / waitlist / alumni / stepped away
  ('noah-blackwell', 'Noah',    'Blackwell', 'interested',   '3', 'Bayside Elementary',       'East Palo Alto', 'Simone Blackwell', '(650) 555-0194', 'sblackwell@example.com','YM', 'Met at Juneteenth Village Night; wants Saturday Academy 2026–27.', date '2026-06-19'),
  ('harmony-dease',  'Harmony', 'Dease',     'interested',   '6', 'Cesar Chavez Academy',     'East Palo Alto', 'Angela Dease',     '(650) 555-0195', 'adease@example.com',    'AS', 'Counselor referral from Ravenswood.', date '2026-07-02'),
  ('ava-sterling',   'Ava',     'Sterling',  'waitlist',     '1', 'Belle Haven Elementary',   'Menlo Park',     'Corinne Sterling', '(650) 555-0196', 'csterling@example.com', 'YS', 'Waitlist #1 for Rising Scholars 2026–27.', date '2026-05-30'),
  ('terrell-boone',  'Terrell', 'Boone',     'waitlist',     '4', 'Redwood Grove Elementary', 'Redwood City',   'Octavia Boone',    '(650) 555-0197', 'oboone@example.com',    'YM', 'Waitlist for Griot Scholars 2026–27.', date '2026-06-08'),
  ('chloe-hargrove', 'Chloe',   'Hargrove',  'alumni',       '12','Menlo-Atherton High',      'East Palo Alto', 'Denita Hargrove',  '(650) 555-0198', 'dhargrove@example.com', 'AM', 'Class of 2025; now at San José State. Spoke at the 2025 gala.', date '2025-06-07'),
  ('emmett-fields',  'Emmett',  'Fields',    'alumni',       '12','Menlo-Atherton High',      'East Palo Alto', 'Roderick Fields',  '(650) 555-0166', 'rfields@example.com',   'AL', 'Class of 2024. Sibling: Imani.', date '2024-06-08'),
  ('nevaeh-simon',   'Nevaeh',  'Simon',     'stepped_away', '5', 'Bayside Elementary',       'East Palo Alto', 'Latasha Simon',    '(650) 555-0199', 'lsimon@example.com',    'YL', 'Family moved to Sacramento in March.', date '2026-03-14')
) as s(k, fn, ln, stage, grade, school, city, gn, gp, ge, ts, notes, la)
on conflict do nothing;

-- Crews
insert into public.cohorts (id, org_id, name, program, program_id, term, location, partner_id, capacity, start_date, end_date, status, accepting_applications, notes)
select md5('ygb:coh:'||c.k)::uuid, md5('ygb:org')::uuid, c.n, c.prog_label, md5('ygb:prog:'||c.prog)::uuid,
       c.term, c.loc, case when c.partner is null then null else md5('ygb:partner:'||c.partner)::uuid end,
       c.cap, c.sd, c.ed, c.status, c.accepting, c.notes
from (values
  ('sa26-rising', 'Rising Scholars (K–2)',              'Saturday Academy',      'saturday', '2025–26', 'St. Mark AME — Fellowship Hall', 'stmark', 16, date '2025-09-06', date '2026-06-06', 'completed', false, 'Saturday mornings, literacy + identity.'),
  ('sa26-griot',  'Griot Scholars (3–5)',               'Saturday Academy',      'saturday', '2025–26', 'St. Mark AME — Fellowship Hall', 'stmark', 16, date '2025-09-06', date '2026-06-06', 'completed', false, 'Storytelling, STEM, Black history.'),
  ('sa26-legacy', 'Legacy Scholars (6–8)',              'Saturday Academy',      'saturday', '2025–26', 'St. Mark AME — Annex',           'stmark', 16, date '2025-09-06', date '2026-06-06', 'completed', false, 'Middle-school cohort; mentor-matched.'),
  ('fs26-jr',     'Freedom Summer 2026 — Juniors',      'Freedom Summer Camp',   'summer',   'Summer 2026', 'St. Mark AME — Fellowship Hall', 'stmark', 32, date '2026-06-22', date '2026-07-31', 'active',   false, 'Grades K–5. Six weeks; Friday showcases.'),
  ('fs26-sr',     'Freedom Summer 2026 — Seniors',      'Freedom Summer Camp',   'summer',   'Summer 2026', 'St. Mark AME — Annex',           'stmark', 24, date '2026-06-22', date '2026-07-31', 'active',   false, 'Grades 6–8. Six weeks; Friday showcases.'),
  ('tlc26',       'Teen Leadership Corps 2026',         'Teen Leadership Corps', 'tlc',      'Summer 2026', 'St. Mark AME — Annex',           'stmark', 10, date '2026-06-15', date '2026-08-07', 'active',   false, 'High-school junior counselors; biweekly leadership labs; stipended.'),
  ('fvn26',       'Family Village Nights 2026',         'Family Village Nights', 'village',  '2026',        'Rotating: St. Mark AME / Bayside CC', null, null, date '2026-01-23', date '2026-12-18', 'active',  false, 'Monthly family gatherings; headcounts in session notes.'),
  ('sa27',        'Saturday Academy 2026–27 (enrolling)','Saturday Academy',     'saturday', '2026–27', 'St. Mark AME — Fellowship Hall', 'stmark', 48, date '2026-09-12', date '2027-06-05', 'planning', true,  'Enrollment open; waitlist families get first call.')
) as c(k, n, prog_label, prog, term, loc, partner, cap, sd, ed, status, accepting, notes)
on conflict do nothing;

-- Crew membership. Freedom Summer Juniors = enrolled K–5; Seniors = 6–8; TLC = 9–12.
insert into public.cohort_members (id, org_id, cohort_id, student_id, status, joined_on)
select md5('ygb:cm:fs26-jr:'||k)::uuid, md5('ygb:org')::uuid, md5('ygb:coh:fs26-jr')::uuid, md5('ygb:stu:'||k)::uuid, 'enrolled', date '2026-06-22'
from unnest(array[
  'amara-jenkins','zoe-carver','micah-thompson','sanaa-whitaker','josiah-green','imani-fields','xavier-dunbar','layla-broussard','caleb-winters','aaliyah-sparks',
  'malik-jenkins','elijah-carver','destiny-cole','isaiah-freeman','nyla-patterson','deandre-chambers','maya-lofton','jaylen-rhodes','trinity-vaughn','amir-bostic'
]) k
on conflict do nothing;

insert into public.cohort_members (id, org_id, cohort_id, student_id, status, joined_on)
select md5('ygb:cm:fs26-sr:'||k)::uuid, md5('ygb:org')::uuid, md5('ygb:coh:fs26-sr')::uuid, md5('ygb:stu:'||k)::uuid, 'enrolled', date '2026-06-22'
from unnest(array[
  'nia-marshall','kayla-prescott','darius-mack','jasmine-otis','malachi-turner','zion-abernathy','serena-watkins','andre-little','brianna-foxx','quincy-sherman'
]) k
on conflict do nothing;

insert into public.cohort_members (id, org_id, cohort_id, student_id, status, joined_on)
select md5('ygb:cm:tlc26:'||k)::uuid, md5('ygb:org')::uuid, md5('ygb:coh:tlc26')::uuid, md5('ygb:stu:'||k)::uuid, 'enrolled', date '2026-06-15'
from unnest(array[
  'jordan-marshall','tamara-ross','devon-sinclair','alexis-grimes','kobe-wheeler','simone-pratt'
]) k
on conflict do nothing;

-- Last school year's Saturday Academy (completed memberships).
insert into public.cohort_members (id, org_id, cohort_id, student_id, status, joined_on, ended_on)
select md5('ygb:cm:sa26-rising:'||k)::uuid, md5('ygb:org')::uuid, md5('ygb:coh:sa26-rising')::uuid, md5('ygb:stu:'||k)::uuid, 'completed', date '2025-09-06', date '2026-06-06'
from unnest(array[
  'amara-jenkins','zoe-carver','micah-thompson','sanaa-whitaker','josiah-green','imani-fields','xavier-dunbar','layla-broussard','caleb-winters','aaliyah-sparks'
]) k
on conflict do nothing;

insert into public.cohort_members (id, org_id, cohort_id, student_id, status, joined_on, ended_on)
select md5('ygb:cm:sa26-griot:'||k)::uuid, md5('ygb:org')::uuid, md5('ygb:coh:sa26-griot')::uuid, md5('ygb:stu:'||k)::uuid, 'completed', date '2025-09-06', date '2026-06-06'
from unnest(array[
  'malik-jenkins','elijah-carver','destiny-cole','isaiah-freeman','nyla-patterson','deandre-chambers','maya-lofton','jaylen-rhodes','trinity-vaughn','amir-bostic'
]) k
on conflict do nothing;

insert into public.cohort_members (id, org_id, cohort_id, student_id, status, joined_on, ended_on)
select md5('ygb:cm:sa26-legacy:'||k)::uuid, md5('ygb:org')::uuid, md5('ygb:coh:sa26-legacy')::uuid, md5('ygb:stu:'||k)::uuid, 'completed', date '2025-09-06', date '2026-06-06'
from unnest(array[
  'nia-marshall','kayla-prescott','darius-mack','jasmine-otis','malachi-turner','zion-abernathy','serena-watkins','andre-little','brianna-foxx','quincy-sherman'
]) k
on conflict do nothing;

-- One dropped membership (the stepped-away family).
insert into public.cohort_members (id, org_id, cohort_id, student_id, status, joined_on, ended_on)
values (md5('ygb:cm:sa26-griot:nevaeh-simon')::uuid, md5('ygb:org')::uuid, md5('ygb:coh:sa26-griot')::uuid, md5('ygb:stu:nevaeh-simon')::uuid, 'dropped', date '2025-09-06', date '2026-03-14')
on conflict do nothing;

-- Sessions. Freedom Summer: Monday kickoff + Friday showcases (Jul 3 canceled
-- for the holiday); TLC leadership labs; Village Nights monthly; Saturday
-- Academy spring sessions.
insert into public.cohort_sessions (id, org_id, cohort_id, session_date, title, starts_at, ends_at, location, status, notes)
select md5('ygb:ses:'||s.k)::uuid, md5('ygb:org')::uuid, md5('ygb:coh:'||s.c)::uuid,
       s.d, s.t, s.st, s.en, s.loc, s.status, s.notes
from (values
  -- Freedom Summer Juniors
  ('fsjr-0622', 'fs26-jr', date '2026-06-22', 'Week 1 kickoff — Umoja',      time '09:00', time '15:00', 'St. Mark AME — Fellowship Hall', 'held',      null::text),
  ('fsjr-0626', 'fs26-jr', date '2026-06-26', 'Week 1 Friday showcase',      time '13:00', time '15:00', 'St. Mark AME — Fellowship Hall', 'held',      null),
  ('fsjr-0703', 'fs26-jr', date '2026-07-03', 'Week 2 Friday showcase',      time '13:00', time '15:00', 'St. Mark AME — Fellowship Hall', 'canceled',  'July 4 holiday weekend.'),
  ('fsjr-0710', 'fs26-jr', date '2026-07-10', 'Week 3 Friday showcase',      time '13:00', time '15:00', 'St. Mark AME — Fellowship Hall', 'held',      null),
  ('fsjr-0717', 'fs26-jr', date '2026-07-17', 'Week 4 Friday showcase',      time '13:00', time '15:00', 'St. Mark AME — Fellowship Hall', 'held',      'Exploratorium trip recap + science fair.'),
  ('fsjr-0724', 'fs26-jr', date '2026-07-24', 'Week 5 Friday showcase',      time '13:00', time '15:00', 'St. Mark AME — Fellowship Hall', 'scheduled', null),
  ('fsjr-0731', 'fs26-jr', date '2026-07-31', 'Closing ceremony',            time '11:00', time '14:00', 'St. Mark AME — Sanctuary',       'scheduled', 'Families + funders invited.'),
  -- Freedom Summer Seniors
  ('fssr-0622', 'fs26-sr', date '2026-06-22', 'Week 1 kickoff — Umoja',      time '09:00', time '15:00', 'St. Mark AME — Annex',           'held',      null),
  ('fssr-0626', 'fs26-sr', date '2026-06-26', 'Week 1 Friday showcase',      time '13:00', time '15:00', 'St. Mark AME — Annex',           'held',      null),
  ('fssr-0703', 'fs26-sr', date '2026-07-03', 'Week 2 Friday showcase',      time '13:00', time '15:00', 'St. Mark AME — Annex',           'canceled',  'July 4 holiday weekend.'),
  ('fssr-0710', 'fs26-sr', date '2026-07-10', 'Week 3 Friday showcase',      time '13:00', time '15:00', 'St. Mark AME — Annex',           'held',      null),
  ('fssr-0717', 'fs26-sr', date '2026-07-17', 'Week 4 Friday showcase',      time '13:00', time '15:00', 'St. Mark AME — Annex',           'held',      null),
  ('fssr-0724', 'fs26-sr', date '2026-07-24', 'Week 5 Friday showcase',      time '13:00', time '15:00', 'St. Mark AME — Annex',           'scheduled', null),
  ('fssr-0731', 'fs26-sr', date '2026-07-31', 'Closing ceremony',            time '11:00', time '14:00', 'St. Mark AME — Sanctuary',       'scheduled', null),
  -- Teen Leadership Corps labs
  ('tlc-0624',  'tlc26',   date '2026-06-24', 'Leadership lab 1 — Voice',    time '16:00', time '18:00', 'St. Mark AME — Annex',           'held',      null),
  ('tlc-0708',  'tlc26',   date '2026-07-08', 'Leadership lab 2 — Service',  time '16:00', time '18:00', 'St. Mark AME — Annex',           'held',      null),
  ('tlc-0715',  'tlc26',   date '2026-07-15', 'Leadership lab 3 — Money',    time '16:00', time '18:00', 'St. Mark AME — Annex',           'held',      'Guest: Michelle Okafor (board treasurer).'),
  ('tlc-0729',  'tlc26',   date '2026-07-29', 'Leadership lab 4 — Legacy',   time '16:00', time '18:00', 'St. Mark AME — Annex',           'scheduled', null),
  -- Family Village Nights (headcounts in notes; no per-person roster)
  ('fvn-0123',  'fvn26',   date '2026-01-23', 'January Village Night',       time '18:00', time '20:00', 'St. Mark AME — Fellowship Hall', 'held',      '38 families / 96 people.'),
  ('fvn-0227',  'fvn26',   date '2026-02-27', 'February Village Night',      time '18:00', time '20:00', 'St. Mark AME — Fellowship Hall', 'held',      '41 families / 103 people. Black History Month showcase.'),
  ('fvn-0327',  'fvn26',   date '2026-03-27', 'March Village Night',         time '18:00', time '20:00', 'Bayside Community Center',       'held',      '33 families / 82 people. First Redwood City night.'),
  ('fvn-0424',  'fvn26',   date '2026-04-24', 'April Village Night',         time '18:00', time '20:00', 'St. Mark AME — Fellowship Hall', 'held',      '44 families / 110 people.'),
  ('fvn-0522',  'fvn26',   date '2026-05-22', 'May Village Night',           time '18:00', time '20:00', 'St. Mark AME — Fellowship Hall', 'held',      '39 families / 92 people. Summer-camp info tables.'),
  ('fvn-0619',  'fvn26',   date '2026-06-19', 'Juneteenth Village Night',    time '17:00', time '21:00', 'St. Mark AME — Front Lawn',      'held',      '64 families / 178 people. Biggest night ever.'),
  ('fvn-0724',  'fvn26',   date '2026-07-24', 'July Village Night',          time '18:00', time '20:00', 'St. Mark AME — Fellowship Hall', 'scheduled', null),
  -- Saturday Academy spring sessions (one per crew per month)
  ('sar-0411',  'sa26-rising', date '2026-04-11', 'Saturday session',        time '10:00', time '13:00', 'St. Mark AME — Fellowship Hall', 'held', null),
  ('sar-0509',  'sa26-rising', date '2026-05-09', 'Saturday session',        time '10:00', time '13:00', 'St. Mark AME — Fellowship Hall', 'held', null),
  ('sar-0606',  'sa26-rising', date '2026-06-06', 'Finale & family showcase',time '10:00', time '13:00', 'St. Mark AME — Sanctuary',       'held', null),
  ('sag-0411',  'sa26-griot',  date '2026-04-11', 'Saturday session',        time '10:00', time '13:00', 'St. Mark AME — Fellowship Hall', 'held', null),
  ('sag-0509',  'sa26-griot',  date '2026-05-09', 'Saturday session',        time '10:00', time '13:00', 'St. Mark AME — Fellowship Hall', 'held', null),
  ('sag-0606',  'sa26-griot',  date '2026-06-06', 'Finale & family showcase',time '10:00', time '13:00', 'St. Mark AME — Sanctuary',       'held', null),
  ('sal-0411',  'sa26-legacy', date '2026-04-11', 'Saturday session',        time '10:00', time '13:00', 'St. Mark AME — Annex',           'held', null),
  ('sal-0509',  'sa26-legacy', date '2026-05-09', 'Saturday session',        time '10:00', time '13:00', 'St. Mark AME — Annex',           'held', null),
  ('sal-0606',  'sa26-legacy', date '2026-06-06', 'Finale & family showcase',time '10:00', time '13:00', 'St. Mark AME — Sanctuary',       'held', null)
) as s(k, c, d, t, st, en, loc, status, notes)
on conflict do nothing;

-- Attendance for every held session, generated from crew membership with a
-- deterministic hash pattern (~87% present / ~6% late / ~7% absent).
insert into public.attendance (id, org_id, session_id, student_id, status, method, recorded_by)
select md5('ygb:att:'||s.id::text||':'||cm.student_id::text)::uuid,
       s.org_id, s.id, cm.student_id,
       case
         when abs(('x'||substr(md5(s.id::text||cm.student_id::text), 1, 8))::bit(32)::int) % 100 < 87 then 'present'
         when abs(('x'||substr(md5(s.id::text||cm.student_id::text), 1, 8))::bit(32)::int) % 100 < 93 then 'late'
         else 'absent'
       end,
       'roster', 'Marcus Boyd'
from public.cohort_sessions s
join public.cohort_members cm on cm.cohort_id = s.cohort_id and cm.org_id = s.org_id
where s.org_id = md5('ygb:org')::uuid and s.status = 'held'
on conflict do nothing;

commit;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — Finance: categories, 2026 budget, Jan–Jul transactions,
--             revenue commitments
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- fin_categories.id is a GLOBAL text PK — hence the ygb.* prefix.
insert into public.fin_categories (id, org_id, group_name, display_name, kind, functional_class, sort_order)
select c.id, md5('ygb:org')::uuid, c.grp, c.dn, c.kind, c.fc, c.o
from (values
  ('ygb.rev.foundations',  'REVENUE',        'Foundations',                    'revenue', null::text,   1),
  ('ygb.rev.government',   'REVENUE',        'Government grants',              'revenue', null,         2),
  ('ygb.rev.corporate',    'REVENUE',        'Corporate & sponsorships',       'revenue', null,         3),
  ('ygb.rev.individual',   'REVENUE',        'Individual giving',              'revenue', null,         4),
  ('ygb.rev.events',       'REVENUE',        'Events',                         'revenue', null,         5),
  ('ygb.rev.fees',         'REVENUE',        'Program fees (sliding scale)',   'revenue', null,         6),
  ('ygb.payroll.program',  'PAYROLL',        'Program staff salaries',         'expense', 'program',    10),
  ('ygb.payroll.admin',    'PAYROLL',        'Admin & development salaries',   'expense', 'admin',      11),
  ('ygb.payroll.taxes',    'PAYROLL',        'Payroll taxes',                  'expense', 'admin',      12),
  ('ygb.payroll.benefits', 'PAYROLL',        'Benefits',                       'expense', 'admin',      13),
  ('ygb.prog.summer',      'PROGRAM',        'Freedom Summer Camp',            'expense', 'program',    20),
  ('ygb.prog.saturday',    'PROGRAM',        'Saturday Academy',               'expense', 'program',    21),
  ('ygb.prog.family',      'PROGRAM',        'Family Village Nights',          'expense', 'program',    22),
  ('ygb.prog.transport',   'PROGRAM',        'Transportation',                 'expense', 'program',    23),
  ('ygb.prog.food',        'PROGRAM',        'Food & meals',                   'expense', 'program',    24),
  ('ygb.prog.stipends',    'PROGRAM',        'Teen stipends & scholarships',   'expense', 'program',    25),
  ('ygb.occupancy.rent',   'OCCUPANCY',      'Facility use (St. Mark AME)',    'expense', 'admin',      30),
  ('ygb.admin.insurance',  'ADMINISTRATION', 'Insurance',                      'expense', 'admin',      31),
  ('ygb.admin.prof',       'ADMINISTRATION', 'Accounting & professional fees', 'expense', 'admin',      32),
  ('ygb.admin.software',   'ADMINISTRATION', 'Software & subscriptions',       'expense', 'admin',      33),
  ('ygb.admin.office',     'ADMINISTRATION', 'Office & supplies',              'expense', 'admin',      34),
  ('ygb.fund.events',      'FUNDRAISING',    'Event costs',                    'expense', 'fundraising',40),
  ('ygb.fund.comms',       'FUNDRAISING',    'Donor communications',           'expense', 'fundraising',41)
) as c(id, grp, dn, kind, fc, o)
on conflict do nothing;

-- 2026 budget: ~$509K expense / $500K revenue.
insert into public.fin_budget (org_id, year, category_id, base_amount, contingency_t1, notes)
select md5('ygb:org')::uuid, 2026, b.cat, b.amt, b.t1, b.notes
from (values
  ('ygb.rev.foundations',  190000, 0,     'Bayfront 75 + Sand Hill 50 + Copley 25 + Westbay 40 (stretch)'),
  ('ygb.rev.government',   60000,  0,     'San Mateo County Youth Development Fund'),
  ('ygb.rev.corporate',    40000,  0,     'Menlo Tech, PCU, + one new sponsor'),
  ('ygb.rev.individual',   135000, 0,     'Board 30 + majors 60 + community/monthly 45'),
  ('ygb.rev.events',       65000,  0,     'Juneteenth Jubilee Gala'),
  ('ygb.rev.fees',         10000,  0,     'Sliding-scale camp fees'),
  ('ygb.payroll.program',  168000, 0,     'Denise, Marcus, Jamal + summer staff'),
  ('ygb.payroll.admin',    130000, 0,     'Raymond, Alicia, Gloria (PT)'),
  ('ygb.payroll.taxes',    25000,  0,     null::text),
  ('ygb.payroll.benefits', 26000,  0,     null),
  ('ygb.prog.summer',      32000,  5000,  'Contingency: bus + 10 more campers if Westbay lands early'),
  ('ygb.prog.saturday',    22000,  0,     null),
  ('ygb.prog.family',      9000,   0,     null),
  ('ygb.prog.transport',   9000,   0,     null),
  ('ygb.prog.food',        12000,  0,     null),
  ('ygb.prog.stipends',    12000,  3000,  'TLC stipends + camp scholarships'),
  ('ygb.occupancy.rent',   18000,  0,     'Below-market facility agreement with St. Mark'),
  ('ygb.admin.insurance',  7500,   0,     null),
  ('ygb.admin.prof',       10000,  0,     'Bookkeeping + 990 prep'),
  ('ygb.admin.software',   6500,   0,     null),
  ('ygb.admin.office',     3000,   0,     null),
  ('ygb.fund.events',      15000,  0,     'Gala production'),
  ('ygb.fund.comms',       4000,   0,     null)
) as b(cat, amt, t1, notes)
on conflict do nothing;

-- Jan–Jul monthly operating baseline.
insert into public.fin_transactions (id, org_id, txn_date, description, amount, category_id, dedup_hash, uploaded_by)
select md5('ygb:txn:'||t.k||':'||m)::uuid, md5('ygb:org')::uuid, make_date(2026, m, t.dom), t.d, t.amt, t.cat, md5('ygb:txn:'||t.k||':'||m), 'Gloria Hines'
from (values
  ('payroll-prog', 28, 'Payroll — program staff (Gusto)',        -14000, 'ygb.payroll.program'),
  ('payroll-adm',  28, 'Payroll — admin & development (Gusto)',  -10800, 'ygb.payroll.admin'),
  ('payroll-tax',  28, 'Payroll taxes (Gusto)',                  -2100,  'ygb.payroll.taxes'),
  ('benefits',      1, 'Health benefits premium',                -2150,  'ygb.payroll.benefits'),
  ('rent',          1, 'Facility use — St. Mark AME',            -1500,  'ygb.occupancy.rent'),
  ('software',      5, 'Software & subscriptions',               -540,   'ygb.admin.software')
) as t(k, dom, d, amt, cat),
generate_series(1, 7) as m
on conflict do nothing;

-- Saturday Academy months (Jan–May).
insert into public.fin_transactions (id, org_id, txn_date, description, amount, category_id, dedup_hash, uploaded_by)
select md5('ygb:txn:'||t.k||':'||m)::uuid, md5('ygb:org')::uuid, make_date(2026, m, t.dom), t.d, t.amt, t.cat, md5('ygb:txn:'||t.k||':'||m), 'Gloria Hines'
from (values
  ('sat-supplies', 12, 'Saturday Academy supplies & curriculum', -900, 'ygb.prog.saturday'),
  ('sat-food',     12, 'Saturday Academy breakfast & snacks',    -600, 'ygb.prog.food')
) as t(k, dom, d, amt, cat),
generate_series(1, 5) as m
on conflict do nothing;

-- One-off expense and revenue lines.
insert into public.fin_transactions (id, org_id, txn_date, description, amount, category_id, restricted, restricted_to, dedup_hash, uploaded_by)
select md5('ygb:txn:'||t.k)::uuid, md5('ygb:org')::uuid, t.d, t.dsc, t.amt, t.cat, t.r, t.rt, md5('ygb:txn:'||t.k), 'Gloria Hines'
from (values
  -- camp & events costs
  ('camp-supplies-jun', date '2026-06-18', 'Freedom Summer curriculum, supplies & shirts', -6500, 'ygb.prog.summer',    false, null::text),
  ('camp-bus-jun',      date '2026-06-24', 'Charter bus — weeks 1–3 field trips',          -3800, 'ygb.prog.transport', false, null),
  ('camp-food-jun',     date '2026-06-30', 'Camp breakfast & lunch — June',                -4200, 'ygb.prog.food',      false, null),
  ('tlc-stipends-jun',  date '2026-06-30', 'Teen Leadership Corps stipends — June',        -2400, 'ygb.prog.stipends',  false, null),
  ('camp-scholar-jun',  date '2026-06-22', 'Camp scholarships (12 seats)',                 -3000, 'ygb.prog.stipends',  false, null),
  ('camp-supplies-jul', date '2026-07-08', 'Freedom Summer supplies — July',               -3200, 'ygb.prog.summer',    false, null),
  ('camp-bus-jul',      date '2026-07-15', 'Charter bus — Exploratorium trip',             -2600, 'ygb.prog.transport', false, null),
  ('camp-food-jul',     date '2026-07-16', 'Camp breakfast & lunch — July (to date)',      -3900, 'ygb.prog.food',      false, null),
  ('tlc-stipends-jul',  date '2026-07-15', 'Teen Leadership Corps stipends — July',        -2400, 'ygb.prog.stipends',  false, null),
  ('fvn-costs-h1',      date '2026-06-20', 'Village Nights — dinners & supplies (H1)',     -4300, 'ygb.prog.family',    false, null),
  ('gala-venue',        date '2026-05-06', 'Gala venue & rentals deposit',                 -4500, 'ygb.fund.events',    false, null),
  ('gala-catering',     date '2026-06-12', 'Gala catering & production',                   -7800, 'ygb.fund.events',    false, null),
  ('do-insurance',      date '2026-02-11', 'D&O insurance renewal',                        -2100, 'ygb.admin.insurance',false, null),
  ('bookkeeping-q1',    date '2026-03-31', 'Bookkeeping — Q1',                             -800,  'ygb.admin.prof',     false, null),
  ('bookkeeping-q2',    date '2026-06-30', 'Bookkeeping — Q2',                             -800,  'ygb.admin.prof',     false, null),
  ('comms-spring',      date '2026-03-25', 'Spring appeal printing & postage',             -350,  'ygb.fund.comms',     false, null),
  ('comms-gala',        date '2026-06-01', 'Gala invitations & program printing',          -350,  'ygb.fund.comms',     false, null),
  ('office-q1',         date '2026-01-20', 'Office & supplies — Q1',                       -350,  'ygb.admin.office',   false, null),
  ('office-q2',         date '2026-04-20', 'Office & supplies — Q2',                       -350,  'ygb.admin.office',   false, null),
  ('office-q3',         date '2026-07-10', 'Office & supplies — Q3',                       -350,  'ygb.admin.office',   false, null),
  -- revenue
  ('rev-bayfront',      date '2026-01-15', 'Bayfront Community Foundation — payment 1/2',  37500, 'ygb.rev.foundations', false, null),
  ('rev-dep-jan',       date '2026-01-30', 'Donations deposit — January',                   5200, 'ygb.rev.individual',  false, null),
  ('rev-county',        date '2026-02-10', 'San Mateo County — Youth Development 1/2',     30000, 'ygb.rev.government',  true,  'Freedom Summer'),
  ('rev-whitfield',     date '2026-02-06', 'Stock gift — A. Whitfield (net proceeds)',     10000, 'ygb.rev.individual',  false, null),
  ('rev-dep-feb',       date '2026-02-27', 'Donations deposit — February',                  1400, 'ygb.rev.individual',  false, null),
  ('rev-gaines',        date '2026-03-02', 'Pledge payment — T. Gaines',                    5000, 'ygb.rev.individual',  false, null),
  ('rev-dep-mar',       date '2026-03-30', 'Donations deposit — March',                     1600, 'ygb.rev.individual',  false, null),
  ('rev-lawrence',      date '2026-04-22', 'Major gift — C. Lawrence (stock, net)',        25000, 'ygb.rev.individual',  false, null),
  ('rev-holloway-q2',   date '2026-04-15', 'Pledge payment — V. Holloway Q2',               2500, 'ygb.rev.individual',  false, null),
  ('rev-dep-apr',       date '2026-04-29', 'Donations deposit — April',                     1900, 'ygb.rev.individual',  false, null),
  ('rev-spring-appeal', date '2026-05-15', 'Spring Family Appeal deposits',                 4300, 'ygb.rev.individual',  false, null),
  ('rev-dep-may',       date '2026-05-29', 'Donations deposit — May',                       1400, 'ygb.rev.individual',  false, null),
  ('rev-gala',          date '2026-06-16', 'Juneteenth Jubilee Gala proceeds',             52000, 'ygb.rev.events',      false, null),
  ('rev-camp-fees',     date '2026-06-05', 'Freedom Summer fees (sliding scale)',           8300, 'ygb.rev.fees',        false, null),
  ('rev-dep-jun',       date '2026-06-29', 'Donations deposit — June',                      1500, 'ygb.rev.individual',  false, null),
  ('rev-sandhill',      date '2026-07-02', 'Sand Hill Family Foundation award',            50000, 'ygb.rev.foundations', false, null),
  ('rev-dep-jul',       date '2026-07-15', 'Donations deposit — July (mid-month)',          3400, 'ygb.rev.individual',  false, null)
) as t(k, d, dsc, amt, cat, r, rt)
on conflict do nothing;

-- Revenue commitments: the $500K story, mid-July.
insert into public.fin_revenue_commitments (id, org_id, year, source_type, source_name, amount, status, expected_date, probability, restricted, restricted_to, notes, created_by)
select md5('ygb:frc:'||c.k)::uuid, md5('ygb:org')::uuid, 2026, c.st, c.n, c.amt, c.status, c.ed, c.p, c.r, c.rt, c.notes, 'Gloria Hines'
from (values
  ('bayfront',   'foundation', 'Bayfront Community Foundation',              75000, 'secured',   date '2026-08-15', null::numeric, false, null::text, '$37.5K received Jan; $37.5K after July interim report.'),
  ('county',     'government', 'San Mateo County — Youth Development Fund',  60000, 'secured',   date '2026-09-15', null,          true,  'Freedom Summer', '$30K received Feb; $30K after September review.'),
  ('sandhill',   'foundation', 'Sand Hill Family Foundation',                50000, 'received',  date '2026-07-02', null,          false, null, 'Paid in full July 2.'),
  ('copley',     'foundation', 'Copley Family Foundation',                   25000, 'projected', date '2026-09-30', 0.6,           false, null, 'Proposal submitted; September docket.'),
  ('westbay',    'foundation', 'Westbay Fund for Children',                  40000, 'projected', date '2026-11-15', 0.4,           true,  'Freedom Summer', 'LOI due Aug 15.'),
  ('menlotech-g','corporate',  'Menlo Tech Gives — gala sponsorship',        15000, 'received',  date '2026-06-14', null,          false, null, null),
  ('menlotech-r','corporate',  'Menlo Tech Gives — fall renewal',            10000, 'projected', date '2026-10-15', 0.7,           false, null, 'Window opens Sept 1.'),
  ('pcu',        'corporate',  'Peninsula Credit Union — gala sponsorship',  10000, 'received',  date '2026-06-14', null,          false, null, null),
  ('board',      'individual', 'Board giving (100% participation)',          30000, 'secured',   date '2026-12-31', null,          false, null, 'Pledges + gala; two board gifts land at year-end.'),
  ('majors',     'individual', 'Major donors',                               60000, 'secured',   date '2026-12-31', null,          false, null, 'Lawrence 25 + Whitfield 10 + gala majors; Lawrence upgrade tracked separately in pipeline.'),
  ('community',  'individual', 'Community & monthly donors',                 18000, 'projected', date '2026-12-31', 0.9,           false, null, null),
  ('yearend',    'individual', 'Year-end appeal',                            55000, 'projected', date '2026-12-15', 0.75,          false, null, 'GivingTuesday + December mail/email.'),
  ('gala-ind',   'other',      'Juneteenth Jubilee Gala (individual giving)',27000, 'received',  date '2026-06-14', null,          false, null, null),
  ('fees',       'earned',     'Program fees (sliding scale)',               10000, 'secured',   date '2026-06-05', null,          false, null, '$8.3K collected; balance due by camp end.')
) as c(k, st, n, amt, status, ed, p, r, rt, notes)
on conflict do nothing;

commit;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 7 — Metrics + strategy (OGSM)
-- ════════════════════════════════════════════════════════════════════════════
begin;

insert into public.metric_definitions (id, org_id, metric_key, name, description, department, unit, direction, cadence, source_kind, target, baseline, baseline_date, owner_id, active)
select md5('ygb:met:'||m.k)::uuid, md5('ygb:org')::uuid, m.k, m.n, m.d, m.dept, m.u, 'up', m.cad, 'manual', m.t, m.b, m.bd, md5('ygb:user:'||m.owner)::uuid, true
from (values
  ('scholars_served',      'Scholars served (YTD)',            'Unique scholars in any program this calendar year.',            'Programs',    'scholars', 'monthly',   120, 91::numeric,  date '2025-12-31', 'denise'),
  ('summer_enrollment',    'Freedom Summer enrollment',        'Scholars enrolled in Freedom Summer Camp.',                     'Programs',    'scholars', 'monthly',   60,  48,           date '2025-08-01', 'marcus'),
  ('saturday_attendance',  'Saturday Academy attendance rate', 'Average attendance across Saturday Crews.',                     'Programs',    '%',        'monthly',   85,  79,           date '2025-12-31', 'marcus'),
  ('families_engaged',     'Families at Village Nights',       'Families attending each monthly Village Night.',                'Programs',    'families', 'monthly',   75,  31,           date '2025-12-31', 'jamal'),
  ('monthly_donors',       'Monthly donors',                   'Active recurring giving plans.',                                'Development', 'donors',   'monthly',   25,  11,           date '2025-12-31', 'alicia'),
  ('scholar_retention',    'Scholar retention',                'Share of fall scholars still enrolled at quarter end.',         'Programs',    '%',        'quarterly', 80,  74,           date '2025-12-31', 'denise')
) as m(k, n, d, dept, u, cad, t, b, bd, owner)
on conflict do nothing;

insert into public.metric_snapshots (id, org_id, metric_id, captured_on, value, note)
select md5('ygb:ms:'||s.mk||':'||s.d::text)::uuid, md5('ygb:org')::uuid, md5('ygb:met:'||s.mk)::uuid, s.d, s.v, s.note
from (values
  ('scholars_served', date '2026-01-31', 68,  null::text),
  ('scholars_served', date '2026-02-28', 74,  null),
  ('scholars_served', date '2026-03-31', 79,  null),
  ('scholars_served', date '2026-04-30', 84,  null),
  ('scholars_served', date '2026-05-31', 88,  null),
  ('scholars_served', date '2026-06-30', 103, 'Camp intake.'),
  ('scholars_served', date '2026-07-15', 112, null),
  ('summer_enrollment', date '2026-05-31', 41, null),
  ('summer_enrollment', date '2026-06-30', 57, null),
  ('summer_enrollment', date '2026-07-15', 59, 'One spot held for a returning family.'),
  ('saturday_attendance', date '2026-01-31', 82, null),
  ('saturday_attendance', date '2026-02-28', 84, null),
  ('saturday_attendance', date '2026-03-31', 86, null),
  ('saturday_attendance', date '2026-04-30', 88, null),
  ('saturday_attendance', date '2026-05-31', 87, null),
  ('saturday_attendance', date '2026-06-30', 89, 'Finale month.'),
  ('families_engaged', date '2026-01-31', 38, null),
  ('families_engaged', date '2026-02-28', 41, null),
  ('families_engaged', date '2026-03-31', 33, 'First Redwood City night.'),
  ('families_engaged', date '2026-04-30', 44, null),
  ('families_engaged', date '2026-05-31', 39, null),
  ('families_engaged', date '2026-06-30', 64, 'Juneteenth.'),
  ('monthly_donors', date '2026-01-31', 14, null),
  ('monthly_donors', date '2026-03-31', 16, null),
  ('monthly_donors', date '2026-05-31', 18, null),
  ('monthly_donors', date '2026-07-15', 19, 'One plan paused (card failure).'),
  ('scholar_retention', date '2026-03-31', 78, null),
  ('scholar_retention', date '2026-06-30', 83, null)
) as s(mk, d, v, note)
on conflict do nothing;

insert into public.plan_foundation (org_id, mission, vision, values, behaviors, proof_points)
values (
  md5('ygb:org')::uuid,
  'To build a village where Black families on the Peninsula find community with one another and their children grow up young, gifted, and whole.',
  'A Peninsula where every Black child grows up surrounded by community, culture, and the belief that their future is theirs to write.',
  '["The village raises the child","Excellence is our inheritance","Joy is resistance","Families lead, we follow","Legacy over programs"]'::jsonb,
  '["Every family is greeted by name","We program WITH families, not FOR them","Scholars see themselves in every lesson","We celebrate loudly and often","We keep our promises to the penny"]'::jsonb,
  '["112 scholars served this year across four programs","64 families at the Juneteenth Village Night — our biggest ever","100% board giving participation, two years running","Saturday Academy attendance climbing: 82% → 89% this school year"]'::jsonb
)
on conflict do nothing;

insert into public.plan_objectives (id, org_id, title, three_year_statement, owner, status, sort_order)
select md5('ygb:obj:'||o.k)::uuid, md5('ygb:org')::uuid, o.t, o.ts, o.owner, o.status, o.so
from (values
  ('impact',  'Deepen scholar impact', 'By 2029, 250 scholars a year show measurable academic growth and strong racial identity — and every scholar who wants a summer seat gets one.', 'Denise Carter',   'on_track', 1),
  ('village', 'Build the village',     'By 2029, 500 Peninsula families are in active community with one another through Village Nights, parent circles, and two program sites.',      'Jamal Porter',    'on_track', 2),
  ('fund',    'Fund the future',       'By 2029, a $750K budget with a 6-month operating reserve and no single funder over 20% of revenue.',                                            'Raymond Williams','at_risk',  3)
) as o(k, t, ts, owner, status, so)
on conflict do nothing;

insert into public.plan_goals (id, org_id, objective_id, title, description, target_date, status, owner, sort_order)
select md5('ygb:goal:'||g.k)::uuid, md5('ygb:org')::uuid, md5('ygb:obj:'||g.obj)::uuid, g.t, g.d, g.td, g.status, g.owner, g.so
from (values
  ('sa-quality',   'impact',  'Every Saturday Academy scholar reading at grade level',   'Literacy blocks + assessment cadence + reading mentors from PBPN.',                       date '2027-06-30', 'on_track', 'Denise Carter',   1),
  ('summer-scale', 'impact',  'Grow Freedom Summer to 75 scholars',                      'Second site (Bayside CC) + Westbay funding unlocks 15 more seats.',                       date '2027-08-31', 'on_track', 'Marcus Boyd',     2),
  ('family-engage','village', '60% of families at 4+ Village Nights a year',             'Consistent rhythm, rotating sites, parent-circle track.',                                 date '2026-12-31', 'at_risk',  'Jamal Porter',    3),
  ('partners',     'village', 'Active partnership in every Ravenswood school',           'Counselor referral loops + tabling at every back-to-school night.',                       date '2027-06-30', 'on_track', 'Marcus Boyd',     4),
  ('reserve',      'fund',    'Build a 6-month operating reserve',                       'Currently ~4 months at summer trough; reserve policy adopted January.',                   date '2027-12-31', 'behind',   'Gloria Hines',    5),
  ('diversify',    'fund',    'Raise $200K from individuals in 2026',                    'Village Builders campaign: board 30 + majors 60 + community 45 + year-end 55 + gala.',   date '2026-12-31', 'on_track', 'Alicia Fontaine', 6)
) as g(k, obj, t, d, td, status, owner, so)
on conflict do nothing;

insert into public.plan_initiatives (id, org_id, goal_id, title, owner, status, sort_order, description)
select md5('ygb:init:'||i.k)::uuid, md5('ygb:org')::uuid, md5('ygb:goal:'||i.goal)::uuid, i.t, i.owner, i.status, i.so, i.d
from (values
  ('lit-blocks',    'sa-quality',   'Stand up fall literacy assessment cadence',        'Denise Carter',   'in_progress', 1, 'Baseline in September, checkpoints December and March.'),
  ('read-mentors',  'sa-quality',   'Recruit 10 reading mentors from PBPN',             'Marcus Boyd',     'in_progress', 2, '14 mentors sourced; 6 confirmed for fall Saturdays.'),
  ('bayside-pilot', 'summer-scale', 'Pilot Bayside CC as a second site',                'Denise Carter',   'todo',        1, 'MOU drafting; decision by October for Summer 2027.'),
  ('westbay-loi',   'summer-scale', 'Land Westbay Fund for Summer 2027',                'Alicia Fontaine', 'in_progress', 2, 'LOI due Aug 15; $40K = 15 seats + second-site staffing.'),
  ('parent-circle', 'family-engage','Launch the parent-circle track at Village Nights', 'Jamal Porter',    'in_progress', 1, 'Piloted in April; formalize with fall facilitators.'),
  ('vn-calendar',   'family-engage','Publish the full-year Village Night calendar',     'Jamal Porter',    'done',        2, 'Printed magnet at Juneteenth; on the website.'),
  ('rvswd-loop',    'partners',     'Counselor referral loop in all Ravenswood schools','Marcus Boyd',     'in_progress', 1, 'Live at Belle Haven + Chavez; two schools to go.'),
  ('reserve-policy','reserve',      'Adopt board reserve policy + auto-transfer',       'Gloria Hines',    'done',        1, 'Adopted January; $2K/mo transfer resumes post-summer.'),
  ('yearend-26',    'diversify',    'Year-end campaign: $55K goal',                     'Alicia Fontaine', 'todo',        1, 'Segment gala first-timers; Darnell Jenkins video story.'),
  ('monthly-25',    'diversify',    'Grow monthly donors to 25',                        'Alicia Fontaine', 'in_progress', 2, 'At 19 (one paused). Gala follow-up ask converts 3–5 more.')
) as i(k, goal, t, owner, status, so, d)
on conflict do nothing;

insert into public.plan_kpis (id, org_id, goal_id, title, unit, target, current, baseline, owner, cadence, source, metric_key, metric_id, status)
select md5('ygb:kpi:'||k.k)::uuid, md5('ygb:org')::uuid, md5('ygb:goal:'||k.goal)::uuid, k.t, k.u, k.tgt, k.cur, k.b, k.owner, k.cad, k.src, k.mk,
       case when k.mk is null then null else md5('ygb:met:'||k.mk)::uuid end, k.status
from (values
  ('sat-att',   'sa-quality',   'Saturday attendance rate',      '%',        85, 89,   79,   'Marcus Boyd',     'monthly',   'manual', 'saturday_attendance', 'on_track'),
  ('summer-en', 'summer-scale', 'Freedom Summer enrollment',     'scholars', 60, 59,   48,   'Marcus Boyd',     'monthly',   'manual', 'summer_enrollment',   'on_track'),
  ('fam-vn',    'family-engage','Families per Village Night',    'families', 75, 64,   31,   'Jamal Porter',    'monthly',   'manual', 'families_engaged',    'at_risk'),
  ('reserve-mo','reserve',      'Months of operating reserve',   'months',   6,  4.2,  5.1,  'Gloria Hines',    'monthly',   'manual', null::text,            'behind'),
  ('ind-raised','diversify',    'Individual giving YTD',         '$K',       200, 118, 96,   'Alicia Fontaine', 'monthly',   'manual', null,                  'on_track'),
  ('mo-donors', 'diversify',    'Active monthly donors',         'donors',   25, 19,   11,   'Alicia Fontaine', 'monthly',   'manual', 'monthly_donors',      'on_track')
) as k(k, goal, t, u, tgt, cur, b, owner, cad, src, mk, status)
on conflict do nothing;

insert into public.plan_kpi_snapshots (org_id, kpi_id, captured_on, value)
select md5('ygb:org')::uuid, md5('ygb:kpi:reserve-mo')::uuid, s.d, s.v
from (values
  (date '2026-01-31', 5.1), (date '2026-03-31', 4.8), (date '2026-05-31', 4.5), (date '2026-07-15', 4.2)
) as s(d, v)
on conflict do nothing;

commit;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 8 — Ops + compliance
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- NOTE: ops_projects/ops_tasks carry a legacy AA check constraint forcing
-- created_by in ('remi','shannon'); 'remi' is used as the literal. Assignment
-- is via assigned_to_id -> profiles (the modern column).
insert into public.ops_projects (id, org_id, title, category, status, description, created_by, due_date, grant_id)
select md5('ygb:proj:'||p.k)::uuid, md5('ygb:org')::uuid, p.t, p.cat, p.status, p.d, 'remi', p.due,
       case when p.grantk is null then null else md5('ygb:grant:'||p.grantk)::uuid end
from (values
  ('fs26',    'Freedom Summer 2026 execution',            'program',     'active', 'Weeks 5–6: showcases, Exploratorium recap, closing ceremony with families and funders.', date '2026-08-07', null::text),
  ('gala-fu', 'Juneteenth Gala follow-up & stewardship',  'fundraising', 'active', 'Thank-yous, first-timer welcome track, debrief memo to board.',                          date '2026-07-31', null),
  ('sa27',    'Saturday Academy 2026–27 recruitment',     'recruitment', 'active', 'Fill 48 seats across three Crews; waitlist families first.',                             date '2026-09-05', null),
  ('990',     'FY2025 Form 990 & state filings',          'compliance',  'active', 'CPA engaged (Okafor referral). Draft by September, board review October, file by Nov 15.', date '2026-11-15', null),
  ('retreat', 'Board retreat planning',                   'board',       'active', 'September retreat: 2027–29 strategy refresh + fundraising board roles.',                 date '2026-09-16', null),
  ('westbay', 'Westbay Fund LOI',                         'fundraising', 'active', 'LOI due Aug 15. Family-engagement outcomes front and center.',                           date '2026-08-15', 'westbay')
) as p(k, t, cat, status, d, due, grantk)
on conflict do nothing;

insert into public.ops_tasks (id, org_id, project_id, title, description, category, status, priority, created_by, assigned_to_id, due_date, pinned_for_today, pinned_for_this_week, planned_week, linked_entity_type, linked_entity_id, linked_label)
select md5('ygb:task:'||t.k)::uuid, md5('ygb:org')::uuid,
       case when t.proj is null then null else md5('ygb:proj:'||t.proj)::uuid end,
       t.title, t.d, t.cat, t.status, t.pri, 'remi', md5('ygb:user:'||t.who)::uuid, t.due, t.today, t.week,
       case when t.today or t.week then date '2026-07-20' else null end,
       t.let, case when t.lid is null then null else md5(t.lid)::uuid end, t.ll
from (values
  -- Freedom Summer
  ('fs-shirts',   'fs26',    'Order closing-ceremony t-shirts',                    'Sizes from the roster custom fields; need them by Jul 29.',                    'program',     'in_progress', 'high',   'marcus', date '2026-07-22', true,  true,  null::text, null::text, null::text),
  ('fs-program',  'fs26',    'Finalize closing ceremony run-of-show',              'Scholar performances + parent speaker (ask Darnell Jenkins again).',           'program',     'todo',        'high',   'denise', date '2026-07-28', false, true,  null, null, null),
  ('fs-media',    'fs26',    'Collect photo/media releases for showcase',          '6 families outstanding.',                                                      'program',     'in_progress', 'medium', 'jamal',  date '2026-07-24', false, true,  null, null, null),
  ('fs-mentors',  'fs26',    'Confirm 4 PBPN mentors for week 6 career day',       '2 confirmed, 2 pending.',                                                      'program',     'todo',        'medium', 'marcus', date '2026-07-27', false, false, null, null, null),
  ('fs-funders',  'fs26',    'Invite funders to closing ceremony',                 'Bayfront (Diane), County, Sand Hill, Westbay PO if timing works.',             'fundraising', 'in_progress', 'high',   'alicia', date '2026-07-23', true,  true,  null, null, null),
  -- Gala follow-up
  ('gala-thanks', 'gala-fu', 'Send remaining gift acknowledgments (3 pending)',    'Fitzgerald, Carver, Hollis — July gifts still unacknowledged.',                'fundraising', 'in_progress', 'urgent', 'alicia', date '2026-07-22', true,  true,  null, null, null),
  ('gala-welcome','gala-fu', 'Welcome track for gala first-timers',                'Osei, Fitzgerald, Royce → coffee or program tour before September.',           'fundraising', 'todo',        'medium', 'alicia', date '2026-08-08', false, false, null, null, null),
  ('gala-debrief','gala-fu', 'Gala debrief memo to board',                         'Net ~$40K after costs; recommendations for 2027.',                             'board',       'todo',        'medium', 'raymond', date '2026-07-31', false, true, null, null, null),
  ('gala-hollis', 'gala-fu', 'Program tour for Gerald Hollis',                     'He asked at the gala; pair with Denise for the Friday showcase.',              'fundraising', 'done',        'medium', 'raymond', date '2026-07-16', false, false, null, null, null),
  -- SA 2026–27
  ('sa27-form',   'sa27',    'Open 2026–27 enrollment',                            'Enrollment open; SA27 Crew accepting applications.',                           'program',     'done',        'medium', 'denise', date '2026-06-30', false, false, null, null, null),
  ('sa27-wait',   'sa27',    'Call waitlist families first',                       'Sterling and Boone families get first seats.',                                 'program',     'todo',        'high',   'jamal',  date '2026-08-05', false, false, null, null, null),
  ('sa27-flyers', 'sa27',    'Table at Ravenswood back-to-school nights',          'Coordinate dates with Dr. Mosley.',                                            'program', 'todo',        'medium', 'marcus', date '2026-08-12', false, false, null, null, null),
  -- 990
  ('990-books',   '990',     'Send reconciled H1 books to CPA',                    'P&L, GL export, gala event breakout.',                                         'finance',     'in_progress', 'high',   'gloria', date '2026-08-01', false, true,  null, null, null),
  ('990-review',  '990',     'Board review of draft 990',                          'Target the October board packet.',                                             'compliance',  'todo',        'medium', 'gloria', date '2026-10-15', false, false, null, null, null),
  -- Retreat
  ('retreat-venue','retreat','Book retreat venue',                                 'Half-day, Sept 16 after the board meeting.',                                   'board',       'todo',        'medium', 'raymond', date '2026-08-08', false, false, null, null, null),
  ('retreat-agenda','retreat','Draft strategy-refresh agenda with Vanessa',        'Anchor on the 2027–29 objectives and board fundraising roles.',                'board',       'todo',        'medium', 'raymond', date '2026-08-29', false, false, null, null, null),
  -- Westbay LOI
  ('west-draft',  'westbay', 'Draft LOI narrative',                                'Lead with family-engagement outcomes per PO guidance.',                        'fundraising', 'in_progress', 'high',   'alicia', date '2026-08-08', false, true,  'grant', 'ygb:grant:westbay', 'Westbay — Freedom Summer 2027'),
  ('west-data',   'westbay', 'Pull outcomes data for the LOI',                     'Village Night growth curve + camp attendance + retention.',                    'program',     'todo',        'high',   'denise', date '2026-08-01', false, true,  'grant', 'ygb:grant:westbay', 'Westbay — Freedom Summer 2027'),
  -- Loose end
  ('ellison-call', null,     'Soft call to Tamika Ellison (paused monthly gift)',  'Jamal knows the family — no dunning email.',                                   'fundraising', 'todo',        'low',    'jamal',  date '2026-07-30', false, false, null, null, null)
) as t(k, proj, title, d, cat, status, pri, who, due, today, week, let, lid, ll)
on conflict do nothing;

insert into public.compliance_items (id, org_id, kind, title, jurisdiction, due_date, recur, status, assigned_to, assigned_to_id, last_filed_at, notes, checklist)
select md5('ygb:comp:'||c.k)::uuid, md5('ygb:org')::uuid, c.kind, c.t, c.j, c.due, c.recur, c.status, c.who, md5('ygb:user:'||c.whoid)::uuid, c.lf, c.notes, c.cl::jsonb
from (values
  ('990',      'form_990',         'Form 990 — FY2025',                        'Federal (IRS)', date '2026-11-15', 'annual',   'in_progress', 'Gloria Hines', 'gloria', timestamptz '2025-11-10 12:00:00-08', 'CPA engaged via Okafor referral.',
   '[{"id":"1","text":"Reconcile FY25 books","done":true},{"id":"2","text":"Engagement letter signed","done":true},{"id":"3","text":"Send H1 books + gala breakout to CPA","done":false},{"id":"4","text":"Board reviews draft (October packet)","done":false},{"id":"5","text":"E-file by Nov 15","done":false}]'),
  ('rrf1',     'state_charitable', 'CA RRF-1 — annual registration renewal',   'California (AG)', date '2026-11-15', 'annual',  'upcoming',    'Gloria Hines', 'gloria', timestamptz '2025-11-10 12:00:00-08', 'File with the 990 copy.', '[]'),
  ('si100',    'corporate_report', 'CA SI-100 — Statement of Information',     'California (SOS)', date '2027-03-31', 'biennial','upcoming',   'Gloria Hines', 'gloria', timestamptz '2025-03-15 12:00:00-07', null, '[]'),
  ('gl-ins',   'insurance',        'General liability policy renewal',         null,            date '2026-09-01', 'annual',   'upcoming',    'Gloria Hines', 'gloria', null, 'Includes youth-program rider; confirm St. Mark listed as additional insured.', '[]'),
  ('do-ins',   'insurance',        'D&O policy renewal',                       null,            date '2027-02-11', 'annual',   'filed',       'Gloria Hines', 'gloria', timestamptz '2026-02-11 12:00:00-08', 'Renewed February 2026.', '[]'),
  ('de9',      'employment_tax',   'CA DE-9 quarterly payroll filing — Q2',    'California (EDD)', date '2026-07-31', 'quarterly','in_progress','Gloria Hines','gloria', timestamptz '2026-04-28 12:00:00-07', 'Gusto files; Gloria verifies confirmation.', '[]'),
  ('safety',   'policy',           'Child-safety policy & staff training',     null,            date '2027-06-01', 'annual',   'filed',       'Denise Carter', 'denise', timestamptz '2026-06-01 12:00:00-07', 'All staff + TLC teens trained before camp. Background checks current.', '[]'),
  ('stmark-mou','contract',        'St. Mark AME facility agreement renewal',  null,            date '2026-08-31', 'annual',   'upcoming',    'Raymond Williams', 'raymond', null, 'Simone reviews pro bono; keep the below-market rate through 2027.', '[]')
) as c(k, kind, t, j, due, recur, status, who, whoid, lf, notes, cl)
on conflict do nothing;

commit;

-- ============================================================================
-- End of seed. Post-checks worth running:
--   select count(*) from students where org_id = md5('ygb:org')::uuid;   -- 43
--   select count(*) from gifts    where org_id = md5('ygb:org')::uuid;   -- ~65
--   select email, role from org_email_allowlist where org_id = md5('ygb:org')::uuid;
-- ============================================================================
