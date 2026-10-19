-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — Identity: teammate auth users (banned), profiles, memberships,
--             staff org chart, Remi's last-seen state
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- Remi's demo login: remisobo+northbridge@gmail.com (plus-addressing lands in
-- his own Gmail). A member of THIS org only — see the prelude for why it is
-- not his everyday account. Confirmed email, random password nobody knows:
-- first sign-in is "Forgot password?" (or a magic link) on the admin login
-- screen. Not on any allowlist and not on an email_domain rule, so the
-- membership bootstrap trigger grants it nothing anywhere else.
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   confirmation_token, recovery_token, email_change, email_change_token_new,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000'::uuid,
   pg_temp.nb_remi(), 'authenticated', 'authenticated', pg_temp.nb_remi_email(),
   extensions.crypt(md5(random()::text || clock_timestamp()::text), extensions.gen_salt('bf')),
   now(), '', '', '', '',
   '{"provider":"email","providers":["email"],"seed":"northbridge_demo"}'::jsonb,
   '{"full_name":"Remi Sobomehin"}'::jsonb,
   now(), now())
on conflict do nothing;

insert into public.profiles (user_id, display_name)
values (pg_temp.nb_remi(), 'Remi Sobomehin')
on conflict do nothing;

-- Ten teammates. They exist so assignees, staff, reviews, and messages are
-- real people — but nobody can ever sign in as them:
--   * banned_until far in the future (GoTrue refuses every sign-in, password
--     reset, and magic link for a banned user),
--   * random bcrypt passwords nobody knows,
--   * emails on the reserved .example TLD (RFC 2606), which cannot receive mail,
--   * no org_email_allowlist rows, so the membership bootstrap trigger grants
--     nothing on its own and operator emails resolve to nobody.
-- A concrete far-future timestamp, not 'infinity': GoTrue's Go driver cannot
-- scan an infinite timestamptz, which would break the dashboard's user list.
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   banned_until, confirmation_token, recovery_token, email_change, email_change_token_new,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  pg_temp.nb_user(u.h), 'authenticated', 'authenticated', u.h || '@northbridge.example',
  extensions.crypt(md5(random()::text || clock_timestamp()::text), extensions.gen_salt('bf')),
  now(), timestamptz '2999-12-31 00:00:00+00', '', '', '', '',
  '{"provider":"email","providers":["email"],"seed":"northbridge_demo"}'::jsonb,
  jsonb_build_object('full_name', u.name),
  now(), now()
from (values
  ('tasha',  'Tasha Greene'),
  ('miguel', 'Miguel Arreola'),
  ('priya',  'Priya Natarajan'),
  ('kwame',  'Kwame Asante'),
  ('ben',    'Ben Okoro'),
  ('rosa',   'Rosa Delgado'),
  ('andre',  'Andre Mitchell'),
  ('simone', 'Simone Baptiste'),
  ('lena',   'Lena Park'),
  ('jordan', 'Jordan Ellis')
) as u(h, name)
on conflict do nothing;

-- Teammate profiles.
insert into public.profiles (user_id, display_name)
select pg_temp.nb_user(u.h), u.name
from (values
  ('tasha',  'Tasha Greene'),
  ('miguel', 'Miguel Arreola'),
  ('priya',  'Priya Natarajan'),
  ('kwame',  'Kwame Asante'),
  ('ben',    'Ben Okoro'),
  ('rosa',   'Rosa Delgado'),
  ('andre',  'Andre Mitchell'),
  ('simone', 'Simone Baptiste'),
  ('lena',   'Lena Park'),
  ('jordan', 'Jordan Ellis')
) as u(h, name)
on conflict do nothing;

-- Remi's demo login is the owner (and the only account that can sign in).
insert into public.memberships (user_id, org_id, role)
select pg_temp.nb_user(m.h), pg_temp.nb_org(), m.role::org_role
from (values
  ('remi',   'owner'),
  ('tasha',  'admin'),
  ('miguel', 'admin'),
  ('priya',  'admin'),
  ('kwame',  'finance'),
  ('ben',    'staff'),
  ('rosa',   'staff'),
  ('andre',  'staff'),
  ('simone', 'staff'),
  ('lena',   'staff'),
  ('jordan', 'staff')
) as m(h, role)
on conflict do nothing;

-- Org chart, top-down (the reports_to validation reads rows as they land).
insert into public.staff (id, org_id, user_id, full_name, title, reports_to, department, employment_type, start_date, sort_order)
values
  (pg_temp.nb_id('staff:remi'), pg_temp.nb_org(), pg_temp.nb_user('remi'),
   'Remi Sobomehin', 'Executive Director', null, 'Leadership', 'staff', pg_temp.d(-365 * 6 - 40), 1)
on conflict do nothing;

insert into public.staff (id, org_id, user_id, full_name, title, reports_to, department, employment_type, start_date, sort_order)
select pg_temp.nb_id('staff:' || s.h), pg_temp.nb_org(), pg_temp.nb_user(s.h),
       s.name, s.title, pg_temp.nb_id('staff:remi'), s.dept, 'staff', pg_temp.d(s.days_ago), s.o
from (values
  ('tasha',  'Tasha Greene',    'Chief Operating Officer',  'Operations',  -365 * 4 - 120, 2),
  ('miguel', 'Miguel Arreola',  'Director of Programs',     'Programs',    -365 * 5 - 200, 3),
  ('priya',  'Priya Natarajan', 'Director of Development',  'Development', -365 * 3 - 15,  4)
) as s(h, name, title, dept, days_ago, o)
on conflict do nothing;

insert into public.staff (id, org_id, user_id, full_name, title, reports_to, department, employment_type, start_date, sort_order)
select pg_temp.nb_id('staff:' || s.h), pg_temp.nb_org(), pg_temp.nb_user(s.h),
       s.name, s.title, pg_temp.nb_id('staff:' || s.mgr), s.dept, 'staff', pg_temp.d(s.days_ago), s.o
from (values
  ('kwame',  'Kwame Asante',    'Finance & Operations Manager',          'tasha',  'Operations',  -365 * 3 - 210, 5),
  ('ben',    'Ben Okoro',       'Data & Evaluation Manager',             'tasha',  'Operations',  -365 * 1 - 160, 6),
  ('rosa',   'Rosa Delgado',    'Launchpad Program Manager',             'miguel', 'Programs',    -365 * 4 - 30,  7),
  ('andre',  'Andre Mitchell',  'Pathways Fellowship Manager',           'miguel', 'Programs',    -365 * 2 - 75,  8),
  ('simone', 'Simone Baptiste', 'Youth Engagement Coordinator',          'miguel', 'Programs',    -300,           9),
  ('lena',   'Lena Park',       'Grants Manager',                        'priya',  'Development', -365 * 2 - 250, 10),
  ('jordan', 'Jordan Ellis',    'Development & Events Associate',        'priya',  'Development', -220,           11)
) as s(h, name, title, mgr, dept, days_ago, o)
on conflict do nothing;

-- "Since you were last here": Remi last looked yesterday evening, so items
-- stamped after that read as new on the demo morning.
insert into public.user_org_state (user_id, org_id, last_seen_at, prev_seen_at)
values (pg_temp.nb_remi(), pg_temp.nb_org(), pg_temp.ts(-1, '17:45'), pg_temp.ts(-2, '18:10'))
on conflict do nothing;

commit;
