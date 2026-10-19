-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — Org core: org, entitlements, terminology, participant stages,
--             custom fields, pipelines, programs, funds, campaigns, appeals,
--             fin_config shell, org settings, comms settings
-- ════════════════════════════════════════════════════════════════════════════
begin;

insert into public.orgs (id, name, slug, settings)
values (pg_temp.nb_org(), 'Northbridge Youth Alliance', 'northbridge-demo', '{}'::jsonb)
on conflict do nothing;

-- Full-tier demo: every generic module + AI + Capture + coaching.
-- Never aa.* (Ambition Angels' website-coupled surfaces) and never
-- modules.content (the GLOBAL career library — editing it from a demo would
-- change the live teen games).
insert into public.org_entitlements (org_id, feature_key, enabled, source)
select pg_temp.nb_org(), k, true, 'seed:northbridge_demo'
from unnest(array[
  'modules.fundraising','modules.finance','modules.program','modules.ops',
  'modules.board','modules.compliance','modules.strategy','modules.staff',
  'modules.reviews','modules.partners','modules.meetings','modules.comms',
  'modules.messages','modules.documents','modules.metrics',
  'ai.reed','ai.prospect_research','ai.capture','coaching'
]) as k
on conflict do nothing;

insert into public.org_terminology (org_id, term_key, label)
select pg_temp.nb_org(), t.k, t.v
from (values
  ('student',   'Participant'),
  ('volunteer', 'Mentor'),
  ('partner',   'Partner'),
  ('staff',     'Team')
) as t(k, v)
on conflict do nothing;

-- Participant lifecycle (engaged = counts as actively served).
insert into public.participant_stages (org_id, stage_key, label, sort_order, engaged, terminal, description)
select pg_temp.nb_org(), s.k, s.l, s.o, s.e, s.t, s.d
from (values
  ('inquiry',   'Inquiry',    1, false, false, 'Referred or reached out; not yet applied.'),
  ('applied',   'Applied',    2, false, false, 'Application in; interview or review pending.'),
  ('enrolled',  'Enrolled',   3, true,  false, 'Active in at least one program.'),
  ('alumni',    'Alumni',     4, false, true,  'Completed a program; stays in the alumni network.'),
  ('withdrawn', 'Withdrawn',  5, false, true,  'Left before completing.')
) as s(k, l, o, e, t, d)
on conflict do nothing;

insert into public.custom_field_defs (org_id, entity_type, key, label, field_type, options, required, sort_order)
select pg_temp.nb_org(), f.et, f.k, f.l, f.t, f.o, f.r, f.s
from (values
  ('student', 'grade',          'Grade',                 'select',      '["9","10","11","12","Post-secondary","Not in school"]'::jsonb, false, 1),
  ('student', 'school',         'School',                'text',        null::jsonb, false, 2),
  ('student', 'track',          'Career track',          'select',      '["IT support","Healthcare","Building trades","Business & finance","Undecided"]'::jsonb, false, 3),
  ('student', 'guardian_name',  'Guardian name',         'text',        null::jsonb, false, 4),
  ('student', 'guardian_phone', 'Guardian phone',        'phone',       null::jsonb, false, 5),
  ('student', 'first_gen',      'First-generation college', 'boolean',  null::jsonb, false, 6),
  ('student', 'neighborhood',   'Neighborhood',          'select',      '["East Oakland","Fruitvale","West Oakland","Downtown","San Leandro","Other"]'::jsonb, false, 7),
  ('student', 'needs',          'Supports needed',       'multiselect', '["Transit pass","Laptop","Childcare","Food","Work clothing","Tutoring"]'::jsonb, false, 8),
  ('constituent', 'affinity',   'Affinity',              'select',      '["Career mentoring","Youth employment","Education equity","Oakland roots","Alumni family"]'::jsonb, false, 1),
  ('constituent', 'employer_partner', 'Employer partner', 'boolean',    null::jsonb, false, 2),
  ('constituent', 'mentor_status', 'Mentor status',      'select',      '["Applied","Background check","Trained","Matched","Alumni mentor"]'::jsonb, false, 3)
) as f(et, k, l, t, o, r, s)
on conflict do nothing;

-- Fundraising pipelines. opportunities carry a composite FK
-- (org_id, pipeline, stage) -> pipeline_stages, so stages must exist first.
insert into public.pipelines (id, org_id, key, label, sort_order, is_default)
values
  (pg_temp.nb_id('pipeline:default'),   pg_temp.nb_org(), 'default',   'Major Gifts & Grants',    0, true),
  (pg_temp.nb_id('pipeline:corporate'), pg_temp.nb_org(), 'corporate', 'Corporate Partnerships',  1, false)
on conflict do nothing;

-- counts_as_pledged marks "committed, not yet collected" for gift tables.
insert into public.pipeline_stages (id, org_id, pipeline, key, label, sort_order, stage_type, probability_default, counts_as_pledged)
select pg_temp.nb_id('pstage:default:' || v.key), pg_temp.nb_org(), 'default', v.key, v.label, v.sort_order, v.stage_type, v.prob, v.pledged
from (values
  ('identified',            'Identified',                        1, 'open',    10,          false),
  ('researched',            'Researched',                        2, 'open',    20,          false),
  ('needs_appointment',     'Needs Appointment',                 3, 'open',    30,          false),
  ('appointment_scheduled', 'Appointment Scheduled',             4, 'open',    40,          false),
  ('meeting_complete',      'Meeting Complete / Ready for Ask',  5, 'open',    60,          false),
  ('ask_made',              'Ask Made',                          6, 'open',    75,          false),
  ('pledged',               'Pledged',                           7, 'open',    90,          true),
  ('closed_won',            'Closed Won',                        8, 'won',    100,          false),
  ('closed_lost',           'Closed Lost',                       9, 'lost',     0,          false),
  ('on_hold',               'On Hold',                          10, 'on_hold', null::int,   false)
) as v(key, label, sort_order, stage_type, prob, pledged)
on conflict do nothing;

-- Corporate pipeline: its own labels, but stage KEYS drawn from the app's
-- known vocabulary (lib/fundraising/stage-sets.ts) — the briefing, forecast,
-- and Reed classify open/won/lost by key, so a custom key would silently drop
-- out of weighted totals.
insert into public.pipeline_stages (id, org_id, pipeline, key, label, sort_order, stage_type, probability_default, counts_as_pledged)
select pg_temp.nb_id('pstage:corporate:' || v.key), pg_temp.nb_org(), 'corporate', v.key, v.label, v.sort_order, v.stage_type, v.prob, v.pledged
from (values
  ('identify',    'Prospect',             1, 'open',  15,  false),
  ('qualify',     'Intro Meeting',        2, 'open',  30,  false),
  ('cultivate',   'Partnership Proposal', 3, 'open',  55,  false),
  ('solicit',     'Negotiating',          4, 'open',  75,  false),
  ('pledged',     'Committed',            5, 'open',  90,  true),
  ('closed_won',  'Signed',               6, 'won',  100,  false),
  ('closed_lost', 'Declined',             7, 'lost',   0,  false)
) as v(key, label, sort_order, stage_type, prob, pledged)
on conflict do nothing;

insert into public.programs (id, org_id, name, description, active)
select pg_temp.nb_id('prog:' || p.k), pg_temp.nb_org(), p.n, p.d, true
from (values
  ('launchpad',   'Launchpad Academy',   'After-school career exploration and academic support for high schoolers (grades 9–12) at three Oakland school sites, Monday–Thursday through the school year.'),
  ('summerworks', 'Summer Works',        'Seven-week paid summer internships for ages 16–21 with ~22 employer partners, plus weekly job-readiness workshops.'),
  ('pathways',    'Pathways Fellowship', 'Twelve-month fellowship for ages 18–24: industry certifications in IT support, healthcare, and the building trades, one-on-one coaching, and job placement.'),
  ('mentors',     'Mentor Circles',      'Volunteer professionals matched one-on-one with Northbridge youth, meeting monthly in small circles.')
) as p(k, n, d)
on conflict do nothing;

insert into public.funds (id, org_id, name, restricted, gl_code)
select pg_temp.nb_id('fund:' || f.k), pg_temp.nb_org(), f.n, f.r, f.gl
from (values
  ('general',  'General Operating',       false, '4000'),
  ('pathways', 'Pathways Fellowship Fund', true,  '4100'),
  ('stipends', 'Youth Stipend Fund',       true,  '4200'),
  ('reserve',  'Opportunity Reserve',      false, '3900')
) as f(k, n, r, gl)
on conflict do nothing;

insert into public.campaigns (id, org_id, name, goal, starts_on, ends_on)
values
  (pg_temp.nb_id('camp:annual'),  pg_temp.nb_org(), 'FY' || pg_temp.fy() || ' Annual Fund',      900000, pg_temp.fy_start(), (pg_temp.fy_start() + interval '1 year - 1 day')::date),
  (pg_temp.nb_id('camp:yearend'), pg_temp.nb_org(), 'Year-End ' || extract(year from pg_temp.d(60))::int, 400000, pg_temp.d(14), make_date(extract(year from pg_temp.d(60))::int, 12, 31)),
  (pg_temp.nb_id('camp:gala'),    pg_temp.nb_org(), 'Northbridge Rising Gala',                  275000, pg_temp.d(-240), pg_temp.d(-150)),
  (pg_temp.nb_id('camp:summer'),  pg_temp.nb_org(), 'Summer Works Sponsor Drive',               350000, pg_temp.d(-20), pg_temp.d(200))
on conflict do nothing;

insert into public.appeals (id, org_id, campaign_id, name, source_code)
select pg_temp.nb_id('appeal:' || a.k), pg_temp.nb_org(), pg_temp.nb_id('camp:' || a.c), a.n, a.sc
from (values
  ('yearend', 'yearend', 'Year-End Appeal',       'YE'),
  ('gt',      'yearend', 'GivingTuesday',          'GT'),
  ('spring',  'annual',  'Spring Appeal',          'SPR'),
  ('gala',    'gala',    'Gala Paddle Raise',      'GALA'),
  ('monthly', 'annual',  'Monthly Giving Circle',  'MON')
) as a(k, c, n, sc)
on conflict do nothing;

-- Prior fiscal years, so historical gifts attribute to a campaign/appeal
-- instead of piling up as "Unattributed". FY(n-1)'s December/GivingTuesday
-- fall in calendar year fy-2; its spring appeal in fy-1.
insert into public.campaigns (id, org_id, name, goal, starts_on, ends_on)
values
  (pg_temp.nb_id('camp:annual_prev'),  pg_temp.nb_org(), 'FY' || (pg_temp.fy() - 1) || ' Annual Fund', 800000,
   (pg_temp.fy_start() - interval '1 year')::date, (pg_temp.fy_start() - 1)),
  (pg_temp.nb_id('camp:annual_prev2'), pg_temp.nb_org(), 'FY' || (pg_temp.fy() - 2) || ' Annual Fund', 700000,
   (pg_temp.fy_start() - interval '2 years')::date, (pg_temp.fy_start() - interval '1 year' - interval '1 day')::date)
on conflict do nothing;

insert into public.appeals (id, org_id, campaign_id, name, source_code)
values
  (pg_temp.nb_id('appeal:yearend_prev'), pg_temp.nb_org(), pg_temp.nb_id('camp:annual_prev'), 'Year-End Appeal ' || (pg_temp.fy() - 2), 'YE' || (pg_temp.fy() - 2) % 100),
  (pg_temp.nb_id('appeal:gt_prev'),      pg_temp.nb_org(), pg_temp.nb_id('camp:annual_prev'), 'GivingTuesday ' || (pg_temp.fy() - 2),   'GT' || (pg_temp.fy() - 2) % 100),
  (pg_temp.nb_id('appeal:spring_prev'),  pg_temp.nb_org(), pg_temp.nb_id('camp:annual_prev'), 'Spring Appeal ' || (pg_temp.fy() - 1),   'SPR' || (pg_temp.fy() - 1) % 100)
on conflict do nothing;

-- Finance config shell (Section 4 owns the numbers; it updates this row for
-- this org only). FY = July–June, named for its end year.
insert into public.fin_config
  (org_id, fiscal_year_start_month, current_year, fundraising_goal,
   cash_starting_balance, cash_starting_date, monthly_burn_baseline,
   forward_horizon_months, runway_target_months)
select pg_temp.nb_org(), 7, pg_temp.fy(), 3550000,
       0, pg_temp.fy_start(), 280000, 3, 6
where not exists (select 1 from public.fin_config where org_id = pg_temp.nb_org());

insert into public.org_settings (org_id, default_steward)
values (pg_temp.nb_org(), 'priya')
on conflict do nothing;

-- Comms identity. The from-address is on a reserved .example domain, so
-- nothing this org "sends" can reach a real inbox.
insert into public.org_comms_settings (org_id, from_name, from_email, reply_to, mailing_address, footer_text, daily_send_cap)
values (pg_temp.nb_org(), 'Northbridge Youth Alliance', 'hello@northbridge.example', 'priya@northbridge.example',
        '1450 Harbor Light Way, Oakland, CA 94607',
        'You are receiving this because you support Northbridge Youth Alliance. Reply to this email anytime; a real person reads it.',
        500)
on conflict do nothing;

commit;
