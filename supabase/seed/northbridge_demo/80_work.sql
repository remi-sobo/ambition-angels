-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 8a — Work: projects, tasks, planning rhythm, meetings, calendar
--   ops_projects (8 bible projects + extras + grant workspaces), ops_tasks
--   (~165 across every teammate + acknowledgment mirrors), work_blocks +
--   work_block_tasks, rhythm_sessions, meeting_types, bookings, blackouts,
--   calendar_events (Remi's calendar), meeting_records + suggested tasks,
--   meeting_exclusions, calendar_prefs (teammates only), agenda_delegations,
--   board meeting_attendance, and the meeting matcher's timeline fan-out.
--
-- Production-safety notes (read before changing anything here):
--   * meeting_types are ALL is_active = false. The public /meet page and
--     /api/meet/* read active types with NO org filter, so an active
--     Northbridge type would appear on Ambition Angels' real booking page.
--   * blackouts always carry meeting_type_ids = Northbridge's own types.
--     lib/availability.ts reads blackouts with NO org filter and treats a
--     NULL list as "every type", which would black out AA's real page.
--   * bookings are past-only. app/api/cron/meet-reminders emails every org's
--     upcoming confirmed bookings through the env Gmail account (no Google
--     connection needed), and confirmed future bookings would also block AA
--     slots (fetchConfirmedBookingsAsBusy has no org filter). cancel_token is
--     left to its random default so nobody can derive it from this file.
--   * calendar_prefs is keyed by user_id alone (global): never a row for Remi.
--   * calendar events exist only for Remi (the one person who could connect a
--     calendar); google ids use characters Google never emits, so they can
--     never collide with his real events.
-- ════════════════════════════════════════════════════════════════════════════

-- Section-local helpers (pg_temp, session-only).
-- w8_wd(n): anchor + n days, pushed forward to Monday when it lands on a weekend.
create or replace function pg_temp.w8_wd(n int) returns date language sql stable
  as $$ select case extract(isodow from pg_temp.d(n))::int
                 when 6 then pg_temp.d(n) + 2 when 7 then pg_temp.d(n) + 1 else pg_temp.d(n) end $$;
-- w8_wdb(n): anchor + n days, pulled back to Friday when it lands on a weekend.
create or replace function pg_temp.w8_wdb(n int) returns date language sql stable
  as $$ select case extract(isodow from pg_temp.d(n))::int
                 when 6 then pg_temp.d(n) - 1 when 7 then pg_temp.d(n) - 2 else pg_temp.d(n) end $$;
-- w8_mon(day): the Monday of that day's week (lib/admin/ops/week.ts mondayOf).
create or replace function pg_temp.w8_mon(dd date) returns date language sql immutable
  as $$ select dd - (extract(isodow from dd)::int - 1) $$;
-- w8_at(day, 'HH:MI'): Pacific wall-clock instant on a given date.
create or replace function pg_temp.w8_at(dd date, hhmi text) returns timestamptz language sql stable
  as $$ select (dd::text || ' ' || hhmi)::timestamp at time zone 'America/Los_Angeles' $$;
-- w8_att('email|Name|status;...'): Google-shaped attendee list, first = organizer.
create or replace function pg_temp.w8_att(spec text) returns jsonb language sql immutable
  as $$ select coalesce(jsonb_agg(jsonb_build_object(
              'email', split_part(p, '|', 1),
              'displayName', nullif(split_part(p, '|', 2), ''),
              'responseStatus', coalesce(nullif(split_part(p, '|', 3), ''), 'accepted'),
              'organizer', o = 1) order by o), '[]'::jsonb)
         from unnest(string_to_array(spec, ';')) with ordinality as t(p, o)
         where p <> '' $$;
-- w8_usd(amount): "$20,000" / "$62.50", matching ackTaskTitle's formatting.
create or replace function pg_temp.w8_usd(a numeric) returns text language sql immutable
  as $$ select case when a = trunc(a) then to_char(a, 'FM$999,999,999') else to_char(a, 'FM$999,999,990.00') end $$;

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Booking page: meeting types (inactive — see header), blackouts, bookings
-- ════════════════════════════════════════════════════════════════════════════
insert into public.meeting_types
  (id, org_id, slug, name, duration_minutes, description, prep_notes, who_its_for, color, icon_name,
   buffer_minutes, min_notice_hours, max_advance_days, available_days, available_start_time, available_end_time,
   daily_limit, is_active, sort_order, duration_options, location_options, default_in_person_address,
   created_at, updated_at)
select pg_temp.nb_id('mtype:' || m.k), pg_temp.nb_org(), 'northbridge-' || replace(m.k, '_', '-'), m.n, m.dur,
       m.descr, m.prep, m.who, m.color, m.icon, m.buf, m.notice, m.adv, m.days, m.st::time, m.et::time,
       m.lim, false, m.o, m.dopts, m.locs, m.addr, pg_temp.ts(m.c, '10:00'), pg_temp.ts(m.u, '14:00')
from (values
  ('intro', 'Intro conversation', 30,
   'A first conversation about Northbridge: who we serve, how the programs work, and where you might fit in.',
   'Send a sentence or two about what prompted you to reach out, so Remi can come prepared.',
   'Funders, community partners, and neighbors who want to learn about the work.',
   '#E8500A', 'MessageCircle', 15, 24, 30, array[2,3,4], '10:00', '16:00', 3, 1, array[30,45], array['video'], null::text, -420, -40),
  ('employer', 'Employer partnership call', 45,
   'For employers thinking about hosting Summer Works interns or hiring Pathways fellows. We will cover roles, supervision, wages, and timing.',
   'Have a rough sense of the roles, the number of openings, and the season you are hiring for.',
   'Hiring managers, HR leads, and owners of local businesses.',
   '#10214B', 'Building2', 15, 24, 45, array[1,2,3,4,5], '09:00', '15:30', 4, 2, null::int[], array['video','in_person'], '1450 Harbor Light Way, Oakland, CA 94607', -400, -25),
  ('site_visit', 'Program site visit', 90,
   'See Launchpad Academy in action at one of our school sites: a short briefing, then time in the room with students and coaches.',
   'Visits run during the school year, Tuesday through Thursday afternoons. We will confirm the school and parking details by email.',
   'Funders, board prospects, and partners who want to see the program firsthand.',
   '#2F7D5B', 'Compass', 30, 72, 60, array[2,3,4], '15:00', '17:30', 1, 3, null::int[], array['in_person'], 'Eastlake High School, Room 204 (we meet at the front office)', -380, -60),
  ('mentor', 'Mentor info session', 30,
   'A short call about Mentor Circles: what mentoring with Northbridge looks like, the monthly time commitment, and the background-check steps.',
   null::text,
   'Working professionals interested in mentoring a young person ages 16 to 24.',
   '#C2410C', 'Heart', 10, 24, 30, array[2,4], '12:00', '18:00', 4, 4, null::int[], array['video'], null::text, -300, -70),
  ('alumni', 'Alumni office hours', 20,
   'Open office hours for Northbridge alumni: job leads, references, school applications, or just a check-in.',
   'Tell us which program you were in and roughly when.',
   'Graduates of Launchpad, Summer Works, and the Pathways Fellowship.',
   '#7C3AED', 'GraduationCap', 10, 12, 21, array[5], '12:00', '14:00', 4, 5, null::int[], array['video'], null::text, -250, -90)
) as m(k, n, dur, descr, prep, who, color, icon, buf, notice, adv, days, st, et, lim, o, dopts, locs, addr, c, u)
on conflict do nothing;

-- Blackouts: always scoped to Northbridge's own meeting types (never NULL).
insert into public.blackouts (id, org_id, start_date, end_date, reason, meeting_type_ids, created_at)
select pg_temp.nb_id('blackout:' || b.k), pg_temp.nb_org(), b.s, b.e, b.r,
       array(select pg_temp.nb_id('mtype:' || t) from unnest(array['intro','employer','site_visit','mentor','alumni']) t),
       pg_temp.ts(b.c, '11:00')
from (
  select 'thanksgiving' k, tg - 1 s, tg + 1 e, 'Thanksgiving break: office closed' r, -30 c
  from (select n1 + ((4 - extract(isodow from n1)::int + 7) % 7) + 21 tg
        from (select make_date(extract(year from pg_temp.d(0))::int
                               + case when pg_temp.d(0) > make_date(extract(year from pg_temp.d(0))::int, 11, 20) then 1 else 0 end, 11, 1) n1) a) x
  union all
  select 'winter', make_date(extract(year from pg_temp.d(0))::int, 12, 22), make_date(extract(year from pg_temp.d(0))::int + 1, 1, 2),
         'Winter break: office closed, no bookings', -30
  union all
  select 'retreat', pg_temp.d(54), pg_temp.d(54), 'Board retreat (all day)', -12
  union all
  select 'yearend_launch', pg_temp.d(14), pg_temp.d(14), 'Year-End campaign launch day', -5
  union all
  select 'summer_orientation', pg_temp.summer_start() - 4, pg_temp.summer_start(), 'Summer Works orientation week',
         (pg_temp.summer_start() - pg_temp.nb_anchor()) - 40
) b
on conflict do nothing;

-- Bookings: PAST ONLY (see header). Start times carry +17s so they can never
-- collide with another org's confirmed slot on the global unique index.
insert into public.bookings
  (id, org_id, meeting_type_id, start_time, end_time, attendee_timezone, attendee_name, attendee_email,
   attendee_company, attendee_role, attendee_message, meeting_url, status, cancelled_at, cancellation_reason,
   reminder_sent_24h, reminder_sent_1h, created_at, updated_at, location_type, location_details)
select pg_temp.nb_id('booking:' || b.k), pg_temp.nb_org(), pg_temp.nb_id('mtype:' || b.t),
       pg_temp.w8_at(pg_temp.w8_wdb(b.dd), b.hm) + interval '17 seconds',
       pg_temp.w8_at(pg_temp.w8_wdb(b.dd), b.hm) + interval '17 seconds' + make_interval(mins => b.dur),
       'America/Los_Angeles', b.nm, b.em, b.co, b.ro, b.msg,
       case when b.loc = 'video' then 'https://meet.example.com/nb-' || substr(md5('nb:booking:' || b.k), 1, 10) end,
       b.st,
       case when b.st = 'cancelled' then pg_temp.w8_at(pg_temp.w8_wdb(b.dd), b.hm) - interval '26 hours' end,
       b.why,
       b.st in ('confirmed', 'no_show', 'completed'), b.st in ('confirmed', 'no_show', 'completed'),
       pg_temp.w8_at(pg_temp.w8_wdb(b.dd), b.hm) - make_interval(days => b.lead),
       pg_temp.w8_at(pg_temp.w8_wdb(b.dd), b.hm) + interval '2 hours',
       b.loc,
       case when b.loc = 'in_person' then 'Eastlake High School, Room 204 (meet at the front office)' end
from (values
  ('whitfield',   'employer',   -21, '10:00', 45, 'Dana Whitfield',     'dana.whitfield@example.com',   'Lantern Point Credit Union', 'Branch Operations Manager', 'We are opening two teller-trainee roles next summer and heard about Summer Works from Pacific Summit.', 'confirmed', null::text, 6, 'video'),
  ('rao',         'intro',      -45, '11:00', 30, 'Priyanka Rao',       'priyanka.rao@example.net',     null::text, 'Parent', 'My son is a sophomore at Bayshore and wants to know how Launchpad works.', 'confirmed', null::text, 4, 'video'),
  ('young',       'site_visit', -38, '15:00', 90, 'Terrence Young',     'terrence.young@example.org',   'Eastshore Community College', 'Career Center Director', 'Would love to see a Launchpad session before we talk about dual enrollment.', 'confirmed', null::text, 9, 'in_person'),
  ('novak',       'mentor',     -33, '12:30', 30, 'Elise Novak',        'elise.novak@example.com',      'Bay Volunteer Collective', 'Volunteer Coordinator', 'Several of our members want to mentor as a group. Is that possible?', 'confirmed', null::text, 5, 'video'),
  ('cho',         'employer',   -29, '13:00', 45, 'Hannah Cho',         'hannah.cho@example.com',       'Tidewell Logistics', 'HR Manager', 'Interested in warehouse-operations interns.', 'cancelled', 'We are in a hiring freeze until January. I will rebook then.', 3, 'video'),
  ('ortizlee',    'intro',      -26, '14:00', 30, 'Samuel Ortiz-Lee',   'samuel.ortizlee@example.org',  'Eastshore Community College', 'Transfer Counselor', 'Exploring a referral pathway for Pathways graduates who want an associate degree.', 'confirmed', null::text, 7, 'video'),
  ('adeyemi',     'mentor',     -19, '12:00', 30, 'Rachel Adeyemi',     'rachel.adeyemi@example.net',   null::text, 'Nurse practitioner', 'I want to mentor someone on the healthcare track.', 'no_show', null::text, 2, 'video'),
  ('huang',       'intro',      -17, '11:30', 30, 'Victor Huang',       'victor.huang@example.com',     'Lakeview Merchants Association', 'Board member', 'Our association picks one youth nonprofit to support each year.', 'confirmed', null::text, 8, 'video'),
  ('carter',      'alumni',     -12, '12:20', 20, 'Imani Carter',       'imani.carter@example.net',     null::text, 'Pathways Cohort 4 alum', 'Need a reference for a medical assistant job.', 'confirmed', null::text, 2, 'video'),
  ('villanueva',  'employer',   -10, '09:30', 45, 'Jorge Villanueva',   'jorge.villanueva@example.org', 'Ironbridge Trades Council', 'Apprenticeship Coordinator', 'Following up on the pre-apprenticeship partnership Redline mentioned.', 'confirmed', null::text, 5, 'video'),
  ('tanaka',      'intro',       -8, '10:30', 30, 'Mei Tanaka',         'mei.tanaka@example.org',       'East Bay Youth Funders Circle', 'Program Director', 'We are building a site-visit list for our spring learning tour.', 'confirmed', null::text, 6, 'video'),
  ('kbrooks',     'alumni',      -5, '12:40', 20, 'Kevin Brooks',       'kevin.brooks@example.net',     null::text, 'Summer Works alum', 'Can we talk about community college vs. a trade program?', 'cancelled', 'Started a new job and cannot make the time. Thank you!', 3, 'video'),
  ('pierce',      'employer',    -4, '14:00', 45, 'Natalie Pierce',     'natalie.pierce@example.com',   'Cedarline Health', 'Talent Acquisition Partner', 'We have patient-services roles that might fit healthcare-track fellows.', 'confirmed', null::text, 7, 'video'),
  ('haddad',      'mentor',      -2, '17:00', 30, 'Omar Haddad',        'omar.haddad@example.com',      null::text, 'Software engineer', 'Kinetic Labs colleague told me about Mentor Circles.', 'completed', null::text, 3, 'video')
) as b(k, t, dd, hm, dur, nm, em, co, ro, msg, st, why, lead, loc)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Projects: the 8 bible projects, a few more (done / paused history), and
--    a workspace project for each grant Section 3b creates (grant-backed
--    projects stay hidden on Projects until "show grant projects").
-- ════════════════════════════════════════════════════════════════════════════
insert into public.ops_projects
  (id, org_id, title, category, status, description, assigned_to, created_by, due_date,
   last_touched_at, created_at, updated_at, completed_at, initiative_id, grant_id)
select pg_temp.nb_id('proj:' || p.k), pg_temp.nb_org(), p.title, p.cat, p.st, p.descr, p.who, p.by,
       case when p.due is null then null else pg_temp.d(p.due) end,
       pg_temp.ts(p.touch, '15:20'), pg_temp.ts(p.age, '09:30'), pg_temp.ts(p.touch, '15:20'),
       case when p.st = 'done' then pg_temp.ts(p.touch, '15:20') end,
       -- Section 6's initiatives (init:<k>); null when Section 6 is absent.
       (select pi.id from public.plan_initiatives pi
         where pi.id = pg_temp.nb_id('init:' || p.ini) and pi.org_id = pg_temp.nb_org()),
       case when p.grant_key is null then null
            else (select g.id from public.grants g where g.id = pg_temp.nb_id('grant:' || p.grant_key) and g.org_id = pg_temp.nb_org()) end
from (values
  ('yearend', 'Year-End Campaign launch', 'fundraising', 'active', 'priya', 'priya', 14, -1, -48,
   E'## Goal\n$400K between launch day and December 31, the biggest single push of the fiscal year.\n\n## Plan\n- **Letter:** Amara''s story (Pathways Cohort 6, now on the help desk at Kinetic Labs). Remi edits, Jordan sends to the mail house.\n- **Match:** Kinetic Labs GivingTuesday match plus Celeste''s $20K board challenge.\n- **Segments:** major donors get a personal call or note first; mid-level and monthly donors get the letter plus two emails.\n- **Event:** donor breakfast in early December with Amara speaking.\n\n## Owners\nPriya (lead), Jordan (production and events), Remi (major donor calls), Ben (segment lists).',
   'fl_yearend', null::text),
  ('audit', 'FY' || (pg_temp.fy() - 1) || ' Audit', 'finance', 'active', 'kwame', 'tasha', 35, -2, -60,
   E'## Scope\nIndependent audit of last fiscal year. Fieldwork is underway; the report goes to the Finance & Audit Committee, then the full board.\n\n## Checklist\n- Engagement letter signed (done)\n- PBC list delivered (in progress)\n- Fieldwork week\n- Draft report and management letter\n- Committee review, then board acceptance\n\nKwame owns day-to-day; Tasha signs the representation letter with Remi.',
   'rs_audit', null::text),
  ('cohort8', 'Pathways Cohort 8 recruitment', 'recruitment', 'active', 'andre', 'miguel', 60, -1, -52,
   E'## Target\n36 fellows across IT support, healthcare, and building trades, starting in the spring.\n\n## Pipeline\n- 41 applications in\n- 18 shortlisted for interviews\n- Offers after interviews; aim for 40 offers to fill 36 seats\n\n## Notes\nRedline referred Jalen Price for the trades track. Library info session drew 30 people.',
   'ys_cohort8', null::text),
  ('sw_employers', 'Summer Works ' || (extract(year from pg_temp.summer_start())::int + 1) || ' employer recruitment', 'program', 'active', 'simone', 'miguel', 150, -3, -40,
   E'## Goal\n30 employers and 100 paid internships next summer (up from 22 employers and 85 interns).\n\n## Approach\n- Renew last summer''s 22 employers first (calls through November)\n- 30 new targets from the board and the Pacific Summit network\n- Refreshed employer one-pager and a simple supervisor guide',
   'sw_employers', null::text),
  ('retreat', 'Board retreat', 'board', 'active', 'remi', 'remi', 66, -2, -35,
   E'## Purpose\nA full day for the board to step back: reserve policy, the San Leandro decision, and the next strategic plan cycle.\n\n## Logistics\n- Date and venue set with Celeste\n- Facilitator shortlist of two\n- Pre-read goes out two weeks ahead\n\nTasha runs logistics; Remi and Celeste own the agenda.',
   'pb_retreat', null::text),
  ('meridian', 'Meridian proposal follow-through', 'fundraising', 'active', 'priya', 'priya', 35, -1, -70,
   E'## The ask\n$300K over two years to open a fourth Launchpad site in San Leandro.\n\n## Status\nFull proposal submitted three weeks ago. Camille Washington called with follow-up questions; decision expected in about five weeks.\n\n## Open items\n- San Leandro pilot budget broken out by year\n- One-page sustainability plan for the fourth site\n- Site-visit dates for early November',
   'sl_meridian', 'meridian'),
  ('sanleandro', 'San Leandro site expansion', 'program', 'active', 'miguel', 'remi', 120, -3, -90,
   E'## What\nA fourth Launchpad site in partnership with San Leandro Unified''s Career Ed office, starting next school year.\n\n## Decisions ahead\n- Go/no-go criteria (Remi and Miguel)\n- Pilot scope: one school, 40 students, Monday to Thursday\n- Funding: Meridian proposal plus district match\n\n## Partner\nLaura Kim, Director of Career Ed. MOU draft has been sent.',
   'sl_launch', null::text),
  ('crm', 'Data cleanup (CRM)', 'admin', 'active', 'ben', 'tasha', 21, -1, -30,
   E'## Why\nThe gala import and two years of manual entry left duplicates and gaps. Clean data before year-end segmentation.\n\n## Work\n- Merge duplicate households\n- Fill missing ZIP codes\n- Standardize employer names on partner contacts\n- Archive long-lapsed records with no contact info\n- Write a short data dictionary so it stays clean',
   'dv_crm', null::text),
  ('midyear_reviews', 'Mid-year staff reviews', 'admin', 'active', 'tasha', 'tasha', 20, -2, -24,
   E'Self-reviews, manager notes, and a calibration pass with the directors. Every review conversation finished before the winter break.',
   null::text, null::text),
  ('laurel_attendance', 'Laurel Ridge attendance recovery', 'program', 'active', 'rosa', 'miguel', 30, -1, -14,
   E'Attendance at Laurel Ridge fell from 88% to 74% after the school''s bell-schedule change. Plan: move sessions to 3:45, call every family with 3+ absences, and add two volunteer tutors. Target: back above 85% by winter break.',
   null::text, null::text),
  ('gala_wrap', 'Northbridge Rising Gala wrap-up', 'fundraising', 'done', 'jordan', 'priya', -150, -140, -175,
   E'Thank-you calls, photo gallery, sponsor recap, and the post-event survey. Gala raised about $285K gross.',
   null::text, null::text),
  ('summer_close', 'Summer Works close-out', 'program', 'done', 'simone', 'miguel', -40, -38, -80,
   E'Final stipend reconciliation with Kwame, employer and intern surveys, and the close-out report for the East Bay Workforce Fund.',
   null::text, null::text),
  ('website', 'Website refresh', 'admin', 'paused', 'jordan', 'priya', null::int, -35, -95,
   E'New impact page and program pages. Paused until after year-end so Jordan can focus on the campaign.',
   null::text, null::text)
) as p(k, title, cat, st, who, by, due, touch, age, descr, ini, grant_key)
on conflict do nothing;

-- Grant workspaces (one per grant, the grant's own name, owner = who runs it).
insert into public.ops_projects
  (id, org_id, title, category, status, description, assigned_to, created_by, due_date,
   last_touched_at, created_at, updated_at, completed_at, grant_id)
select pg_temp.nb_id('proj:grant:' || w.k), pg_temp.nb_org(), g.name, 'fundraising',
       case when g.stage in ('declined', 'closed') then 'done' else 'active' end,
       w.descr, w.who, 'lena',
       case when g.stage in ('declined', 'closed') or w.due is null then null else pg_temp.d(w.due) end,
       pg_temp.ts(w.touch, '14:10'), pg_temp.ts(w.age, '10:00'), pg_temp.ts(w.touch, '14:10'),
       case when g.stage in ('declined', 'closed') then pg_temp.ts(w.touch, '14:10') end,
       g.id
from (values
  ('hollis_pathways',    'lena',  10, -1, -120, E'Reporting and deliverables for the Hollis Pathways grant. The interim report releases the second $75K installment.'),
  ('bayview_gos',        'lena',  22, -2, -400, E'Year two of the three-year general operating grant. Annual report due this fall; lead with Cohort 6 placements.'),
  ('workforce_contract', 'kwame', 75, -2, -110, E'Cost-reimbursement contract for Pathways. Quarterly invoices with outcomes data attached; reimbursement runs about 45 days.'),
  ('state_yoi',          'lena',  70, -5, -300, E'Two-year state award. Year-two claim and documentation, then the annual tranche.'),
  ('harbor_health',      'lena',  35, -6, -150, E'Community-benefit grant for the healthcare track, plus clinical placements.'),
  ('eastbay_workforce',  'lena', null::int, -20, -330, E'Summer Works stipends. Final report submitted; renewal is tracked as a separate opportunity.'),
  ('cypress_launchpad',  'lena', null::int, -95, -500, E'Launchpad grant, complete. Renewal LOI is tracked as a separate opportunity.')
) as w(k, who, due, touch, age, descr)
join public.grants g on g.id = pg_temp.nb_id('grant:' || w.k) and g.org_id = pg_temp.nb_org()
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Remi's calendar (calendar_events). Recurring internal series for the
--    weeks around today, plus one-off donor, partner, and site meetings.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.calendar_events
  (id, org_id, owner_user_id, google_event_id, recurring_event_id, calendar_id, title, description, location,
   start_time, end_time, all_day, status, attendees, is_external, source, synced_at, created_at, updated_at)
select pg_temp.nb_id('cal:rec:' || s.k || ':' || w.n), pg_temp.nb_org(), pg_temp.nb_remi(),
       'nbwx-' || s.k || '_' || to_char(pg_temp.w8_at(pg_temp.wk(w.n) + s.dow, s.st) at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"'),
       'nbwx-' || s.k, 'primary', s.title, s.descr, s.loc,
       pg_temp.w8_at(pg_temp.wk(w.n) + s.dow, s.st), pg_temp.w8_at(pg_temp.wk(w.n) + s.dow, s.et), false, 'confirmed',
       pg_temp.w8_att(s.att), s.ext, 'google',
       least(pg_temp.ts(0, '06:00'), pg_temp.w8_at(pg_temp.wk(w.n) + s.dow, s.et) + interval '1 hour'),
       pg_temp.ts(-240, '09:00'),
       least(pg_temp.ts(0, '06:00'), pg_temp.w8_at(pg_temp.wk(w.n) + s.dow, s.et) + interval '1 hour')
from (values
  ('leadership', 'Leadership team', 0, '09:30', '10:30', 1, 0,
   'Weekly: wins, the week''s priorities, cash and pipeline, people.', 'Northbridge HQ, Conference Room',
   'remi@northbridge.example|Remi Sobomehin;tasha@northbridge.example|Tasha Greene;miguel@northbridge.example|Miguel Arreola;priya@northbridge.example|Priya Natarajan', false),
  ('oneone-tasha', 'Remi / Tasha 1:1', 1, '10:00', '10:45', 1, 0, null::text, 'Remi''s office',
   'remi@northbridge.example|Remi Sobomehin;tasha@northbridge.example|Tasha Greene', false),
  ('oneone-miguel', 'Remi / Miguel 1:1', 2, '11:00', '11:45', 1, 0, null::text, 'Remi''s office',
   'remi@northbridge.example|Remi Sobomehin;miguel@northbridge.example|Miguel Arreola', false),
  ('oneone-priya', 'Remi / Priya 1:1', 3, '10:00', '10:45', 1, 0, null::text, 'Remi''s office',
   'remi@northbridge.example|Remi Sobomehin;priya@northbridge.example|Priya Natarajan', false),
  ('program-staff', 'Program staff meeting', 3, '14:00', '15:00', 2, 1,
   'Every other Thursday. Attendance by site, cohort check-ins, partner updates.', 'Northbridge HQ, Community Room',
   'miguel@northbridge.example|Miguel Arreola;remi@northbridge.example|Remi Sobomehin;rosa@northbridge.example|Rosa Delgado;andre@northbridge.example|Andre Mitchell;simone@northbridge.example|Simone Baptiste;ben@northbridge.example|Ben Okoro', false),
  ('allstaff', 'All-staff meeting', 4, '09:00', '10:00', 2, 0,
   'Every other Friday. Shout-outs, one program story, org updates.', 'Northbridge HQ, Community Room',
   'remi@northbridge.example|Remi Sobomehin;tasha@northbridge.example|Tasha Greene;miguel@northbridge.example|Miguel Arreola;priya@northbridge.example|Priya Natarajan;kwame@northbridge.example|Kwame Asante;ben@northbridge.example|Ben Okoro;rosa@northbridge.example|Rosa Delgado;andre@northbridge.example|Andre Mitchell;simone@northbridge.example|Simone Baptiste;lena@northbridge.example|Lena Park;jordan@northbridge.example|Jordan Ellis', false)
) as s(k, title, dow, st, et, every, parity, descr, loc, att, ext)
cross join generate_series(-3, 3) as w(n)
where s.every = 1 or ((w.n % 2) + 2) % 2 = s.parity
on conflict do nothing;

-- Mentor Circles: second Tuesday of each month at Fruitvale Hub (an excluded
-- series — a program event, not a follow-up meeting).
insert into public.calendar_events
  (id, org_id, owner_user_id, google_event_id, recurring_event_id, calendar_id, title, description, location,
   start_time, end_time, all_day, status, attendees, is_external, source, synced_at, created_at, updated_at)
select pg_temp.nb_id('cal:rec:mentorcircles:' || m.k), pg_temp.nb_org(), pg_temp.nb_remi(),
       'nbwx-mentorcircles_' || to_char(pg_temp.w8_at(m.dd, '18:00') at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"'),
       'nbwx-mentorcircles', 'primary', 'Mentor Circles (monthly)',
       'Monthly circle for mentors and mentees. Dinner at 6, circles at 6:30.', 'Fruitvale Hub Community Center',
       pg_temp.w8_at(m.dd, '18:00'), pg_temp.w8_at(m.dd, '19:30'), false, 'confirmed',
       pg_temp.w8_att('simone@northbridge.example|Simone Baptiste;remi@northbridge.example|Remi Sobomehin;hruiz@example.org|Hector Ruiz'),
       true, 'google',
       least(pg_temp.ts(0, '06:00'), pg_temp.w8_at(m.dd, '20:30')), pg_temp.ts(-200, '09:00'),
       least(pg_temp.ts(0, '06:00'), pg_temp.w8_at(m.dd, '20:30'))
from (
  select k, m1 + ((2 - extract(isodow from m1)::int + 7) % 7) + 7 as dd
  from (values ('prev', pg_temp.mon(-1)), ('this', pg_temp.mon(0)), ('next', pg_temp.mon(1))) v(k, m1)
) m
on conflict do nothing;

-- One-off meetings: past (with meeting records below) and upcoming.
insert into public.calendar_events
  (id, org_id, owner_user_id, google_event_id, recurring_event_id, calendar_id, title, description, location,
   start_time, end_time, all_day, status, attendees, is_external, source, synced_at, created_at, updated_at)
select pg_temp.nb_id('cal:' || e.k), pg_temp.nb_org(), pg_temp.nb_remi(),
       'nbwx-' || replace(e.k, '_', '-') || '-' || substr(md5('nb:cal:' || e.k), 1, 8), null, 'primary',
       e.title, e.descr, e.loc,
       case when e.allday then e.dd::timestamp at time zone 'UTC' else pg_temp.w8_at(e.dd, e.st) end,
       case when e.allday then (e.dd + 1)::timestamp at time zone 'UTC' else pg_temp.w8_at(e.dd, e.et) end,
       e.allday, 'confirmed', pg_temp.w8_att(e.att), e.ext, 'google',
       least(pg_temp.ts(0, '06:00'), pg_temp.w8_at(e.dd, coalesce(e.et, '23:00')) + interval '1 hour'),
       least(pg_temp.ts(-1, '16:00'), pg_temp.w8_at(e.dd, '09:00') - make_interval(days => e.lead)),
       least(pg_temp.ts(0, '06:00'), pg_temp.w8_at(e.dd, coalesce(e.et, '23:00')) + interval '1 hour')
from (values
  -- past
  ('bayview_visit', 'Bayview Community Foundation: Launchpad site visit', pg_temp.w8_wdb(-30), '15:30', '17:00', false, true, 14,
   'Janelle Ortiz visiting Launchpad at Eastlake. Rosa hosting; résumé workshop in session.', 'Eastlake High School, Room 204',
   'remi@northbridge.example|Remi Sobomehin;jortiz@example.org|Janelle Ortiz;rosa@northbridge.example|Rosa Delgado;treed@example.org|Tamika Reed'),
  ('redline_visit', 'Redline Builders: job-site visit', pg_temp.w8_wdb(-24), '13:00', '14:30', false, true, 10,
   'Walk the Embarcadero site with Tom Brennan; check in with our two pre-apprentices.', '2500 Embarcadero, Oakland',
   'tbrennan@example.com|Tom Brennan;remi@northbridge.example|Remi Sobomehin;andre@northbridge.example|Andre Mitchell'),
  ('fincmte_prev', 'Finance & Audit Committee', pg_temp.w8_wdb(-23), '17:30', '18:30', false, true, 30,
   'August close, runway, audit engagement letter, reserve policy discussion.', 'Video call',
   'kwame@northbridge.example|Kwame Asante;grace.lim@example.com|Grace Lim;remi@northbridge.example|Remi Sobomehin;tasha@northbridge.example|Tasha Greene'),
  ('wu_discovery', 'Coffee with Jennifer Wu', pg_temp.w8_wdb(-16), '08:30', '09:30', false, true, 9,
   'Discovery conversation. Background in the prospect brief.', 'Coffee shop near Lake Merritt',
   'remi@northbridge.example|Remi Sobomehin;jennifer.wu@example.com|Jennifer Wu'),
  ('chair_checkin', 'Celeste / Remi: board chair check-in', pg_temp.w8_wdb(-12), '16:00', '16:45', false, true, 20,
   null::text, 'Phone',
   'remi@northbridge.example|Remi Sobomehin;celeste.harrington@example.com|Celeste Harrington'),
  ('hollis_call', 'Hollis Family Foundation: interim report check-in', pg_temp.w8_wdb(-8), '11:00', '11:30', false, true, 6,
   null::text, 'Phone',
   'mhollisreyes@example.org|Martin Hollis-Reyes;remi@northbridge.example|Remi Sobomehin;lena@northbridge.example|Lena Park'),
  ('meridian_call', 'Meridian Foundation: follow-up on the proposal', pg_temp.w8_wdb(-6), '09:00', '09:45', false, true, 4,
   'Camille has follow-up questions from their review committee.', 'Video call',
   'cwashington@example.org|Camille Washington;remi@northbridge.example|Remi Sobomehin;priya@northbridge.example|Priya Natarajan'),
  ('car_service', 'Car service appointment', pg_temp.w8_wdb(-5), '07:30', '08:15', false, true, 12,
   null::text, 'Lakeshore Auto Care',
   'service@example.net|Lakeshore Auto Care;remi@northbridge.example|Remi Sobomehin'),
  ('kinetic_checkin', 'Kinetic Labs: mentor program check-in', pg_temp.w8_wdb(-3), '15:00', '15:45', false, true, 7,
   'Mentor match status, new mentor cohort, Cohort 8 hiring interest.', 'Video call',
   'pgomez@example.com|Priscilla Gomez;remi@northbridge.example|Remi Sobomehin;simone@northbridge.example|Simone Baptiste'),
  ('harbor_quarterly', 'Harbor Health Partners: quarterly check-in', pg_temp.w8_wdb(-1), '12:00', '13:00', false, true, 21,
   'Clinical rotations for Cohort 7, healthcare-track hiring, community-benefit grant renewal timing.', 'Harbor Health, 2800 Telegraph Ave',
   'monique.jackson@example.com|Monique Jackson;remi@northbridge.example|Remi Sobomehin;andre@northbridge.example|Andre Mitchell'),
  -- today and ahead
  ('bell_call', 'Call: Sarah Bell (year-end)', pg_temp.w8_wd(0), '11:30', '12:00', false, true, 6,
   'Her December gift conversation. She asked about Summer Works last year.', 'Phone',
   'remi@northbridge.example|Remi Sobomehin;sarah.bell@example.com|Sarah Bell'),
  ('hollis_review', 'Lena / Remi: Hollis report review', pg_temp.w8_wd(0), '16:00', '16:30', false, false, 5,
   'Walk through the draft outline and Keisha''s story.', 'Remi''s office',
   'lena@northbridge.example|Lena Park;remi@northbridge.example|Remi Sobomehin'),
  ('harrington_coffee', 'Coffee with Celeste Harrington', pg_temp.w8_wd(1), '08:00', '08:45', false, true, 8,
   'Board meeting agenda, retreat facilitator, her December challenge match.', 'Coffee near Lake Merritt',
   'celeste.harrington@example.com|Celeste Harrington;remi@northbridge.example|Remi Sobomehin'),
  ('laurel_visit', 'Laurel Ridge site visit + AP meeting', pg_temp.w8_wd(2), '15:30', '16:30', false, true, 5,
   'Sit in on the new 3:45 session, then 20 minutes with Mr. Whitaker on attendance.', 'Laurel Ridge High School, Library',
   'rosa@northbridge.example|Rosa Delgado;remi@northbridge.example|Remi Sobomehin;jwhitaker@example.org|Jason Whitaker'),
  ('sequoia_intro', 'Sequoia Trust for Education: intro', pg_temp.w8_wd(3), '13:00', '14:00', false, true, 12,
   'First meeting with Arthur Feld. Priya joins. Brief in the prep task.', 'Video call',
   'afeld@example.org|Arthur Feld;remi@northbridge.example|Remi Sobomehin;priya@northbridge.example|Priya Natarajan'),
  ('patel_coffee', 'Board onboarding: Ravi Patel', pg_temp.w8_wd(5), '08:30', '09:30', false, true, 10,
   'Committee choice, site visit date, first-year board gift.', 'Northbridge HQ',
   'remi@northbridge.example|Remi Sobomehin;ravi.patel@example.com|Ravi Patel'),
  ('fincmte_next', 'Finance & Audit Committee', pg_temp.w8_wd(8), '17:30', '18:30', false, true, 30,
   'September close, Q2 reforecast, reserve policy draft, audit status.', 'Video call',
   'kwame@northbridge.example|Kwame Asante;grace.lim@example.com|Grace Lim;remi@northbridge.example|Remi Sobomehin;tasha@northbridge.example|Tasha Greene'),
  ('bayshore_visit', 'Bayshore Academy site visit', pg_temp.w8_wd(8), '15:30', '16:30', false, true, 9,
   'Launchpad session and a check-in with Dr. Coleman on the counselor partnership.', 'Bayshore Academy, Room 12',
   'remi@northbridge.example|Remi Sobomehin;ncoleman@example.org|Nia Coleman;rosa@northbridge.example|Rosa Delgado'),
  ('chen_visit', 'Chen family visit: Launchpad at Eastlake', pg_temp.w8_wd(9), '15:30', '17:00', false, true, 14,
   'Margaret and David see a session; two seniors present their career plans. Their annual installment is due in December.', 'Eastlake High School, Room 204',
   'priya@northbridge.example|Priya Natarajan;margaret.chen@example.com|Margaret Chen;david.chen@example.com|David Chen;remi@northbridge.example|Remi Sobomehin;rosa@northbridge.example|Rosa Delgado;treed@example.org|Tamika Reed'),
  ('osei_lunch', 'Lunch with Daniel Osei (Pacific Summit renewal)', pg_temp.w8_wd(10), '12:00', '13:15', false, true, 11,
   'Renewal of the Summer Works presenting sponsorship ($60K) and intern slots.', 'Downtown Oakland',
   'remi@northbridge.example|Remi Sobomehin;daniel.osei@example.com|Daniel Osei'),
  ('bayview_checkin', 'Bayview: annual report check-in', pg_temp.w8_wd(11), '10:00', '10:30', false, true, 7,
   null::text, 'Phone',
   'jortiz@example.org|Janelle Ortiz;lena@northbridge.example|Lena Park;remi@northbridge.example|Remi Sobomehin'),
  ('sl_scope', 'San Leandro Career Ed: pilot scope', pg_temp.w8_wd(12), '14:00', '15:00', false, true, 10,
   'Pilot school, start date, district match, data agreement.', 'San Leandro Unified District Office',
   'lkim@example.org|Laura Kim;miguel@northbridge.example|Miguel Arreola;remi@northbridge.example|Remi Sobomehin'),
  ('ye_kickoff', 'Year-End campaign kickoff (staff)', pg_temp.w8_wd(14), '11:00', '12:00', false, false, 9,
   'Launch-day run of show: letter drop, email schedule, call lists.', 'Northbridge HQ, Community Room',
   'priya@northbridge.example|Priya Natarajan;remi@northbridge.example|Remi Sobomehin;jordan@northbridge.example|Jordan Ellis;lena@northbridge.example|Lena Park;ben@northbridge.example|Ben Okoro'),
  ('yoi_convening', 'CA Youth Opportunity Initiative grantee convening (Sacramento)', pg_temp.w8_wd(16), null::text, null::text, true, true, 30,
   'Annual grantee convening. Train from Oakland at 7:10.', 'Sacramento',
   'remi@northbridge.example|Remi Sobomehin'),
  ('board_meeting', 'Board of Directors meeting', pg_temp.d(24), '17:30', '19:30', false, true, 60,
   'Regular board meeting. Packet goes out one week ahead.', 'Northbridge HQ, Community Room',
   'tasha@northbridge.example|Tasha Greene;remi@northbridge.example|Remi Sobomehin;celeste.harrington@example.com|Celeste Harrington;daniel.osei@example.com|Daniel Osei;grace.lim@example.com|Grace Lim;victor.ramos@example.com|Victor Ramos;alicia.freeman@example.com|Alicia Freeman;ken.nakamura@example.com|Ken Nakamura;monique.jackson@example.com|Monique Jackson;ravi.patel@example.com|Ravi Patel;theo.brooks@example.com|Theo Brooks'),
  ('board_retreat', 'Board retreat', pg_temp.d(54), null::text, null::text, true, true, 30,
   'Full-day board retreat. Details from Tasha.', 'Offsite',
   'tasha@northbridge.example|Tasha Greene;remi@northbridge.example|Remi Sobomehin;celeste.harrington@example.com|Celeste Harrington')
) as e(k, title, dd, st, et, allday, ext, lead, descr, loc, att)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Meeting records (Remi's) — what "Sync from calendar" would have made for
--    past external events, plus one transcript upload and one manual record.
--    Harbor Health (yesterday) is left WITHOUT a record on purpose: the
--    "Sync from calendar" button finds it live in the demo.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.meeting_records
  (id, org_id, owner_user_id, calendar_event_id, title, occurred_at, source, summary, transcript,
   store_transcript, follow_up_status, external_source, external_id, created_at, updated_at)
select pg_temp.nb_id('mtg:' || r.k), pg_temp.nb_org(), pg_temp.nb_remi(), ev.id,
       coalesce(ev.title, r.title), coalesce(ev.start_time, r.occ), r.src, r.summary, null, false, r.fus,
       case when r.src = 'calendar' then 'calendar' end,
       case when r.src = 'calendar' then ev.id::text end,
       coalesce(ev.end_time, r.occ) + interval '2 hours',
       coalesce(ev.end_time, r.occ) + make_interval(hours => r.upd_h)
from (values
  ('bayview_visit', 'cal:bayview_visit', null::text, null::timestamptz, 'calendar', 'has_follow_up', 26,
   E'Janelle Ortiz spent 90 minutes at Launchpad Eastlake with Remi and Rosa. She sat in on the résumé workshop and talked with four seniors, including Luis Ortega.\n\nWhat we heard:\n- Bayview is happy with year two of the general operating grant.\n- She wants the annual report to lead with Cohort 6 placement numbers and the Launchpad attendance trend.\n- A fourth year of funding is possible if the San Leandro expansion has a credible plan.\n\nFollow-ups: send the Cohort 6 placement data this week; invite her to the Cohort 7 graduation.'),
  ('redline_visit', 'cal:redline_visit', null, null, 'calendar', 'has_follow_up', 20,
   E'Tom Brennan walked Remi and Andre through both active sites. Our two pre-apprentices are on track to start the union apprenticeship in the spring.\n\n- Tom referred a young man he met on site, Jalen Price, for Cohort 8 (building trades).\n- Redline can host two more fellows if we cover steel-toe boots and OSHA-10 before day one.\n- He asked about sponsoring the trades track at next year''s gala. Too early; revisit in spring.'),
  ('fincmte_prev', 'cal:fincmte_prev', null, null, 'calendar', 'has_follow_up', 22,
   E'Grace Lim chaired. Kwame walked through the August close: cash about $1.6M, burn tracking near $280K a month, roughly 5.7 months of runway against the board''s 6-month goal.\n\nDecisions:\n- Approved the audit engagement letter.\n- Asked staff for a written operating-reserve policy (target, allowed uses, how we rebuild it) before the board retreat.\n\nAlso: Eastshore contract reimbursements average 45 days, so the reserve matters more than the runway number suggests. Kwame to send Grace the Q1 cash-flow forecast by month end.'),
  ('wu_discovery', 'cal:wu_discovery', null, null, 'calendar', 'has_follow_up', 30,
   E'First real conversation with Jennifer Wu. She runs her family''s office and was the first in her family to finish college; she lit up talking about Pathways and paid work for young adults.\n\n- Asked sharp questions about cost per fellow and starting wages after placement.\n- Open to a significant gift but wants to see the program first.\n- Next: invite her to a Pathways IT class, then an ask around $100K over two years for Pathways.\n\nPriya to prepare a giving-options sheet.'),
  ('chair_checkin', 'cal:chair_checkin', null, null, 'calendar', 'has_follow_up', 6,
   E'Set the retreat date and agreed on a two-name facilitator shortlist. Celeste will personally ask Victor and Ravi about their board gifts.\n\nShe offered to put $20K of her December gift up as a year-end board challenge match if Development promotes it. Next board meeting agenda: reserve policy, San Leandro pilot, mid-year dashboard.'),
  ('hollis_call', 'cal:hollis_call', null, null, 'calendar', 'has_follow_up', 4,
   E'Martin Hollis-Reyes confirmed the interim report is due in about two weeks; the second $75K installment is released once it is approved.\n\nHe wants three things: Cohort 7 enrollment and retention, credential exam pass rates so far, and one fellow''s story in her own words. A 3 to 4 page narrative plus budget-to-actuals is plenty.'),
  ('meridian_call', 'cal:meridian_call', null, null, 'calendar', 'needs_follow_up', 1,
   E'Camille Washington called with questions from Meridian''s review committee. Tone was positive; she said the proposal is in the top group.\n\nThey want:\n1. The San Leandro pilot budget broken out by year.\n2. How we sustain the fourth site after the grant ends.\n3. A site visit before the committee meets in November.\n\nDecision still expected in about five weeks.'),
  ('car_service', 'cal:car_service', null, null, 'calendar', 'dismissed', 1, null::text),
  ('kinetic_checkin', 'cal:kinetic_checkin', null, null, 'calendar', 'needs_follow_up', 0, null::text),
  ('program_staff', null, 'Program staff meeting: attendance and Cohort 8', pg_temp.w8_at(pg_temp.wk(-1) + 3, '14:00'), 'upload', 'has_follow_up', 20,
   E'Transcript summary.\n\n- Launchpad attendance is 86% overall; Laurel Ridge fell to 74% after the bell-schedule change. Rosa is moving sessions to 3:45 and calling families of students with 3+ absences, starting with David Tran.\n- Cohort 7 is on track: 31 of 36 fellows active; the first CompTIA A+ exams were passed.\n- Cohort 8 has 41 applications. Andre is shortlisting 18 for interviews.\n\nDecision: pause new Mentor Circle matches until the background-check vendor switch is done.'),
  ('leadership_q2', null, 'Leadership team: Q2 priorities', pg_temp.w8_at(pg_temp.w8_wdb(-19), '13:00'), 'manual', 'has_follow_up', 24,
   E'Notes from the leadership team''s quarterly planning session.\n\nQ2 priorities:\n1. Year-end campaign: $400K, launch mid-November (Priya).\n2. Meridian decision and a San Leandro go/no-go (Remi and Miguel).\n3. A clean audit, on time (Kwame and Tasha).\n4. Cohort 8 recruitment to 36 fellows (Andre).\n\nDecided: all-staff moves to every other Friday. Tasha owns retreat logistics.')
) as r(k, ev_key, title, occ, src, fus, upd_h, summary)
left join public.calendar_events ev on ev.id = pg_temp.nb_id(r.ev_key) and r.ev_key is not null
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Tasks. Core rows + link/why/description/meta side tables, then one
--    insert (parents first, then subtasks). Dates:
--      due   → anchor + n (bible-exact), done → completion day (weekday),
--      pday  → planned day (weekday; negative = an earlier week).
--    plan: 'day' (planned on pday / completion day), 'week' (this week, no
--    day), 'next' (next week), 'last' (last week → Monday carryover).
-- ════════════════════════════════════════════════════════════════════════════
create temp table w8_t (
  k text primary key, who text, title text, cat text, pri text, proj text, par text,
  st text, due int, done int, pday int, plan text, age int
) on commit drop;

insert into w8_t (k, who, title, cat, pri, proj, par, st, due, done, pday, plan, age) values
  -- ── Remi ──────────────────────────────────────────────────────────────────
  ('okafor_call',          'remi', 'Call Nnamdi Okafor about renewing his support', 'fundraising', 'high', null, null, 'todo', 0, null, 0, 'day', -6),
  ('sequoia_prep',         'remi', 'Prep for the Sequoia Trust intro: one-page brief and ask range', 'fundraising', 'high', null, null, 'in_progress', 2, null, 1, 'day', -9),
  ('goldberg_thanks',      'remi', 'Personally thank Aaron Goldberg for his $20,000 gift', 'fundraising', 'high', null, null, 'todo', -2, null, 0, 'day', -8),
  ('wu_ask_meeting',       'remi', 'Book the ask meeting with Jennifer Wu', 'fundraising', 'high', null, null, 'todo', 4, null, 2, 'day', -15),
  ('patel_onboarding',     'remi', 'Finish Ravi Patel''s board onboarding: site visit, committee, first gift', 'board', 'medium', null, null, 'in_progress', 9, null, null, 'next', -40),
  ('remi_reserve_memo',    'remi', 'Draft the operating reserve policy for the finance committee', 'finance', 'high', null, null, 'todo', 6, null, -4, 'day', -22),
  ('remi_alumni_onepager', 'remi', 'Write the alumni network one-pager for donors', 'fundraising', 'low', null, null, 'todo', null, null, null, 'last', -31),
  ('remi_reforecast',      'remi', 'Approve the Q2 budget reforecast', 'finance', 'high', null, null, 'todo', 4, null, 4, 'day', -2),
  ('remi_retreat_facilitator', 'remi', 'Confirm the retreat facilitator and agenda with Celeste', 'board', 'medium', 'retreat', null, 'todo', 7, null, null, 'next', -12),
  ('remi_meridian_reference', 'remi', 'Prep Celeste for a possible Meridian reference call', 'fundraising', 'medium', 'meridian', null, 'todo', 14, null, null, null, -6),
  ('remi_bylaws',          'remi', 'Circulate the term-limits bylaws amendment to the governance committee', 'board', 'low', null, null, 'todo', 20, null, null, null, -25),
  ('remi_sl_criteria',     'remi', 'Draft the San Leandro go/no-go criteria with Miguel', 'program', 'medium', 'sanleandro', null, 'in_progress', 12, null, null, 'week', -19),
  ('remi_wdb_amendment',   'remi', 'Sign the Eastshore contract amendment (waiting on the agency)', 'finance', 'medium', 'grant:workforce_contract', null, 'blocked', 5, null, null, 'week', -13),
  ('conn_kinetic_talent',  'remi', 'Meet Kinetic Labs'' new head of talent about Cohort 8 hiring', 'operations', 'medium', null, null, 'todo', 14, null, null, null, -5),
  ('conn_celeste_intro',   'remi', 'Coffee with Celeste''s former colleague, a retired bank CFO', 'operations', 'medium', null, null, 'todo', 21, null, null, null, -11),
  ('remi_gala_calls',      'remi', 'Thank-you calls to the gala table captains', 'fundraising', 'high', 'gala_wrap', null, 'done', -160, -158, null, 'day', -170),
  ('remi_fy_budget',       'remi', 'Present the FY budget to the board for a vote', 'finance', 'high', null, null, 'done', -105, -108, null, 'day', -130),
  ('remi_janelle_numbers', 'remi', 'Send Janelle Ortiz the Cohort 6 placement numbers', 'fundraising', 'medium', null, null, 'done', -26, -27, null, 'day', -30),
  ('remi_annual_letter',   'remi', 'Write the ED letter for the annual report', 'other', 'medium', null, null, 'done', -38, -40, null, 'day', -52),
  ('remi_meridian_review', 'remi', 'Final read of the Meridian proposal before submission', 'fundraising', 'high', 'meridian', null, 'done', -22, -22, null, 'day', -28),
  ('remi_sw_closeout',     'remi', 'Approve the Summer Works close-out report', 'program', 'medium', 'summer_close', null, 'done', -55, -56, null, 'day', -62),
  ('remi_chair_retreat',   'remi', 'Lock the retreat date and location with Celeste', 'board', 'medium', 'retreat', null, 'done', -12, -12, null, 'day', -20),
  ('remi_review_form',     'remi', 'Review the mid-year review form with Tasha', 'operations', 'medium', 'midyear_reviews', null, 'done', -9, -9, null, 'day', -14),
  ('remi_monthly_video',   'remi', 'Record a 60-second thank-you video for monthly donors', 'fundraising', 'low', null, null, 'done', -4, -5, null, 'day', -12),
  ('remi_ye_segments',     'remi', 'Approve the year-end segment plan', 'fundraising', 'medium', 'yearend', null, 'done', -6, -6, null, 'day', -10),
  ('remi_hollis_timeline', 'remi', 'Send Martin Hollis-Reyes the report timeline', 'fundraising', 'medium', null, null, 'done', -6, -6, null, 'day', -8),
  ('remi_laurel_plan',     'remi', 'Sign off on the Laurel Ridge bell-schedule plan with Rosa', 'program', 'medium', 'laurel_attendance', null, 'done', 0, 0, null, 'day', -3),
  ('remi_wu_research',     'remi', 'Read the prospect research on Jennifer Wu before coffee', 'fundraising', 'medium', null, null, 'done', -17, -17, null, 'day', -24),
  ('remi_lybunt_calls',    'remi', 'Review the LYBUNT list with Priya and pick five personal calls', 'fundraising', 'medium', null, null, 'done', -11, -11, null, 'day', -15),
  ('conn_lantern',         'remi', 'Meet Dana Whitfield (Lantern Point Credit Union) about summer interns', 'operations', 'medium', null, null, 'done', -20, -21, null, null, -26),
  -- ── Tasha ─────────────────────────────────────────────────────────────────
  ('board_packet',         'tasha', 'Assemble the board packet for the {bm} board meeting', 'board', 'high', null, null, 'in_progress', 17, null, 2, 'day', -10),
  ('tasha_do_renewal',     'tasha', 'Renew D&O and general liability policies with the broker', 'compliance', 'high', null, null, 'in_progress', 21, null, null, 'week', -16),
  ('tasha_calibration',    'tasha', 'Run mid-year review calibration with the directors', 'operations', 'medium', 'midyear_reviews', null, 'todo', 10, null, null, 'next', -14),
  ('tasha_review_forms',   'tasha', 'Send mid-year review forms to all staff', 'operations', 'medium', 'midyear_reviews', null, 'done', -6, -6, null, 'day', -14),
  ('tasha_handbook_pto',   'tasha', 'Update the employee handbook PTO accrual section', 'operations', 'low', null, null, 'todo', null, null, null, null, -38),
  ('tasha_si100',          'tasha', 'Confirm the Statement of Information (SI-100) is current', 'compliance', 'medium', null, null, 'done', -12, -14, null, 'day', -25),
  ('tasha_venue',          'tasha', 'Retreat venue contract and catering', 'board', 'medium', 'retreat', null, 'in_progress', 20, null, null, 'week', -18),
  ('tasha_retreat_agenda', 'tasha', 'Draft the retreat agenda with Remi and Celeste', 'board', 'medium', 'retreat', null, 'todo', 18, null, null, null, -12),
  ('tasha_open_enrollment','tasha', 'Send open enrollment reminders for benefits', 'operations', 'medium', null, null, 'todo', 11, null, null, 'next', -5),
  ('tasha_bgcheck_vendor', 'tasha', 'Switch mentor background checks to the new vendor', 'operations', 'high', null, null, 'blocked', -3, null, null, 'last', -26),
  ('tasha_i9',             'tasha', 'Spot-check I-9 files for the Q3 HR audit', 'compliance', 'medium', null, null, 'done', -20, -20, null, 'day', -30),
  ('tasha_audit_timeline', 'tasha', 'Approve the audit fieldwork timeline with Kwame', 'finance', 'medium', 'audit', null, 'done', -35, -35, null, 'day', -40),
  -- ── Miguel ────────────────────────────────────────────────────────────────
  ('miguel_sl_memo',       'miguel', 'Write the San Leandro pilot scope memo', 'program', 'high', 'sanleandro', null, 'in_progress', 11, null, 1, 'day', -16),
  ('miguel_laura_budget',  'miguel', 'Meet Laura Kim on the San Leandro pilot budget', 'program', 'medium', 'sanleandro', null, 'done', -13, -13, null, 'day', -20),
  ('miguel_c7_midpoint',   'miguel', 'Cohort 7 midpoint review with Andre', 'program', 'medium', null, null, 'todo', 3, null, 3, 'day', -6),
  ('miguel_sw_list',       'miguel', 'Approve the Summer Works employer outreach list', 'program', 'medium', 'sw_employers', null, 'done', -10, -10, null, 'day', -18),
  ('miguel_bayshore_tutor','miguel', 'Hire a part-time Launchpad tutor for Bayshore', 'program', 'medium', null, null, 'in_progress', 20, null, null, 'week', -21),
  ('miguel_wdb_quarterly', 'miguel', 'Submit Pathways quarterly outcomes to Eastshore WDB', 'compliance', 'high', 'grant:workforce_contract', null, 'todo', 9, null, null, 'next', -7),
  ('miguel_budget_variance','miguel', 'Program budget variance review with Kwame', 'finance', 'medium', null, null, 'done', -18, -18, null, 'day', -22),
  ('miguel_meridian_visit','miguel', 'Plan the program side of a Meridian site visit', 'program', 'medium', 'meridian', null, 'todo', 15, null, null, null, -5),
  ('miguel_laurel_recovery','miguel', 'Laurel Ridge attendance recovery plan with Rosa', 'program', 'high', 'laurel_attendance', null, 'done', -4, -4, null, 'day', -12),
  ('miguel_staff_agenda',  'miguel', 'Set the program staff meeting agenda', 'program', 'low', null, null, 'done', -4, -5, null, 'day', -6),
  ('conn_sl_superintendent','miguel', 'Get time with the San Leandro superintendent', 'operations', 'medium', 'sanleandro', null, 'todo', 18, null, null, null, -9),
  -- ── Priya ─────────────────────────────────────────────────────────────────
  ('yearend_letter',       'priya', 'Final draft of the year-end appeal letter (Amara''s story)', 'fundraising', 'high', 'yearend', null, 'in_progress', 8, null, 1, 'day', -20),
  ('priya_ye_plan',        'priya', 'Year-end launch plan: segments, dates, owners', 'fundraising', 'high', 'yearend', null, 'done', -12, -12, null, 'day', -25),
  ('priya_gt_match',       'priya', 'Confirm the Kinetic Labs GivingTuesday match in writing', 'fundraising', 'high', 'yearend', null, 'in_progress', 10, null, null, 'week', -14),
  ('priya_pacific_proposal','priya', 'Write the Pacific Summit Bank renewal proposal ($60K)', 'fundraising', 'high', null, null, 'todo', 14, null, 3, 'day', -10),
  ('priya_board_giving',   'priya', 'Nudge Victor Ramos and Ravi Patel on board gifts', 'board', 'medium', null, null, 'todo', 5, null, null, 'week', -11),
  ('priya_meridian_answers','priya', 'Assemble answers to Meridian''s budget questions', 'fundraising', 'high', 'meridian', null, 'todo', 4, null, null, 'week', -5),
  ('priya_chen_visit',     'priya', 'Plan the Chens'' Launchpad visit at Eastlake', 'fundraising', 'medium', null, null, 'todo', 7, null, null, 'next', -9),
  ('priya_pipeline_review','priya', 'Pipeline review for the leadership team', 'fundraising', 'medium', null, null, 'done', -7, -7, null, 'day', -9),
  ('priya_moves_review',   'priya', 'Moves management review: top 25 prospects', 'fundraising', 'medium', null, null, 'done', -21, -21, null, 'day', -28),
  ('priya_alder',          'priya', 'Alder & Finch re-cultivation plan', 'fundraising', 'low', null, null, 'todo', null, null, null, null, -45),
  ('priya_chen_reminder',  'priya', 'Send the Chens their pledge installment reminder', 'fundraising', 'medium', null, null, 'todo', 30, null, null, null, -3),
  ('priya_wu_options',     'priya', 'Draft a Pathways giving-options sheet for Jennifer Wu', 'fundraising', 'high', null, null, 'done', -9, -10, null, 'day', -15),
  ('priya_board_match',    'priya', 'Draft the board-match announcement for the year-end appeal', 'fundraising', 'medium', 'yearend', null, 'todo', 11, null, null, 'next', -11),
  ('conn_alder',           'priya', 'Book an Alder & Finch re-introduction call', 'operations', 'low', null, null, 'todo', 21, null, null, null, -12),
  -- ── Kwame ─────────────────────────────────────────────────────────────────
  ('audit_pbc',            'kwame', 'Deliver the auditor''s PBC list', 'finance', 'urgent', 'audit', null, 'in_progress', 5, null, null, 'week', -21),
  ('kwame_q1_invoice',     'kwame', 'Submit the Q1 invoice ($105K) to Eastshore WDB', 'finance', 'high', 'grant:workforce_contract', null, 'done', -12, -12, null, 'day', -18),
  ('kwame_q1_payment',     'kwame', 'Follow up on the Eastshore Q1 payment', 'finance', 'low', 'grant:workforce_contract', null, 'todo', 30, null, null, null, -12),
  ('kwame_990_partix',     'kwame', 'Send the 990 Part IX functional expense split to the preparer', 'compliance', 'high', null, null, 'in_progress', 10, null, null, 'week', -15),
  ('kwame_rrf1',           'kwame', 'File the CA RRF-1 once the 990 is final', 'compliance', 'medium', null, null, 'todo', 40, null, null, null, -15),
  ('kwame_sept_close',     'kwame', 'September close', 'finance', 'high', null, null, 'done', -8, -8, null, 'day', -20),
  ('kwame_oct_close',      'kwame', 'October close', 'finance', 'high', null, null, 'todo', 12, null, null, null, -1),
  ('kwame_reforecast',     'kwame', 'Prepare the Q2 budget reforecast for Remi', 'finance', 'high', null, null, 'done', -1, -1, null, 'day', -9),
  ('kwame_kinetic_invoice','kwame', 'Invoice Kinetic Labs for pledge installment #2', 'finance', 'medium', null, null, 'todo', 50, null, null, null, -4),
  ('kwame_grace_forecast', 'kwame', 'Send Grace Lim the Q1 cash-flow forecast', 'finance', 'medium', null, null, 'done', -15, -15, null, 'day', -22),
  ('kwame_laptop_cart',    'kwame', 'Get quotes for a second laptop cart', 'operations', 'low', null, null, 'todo', null, null, null, null, -33),
  ('kwame_signer',         'kwame', 'Add Grace Lim as a signer on the operating account', 'finance', 'medium', null, null, 'blocked', 8, null, null, null, -12),
  -- ── Ben ───────────────────────────────────────────────────────────────────
  ('ben_households',       'ben', 'Merge duplicate households from the gala import', 'operations', 'high', 'crm', null, 'in_progress', 7, null, 2, 'day', -12),
  ('ben_employers',        'ben', 'Standardize employer names on partner contacts', 'operations', 'medium', 'crm', null, 'todo', 14, null, null, 'next', -12),
  ('ben_lapsed',           'ben', 'Archive pre-2019 lapsed donors with no email or address', 'operations', 'low', 'crm', null, 'todo', 21, null, null, null, -12),
  ('ben_zips',             'ben', 'Fix missing ZIP codes on 140 donor records', 'operations', 'medium', 'crm', null, 'done', -4, -4, null, 'day', -12),
  ('ben_dictionary',       'ben', 'Write the CRM data dictionary', 'operations', 'low', 'crm', null, 'todo', null, null, null, null, -29),
  ('ben_placement',        'ben', 'Refresh the 90-day placement rate for Cohort 6', 'program', 'high', null, null, 'done', -3, -3, null, 'day', -8),
  ('ben_attendance_weekly','ben', 'Weekly Launchpad attendance by site for Rosa', 'program', 'medium', null, null, 'done', -3, -3, null, 'day', -4),
  ('ben_sw_survey',        'ben', 'Summer Works intern exit survey analysis', 'program', 'medium', 'summer_close', null, 'done', -30, -31, null, 'day', -50),
  ('ben_export_bug',       'ben', 'Attendance export drops the site column', 'product', 'medium', null, null, 'todo', null, null, null, null, -6),
  -- ── Rosa ──────────────────────────────────────────────────────────────────
  ('david_checkin',        'rosa', 'Check in with David Tran''s mom about attendance', 'program', 'high', 'laurel_attendance', null, 'todo', -1, null, -1, 'day', -6),
  ('rosa_whitaker',        'rosa', 'Confirm the new session time with Mr. Whitaker at Laurel Ridge', 'program', 'high', 'laurel_attendance', null, 'done', -6, -6, null, 'day', -12),
  ('rosa_laurel_visit',    'rosa', 'Prep the Laurel Ridge site visit with Remi', 'program', 'medium', 'laurel_attendance', null, 'todo', 2, null, 2, 'day', -4),
  ('rosa_family_night',    'rosa', 'Plan Launchpad fall family night at Eastlake', 'program', 'medium', null, null, 'in_progress', 16, null, null, 'week', -18),
  ('rosa_luis_csueb',      'rosa', 'College application check-in with Luis Ortega', 'program', 'medium', null, null, 'todo', 5, null, null, 'week', -7),
  ('rosa_sat_books',       'rosa', 'Order SAT prep books for Bayshore juniors', 'program', 'low', null, null, 'done', -15, -16, null, 'day', -25),
  ('rosa_attendance_wk',   'rosa', 'Record attendance for the Eastlake week', 'program', 'medium', null, null, 'done', -3, -3, null, 'day', -4),
  ('rosa_chen_students',   'rosa', 'Pick two students to present at the Chen site visit', 'program', 'medium', null, null, 'todo', 6, null, null, 'next', -5),
  ('rosa_tutors',          'rosa', 'Recruit two more volunteer tutors for Laurel Ridge', 'program', 'medium', 'laurel_attendance', null, 'todo', 14, null, null, null, -12),
  ('rosa_spring_calendar', 'rosa', 'Draft the spring semester Launchpad calendar', 'program', 'low', null, null, 'todo', null, null, null, null, -9),
  ('rosa_self_review',     'rosa', 'Complete the mid-year self-review', 'operations', 'medium', 'midyear_reviews', null, 'todo', 5, null, null, 'week', -6),
  ('rosa_families_call',   'rosa', 'Call families of Laurel Ridge students with 3+ absences', 'program', 'high', 'laurel_attendance', null, 'done', -4, -5, null, 'day', -6),
  -- ── Andre ─────────────────────────────────────────────────────────────────
  ('cohort8_interviews',   'andre', 'Schedule interviews for the 18 shortlisted Cohort 8 applicants', 'program', 'high', 'cohort8', null, 'in_progress', 7, null, null, 'week', -6),
  ('andre_keisha',         'andre', 'Keisha Brown: confirm CNA exam registration and transit pass', 'program', 'high', null, null, 'todo', 3, null, 3, 'day', -5),
  ('andre_jalen',          'andre', 'Invite Jalen Price to interview for Cohort 8', 'program', 'medium', 'cohort8', null, 'todo', 6, null, null, 'week', -23),
  ('andre_info_session',   'andre', 'Cohort 8 info session at Eastshore Public Library', 'program', 'medium', 'cohort8', null, 'done', -11, -11, null, 'day', -30),
  ('andre_scoring',        'andre', 'Score the 41 Cohort 8 applications', 'program', 'high', 'cohort8', null, 'in_progress', 4, null, 1, 'day', -9),
  ('andre_amara',          'andre', '90-day placement check-in with Amara Johnson at Kinetic Labs', 'program', 'medium', null, null, 'done', -9, -9, null, 'day', -14),
  ('andre_comptia',        'andre', 'Order CompTIA A+ exam vouchers for the IT track', 'program', 'medium', null, null, 'done', -19, -19, null, 'day', -26),
  ('andre_harbor_slots',   'andre', 'Confirm spring clinical rotation slots with Harbor Health', 'program', 'medium', null, null, 'todo', 18, null, null, null, -10),
  ('andre_redline_two',    'andre', 'Line up two more pre-apprenticeship placements at Redline', 'program', 'medium', null, null, 'todo', 25, null, null, null, -23),
  ('andre_c6_outcomes',    'andre', 'Update 90-day outcomes for Cohort 6 graduates', 'program', 'high', null, null, 'done', -6, -6, null, 'day', -12),
  ('andre_ben_data',       'andre', 'Send Pathways quarterly data to Ben', 'program', 'medium', null, null, 'done', -14, -14, null, 'day', -16),
  ('andre_stipends',       'andre', 'Set the spring stipend schedule for fellows', 'finance', 'low', null, null, 'todo', 30, null, null, null, -8),
  -- ── Simone ────────────────────────────────────────────────────────────────
  ('simone_target_list',   'simone', 'Build the employer target list (30 new employers)', 'program', 'high', 'sw_employers', null, 'done', -17, -17, null, 'day', -30),
  ('simone_renewal_calls', 'simone', 'Renewal calls to last summer''s 22 employers', 'program', 'high', 'sw_employers', null, 'in_progress', 21, null, null, 'week', -15),
  ('simone_onepager',      'simone', 'Refresh the Summer Works employer one-pager', 'program', 'medium', 'sw_employers', null, 'todo', 10, null, null, 'next', -8),
  ('simone_pacific_slots', 'simone', 'Confirm 8 intern slots with Pacific Summit Bank for next summer', 'program', 'medium', 'sw_employers', null, 'todo', 28, null, null, null, -8),
  ('simone_finaid_night',  'simone', 'Plan the November Mentor Circle: financial-aid night', 'program', 'medium', null, null, 'todo', 12, null, null, 'next', -10),
  ('simone_kinetic_mentors','simone', 'Match six new Kinetic Labs mentors', 'program', 'medium', null, null, 'blocked', 9, null, null, 'week', -14),
  ('simone_bg_checks',     'simone', 'Clear four pending mentor background checks', 'program', 'high', null, null, 'blocked', -4, null, null, 'last', -20),
  ('simone_fruitvale_mou', 'simone', 'Renew the Fruitvale Hub MOU', 'program', 'medium', null, null, 'todo', 14, null, null, null, -35),
  ('simone_sw_survey',     'simone', 'Summer Works close-out survey to employers', 'program', 'medium', 'summer_close', null, 'done', -40, -41, null, 'day', -55),
  ('simone_appreciation',  'simone', 'Pick a date for mentor appreciation night', 'program', 'low', null, null, 'todo', null, null, null, null, -20),
  -- ── Lena ──────────────────────────────────────────────────────────────────
  ('hollis_report',        'lena', 'Hollis interim report: draft, review, submit', 'fundraising', 'high', 'grant:hollis_pathways', null, 'in_progress', 10, null, null, 'week', -8),
  ('bayview_report',       'lena', 'Bayview annual report', 'fundraising', 'high', 'grant:bayview_gos', null, 'todo', 22, null, null, null, -12),
  ('lena_cypress_loi',     'lena', 'Write the Cypress Fund renewal LOI', 'fundraising', 'high', null, null, 'in_progress', 18, null, null, 'week', -14),
  ('lena_eastbay_renewal', 'lena', 'East Bay Workforce renewal application', 'fundraising', 'medium', null, null, 'todo', 45, null, null, null, -20),
  ('lena_yoi_claim',       'lena', 'Assemble CA YOI year-two claim documentation', 'fundraising', 'medium', 'grant:state_yoi', null, 'todo', 30, null, null, null, -10),
  ('lena_harbor_update',   'lena', 'Send Harbor Health a mid-year update', 'fundraising', 'low', 'grant:harbor_health', null, 'todo', 35, null, null, null, -10),
  ('lena_eastbay_final',   'lena', 'Submit the East Bay Workforce final report', 'fundraising', 'high', 'grant:eastbay_workforce', null, 'done', -20, -20, null, 'day', -40),
  ('lena_meridian_budget', 'lena', 'Meridian proposal: final budget narrative', 'fundraising', 'high', 'meridian', null, 'done', -23, -23, null, 'day', -35),
  ('lena_grants_calendar', 'lena', 'Send the Q3 grants calendar to leadership', 'fundraising', 'medium', null, null, 'done', -7, -7, null, 'day', -10),
  ('lena_alder_note',      'lena', 'Draft a re-approach note to Alder & Finch', 'fundraising', 'low', null, null, 'todo', 40, null, null, null, -12),
  ('lena_hollis_agreement','lena', 'File the signed Hollis agreement in Documents', 'fundraising', 'low', 'grant:hollis_pathways', null, 'done', -92, -93, null, 'day', -95),
  -- ── Jordan ────────────────────────────────────────────────────────────────
  ('jordan_breakfast',     'jordan', 'Year-end donor breakfast: venue and RSVPs', 'fundraising', 'medium', 'yearend', null, 'in_progress', 30, null, 2, 'day', -16),
  ('jordan_gt_social',     'jordan', 'GivingTuesday social posts calendar', 'fundraising', 'medium', 'yearend', null, 'todo', 20, null, null, null, -10),
  ('jordan_failed_cards',  'jordan', 'Monthly donors: retry two failed card payments', 'fundraising', 'high', null, null, 'todo', -1, null, null, 'week', -6),
  ('jordan_gala_photos',   'jordan', 'Post gala photos and send the thank-you email', 'fundraising', 'medium', 'gala_wrap', null, 'done', -158, -160, null, 'day', -165),
  ('jordan_gift_batch',    'jordan', 'Weekly gift entry and acknowledgment batch', 'fundraising', 'medium', null, null, 'done', -3, -3, null, 'day', -5),
  ('jordan_templates',     'jordan', 'Update the donor thank-you letter templates', 'fundraising', 'medium', null, null, 'done', -25, -25, null, 'day', -33),
  ('jordan_impact_copy',   'jordan', 'Website refresh: new impact page copy', 'other', 'low', 'website', null, 'todo', null, null, null, null, -60),
  ('jordan_board_tracker', 'jordan', 'Build the board giving tracker for Priya', 'board', 'medium', null, null, 'done', -11, -11, null, 'day', -14),
  ('jordan_janelle_invite','jordan', 'Add Janelle Ortiz to the Cohort 7 graduation invite list', 'fundraising', 'low', null, null, 'todo', null, null, null, null, -29),
  -- ── unassigned triage (owned by the Operations team via category) ─────────
  ('triage_webform',       null, 'Triage website contact-form requests from last week', 'operations', 'low', null, null, 'todo', null, null, null, null, -4),
  -- ── subtasks (parent = par) ───────────────────────────────────────────────
  ('remi_ye_edits',        'remi', 'Edit the year-end letter draft', 'fundraising', 'high', 'yearend', 'yearend_letter', 'todo', 5, null, 2, 'day', -5),
  ('jordan_amara_quote',   'jordan', 'Get Amara''s sign-off on her quote', 'fundraising', 'medium', 'yearend', 'yearend_letter', 'done', 4, -4, null, 'day', -12),
  ('jordan_mailhouse',     'jordan', 'Send the year-end letter to the mail house', 'fundraising', 'high', 'yearend', 'yearend_letter', 'todo', 12, null, null, 'next', -12),
  ('remi_ed_report',       'remi', 'Write the ED report for the board packet', 'board', 'high', null, 'board_packet', 'todo', 12, null, 3, 'day', -4),
  ('tasha_committee_reports','tasha', 'Collect committee reports from the Finance, Program, and Development chairs', 'board', 'medium', null, 'board_packet', 'todo', 14, null, null, 'next', -9),
  ('tasha_consent_agenda', 'tasha', 'Prepare the consent agenda and prior minutes', 'board', 'medium', null, 'board_packet', 'done', 13, -3, null, 'day', -9),
  ('miguel_program_cmte',  'miguel', 'Program committee update for the board packet', 'board', 'medium', null, 'board_packet', 'todo', 13, null, null, 'next', -8),
  ('ben_board_dash',       'ben', 'Board dashboard: Q1 metrics for the packet', 'board', 'medium', null, 'board_packet', 'todo', 12, null, null, 'next', -6),
  ('kwame_fixed_assets',   'kwame', 'Fixed-asset rollforward for the auditors', 'finance', 'high', 'audit', 'audit_pbc', 'done', 2, -2, null, 'day', -20),
  ('kwame_grants_receivable','kwame', 'Grants receivable schedule', 'finance', 'high', 'audit', 'audit_pbc', 'in_progress', 4, null, 1, 'day', -20),
  ('kwame_payroll_tieout', 'kwame', 'Payroll tie-out to the general ledger', 'finance', 'high', 'audit', 'audit_pbc', 'todo', 5, null, null, 'week', -20),
  ('lena_hollis_narrative','lena', 'Draft the outcomes narrative and Keisha''s story', 'fundraising', 'high', 'grant:hollis_pathways', 'hollis_report', 'in_progress', 7, null, 0, 'day', -7),
  ('lena_hollis_budget',   'kwame', 'Budget-to-actuals for the Hollis report', 'finance', 'high', 'grant:hollis_pathways', 'hollis_report', 'todo', 8, null, null, 'week', -7),
  ('lena_hollis_signoff',  'remi', 'Review and sign the Hollis interim report', 'fundraising', 'high', 'grant:hollis_pathways', 'hollis_report', 'todo', 9, null, null, 'next', -7),
  ('ben_hollis_data',      'ben', 'Pull Cohort 7 attendance and credential data for the Hollis report', 'program', 'high', 'grant:hollis_pathways', 'hollis_report', 'done', -5, -5, null, 'day', -8),
  ('lena_bayview_outline', 'lena', 'Outline the Bayview report around Cohort 6 placements', 'fundraising', 'medium', 'grant:bayview_gos', 'bayview_report', 'todo', 15, null, null, 'next', -12),
  ('lena_bayview_financials','kwame', 'Bayview: audited financials and FY budget attachments', 'finance', 'medium', 'grant:bayview_gos', 'bayview_report', 'todo', 18, null, null, null, -12),
  ('priya_sequoia_brief',  'priya', 'Draft the one-page Northbridge brief for Sequoia', 'fundraising', 'high', null, 'sequoia_prep', 'in_progress', 1, null, 0, 'day', -8),
  ('ben_sequoia_outcomes', 'ben', 'Pull Launchpad academic outcomes for the Sequoia brief', 'program', 'high', null, 'sequoia_prep', 'in_progress', 1, null, null, 'week', -8),
  ('lena_sequoia_research','lena', 'Research Sequoia Trust''s recent grants and priorities', 'fundraising', 'medium', null, 'sequoia_prep', 'done', -10, -10, null, 'day', -14);

-- Linked entity per task (type, bible key or lookup key, label fallback).
create temp table w8_l (k text primary key, lt text, lk text, ll text) on commit drop;
insert into w8_l (k, lt, lk, ll) values
  ('okafor_call', 'constituent', 'con:okafor', 'Nnamdi Okafor'),
  ('sequoia_prep', 'opportunity', 'opp:sequoia', 'Sequoia Trust for Education'),
  ('goldberg_thanks', 'constituent', 'con:goldberg', 'Aaron Goldberg'),
  ('wu_ask_meeting', 'constituent', 'con:wu', 'Jennifer Wu'),
  ('patel_onboarding', 'board_member', 'bd_patel', 'Ravi Patel'),
  ('remi_reserve_memo', 'board_meeting', 'boardmtg:retreat', 'Board retreat'),
  ('remi_meridian_reference', 'opportunity', 'opp:meridian', 'Meridian Foundation for Youth Opportunity'),
  ('remi_bylaws', 'document', 'doc:bylaws', 'Bylaws'),
  ('remi_sl_criteria', 'partner', 'partner:sanleandro', 'San Leandro Unified (Career Ed)'),
  ('remi_wdb_amendment', 'grant', 'grant:workforce_contract', 'Eastshore WDB contract'),
  ('conn_kinetic_talent', 'partner', 'partner:kinetic', 'Kinetic Labs'),
  ('conn_celeste_intro', 'constituent', 'con:bd_harrington', 'Celeste Harrington'),
  ('remi_janelle_numbers', 'constituent', 'con:po_bayview', 'Janelle Ortiz'),
  ('remi_meridian_review', 'grant', 'grant:meridian', 'Meridian proposal'),
  ('remi_chair_retreat', 'constituent', 'con:bd_harrington', 'Celeste Harrington'),
  ('remi_hollis_timeline', 'constituent', 'con:po_hollis', 'Martin Hollis-Reyes'),
  ('remi_laurel_plan', 'partner', 'partner:laurel', 'Laurel Ridge High School'),
  ('remi_wu_research', 'constituent', 'con:wu', 'Jennifer Wu'),
  ('remi_ed_report', 'board_meeting', 'boardmtg:next', 'Next board meeting'),
  ('lena_hollis_signoff', 'grant', 'grant:hollis_pathways', 'Hollis Pathways grant'),
  ('board_packet', 'board_meeting', 'boardmtg:next', 'Next board meeting'),
  ('tasha_committee_reports', 'board_meeting', 'boardmtg:next', 'Next board meeting'),
  ('tasha_consent_agenda', 'board_meeting', 'boardmtg:next', 'Next board meeting'),
  ('tasha_do_renewal', 'compliance_item', 'insurance', 'D&O and general liability renewal'),
  ('tasha_handbook_pto', 'document', 'doc:handbook', 'Employee Handbook'),
  ('tasha_si100', 'compliance_item', 'corporate_report', 'Statement of Information (SI-100)'),
  ('tasha_venue', 'board_meeting', 'boardmtg:retreat', 'Board retreat'),
  ('tasha_retreat_agenda', 'board_meeting', 'boardmtg:retreat', 'Board retreat'),
  ('miguel_sl_memo', 'partner', 'partner:sanleandro', 'San Leandro Unified (Career Ed)'),
  ('miguel_laura_budget', 'partner', 'partner:sanleandro', 'San Leandro Unified (Career Ed)'),
  ('miguel_c7_midpoint', 'cohort', 'cohort:pw7', 'Pathways Cohort 7'),
  ('miguel_bayshore_tutor', 'partner', 'partner:bayshore', 'Bayshore Academy'),
  ('miguel_wdb_quarterly', 'grant', 'grant:workforce_contract', 'Eastshore WDB contract'),
  ('miguel_laurel_recovery', 'partner', 'partner:laurel', 'Laurel Ridge High School'),
  ('miguel_program_cmte', 'board_meeting', 'boardmtg:next', 'Next board meeting'),
  ('conn_sl_superintendent', 'partner', 'partner:sanleandro', 'San Leandro Unified (Career Ed)'),
  ('yearend_letter', 'student', 'student:amara', 'Amara Johnson'),
  ('priya_gt_match', 'constituent', 'con:kinetic', 'Kinetic Labs'),
  ('priya_pacific_proposal', 'opportunity', 'opp:pacific_renewal', 'Pacific Summit Bank renewal'),
  ('priya_board_giving', 'board_member', 'bd_ramos', 'Victor Ramos'),
  ('priya_meridian_answers', 'opportunity', 'opp:meridian', 'Meridian Foundation for Youth Opportunity'),
  ('priya_chen_visit', 'constituent', 'con:chen_margaret', 'Margaret Chen'),
  ('priya_alder', 'opportunity', 'opp:alder', 'Alder & Finch Foundation'),
  ('priya_chen_reminder', 'constituent', 'con:chen_margaret', 'Margaret Chen'),
  ('priya_wu_options', 'constituent', 'con:wu', 'Jennifer Wu'),
  ('priya_sequoia_brief', 'opportunity', 'opp:sequoia', 'Sequoia Trust for Education'),
  ('conn_alder', 'constituent', 'con:alder', 'Alder & Finch Foundation'),
  ('kwame_q1_invoice', 'grant', 'grant:workforce_contract', 'Eastshore WDB contract'),
  ('kwame_q1_payment', 'grant', 'grant:workforce_contract', 'Eastshore WDB contract'),
  ('kwame_990_partix', 'compliance_item', 'form_990', 'Form 990'),
  ('kwame_rrf1', 'compliance_item', 'state_charitable', 'CA RRF-1'),
  ('kwame_kinetic_invoice', 'constituent', 'con:kinetic', 'Kinetic Labs'),
  ('kwame_grace_forecast', 'board_member', 'bd_lim', 'Grace Lim'),
  ('kwame_signer', 'board_member', 'bd_lim', 'Grace Lim'),
  ('ben_placement', 'metric', 'placement_rate', 'Placement rate'),
  ('ben_attendance_weekly', 'cohort', 'cohort:lp_laurel', 'Launchpad · Laurel Ridge'),
  ('ben_board_dash', 'board_meeting', 'boardmtg:next', 'Next board meeting'),
  ('ben_hollis_data', 'cohort', 'cohort:pw7', 'Pathways Cohort 7'),
  ('ben_sequoia_outcomes', 'program', 'prog:launchpad', 'Launchpad Academy'),
  ('david_checkin', 'student', 'student:david', 'David Tran'),
  ('rosa_whitaker', 'partner', 'partner:laurel', 'Laurel Ridge High School'),
  ('rosa_laurel_visit', 'partner', 'partner:laurel', 'Laurel Ridge High School'),
  ('rosa_family_night', 'partner', 'partner:eastlake', 'Eastlake High School'),
  ('rosa_luis_csueb', 'student', 'student:luis', 'Luis Ortega'),
  ('rosa_sat_books', 'partner', 'partner:bayshore', 'Bayshore Academy'),
  ('rosa_attendance_wk', 'cohort', 'cohort:lp_eastlake', 'Launchpad · Eastlake'),
  ('rosa_chen_students', 'partner', 'partner:eastlake', 'Eastlake High School'),
  ('rosa_tutors', 'partner', 'partner:laurel', 'Laurel Ridge High School'),
  ('rosa_families_call', 'cohort', 'cohort:lp_laurel', 'Launchpad · Laurel Ridge'),
  ('cohort8_interviews', 'cohort', 'cohort:pw8', 'Pathways Cohort 8'),
  ('andre_keisha', 'student', 'student:keisha', 'Keisha Brown'),
  ('andre_jalen', 'student', 'student:jalen', 'Jalen Price'),
  ('andre_info_session', 'partner', 'partner:library', 'Eastshore Public Library'),
  ('andre_scoring', 'cohort', 'cohort:pw8', 'Pathways Cohort 8'),
  ('andre_amara', 'student', 'student:amara', 'Amara Johnson'),
  ('andre_comptia', 'cohort', 'cohort:pw7', 'Pathways Cohort 7'),
  ('andre_harbor_slots', 'partner', 'partner:harbor', 'Harbor Health Partners'),
  ('andre_redline_two', 'partner', 'partner:redline', 'Redline Builders'),
  ('andre_c6_outcomes', 'cohort', 'cohort:pw6', 'Pathways Cohort 6'),
  ('simone_pacific_slots', 'partner', 'partner:pacific_summit', 'Pacific Summit Bank'),
  ('simone_finaid_night', 'cohort', 'cohort:mc', 'Mentor Circles'),
  ('simone_kinetic_mentors', 'partner', 'partner:kinetic', 'Kinetic Labs'),
  ('simone_bg_checks', 'program', 'prog:mentors', 'Mentor Circles'),
  ('simone_fruitvale_mou', 'partner', 'partner:fruit_center', 'Fruitvale Hub Community Center'),
  ('hollis_report', 'grant', 'grant:hollis_pathways', 'Hollis Pathways grant'),
  ('lena_hollis_narrative', 'student', 'student:keisha', 'Keisha Brown'),
  ('bayview_report', 'grant', 'grant:bayview_gos', 'Bayview general operating grant'),
  ('lena_cypress_loi', 'opportunity', 'opp:cypress_renewal', 'Cypress Fund renewal'),
  ('lena_eastbay_renewal', 'opportunity', 'opp:eastbay_renewal', 'East Bay Workforce renewal'),
  ('lena_yoi_claim', 'grant', 'grant:state_yoi', 'CA Youth Opportunity Initiative'),
  ('lena_harbor_update', 'grant', 'grant:harbor_health', 'Harbor Health grant'),
  ('lena_eastbay_final', 'grant', 'grant:eastbay_workforce', 'East Bay Workforce grant'),
  ('lena_meridian_budget', 'grant', 'grant:meridian', 'Meridian proposal'),
  ('lena_alder_note', 'opportunity', 'opp:alder', 'Alder & Finch Foundation'),
  ('lena_hollis_agreement', 'document', 'doc:hollis_agreement', 'Hollis grant agreement'),
  ('lena_sequoia_research', 'constituent', 'con:sequoia', 'Sequoia Trust for Education'),
  ('jordan_amara_quote', 'student', 'student:amara', 'Amara Johnson'),
  ('jordan_janelle_invite', 'constituent', 'con:po_bayview', 'Janelle Ortiz');

-- The one-sentence stake Today renders under the title.
create temp table w8_w (k text primary key, why text) on commit drop;
insert into w8_w (k, why) values
  ('okafor_call', 'He gave $25K last year and nothing yet this year. A personal call from you before the year-end launch is the best shot at renewing.'),
  ('sequoia_prep', 'First meeting with a $100K prospect this week. Walk in with the brief, the outcomes, and an ask range Priya agrees with.'),
  ('goldberg_thanks', 'His largest gift yet, through his donor-advised fund, and still unthanked. A call from you this week turns a transaction into a relationship.'),
  ('wu_ask_meeting', 'Discovery went well and she asked to see Pathways in person. Get the ask meeting on the calendar before the holidays.'),
  ('patel_onboarding', 'Ravi joined three months ago and has not made his board gift yet. A strong onboarding finish is how he becomes a champion.'),
  ('remi_ye_edits', 'The letter goes to the mail house in under two weeks. Your edits are the last step before Amara''s story goes out.'),
  ('remi_ed_report', 'The packet goes out a week before the board meeting, and the ED report is the part every director reads.'),
  ('remi_reserve_memo', 'The finance committee asked for a written reserve policy before the retreat. We sit at about 5.5 months against a 6-month goal.'),
  ('remi_reforecast', 'Kwame''s Q2 reforecast changes the runway number the board will see. It needs your sign-off before the packet.'),
  ('remi_sl_criteria', 'Meridian decides in about five weeks. We need our own go/no-go criteria for San Leandro before their answer arrives.'),
  ('remi_wdb_amendment', 'The amendment raises the Q2 reimbursement cap. Nothing to do until the agency sends the signature copy.'),
  ('lena_hollis_signoff', 'Your signature is the last step before submission, and approval releases the second $75K installment.'),
  ('board_packet', 'Materials go to the board a week ahead. The reserve policy and the San Leandro pilot both need real board time.'),
  ('tasha_do_renewal', 'Our D&O policy lapses at the end of next month. The broker needs the board roster and the audited financials.'),
  ('tasha_bgcheck_vendor', 'New mentor matches are paused until background checks move to the new vendor. Six Kinetic Labs mentors are waiting.'),
  ('audit_pbc', 'Fieldwork runs off this list. Every day it slips pushes the audit report closer to the board retreat.'),
  ('kwame_990_partix', 'The preparer cannot finish the 990 without the functional expense split, and the extended deadline is close.'),
  ('kwame_grants_receivable', 'The auditors test grants receivable first, and the Eastshore reimbursement lag makes this schedule the hardest one.'),
  ('david_checkin', 'David has missed 6 of his last 10 sessions since starting a grocery job. A call home this week keeps him on the Launchpad roster.'),
  ('cohort8_interviews', 'Cohort 8 starts in the spring, and strong applicants are talking to other programs too. Offers follow the interviews.'),
  ('andre_keisha', 'Keisha''s CNA exam is about a month out. A lapsed transit pass is the most common reason fellows miss clinical hours.'),
  ('andre_jalen', 'A referral from Redline''s field lead. He is exactly who the trades track is for.'),
  ('hollis_report', 'Approval of this report releases the second $75K installment of the Hollis grant.'),
  ('lena_hollis_narrative', 'Martin asked for one fellow''s story in her own words. Keisha agreed to share hers.'),
  ('bayview_report', 'Bayview is our largest unrestricted funder, and Janelle asked us to lead with Cohort 6 placements.'),
  ('yearend_letter', 'The year-end campaign launches in two weeks, and this letter carries most of the $400K goal.'),
  ('priya_gt_match', 'A confirmed match is the headline of the GivingTuesday email. Kinetic said yes in principle; we need it in writing.'),
  ('priya_meridian_answers', 'Meridian''s committee meets in November. Clear answers on the San Leandro budget keep us in their top group.'),
  ('priya_pacific_proposal', 'Pacific Summit is our Summer Works presenting sponsor, and Daniel Osei wants the renewal ready for his budget cycle.'),
  ('priya_board_giving', 'Seven of nine directors have given this year. Getting to 100% is a line the board chair wants to report.'),
  ('priya_sequoia_brief', 'Remi takes this into the Sequoia intro. It needs to be one page and lead with outcomes.'),
  ('lena_cypress_loi', 'Cypress invited this LOI, so a strong one is likely to turn into a full proposal. It is due in 18 days.'),
  ('jordan_failed_cards', 'Two monthly donors'' cards declined. Most failures are just expired cards, and a quick note saves the gift.'),
  ('simone_bg_checks', 'Four mentors are ready to match except for their background checks, which wait on the vendor switch.'),
  ('miguel_sl_memo', 'The board and Meridian will both read this memo. It sets the size and the cost of the fourth site.'),
  ('miguel_wdb_quarterly', 'Quarterly outcomes are a condition of the Eastshore contract, and a late report holds up reimbursement.'),
  ('rosa_laurel_visit', 'Remi''s first visit since the bell-schedule change dropped attendance to 74%.'),
  ('ben_households', 'Duplicate households mean duplicate year-end letters. This has to be clean before Ben pulls the segments.'),
  ('simone_renewal_calls', 'Renewing last summer''s employers is the fastest path to 100 internships. Most decide budgets before January.'),
  ('kwame_signer', 'Grace became treasurer in the summer. Two signers keep payroll moving when Remi travels.');

-- Descriptions (plain text; the task editor shows them).
create temp table w8_d (k text primary key, descr text) on commit drop;
insert into w8_d (k, descr) values
  ('okafor_call', E'Last gift: $25K, about ten months ago. Talking points: Amara''s placement at Kinetic Labs, Cohort 8 starting in the spring, and the year-end match.'),
  ('sequoia_prep', E'Meeting with Arthur Feld, program officer. Priya is drafting the brief, Ben is pulling outcomes, Lena did the giving-history research. Settle the ask range with Priya before Thursday.'),
  ('goldberg_thanks', E'$20,000 arrived through the Bay Legacy Giving Fund with a recommendation letter naming Aaron. Jordan is handling the formal receipt to the fund; this is the personal call.'),
  ('board_packet', E'Contents: ED report, financials through September and the Q2 reforecast, committee reports, consent agenda and prior minutes, reserve policy draft, San Leandro pilot memo.'),
  ('audit_pbc', E'Remaining: grants receivable schedule, payroll tie-out. Fixed-asset rollforward is done. Auditors want everything before fieldwork week.'),
  ('hollis_report', E'Due in ten days. Sections: Cohort 7 enrollment and retention (Ben), credential pass rates, one fellow''s story (Keisha), budget-to-actuals (Kwame). Remi signs.'),
  ('bayview_report', E'Lead with Cohort 6 placement outcomes and the Launchpad attendance trend. Attach audited financials and the FY budget.'),
  ('remi_reserve_memo', E'Cover: the target (6 months of operating expense), allowed uses, who approves a draw, and how we rebuild. Grace offered to review a first draft.'),
  ('ben_export_bug', E'Exporting attendance from a Launchpad cohort leaves out the school site column, so Rosa has to add it by hand each week.'),
  ('yearend_letter', E'Amara''s story, from the Cohort 6 graduation to her first paycheck at Kinetic Labs. One page, a clear ask, a reply card with the match.'),
  ('wu_ask_meeting', E'Offer two dates for her to visit a Pathways IT class, with the ask conversation right after. Priya''s giving-options sheet is ready.'),
  ('cohort8_interviews', E'18 shortlisted from 41 applications. Two interview days, panels of two (Andre plus an employer partner).'),
  ('david_checkin', E'Mom is Linh Tran. David started evening shifts at a grocery store. Ask whether a later session or a weekly check-in would help.');

-- Meta: labels, roll count, pins, archive, meeting link, source, snooze,
-- explicit last-touch, creator, origin path.
create temp table w8_m (
  k text primary key, lbl text[], rolls int, pin bool, arch int, mtg text, src text,
  snooze int, touch int, by text, origin text, bk text
) on commit drop;
insert into w8_m (k, lbl, rolls, pin, arch, mtg, src, snooze, touch, by, origin, bk) values
  ('okafor_call',          array['donor-care','lybunt'], 0, true, null, null, null, null, null, null, null, null),
  ('sequoia_prep',         array['prep'], 0, false, null, null, null, null, null, null, null, null),
  ('goldberg_thanks',      array['sys:ack','sys:escalate:{goldberg_gift}'], 0, true, null, null, 'automation', null, null, 'priya', null, null),
  ('wu_ask_meeting',       array['scheduling','major-gift'], 0, false, null, 'wu_discovery', 'reed', null, null, null, null, null),
  ('patel_onboarding',     array['board'], 0, false, null, null, null, null, -3, null, null, null),
  ('remi_reserve_memo',    array['board','finance-committee'], 3, false, null, 'fincmte_prev', 'reed', null, -4, null, null, null),
  ('remi_alumni_onepager', array['donor-care'], 2, false, null, null, null, null, -6, null, null, null),
  ('remi_wdb_amendment',   array['contract'], 0, false, null, null, null, null, -2, null, null, null),
  ('conn_kinetic_talent',  array['scheduling'], 0, false, null, null, null, null, null, null, null, null),
  ('conn_celeste_intro',   array['scheduling','major-gift'], 0, false, null, null, null, null, null, null, null, null),
  ('conn_lantern',         array['scheduling'], 0, false, null, null, null, null, null, null, null, 'whitfield'),
  ('remi_gala_calls',      array['donor-care'], 0, false, -120, null, null, null, null, null, null, null),
  ('remi_fy_budget',       array['board'], 0, false, -90, null, null, null, null, null, null, null),
  ('remi_janelle_numbers', array['grant-report'], 0, false, null, 'bayview_visit', 'reed', null, null, null, null, null),
  ('remi_sw_closeout',     array[]::text[], 0, false, -30, null, null, null, null, null, null, null),
  ('remi_hollis_timeline', array['grant-report'], 0, false, null, 'hollis_call', null, null, null, null, null, null),
  ('remi_lybunt_calls',    array['lybunt'], 0, false, null, null, null, null, null, null, null, null),
  ('remi_sl_criteria',     array['strategy'], 0, false, null, 'leadership_q2', 'reed', null, null, null, null, null),
  ('remi_ed_report',       array['board'], 0, false, null, null, null, null, null, 'tasha', null, null),
  ('lena_hollis_signoff',  array['grant-report'], 0, false, null, null, null, null, null, 'lena', null, null),
  ('board_packet',         array['board'], 0, false, null, null, null, null, -1, null, null, null),
  ('tasha_do_renewal',     array['compliance','insurance'], 0, false, null, null, null, null, null, null, null, null),
  ('tasha_handbook_pto',   array['hr'], 0, false, null, null, null, null, -17, null, null, null),
  ('tasha_bgcheck_vendor', array['mentors','hr'], 1, false, null, null, null, null, -2, null, null, null),
  ('tasha_venue',          array['retreat'], 0, false, null, null, null, null, null, null, null, null),
  ('tasha_retreat_agenda', array['retreat'], 0, false, null, 'chair_checkin', null, null, null, 'remi', null, null),
  ('miguel_sl_memo',       array['expansion'], 0, false, null, null, null, null, -1, null, null, null),
  ('miguel_wdb_quarterly', array['contract','grant-report'], 0, false, null, null, null, null, null, 'kwame', null, null),
  ('miguel_laurel_recovery', array['attendance'], 0, false, null, 'program_staff', 'reed', null, null, null, null, null),
  ('yearend_letter',       array['year-end'], 0, false, null, null, null, null, -1, null, null, null),
  ('priya_ye_plan',        array['year-end'], 0, false, null, 'leadership_q2', 'reed', null, null, null, null, null),
  ('priya_gt_match',       array['year-end','corporate'], 0, false, null, null, null, null, null, null, null, null),
  ('priya_board_giving',   array['board','board-giving'], 0, false, null, 'chair_checkin', null, null, null, 'remi', null, null),
  ('priya_meridian_answers', array['grant'], 0, false, null, null, null, null, null, 'remi', null, null),
  ('priya_alder',          array['re-cultivation'], 0, false, null, null, null, 30, -6, null, null, null),
  ('priya_wu_options',     array['major-gift'], 0, false, null, 'wu_discovery', 'reed', null, null, null, null, null),
  ('priya_board_match',    array['year-end','board-giving'], 0, false, null, 'chair_checkin', 'reed', null, null, null, null, null),
  ('conn_alder',           array['scheduling'], 0, false, null, null, null, null, null, null, null, null),
  ('audit_pbc',            array['audit'], 0, false, null, null, null, null, -1, 'tasha', null, null),
  ('kwame_990_partix',     array['compliance','990'], 0, false, null, null, null, null, null, null, null, null),
  ('kwame_rrf1',           array['compliance'], 0, false, null, null, null, null, null, null, null, null),
  ('kwame_grace_forecast', array['finance-committee'], 0, false, null, 'fincmte_prev', 'reed', null, null, 'remi', null, null),
  ('kwame_laptop_cart',    array[]::text[], 1, false, null, null, null, null, -15, null, null, null),
  ('kwame_signer',         array['banking'], 0, false, null, 'fincmte_prev', null, null, -5, 'remi', null, null),
  ('ben_households',       array['data-quality','year-end'], 0, false, null, null, null, null, null, null, null, null),
  ('ben_dictionary',       array['data-quality'], 0, false, null, null, null, null, -11, null, null, null),
  ('ben_sw_survey',        array[]::text[], 0, false, -25, null, null, null, null, null, null, null),
  ('ben_export_bug',       array['bug'], 0, false, null, null, null, null, null, null, '/admin/cohorts', null),
  ('david_checkin',        array['attendance','family-contact'], 0, false, null, 'program_staff', 'reed', null, -2, 'miguel', null, null),
  ('rosa_families_call',   array['attendance','family-contact'], 0, false, null, 'program_staff', 'reed', null, null, null, null, null),
  ('rosa_laurel_visit',    array['site-visit'], 0, false, null, null, null, null, null, null, null, null),
  ('rosa_chen_students',   array['site-visit'], 0, false, null, null, null, null, null, 'priya', null, null),
  ('cohort8_interviews',   array['cohort-8'], 0, false, null, 'program_staff', 'reed', null, -1, null, null, null),
  ('andre_jalen',          array['cohort-8','referral'], 0, false, null, 'redline_visit', 'reed', null, -3, 'remi', null, null),
  ('andre_scoring',        array['cohort-8'], 0, false, null, null, null, null, null, null, null, null),
  ('andre_redline_two',    array['trades'], 0, false, null, 'redline_visit', 'reed', null, -4, 'remi', null, null),
  ('andre_keisha',         array['credential'], 0, false, null, null, null, null, null, null, null, null),
  ('simone_kinetic_mentors', array['mentors'], 0, false, null, null, null, null, -2, null, null, null),
  ('simone_bg_checks',     array['mentors'], 2, false, null, null, null, null, -2, null, null, null),
  ('simone_fruitvale_mou', array['mou'], 0, false, null, null, null, 7, -10, null, null, null),
  ('simone_sw_survey',     array[]::text[], 0, false, -30, null, null, null, null, null, null, null),
  ('hollis_report',        array['grant-report'], 0, false, null, 'hollis_call', 'reed', null, -1, null, null, null),
  ('lena_hollis_narrative', array['grant-report'], 0, true, null, null, null, null, 0, null, null, null),
  ('priya_sequoia_brief',  array['prep'], 0, false, null, null, null, null, 0, null, null, null),
  ('bayview_report',       array['grant-report'], 0, false, null, 'bayview_visit', null, null, -3, null, null, null),
  ('lena_cypress_loi',     array['loi','renewal'], 0, false, null, null, null, null, null, null, null, null),
  ('lena_hollis_agreement', array[]::text[], 0, false, -60, null, null, null, null, null, null, null),
  ('jordan_gala_photos',   array['event'], 0, false, -120, null, null, null, null, null, null, null),
  ('jordan_breakfast',     array['event','year-end'], 0, false, null, null, null, null, null, null, null, null),
  ('jordan_failed_cards',  array['monthly-donors'], 0, false, null, null, null, null, -1, null, null, null),
  ('jordan_impact_copy',   array['website'], 2, false, null, null, null, null, -6, null, null, null),
  ('jordan_janelle_invite', array['event'], 0, false, null, 'bayview_visit', 'reed', null, -5, 'remi', null, null),
  ('jordan_amara_quote',   array['year-end'], 0, false, null, null, null, null, null, null, null, null);


-- Resolve every derived column once, then insert parents before subtasks.
create temp table w8_x on commit drop as
select y.k, y.who, y.title_x as title, y.descr, y.project_id, y.cat, y.st, y.pri, y.parent_id, y.labels,
       y.by, y.due_date, y.pin, y.created_at, y.completed_at, y.touched_at, y.arch, y.planned_week, y.planned_day,
       y.pri_rank, y.mtg_id, y.rolls, y.why, y.src, y.snooze, y.origin, y.booking_id, y.par,
       case when r.lid is null then null else y.lt0 end as lt,
       r.lid,
       case when r.lid is null then null else coalesce(r.lbl_live, y.ll) end as llabel
from (
  select t.*, d.descr, w.why, m.rolls, m.pin, m.arch, m.src, m.snooze, m.by, m.origin,
         replace(replace(t.title, '{bm}', to_char(pg_temp.d(24), 'FMMonth')), '{fy1}', (pg_temp.fy() - 1)::text) as title_x,
         case t.pri when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end as pri_rank,
         case when t.proj is null then null
              else (select p.id from public.ops_projects p
                     where p.id = pg_temp.nb_id('proj:' || t.proj) and p.org_id = pg_temp.nb_org()) end as project_id,
         case when t.par is null then null else pg_temp.nb_id('task:' || t.par) end as parent_id,
         coalesce(array(select replace(lb, '{goldberg_gift}', pg_temp.nb_id('gift:goldberg_daf')::text)
                        from unnest(m.lbl) lb), '{}'::text[]) as labels,
         case when t.due is null then null else pg_temp.d(t.due) end as due_date,
         pg_temp.ts(t.age, lpad((9 + floor(pg_temp.rnd('w8c:' || t.k) * 8))::int::text, 2, '0') || ':' ||
                           lpad((floor(pg_temp.rnd('w8cm:' || t.k) * 12) * 5)::int::text, 2, '0')) as created_at,
         case when t.st = 'done' then
                case when t.done = 0
                     then pg_temp.w8_at(pg_temp.w8_wdb(0), '08:' || lpad((10 + floor(pg_temp.rnd('w8dm:' || t.k) * 20))::int::text, 2, '0'))
                     else pg_temp.w8_at(pg_temp.w8_wdb(t.done),
                                        lpad((10 + floor(pg_temp.rnd('w8d:' || t.k) * 8))::int::text, 2, '0') || ':' ||
                                        lpad((floor(pg_temp.rnd('w8dm:' || t.k) * 12) * 5)::int::text, 2, '0')) end
         end as completed_at,
         coalesce(case when m.touch = 0 then pg_temp.ts(0, '07:50') else pg_temp.ts(m.touch, '16:40') end,
                  pg_temp.ts(-(1 + floor(pg_temp.rnd('w8u:' || t.k) * 4))::int,
                             lpad((9 + floor(pg_temp.rnd('w8uh:' || t.k) * 8))::int::text, 2, '0') || ':20')) as touched_at,
         case when t.st = 'done' and t.plan = 'day' then pg_temp.w8_wdb(t.done)
              when t.st <> 'done' and t.plan = 'day' then
                   case when t.pday < 0 then pg_temp.w8_wdb(t.pday) else pg_temp.w8_wd(t.pday) end
         end as planned_day,
         case when t.st = 'done' and t.plan in ('day', 'week') then pg_temp.w8_mon(pg_temp.w8_wdb(t.done))
              when t.st <> 'done' and t.plan = 'day' then
                   pg_temp.w8_mon(case when t.pday < 0 then pg_temp.w8_wdb(t.pday) else pg_temp.w8_wd(t.pday) end)
              when t.plan = 'week' then pg_temp.wk(0)
              when t.plan = 'next' then pg_temp.wk(1)
              when t.plan = 'last' then pg_temp.wk(-1)
         end as planned_week,
         l.lt as lt0, l.lk, l.ll,
         case when m.mtg is null then null
              else (select r.id from public.meeting_records r
                     where r.id = pg_temp.nb_id('mtg:' || m.mtg) and r.org_id = pg_temp.nb_org()) end as mtg_id,
         case when m.bk is null then null
              else (select b.id from public.bookings b
                     where b.id = pg_temp.nb_id('booking:' || m.bk) and b.org_id = pg_temp.nb_org()) end as booking_id
  from w8_t t
  left join w8_l l on l.k = t.k
  left join w8_w w on w.k = t.k
  left join w8_d d on d.k = t.k
  left join w8_m m on m.k = t.k
) y
cross join lateral (
  -- Link targets that other sections own are verified (null when absent);
  -- anchors (constituents, partners, students, cohorts, programs) always exist.
  select case y.lt0
           when 'board_member' then (select bm.id from public.board_members bm
                                      where bm.org_id = pg_temp.nb_org()
                                        and (bm.constituent_id = pg_temp.nb_id('con:' || y.lk)
                                             or bm.name ilike '%' || split_part(y.ll, ' ', 2) || '%')
                                      order by (bm.constituent_id = pg_temp.nb_id('con:' || y.lk)) desc nulls last limit 1)
           when 'compliance_item' then (select ci.id from public.compliance_items ci
                                         where ci.org_id = pg_temp.nb_org() and ci.kind = y.lk
                                         order by (ci.status in ('upcoming', 'in_progress')) desc, ci.due_date limit 1)
           when 'metric' then (select md.id from public.metric_definitions md
                                where md.org_id = pg_temp.nb_org() and md.metric_key = y.lk limit 1)
           when 'grant' then (select g.id from public.grants g where g.id = pg_temp.nb_id(y.lk) and g.org_id = pg_temp.nb_org())
           when 'opportunity' then (select o.id from public.opportunities o where o.id = pg_temp.nb_id(y.lk) and o.org_id = pg_temp.nb_org())
           when 'board_meeting' then (select b.id from public.board_meetings b where b.id = pg_temp.nb_id(y.lk) and b.org_id = pg_temp.nb_org())
           when 'document' then (select dc.id from public.documents dc where dc.id = pg_temp.nb_id(y.lk) and dc.org_id = pg_temp.nb_org())
           else case when y.lk is null then null else pg_temp.nb_id(y.lk) end
         end as lid,
         case y.lt0
           when 'grant' then (select g.name from public.grants g where g.id = pg_temp.nb_id(y.lk) and g.org_id = pg_temp.nb_org())
           when 'opportunity' then (select o.name from public.opportunities o where o.id = pg_temp.nb_id(y.lk) and o.org_id = pg_temp.nb_org())
           when 'board_meeting' then (select coalesce(nullif(b.title, ''), 'Board meeting') || ' · ' || to_char(b.meeting_date, 'Mon FMDD')
                                       from public.board_meetings b where b.id = pg_temp.nb_id(y.lk) and b.org_id = pg_temp.nb_org())
           when 'compliance_item' then (select ci.title from public.compliance_items ci
                                         where ci.org_id = pg_temp.nb_org() and ci.kind = y.lk
                                         order by (ci.status in ('upcoming', 'in_progress')) desc, ci.due_date limit 1)
           when 'document' then (select coalesce(nullif(dc.title, ''), dc.filename) from public.documents dc
                                  where dc.id = pg_temp.nb_id(y.lk) and dc.org_id = pg_temp.nb_org())
           when 'board_member' then (select bm.name from public.board_members bm
                                      where bm.org_id = pg_temp.nb_org()
                                        and (bm.constituent_id = pg_temp.nb_id('con:' || y.lk)
                                             or bm.name ilike '%' || split_part(y.ll, ' ', 2) || '%')
                                      order by (bm.constituent_id = pg_temp.nb_id('con:' || y.lk)) desc nulls last limit 1)
         end as lbl_live
) r;

insert into public.ops_tasks
  (id, org_id, title, description, project_id, category, status, priority, parent_id, labels,
   assigned_to, assigned_to_id, created_by, due_date, pinned_for_today, pinned_for_this_week,
   display_order, created_at, updated_at, completed_at, linked_entity_type, linked_entity_id, linked_label,
   booking_id, archived_at, planned_week, planned_day, day_order, meeting_record_id, calendar_event_id,
   roll_count, why_it_matters, obligation_source, snoozed_until, origin_path)
select pg_temp.nb_id('task:' || x.k), pg_temp.nb_org(), x.title, x.descr, x.project_id, x.cat, x.st, x.pri,
       x.parent_id, x.labels, x.who, case when x.who is null then null else pg_temp.nb_user(x.who) end,
       coalesce(x.by, x.who, 'tasha'), x.due_date,
       coalesce(x.pin, false) and x.st <> 'done',
       coalesce((x.st <> 'done' and x.planned_week between pg_temp.wk(-1) and pg_temp.wk(0))
                or (x.st = 'done' and x.planned_week = pg_temp.wk(0)), false),
       null, x.created_at,
       case when x.st = 'done' then x.completed_at else greatest(x.created_at, x.touched_at) end,
       x.completed_at, x.lt, x.lid, x.llabel, x.booking_id,
       case when x.arch is null then null else greatest(x.completed_at + interval '1 day', pg_temp.ts(x.arch, '17:05')) end,
       x.planned_week, x.planned_day,
       case when x.planned_day is null then null
            else (row_number() over (partition by x.who, x.planned_day order by x.pri_rank, x.k))::int end,
       x.mtg_id, null, coalesce(x.rolls, 0), x.why, coalesce(x.src, 'human'),
       case when x.snooze is null then null else pg_temp.d(x.snooze) end,
       x.origin
from w8_x x
order by (x.par is not null), x.k
on conflict do nothing;

-- Acknowledgment mirrors: the receipt task the app creates for each pending
-- gift that needs a personal thank-you (lib/fundraising/ack-tasks.ts:
-- labels sys:ack + sys:gift:<id>, linked to the donor). Only gifts whose 48h
-- SLA has not lapsed (so the org-wide overdue count stays honest and small);
-- the acknowledgments page creates the rest on first visit. Plus a short
-- done history for recently sent thank-yous.
insert into public.ops_tasks
  (id, org_id, title, category, status, priority, labels, assigned_to, assigned_to_id, created_by,
   due_date, created_at, updated_at, completed_at, linked_entity_type, linked_entity_id, linked_label,
   planned_week, planned_day, pinned_for_this_week, obligation_source)
select pg_temp.nb_id('task:ack:' || g.id), pg_temp.nb_org(),
       'Thank ' || nm.n || ' for the ' || pg_temp.w8_usd(g.amount) || ' gift', 'fundraising', 'todo',
       case when g.amount >= 1000 then 'high' else 'medium' end,
       array['sys:ack', 'sys:gift:' || g.id], 'jordan', pg_temp.nb_user('jordan'), 'jordan',
       g.gift_date + 2, greatest(g.created_at, g.gift_date::timestamp at time zone 'America/Los_Angeles' + interval '9 hours'),
       greatest(g.created_at, g.gift_date::timestamp at time zone 'America/Los_Angeles' + interval '9 hours'), null,
       'constituent', g.constituent_id, nm.n,
       pg_temp.w8_mon(g.gift_date + 2), null, pg_temp.w8_mon(g.gift_date + 2) = pg_temp.wk(0), 'automation'
from public.gifts g
join public.constituents c on c.id = g.constituent_id and c.org_id = g.org_id
cross join lateral (select coalesce(case when c.type = 'organization' then c.org_name
                                         else nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '') end,
                                    'this donor') as n) nm
where g.org_id = pg_temp.nb_org()
  and g.acknowledgment_status = 'pending'
  and g.external_source in ('manual', 'pledge', 'stripe')
  and g.gift_date + 2 >= pg_temp.d(0)
  and not exists (select 1 from public.ops_tasks t
                   where t.org_id = g.org_id and t.labels @> array['sys:gift:' || g.id::text] and t.status <> 'done')
on conflict do nothing;

insert into public.ops_tasks
  (id, org_id, title, category, status, priority, labels, assigned_to, assigned_to_id, created_by,
   due_date, created_at, updated_at, completed_at, linked_entity_type, linked_entity_id, linked_label,
   planned_week, planned_day, obligation_source)
select pg_temp.nb_id('task:ack:' || h.id), pg_temp.nb_org(),
       'Thank ' || h.n || ' for the ' || pg_temp.w8_usd(h.amount) || ' gift', 'fundraising', 'done',
       case when h.amount >= 1000 then 'high' else 'medium' end,
       array['sys:ack', 'sys:gift:' || h.id], 'jordan', pg_temp.nb_user('jordan'), 'jordan',
       h.gift_date + 2, h.made, h.sent, h.sent, 'constituent', h.constituent_id, h.n,
       pg_temp.w8_mon((h.sent at time zone 'America/Los_Angeles')::date), (h.sent at time zone 'America/Los_Angeles')::date,
       'automation'
from (
  select g.id, g.amount, g.gift_date, g.constituent_id,
         least(g.acknowledged_at, greatest(g.created_at, g.gift_date::timestamp at time zone 'America/Los_Angeles' + interval '9 hours')) as made,
         g.acknowledged_at as sent,
         coalesce(case when c.type = 'organization' then c.org_name
                       else nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '') end, 'this donor') as n
  from public.gifts g
  join public.constituents c on c.id = g.constituent_id and c.org_id = g.org_id
  where g.org_id = pg_temp.nb_org()
    and g.acknowledgment_status = 'sent'
    and g.acknowledged_at is not null
    and g.acknowledged_at >= pg_temp.ts(-45, '00:00')
    and g.acknowledged_at <= pg_temp.ts(0, '00:00')
    and g.amount >= 250
    and g.external_source in ('manual', 'pledge', 'stripe')
  order by g.acknowledged_at desc
  limit 12
) h
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Reed's suggested follow-ups on the meeting records (accepted ones became
--    the tasks above; a few are still pending on Meridian and Wu).
-- ════════════════════════════════════════════════════════════════════════════
insert into public.meeting_suggested_tasks
  (id, org_id, meeting_record_id, suggested_title, suggested_category, suggested_entity_type,
   suggested_entity_id, status, created_at, updated_at)
select pg_temp.nb_id('mtgsug:' || s.mk || ':' || s.n), pg_temp.nb_org(), r.id, s.title, s.cat, s.et,
       case when s.ek is null then null else pg_temp.nb_id(s.ek) end, s.st,
       r.created_at + interval '4 minutes',
       case when s.st = 'pending' then r.created_at + interval '4 minutes' else r.updated_at end
from (values
  ('bayview_visit', 1, 'Send Janelle Ortiz the Cohort 6 placement numbers', 'fundraising', 'constituent', 'con:po_bayview', 'accepted'),
  ('bayview_visit', 2, 'Add Janelle Ortiz to the Cohort 7 graduation invite list', 'fundraising', 'constituent', 'con:po_bayview', 'accepted'),
  ('bayview_visit', 3, 'Schedule a second Bayview visit at Bayshore Academy', 'program', 'constituent', 'con:po_bayview', 'dismissed'),
  ('redline_visit', 1, 'Invite Jalen Price to interview for Cohort 8', 'program', 'partner', 'partner:redline', 'accepted'),
  ('redline_visit', 2, 'Line up two more pre-apprenticeship placements at Redline', 'program', 'partner', 'partner:redline', 'accepted'),
  ('redline_visit', 3, 'Send Redline a gala sponsorship deck', 'fundraising', 'partner', 'partner:redline', 'dismissed'),
  ('fincmte_prev', 1, 'Draft the operating reserve policy for the finance committee', 'finance', 'constituent', 'con:bd_lim', 'accepted'),
  ('fincmte_prev', 2, 'Send Grace Lim the Q1 cash-flow forecast', 'finance', 'constituent', 'con:bd_lim', 'accepted'),
  ('fincmte_prev', 3, 'Add Grace Lim as a signer on the operating account', 'finance', 'constituent', 'con:bd_lim', 'accepted'),
  ('wu_discovery', 1, 'Book the ask meeting with Jennifer Wu', 'fundraising', 'constituent', 'con:wu', 'accepted'),
  ('wu_discovery', 2, 'Draft a Pathways giving-options sheet for Jennifer Wu', 'fundraising', 'constituent', 'con:wu', 'accepted'),
  ('wu_discovery', 3, 'Send Jennifer Wu the Pathways outcomes one-pager', 'fundraising', 'constituent', 'con:wu', 'pending'),
  ('chair_checkin', 1, 'Draft the board-match announcement for the year-end appeal', 'fundraising', 'constituent', 'con:bd_harrington', 'accepted'),
  ('chair_checkin', 2, 'Nudge Victor Ramos and Ravi Patel on board gifts', 'board', 'constituent', 'con:bd_harrington', 'accepted'),
  ('chair_checkin', 3, 'Draft the retreat agenda with Remi and Celeste', 'board', 'constituent', 'con:bd_harrington', 'accepted'),
  ('hollis_call', 1, 'Hollis interim report: draft, review, submit', 'fundraising', 'constituent', 'con:po_hollis', 'accepted'),
  ('hollis_call', 2, 'Send Martin Hollis-Reyes the report timeline', 'fundraising', 'constituent', 'con:po_hollis', 'accepted'),
  ('meridian_call', 1, 'Send Camille Washington the San Leandro pilot budget by year', 'fundraising', 'constituent', 'con:po_meridian', 'pending'),
  ('meridian_call', 2, 'Draft a one-page sustainability plan for the fourth site', 'fundraising', 'constituent', 'con:po_meridian', 'pending'),
  ('meridian_call', 3, 'Offer Meridian three site-visit dates in early November', 'fundraising', 'constituent', 'con:po_meridian', 'pending'),
  ('program_staff', 1, 'Check in with David Tran''s mom about attendance', 'program', null, null, 'accepted'),
  ('program_staff', 2, 'Schedule interviews for the 18 shortlisted Cohort 8 applicants', 'program', null, null, 'accepted'),
  ('program_staff', 3, 'Call families of Laurel Ridge students with 3+ absences', 'program', null, null, 'accepted'),
  ('program_staff', 4, 'Laurel Ridge attendance recovery plan with Rosa', 'program', 'partner', 'partner:laurel', 'accepted'),
  ('leadership_q2', 1, 'Year-end launch plan: segments, dates, owners', 'fundraising', null, null, 'accepted'),
  ('leadership_q2', 2, 'Draft the San Leandro go/no-go criteria with Miguel', 'program', 'partner', 'partner:sanleandro', 'accepted')
) as s(mk, n, title, cat, et, ek, st)
join public.meeting_records r on r.id = pg_temp.nb_id('mtg:' || s.mk) and r.org_id = pg_temp.nb_org()
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Work blocks (BloomOS-native, not pushed to Google) + their checklists.
--    A block's tasks share its day (the write engine keeps planned_day equal
--    to the block's day); the link insert enforces that.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.work_blocks
  (id, org_id, owner_user_id, day, start_minute, duration_minute, title, google_event_id, calendar_event_id, created_at, updated_at)
select pg_temp.nb_id('wblock:' || b.k), pg_temp.nb_org(), pg_temp.nb_user(b.who), b.dd, b.sm, b.dur, b.title, null, null,
       least(pg_temp.ts(b.age, '08:30'), pg_temp.w8_at(b.dd, '07:00')), least(pg_temp.ts(b.age, '08:30'), pg_temp.w8_at(b.dd, '07:00'))
from (values
  ('r_mon',  'remi',   pg_temp.w8_wd(0),   780,  90, 'Donor follow-ups', -1),
  ('r_tue',  'remi',   pg_temp.w8_wd(1),   840,  90, 'Sequoia prep', -1),
  ('r_wed',  'remi',   pg_temp.w8_wd(2),   540,  90, 'Year-end letter + Wu scheduling', 0),
  ('r_thu',  'remi',   pg_temp.w8_wd(3),   900,  90, 'Board packet: ED report', 0),
  ('r_fri',  'remi',   pg_temp.w8_wd(4),   630,  90, 'Q2 reforecast review', 0),
  ('r_lw1',  'remi',   pg_temp.w8_wdb(-6), 780,  90, 'Year-end + Hollis follow-ups', -8),
  ('r_lw2',  'remi',   pg_temp.w8_wdb(-4), 840, 120, 'Reserve policy memo', -8),
  ('r_lw3',  'remi',   pg_temp.w8_wdb(-5), 600,  60, 'Monthly donor video', -8),
  ('p_tue',  'priya',  pg_temp.w8_wd(1),   540, 120, 'Year-end letter: final draft', -2),
  ('p_thu',  'priya',  pg_temp.w8_wd(3),   870,  90, 'Pacific Summit renewal proposal', -2),
  ('t_wed',  'tasha',  pg_temp.w8_wd(2),   780, 120, 'Board packet assembly', -1),
  ('m_tue',  'miguel', pg_temp.w8_wd(1),   780,  90, 'San Leandro scope memo', -1),
  ('j_wed',  'jordan', pg_temp.w8_wd(2),   600, 120, 'Year-end breakfast logistics', -1),
  ('l_mon',  'lena',   pg_temp.w8_wd(0),   540, 180, 'Hollis report: outcomes narrative', -2),
  ('k_tue',  'kwame',  pg_temp.w8_wd(1),   540, 150, 'Audit PBC: grants receivable', -2),
  ('a_tue',  'andre',  pg_temp.w8_wd(1),   780, 120, 'Score Cohort 8 applications', -1),
  ('b_wed',  'ben',    pg_temp.w8_wd(2),   600, 120, 'Household merge', -1)
) as b(k, who, dd, sm, dur, title, age)
on conflict do nothing;

insert into public.work_block_tasks (id, org_id, block_id, task_id, position, created_at)
select pg_temp.nb_id('wbt:' || l.bk || ':' || l.tk), pg_temp.nb_org(), wb.id, t.id, l.pos, wb.created_at
from (values
  ('r_mon', 'goldberg_thanks', 0), ('r_mon', 'okafor_call', 1),
  ('r_tue', 'sequoia_prep', 0),
  ('r_wed', 'remi_ye_edits', 0), ('r_wed', 'wu_ask_meeting', 1),
  ('r_thu', 'remi_ed_report', 0),
  ('r_fri', 'remi_reforecast', 0),
  ('r_lw1', 'remi_ye_segments', 0), ('r_lw1', 'remi_hollis_timeline', 1),
  ('r_lw2', 'remi_reserve_memo', 0),
  ('r_lw3', 'remi_monthly_video', 0),
  ('p_tue', 'yearend_letter', 0),
  ('p_thu', 'priya_pacific_proposal', 0),
  ('t_wed', 'board_packet', 0),
  ('m_tue', 'miguel_sl_memo', 0),
  ('j_wed', 'jordan_breakfast', 0),
  ('l_mon', 'lena_hollis_narrative', 0),
  ('k_tue', 'kwame_grants_receivable', 0),
  ('a_tue', 'andre_scoring', 0),
  ('b_wed', 'ben_households', 0)
) as l(bk, tk, pos)
join public.work_blocks wb on wb.id = pg_temp.nb_id('wblock:' || l.bk) and wb.org_id = pg_temp.nb_org()
join public.ops_tasks t on t.id = pg_temp.nb_id('task:' || l.tk) and t.org_id = pg_temp.nb_org()
                       and t.planned_day = wb.day
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Weekly rhythm: Remi's Monday plans (8 weeks back + this Monday) and
--    Friday closes (8 weeks back through last Friday), a few teammates'.
--    Stats mirror what /api/admin/ops/rhythm computes from the week's tasks.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.rhythm_sessions
  (id, org_id, user_id, kind, week_of, status, checklist, stats, notes, started_at, completed_at, created_at, updated_at)
select pg_temp.nb_id('rhythm:' || s.who || ':' || s.kind || ':' || s.n), pg_temp.nb_org(), pg_temp.nb_user(s.who),
       s.kind, pg_temp.wk(s.n), 'completed',
       case when s.kind = 'friday_close'
            then jsonb_build_object('tasks_truthed', true, 'follow_ups_cleared', s.n <> -2, 'note_written', s.note is not null)
            else '{}'::jsonb end,
       case when s.kind = 'monday_plan' then
              jsonb_build_object('planned', st.planned, 'placed', st.placed, 'scheduled', 0, 'done', 0)
            else jsonb_build_object('planned', st.planned, 'done', st.done_by_fri, 'open', st.planned - st.done_by_fri) end,
       s.note,
       s.t0, s.t1, s.t0, s.t1
from (
  select v.*,
         case when v.kind = 'monday_plan' then pg_temp.w8_at(pg_temp.wk(v.n), v.hm0) else pg_temp.w8_at(pg_temp.wk(v.n) + 4, v.hm0) end as t0,
         case when v.kind = 'monday_plan' then pg_temp.w8_at(pg_temp.wk(v.n), v.hm1) else pg_temp.w8_at(pg_temp.wk(v.n) + 4, v.hm1) end as t1
  from (
    select 'remi' who, 'monday_plan' kind, n, '08:20' hm0, '08:45' hm1, null::text note from generate_series(-8, 0) n
    union all
    select 'remi', 'friday_close', n, '16:05', '16:30',
           case n
             when -1 then 'Meridian came back with good questions and the decision is still about five weeks out. Hollis draft is with Lena. Carryover: the reserve policy memo (third week, so it gets Friday morning) and the alumni one-pager. Next week: Sequoia intro, get the Wu ask on the calendar, call Okafor, thank Aaron Goldberg.'
             when -2 then 'Jennifer Wu wants to see Pathways in person, a good sign. Celeste offered a $20K board challenge for year-end. Did not get to the reserve policy; it rolls. Laurel Ridge attendance is the program worry.'
             when -3 then 'Meridian proposal is in. Finance committee went well: about 5.7 months of runway. Redline referred a strong Cohort 8 applicant. Audit fieldwork is next; Kwame has the PBC list.'
             when -4 then 'Bayview visit at Eastlake went well and Janelle got her placement numbers. Meridian budget narrative done with Lena.'
             when -5 then 'Quiet week on purpose: wrote the annual report letter and cleared the inbox. Summer Works close-out approved.'
             when -6 then 'Board prep week. Nothing rolled.'
             when -7 then 'Two items rolled, both waiting on other people. Fine.'
             else 'Closed clean. Back from the summer break with a full calendar.'
           end
    from generate_series(-8, -1) n
    union all
    select h, 'monday_plan', n, '08:40', '09:00', null from unnest(array['tasha','priya','miguel','lena']) h, generate_series(-3, 0) n
    union all
    select h, 'friday_close', n, '15:30', '15:50',
           case when n = -1 then
             case h when 'tasha' then 'Board packet outline is set; committee chairs have their asks. Background-check vendor contract still stuck in legal.'
                    when 'priya' then 'Year-end plan locked. Letter draft is close; Remi edits next week. Meridian follow-ups split with Lena.'
                    when 'miguel' then 'Laurel Ridge plan is in motion. San Leandro memo needs one more pass before Remi sees it.'
                    else 'Hollis data is in from Ben. Narrative next, then Kwame''s budget-to-actuals.' end
           end
    from unnest(array['tasha','priya','miguel','lena']) h, generate_series(-3, -1) n
  ) v
) s
cross join lateral (
  select count(*)::int as planned,
         count(*) filter (where t.planned_day is not null)::int as placed,
         count(*) filter (where t.status = 'done' and t.completed_at <= s.t1)::int as done_by_fri
  from public.ops_tasks t
  where t.org_id = pg_temp.nb_org() and t.planned_week = pg_temp.wk(s.n)
    and (t.assigned_to = s.who or t.assigned_to is null)
) st
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Exclusions, teammate calendar prefs, agenda delegations
-- ════════════════════════════════════════════════════════════════════════════
insert into public.meeting_exclusions (id, org_id, owner_user_id, series_key, title, created_at)
values
  (pg_temp.nb_id('mexcl:mentorcircles'), pg_temp.nb_org(), pg_temp.nb_remi(), 'nbwx-mentorcircles', 'Mentor Circles (monthly)', pg_temp.ts(-60, '10:15')),
  (pg_temp.nb_id('mexcl:allstaff'),      pg_temp.nb_org(), pg_temp.nb_remi(), 'nbwx-allstaff',      'All-staff meeting',        pg_temp.ts(-58, '09:40'))
on conflict do nothing;

-- Teammates only: calendar_prefs is keyed by user_id alone (it would follow
-- Remi into every org he belongs to).
insert into public.calendar_prefs (user_id, org_id, day_start_minute, day_end_minute, default_block_minute, updated_at)
select pg_temp.nb_user(p.h), pg_temp.nb_org(), p.s, p.e, p.b, pg_temp.ts(p.u, '12:00')
from (values ('tasha', 480, 990, 60, -40), ('priya', 540, 1050, 90, -33), ('miguel', 510, 1020, 60, -50),
             ('jordan', 600, 1080, 60, -20), ('lena', 540, 1020, 90, -27)) as p(h, s, e, b, u)
on conflict do nothing;

-- Tasha (COO) sees Remi's calendar; Jordan shares his events calendar with
-- Remi; Lena shares hers with Priya during report season.
insert into public.agenda_delegations (id, org_id, grantor_user_id, grantee_user_id, created_at)
select pg_temp.nb_id('agdel:' || a.g || ':' || a.e), pg_temp.nb_org(), pg_temp.nb_user(a.g), pg_temp.nb_user(a.e), pg_temp.ts(a.c, '11:00')
from (values ('remi', 'tasha', -300), ('jordan', 'remi', -120), ('lena', 'priya', -45)) as a(g, e, c)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 10. Board meeting attendance / RSVPs (Section 7's meetings and members,
--     matched by the bible's board keys).
-- ════════════════════════════════════════════════════════════════════════════
insert into public.meeting_attendance (id, org_id, meeting_id, board_member_id, rsvp, attended, is_staff, updated_at)
select pg_temp.nb_id('mattend:' || a.mk || ':' || bm.id), pg_temp.nb_org(), mt.id, bm.id, a.rsvp, a.att, bm.is_staff,
       least(pg_temp.ts(-1, '10:00'), (mt.meeting_date - a.lead)::timestamp at time zone 'America/Los_Angeles' + interval '10 hours')
from (
  select b.*,
         case when b.is_staff then '*staff'
              when b.constituent_id = pg_temp.nb_id('con:bd_harrington') or b.name ilike '%harrington%' then 'harrington'
              when b.constituent_id = pg_temp.nb_id('con:bd_osei') or b.name ilike '%osei%' then 'osei'
              when b.constituent_id = pg_temp.nb_id('con:bd_lim') or b.name ilike '%grace lim%' then 'lim'
              when b.constituent_id = pg_temp.nb_id('con:bd_ramos') or b.name ilike '%ramos%' then 'ramos'
              when b.constituent_id = pg_temp.nb_id('con:bd_freeman') or b.name ilike '%freeman%' then 'freeman'
              when b.constituent_id = pg_temp.nb_id('con:bd_nakamura') or b.name ilike '%nakamura%' then 'nakamura'
              when b.constituent_id = pg_temp.nb_id('con:bd_jackson') or b.name ilike '%jackson%' then 'jackson'
              when b.constituent_id = pg_temp.nb_id('con:bd_patel') or b.name ilike '%patel%' then 'patel'
              when b.constituent_id = pg_temp.nb_id('con:bd_brooks') or b.name ilike '%brooks%' then 'brooks'
         end as bkey
  from public.board_members b
  where b.org_id = pg_temp.nb_org() and b.status = 'active'
) bm
join (values
  ('prev2', 'harrington', 'yes', true, 6), ('prev2', 'osei', 'yes', true, 5), ('prev2', 'lim', 'yes', true, 6),
  ('prev2', 'ramos', 'yes', true, 4), ('prev2', 'freeman', 'yes', true, 7), ('prev2', 'nakamura', 'yes', true, 3),
  ('prev2', 'jackson', 'yes', true, 5), ('prev2', 'brooks', 'no', false, 2), ('prev2', '*staff', 'yes', true, 8),
  ('prev', 'harrington', 'yes', true, 7), ('prev', 'osei', 'yes', true, 6), ('prev', 'lim', 'yes', true, 6),
  ('prev', 'ramos', 'no', false, 3), ('prev', 'freeman', 'yes', true, 5), ('prev', 'nakamura', 'yes', true, 2),
  ('prev', 'jackson', 'yes', true, 6), ('prev', 'patel', 'yes', true, 4), ('prev', 'brooks', 'yes', true, 5),
  ('prev', '*staff', 'yes', true, 8),
  ('next', 'harrington', 'yes', null, 14), ('next', 'osei', 'yes', null, 12), ('next', 'lim', 'yes', null, 13),
  ('next', 'freeman', 'no', null, 10), ('next', 'nakamura', 'unsure', null, 9), ('next', 'jackson', 'yes', null, 11),
  ('next', 'patel', 'yes', null, 12), ('next', 'brooks', 'yes', null, 10), ('next', '*staff', 'yes', null, 15),
  ('retreat', 'harrington', 'yes', null, 40), ('retreat', 'osei', 'yes', null, 38), ('retreat', 'lim', 'yes', null, 37),
  ('retreat', 'patel', 'yes', null, 36), ('retreat', 'brooks', 'unsure', null, 35)
) as a(mk, bkey, rsvp, att, lead) on a.bkey = bm.bkey
join public.board_meetings mt on mt.id = pg_temp.nb_id('boardmtg:' || a.mk) and mt.org_id = pg_temp.nb_org()
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 11. The meeting matcher's timeline fan-out (lib/meetings/match.ts
--     fanOutTimeline): each calendar-sourced record's external attendees,
--     matched by email to constituents and partners in this org, get a
--     'meeting' row keyed (external_source='meeting', external_id=record).
-- ════════════════════════════════════════════════════════════════════════════
insert into public.interactions
  (id, org_id, constituent_id, kind, direction, subject, thread_id, body_preview, occurred_at, matched_email,
   logged_by, external_source, external_id, is_private, shannon_present, created_at)
select distinct on (r.id, c.id)
       pg_temp.nb_id('inter:mtg:' || r.id || ':' || c.id), r.org_id, c.id, 'meeting', null, r.title, null,
       left(r.summary, 400), r.occurred_at, att.email, 'meeting', 'meeting', r.id::text, false, false, r.created_at
from public.meeting_records r
join public.calendar_events e on e.id = r.calendar_event_id and e.org_id = r.org_id
cross join lateral (select lower(btrim(a->>'email')) as email from jsonb_array_elements(e.attendees) a) att
join public.constituents c on c.org_id = r.org_id
                          and att.email = any (array(select lower(x) from unnest(c.emails) x))
where r.org_id = pg_temp.nb_org()
  and r.source = 'calendar'
  and r.id in (select pg_temp.nb_id('mtg:' || k) from unnest(array['bayview_visit','redline_visit','fincmte_prev','wu_discovery',
               'chair_checkin','hollis_call','meridian_call','kinetic_checkin']) k)
  and att.email not like '%@northbridge.example'
order by r.id, c.id, att.email
on conflict do nothing;

insert into public.partner_interactions
  (id, org_id, partner_id, contact_id, kind, occurred_at, notes, logged_by, external_source, external_id, created_at)
select distinct on (r.id, p.id)
       pg_temp.nb_id('pinter:mtg:' || r.id || ':' || p.id), r.org_id, p.id, null, 'meeting', r.occurred_at, r.title,
       'meeting', 'meeting', r.id::text, r.created_at
from public.meeting_records r
join public.calendar_events e on e.id = r.calendar_event_id and e.org_id = r.org_id
cross join lateral (select lower(btrim(a->>'email')) as email from jsonb_array_elements(e.attendees) a) att
join public.partners p on p.org_id = r.org_id
                      and (lower(p.champion_email) = att.email
                           or exists (select 1 from public.partner_contacts pc
                                       where pc.org_id = r.org_id and pc.partner_id = p.id and lower(pc.email) = att.email))
where r.org_id = pg_temp.nb_org()
  and r.source = 'calendar'
  and r.id in (select pg_temp.nb_id('mtg:' || k) from unnest(array['bayview_visit','redline_visit','fincmte_prev','wu_discovery',
               'chair_checkin','hollis_call','meridian_call','kinetic_checkin']) k)
  and att.email not like '%@northbridge.example'
order by r.id, p.id, att.email
on conflict do nothing;

commit;
