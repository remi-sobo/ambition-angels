-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 8b — Inbox, messages, notifications, comments, Reed (AI), Capture,
--              briefing (daily narrative + weekly), AI usage ledger,
--              email campaigns, stories + comms editions, and the audit rows
--              for this section's own app actions.
--
-- Screens: /admin/inbox (notifications feed + bell badge), /admin/messages and
-- /admin/inbox/messages (threads, DMs, reactions, unread for Remi),
-- CommentThread on donor / student pages, /admin/reed (drafts, approved,
-- suggestions, strategy proposals, history), NextMovePanel on donor pages,
-- /admin/capture/[id] + the Today needs-you capture arm, /admin/briefing (cached
-- narrative) + /admin/briefing/weekly + Today's orientation line, Settings →
-- AI usage this month, /admin/fundraising/comms. Stories / comms editions are
-- dormant in the app (no UI reads them yet); they are seeded so the module
-- lights up when its UI ships.
--
-- Conventions (BIBLE §0): every row carries org_id = pg_temp.nb_org(); ids are
-- pg_temp.nb_id('<domain>:<key>'); every insert is on conflict do nothing (or
-- where not exists); dates are relative to the anchor; timestamps historical.
--
-- SAFETY
--  * Every email address here is on a reserved domain (@example.com/.org/.net,
--    @northbridge.example). Campaign recipients are filtered to those domains.
--  * email_campaigns has no 'scheduled' state (check: draft|sending|sent) and
--    nothing in the app sends a campaign except a human clicking Send on
--    /admin/fundraising/comms. The Year-End appeal is a DRAFT with NO segment
--    attached, so its Send button is disabled ("Attach a segment first").
--  * comms_editions have no send path in the app at all.
--  * Notifications here are in-app only (emailed_at is historical metadata; the
--    only emailing types are research.*, and that fan-out runs only at insert
--    time inside notify(), never from a seeded row).
--  * Reed / capture rows are inert records: nothing executes on read.
--
-- Cross-section references (exist at integration; no FK requires them here):
--  task:okafor_call, task:sequoia_prep, task:wu_ask_meeting, task:patel_onboarding
--  (S8a) · gift:goldberg_daf (S3a) · grant:hollis_pathways, grant:bayview_gos,
--  grant:workforce_contract (S3b) · doc:workforce_contract (S7) ·
--  boardmtg:next (S7). Resolved by lookup when present: metric_definitions by
--  metric_key (S6), plan_objectives / plan_goals by title (S6), segments by
--  name (S3a). Bulk constituents (S3a) are newsletter recipients.
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- Section-local helpers (pg_temp: session only, nothing persists).
create or replace function pg_temp.nb85_season(p date) returns text language sql immutable
  as $$ select case when extract(month from p) in (12, 1, 2) then 'Winter'
                    when extract(month from p) in (3, 4, 5)  then 'Spring'
                    when extract(month from p) in (6, 7, 8)  then 'Summer'
                    else 'Fall' end $$;
-- Fiscal quarter (Jul–Jun) a date falls in: 1..4
create or replace function pg_temp.nb85_fyq(p date) returns int language sql immutable
  as $$ select ((extract(month from p)::int - 7 + 12) % 12) / 3 + 1 $$;
-- Label of the most recently closed fiscal quarter, e.g. 'FY2027 Q1' (same
-- rule Section 6 uses for its funder-update reports).
create or replace function pg_temp.nb85_lastq() returns text language sql stable
  as $$ select 'FY' || (extract(year from q)::int + case when extract(month from q) >= 7 then 1 else 0 end)
               || ' Q' || (((extract(month from q)::int + 5) % 12) / 3 + 1)
          from (select (date_trunc('quarter', pg_temp.nb_anchor()) - interval '1 day')::date as q) x $$;
create or replace function pg_temp.nb85_ord(n int) returns text language sql immutable
  as $$ select (array['first','second','third','fourth'])[n] $$;
-- "Monday", "November 22"
create or replace function pg_temp.nb85_dow(n int) returns text language sql stable
  as $$ select to_char(pg_temp.d(n), 'FMDay') $$;
create or replace function pg_temp.nb85_md(n int) returns text language sql stable
  as $$ select to_char(pg_temp.d(n), 'FMMonth FMDD') $$;
create or replace function pg_temp.nb85_iso(n int) returns text language sql stable
  as $$ select to_char(pg_temp.d(n), 'YYYY-MM-DD') $$;
-- The app's DM key: the two user ids sorted, joined by ':' (lib/messaging/threads.ts
-- dmKey). uuid ordering equals JS string ordering for lowercase canonical uuids.
create or replace function pg_temp.nb85_dmkey(a uuid, b uuid) returns text language sql immutable
  as $$ select least(a, b)::text || ':' || greatest(a, b)::text $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. MESSAGES — 5 threads, 64 messages over the last two weeks
--    #leadership (remi tasha miguel priya) · #development (priya lena jordan remi)
--    · #programs (miguel rosa andre simone ben remi — Remi reads it, rarely posts) · DM Priya↔Remi (Wu) · DM Tasha↔Remi (audit).
--    Unread for Remi: 2 in the Priya DM, 1 in the Tasha DM, 1 @mention in
--    #development (4 messages, 3 threads).
-- ════════════════════════════════════════════════════════════════════════════
insert into public.message_threads (id, org_id, is_group, title, dm_key, created_by, last_message_at, created_at)
values
  (pg_temp.nb_id('thread:leadership'),  pg_temp.nb_org(), true,  'leadership',  null,
   pg_temp.nb_user('remi'),   pg_temp.ts(-1, '09:21'), pg_temp.ts(-420, '09:00')),
  (pg_temp.nb_id('thread:development'), pg_temp.nb_org(), true,  'development', null,
   pg_temp.nb_user('priya'),  pg_temp.ts(0, '07:20'),  pg_temp.ts(-380, '10:00')),
  (pg_temp.nb_id('thread:programs'),    pg_temp.nb_org(), true,  'programs',    null,
   pg_temp.nb_user('miguel'), pg_temp.ts(-1, '10:12'), pg_temp.ts(-300, '08:30')),
  (pg_temp.nb_id('thread:dm_priya'),    pg_temp.nb_org(), false, null,
   pg_temp.nb85_dmkey(pg_temp.nb_user('priya'), pg_temp.nb_remi()),
   pg_temp.nb_user('priya'),  pg_temp.ts(0, '07:14'),  pg_temp.ts(-200, '11:00')),
  (pg_temp.nb_id('thread:dm_tasha'),    pg_temp.nb_org(), false, null,
   pg_temp.nb85_dmkey(pg_temp.nb_user('tasha'), pg_temp.nb_remi()),
   pg_temp.nb_user('tasha'),  pg_temp.ts(-1, '18:30'), pg_temp.ts(-260, '14:00'))
on conflict do nothing;

insert into public.message_thread_members (thread_id, user_id, org_id, last_read_at, added_at)
select pg_temp.nb_id('thread:' || m.t), pg_temp.nb_user(m.h), pg_temp.nb_org(),
       pg_temp.ts(m.rd, m.rt), pg_temp.ts(m.ad, '09:00')
from (values
  ('leadership',  'remi',   -1, '09:30', -420),
  ('leadership',  'tasha',  -1, '09:25', -420),
  ('leadership',  'miguel', -1, '10:30', -420),
  ('leadership',  'priya',  -1, '09:21', -420),
  ('development', 'priya',   0, '07:25', -380),
  ('development', 'lena',   -1, '11:12', -380),
  ('development', 'jordan',  0, '07:20', -215),
  ('development', 'remi',   -1, '11:30', -380),
  ('programs',    'miguel', -1, '10:12', -300),
  ('programs',    'rosa',   -1, '10:20', -300),
  ('programs',    'andre',  -1, '12:00', -300),
  ('programs',    'simone', -2, '15:22', -295),
  ('programs',    'ben',    -1, '10:05', -300),
  ('programs',    'remi',   -1, '17:40', -300),
  ('dm_priya',    'priya',   0, '07:14', -200),
  ('dm_priya',    'remi',   -4, '13:45', -200),
  ('dm_tasha',    'tasha',  -1, '18:30', -260),
  ('dm_tasha',    'remi',   -2, '10:35', -260)
) as m(t, h, rd, rt, ad)
on conflict do nothing;

insert into public.messages (id, thread_id, org_id, sender_id, body, created_at)
select pg_temp.nb_id('msg:' || v.t || ':' || v.n), pg_temp.nb_id('thread:' || v.t), pg_temp.nb_org(),
       pg_temp.nb_user(v.h), v.body, pg_temp.ts(v.dd, v.hm)
from (values
  -- #leadership
  ('leadership', 1,  'tasha',  -13, '08:15', 'Morning, all. Audit fieldwork starts next week. Kwame has the PBC list about 70% done; the open items are the grant schedules and the fixed-asset rollforward.'),
  ('leadership', 2,  'remi',   -13, '08:31', 'Thanks, Tasha. Anything you need from me before the auditors arrive?'),
  ('leadership', 3,  'tasha',  -13, '08:40', 'Just the signed management rep letter at the end. I''ll put it on your calendar.'),
  ('leadership', 4,  'priya',  -11, '12:05', 'Meridian confirmed they have the full proposal. Camille says the committee decides in about six weeks and they may call with questions before then.'),
  ('leadership', 5,  'miguel', -11, '12:20', 'If they want a site visit, Bayshore on a Tuesday is our best showing. The mock interview stations run that day.'),
  ('leadership', 6,  'remi',   -11, '12:26', 'Good call. Priya, let''s offer a Tuesday at Bayshore if Camille asks.'),
  ('leadership', 7,  'priya',   -9, '16:50', 'Big news: $20,000 from Aaron Goldberg came in this afternoon through Bay Legacy Giving Fund.'),
  ('leadership', 8,  'miguel',  -9, '16:52', 'That''s wonderful. He came to the Launchpad showcase and stayed for an hour talking with the seniors.'),
  ('leadership', 9,  'miguel',  -8, '09:10', 'Launchpad attendance for last month closed at 86%. Laurel Ridge dipped to 79% after the bell-schedule change; Eastlake and Bayshore are both above 88%.'),
  ('leadership', 10, 'tasha',   -8, '09:24', 'Is the Laurel dip something the board should hear about, or is it already handled?'),
  ('leadership', 11, 'miguel',  -8, '09:31', 'Handled, I think. Rosa moved the start to 3:45 last week and added a snack table. Early numbers look better; we''ll know for sure at the next plan review.'),
  ('leadership', 12, 'remi',    -6, '14:02', 'Board meeting is a month out. Tasha, can we lock the agenda this week? I want the reserve conversation on it, not just the audit update.'),
  ('leadership', 13, 'tasha',   -6, '14:15', 'Yes. Draft agenda: audit status, Q1 financials, reserve policy, Meridian and the pipeline, Cohort 8 recruiting. The packet goes out a week ahead.'),
  ('leadership', 14, 'miguel',  -4, '10:40', 'Cohort 8 is past 40 applications and they''re still coming in. Andre starts interviews next week.'),
  ('leadership', 15, 'remi',    -4, '10:44', 'That''s a strong pool. Let''s make sure the healthcare track gets its share; Harbor wants more CNA candidates.'),
  ('leadership', 16, 'tasha',   -1, '09:05', 'Audit update: fieldwork is going smoothly. Two open requests left, both on Kwame''s list for this week. No findings so far.'),
  ('leadership', 17, 'remi',    -1, '09:20', 'Great news. Please thank Kwame for me.'),
  ('leadership', 18, 'priya',   -1, '09:21', 'Same here. That''s a big lift with the year-end launch coming.'),
  -- #development
  ('development', 1,  'lena',   -12, '10:00', 'Hollis interim report is due in 24 days. Outline is in the shared drive; I need outcomes by track from Ben and two participant stories.'),
  ('development', 2,  'priya',  -12, '10:12', 'Amara''s story is cleared for use. For the second, maybe Keisha? Her clinical rotation at Harbor is exactly what Martin funds.'),
  ('development', 3,  'lena',   -12, '10:20', 'Keisha would be perfect. I''ll ask Andre about a release.'),
  ('development', 4,  'jordan',  -7, '15:30', 'Acknowledgment queue: seven gifts from the last two weeks are waiting. Six are standard receipts I can send today. The Goldberg gift is the one that needs Remi.'),
  ('development', 5,  'remi',    -7, '15:41', 'I''ll call Aaron this week and sign the letter after. Jordan, can you have it on my desk?'),
  ('development', 6,  'jordan',  -7, '15:44', 'Printed and on your desk, with a pen.'),
  ('development', 7,  'priya',   -5, '11:00', 'Year-End launches in 19 days. The letter draft is in the doc. Lena, can you pull the Pathways placement numbers for the back page?'),
  ('development', 8,  'lena',    -5, '11:15', 'On it. Ben is sending the Cohort 6 placement rate and average starting wage once the 90-day check-ins close.'),
  ('development', 9,  'lena',    -3, '09:30', 'Cypress LOI is due in 21 days. They want a one-page budget and last year''s Launchpad outcomes.'),
  ('development', 10, 'priya',   -3, '09:42', 'Let''s use the attendance chart Ben made for the board. @Remi are you comfortable with an $85K ask?'),
  ('development', 11, 'remi',    -3, '10:05', 'Yes, $85K. It matches what the Eastlake and Bayshore sites cost us beyond the district stipend.'),
  ('development', 12, 'jordan',  -2, '16:20', 'GivingTuesday page is drafted. I used Amara''s photo with her OK. Preview link is in the doc.'),
  ('development', 13, 'priya',   -2, '16:33', 'Looks great. Let''s hold the match announcement until Celeste confirms the amount.'),
  ('development', 14, 'lena',    -1, '11:10', 'Hollis draft is about 80% done. Martin asked whether we can report credentials by track, so I''m working through that with Ben.'),
  ('development', 16, 'lena',    -2, '17:05', 'Remi, the ' || pg_temp.nb85_lastq() || ' funder update is drafted in the impact report builder: /admin/impact/reports?draft=1&rid=d5c64c67-c988-89eb-3ac8-21833f0da01d&title=' || replace(pg_temp.nb85_lastq(), ' ', '%20') || '%20Funder%20Update&keys=youth_served,active_participants,attendance_rate,program_completion,placement_rate,avg_starting_wage,credentials_earned,mentor_matches' || E'\n' || 'The narrative slot is the one you approved in Reed. Can you look before it goes to Janelle and Martin?'),
  ('development', 17, 'remi',    -2, '17:22', 'Will do tonight. Thanks, Lena.'),
  ('development', 15, 'jordan',   0, '07:20', '@Remi the Goldberg letter is still on your desk. Want me to clear 30 minutes on your calendar today so you can call him first?'),
  -- #programs (Remi is not a member)
  ('programs', 1,  'miguel', -13, '08:05', 'Weekly check: Launchpad attendance, Cohort 7 milestones, Cohort 8 intake. Drop updates here by noon.'),
  ('programs', 2,  'rosa',   -13, '10:40', 'Laurel Ridge closed last month at 79%. The 3:45 start and the snack table began last week; I''ll have a read on it by Friday.'),
  ('programs', 3,  'andre',  -13, '11:02', 'Cohort 7: 34 of 36 fellows on track. Two healthcare fellows need make-up hours before their clinical rotation.'),
  ('programs', 4,  'simone', -13, '11:30', 'Mentor Circles had 41 pairs at this month''s circle. Kinetic sent six new mentors.'),
  ('programs', 5,  'ben',    -11, '14:10', 'Dashboard is updated with last month''s attendance. I added a by-site view so the Laurel dip is easy to see.'),
  ('programs', 6,  'rosa',    -7, '17:00', 'Second week on the 3:45 start at Laurel. Families like the snack table even more than the schedule.'),
  ('programs', 7,  'rosa',    -6, '09:15', 'David Tran has missed six of the last ten sessions. He picked up evening shifts at a grocery store. I''m calling his mom this week.'),
  ('programs', 8,  'miguel',  -6, '09:30', 'Thanks, Rosa. Let''s look at moving his tutoring block. Loop me in after you talk.'),
  ('programs', 9,  'andre',   -4, '12:20', 'Keisha''s CNA exam is booked for ' || pg_temp.nb85_md(30) || '. She needs a transit pass for the testing center.'),
  ('programs', 10, 'simone',  -4, '12:35', 'I can get her a pass from the stipend fund. I''ll bring it to her this week.'),
  ('programs', 11, 'andre',   -2, '15:00', 'Cohort 8 interviews start next week. Rosa and Simone, can you each take two panels?'),
  ('programs', 12, 'rosa',    -2, '15:20', 'Yes to two.'),
  ('programs', 13, 'simone',  -2, '15:22', 'Same.'),
  ('programs', 14, 'ben',     -1, '10:00', 'Laurel has been at 85% for the two weeks since the new start time.'),
  ('programs', 15, 'miguel',  -1, '10:12', 'That''s the fix. Nice work, Rosa.'),
  -- DM Priya ↔ Remi (Jennifer Wu)
  ('dm_priya', 1, 'priya', -10, '17:05', 'Debrief from the Wu tour: she spent twenty minutes in the healthcare lab and asked how many fellows go on to nursing programs. Her mother was a nurse.'),
  ('dm_priya', 2, 'remi',  -10, '17:20', 'That''s the connection. What did she say about timing?'),
  ('dm_priya', 3, 'priya', -10, '17:26', 'She''s thinking about a multi-year commitment once her liquidity event closes. Research puts her capacity around $100K.'),
  ('dm_priya', 4, 'remi',   -8, '08:50', 'Let''s ask for $100K over two years for the healthcare track. Can you draft the one-pager?'),
  ('dm_priya', 5, 'priya',  -8, '09:02', 'Yes. I''ll pull Keisha''s rotation and the Harbor placements into it.'),
  ('dm_priya', 6, 'remi',   -4, '13:15', 'How''s the one-pager coming?'),
  ('dm_priya', 7, 'priya',  -4, '13:40', 'Draft is in the Wu folder. Ben checked every number.'),
  ('dm_priya', 8, 'priya',   0, '07:12', 'Morning! Jennifer replied. She can meet ' || pg_temp.nb85_dow(4) || ' or the following ' || pg_temp.nb85_dow(9) || ' for the ask, and she''d like to keep it to you, me, and her.'),
  ('dm_priya', 9, 'priya',   0, '07:14', 'I''d take ' || pg_temp.nb85_dow(4) || ' while she''s warm. I can hold 10am at the Fruitvale office if that works for you.'),
  -- DM Tasha ↔ Remi (the audit)
  ('dm_tasha', 1, 'tasha', -9, '11:00', 'Heads up: the auditors want to test the Hollis and Bayview restrictions. Kwame has the agreements. Can you confirm we''ve never released Pathways funds early?'),
  ('dm_tasha', 2, 'remi',  -9, '11:18', 'We haven''t. The Hollis money sits in the Pathways fund and only moves against fellowship costs. Kwame''s schedule shows it.'),
  ('dm_tasha', 3, 'tasha', -6, '16:40', 'They''d like 30 minutes with you next week on governance: board minutes, conflict-of-interest forms, and the reserve policy.'),
  ('dm_tasha', 4, 'remi',  -6, '16:52', 'Fine. Mornings work best.'),
  ('dm_tasha', 5, 'tasha', -2, '10:15', 'Two COI forms are still out: Ravi and Theo. I''ll nudge them, but a note from you might land faster.'),
  ('dm_tasha', 6, 'remi',  -2, '10:31', 'I''ll text them both today.'),
  ('dm_tasha', 7, 'tasha', -1, '18:30', 'Auditors finished the restriction testing with no exceptions. Draft financials are expected in about three weeks, so we''ll have them before the board meeting.')
) as v(t, n, h, dd, hm, body)
on conflict do nothing;

insert into public.message_reactions (message_id, user_id, org_id, emoji, created_at)
select pg_temp.nb_id('msg:' || r.t || ':' || r.n), pg_temp.nb_user(r.h), pg_temp.nb_org(), r.e,
       pg_temp.ts(r.dd, r.hm)
from (values
  ('leadership', 7,  'remi',   '🎉', -9, '16:55'),
  ('leadership', 7,  'tasha',  '🎉', -9, '17:02'),
  ('leadership', 7,  'miguel', '❤️', -9, '16:53'),
  ('leadership', 9,  'remi',   '👍', -8, '09:15'),
  ('leadership', 13, 'remi',   '✅', -6, '14:20'),
  ('leadership', 16, 'remi',   '🎉', -1, '09:19'),
  ('leadership', 16, 'priya',  '🎉', -1, '09:21'),
  ('leadership', 16, 'miguel', '👍', -1, '10:28'),
  ('development', 2,  'lena',   '❤️', -12, '10:14'),
  ('development', 6,  'remi',   '😂', -7, '15:50'),
  ('development', 11, 'priya',  '👍', -3, '10:06'),
  ('development', 12, 'priya',  '🎉', -2, '16:25'),
  ('development', 12, 'remi',   '🎉', -1, '11:28'),
  ('development', 12, 'lena',   '❤️', -2, '16:40'),
  ('programs', 6,  'miguel', '👍', -7, '17:10'),
  ('programs', 14, 'miguel', '🎉', -1, '10:05'),
  ('programs', 14, 'rosa',   '🎉', -1, '10:18'),
  ('programs', 14, 'andre',  '🎉', -1, '11:55'),
  ('programs', 14, 'simone', '❤️', -1, '10:40'),
  ('dm_priya', 1, 'remi',  '❤️', -10, '17:18'),
  ('dm_priya', 7, 'remi',  '👍', -4, '13:44'),
  ('dm_tasha', 2, 'tasha', '👍', -9, '11:20')
) as r(t, n, h, e, dd, hm)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. ENTITY COMMENTS — CommentThread on donor and student pages. @mentions
--    store the resolved user ids (mentions[]), as the comments API does.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.entity_comments (id, org_id, entity_type, entity_id, author_id, body, parent_id, mentions, created_at, updated_at)
select pg_temp.nb_id('comment:' || c.k), pg_temp.nb_org(), c.et, pg_temp.nb_id(c.ent), pg_temp.nb_user(c.h), c.body,
       case when c.parent is null then null else pg_temp.nb_id('comment:' || c.parent) end,
       case when c.mention then array[pg_temp.nb_remi()] else '{}'::uuid[] end,
       pg_temp.ts(c.dd, c.hm), pg_temp.ts(c.dd, c.hm)
from (values
  ('goldberg_1', 'constituent', 'con:goldberg', 'jordan', null, true, -9, '17:00',
   'Bay Legacy''s grant letter came in: $20,000 recommended by Aaron Goldberg. The receipt goes to the fund; the thank-you goes to Aaron. @Remi this one is over the major-gift line, so it''s yours first.'),
  ('goldberg_2', 'constituent', 'con:goldberg', 'remi', 'goldberg_1', false, -9, '17:35',
   'On it. I''ll call him before the letter goes out.'),
  ('goldberg_3', 'constituent', 'con:goldberg', 'priya', null, false, -1, '12:10',
   'Gentle nudge: it''s been eight days. Reed drafted the letter if you want a starting point.'),
  ('hollis_1', 'constituent', 'con:hollis', 'priya', null, false, -12, '10:30',
   'Installment 2 ($75K) is tied to the interim report. Lena owns the draft; Ben is pulling credentials by track.'),
  ('hollis_2', 'constituent', 'con:hollis', 'lena', null, true, 0, '07:35',
   '@Remi the interim report draft is in the Hollis folder. Martin asked for two participant stories. Can I use Keisha''s clinical rotation if she signs the release?'),
  ('okafor_1', 'constituent', 'con:okafor', 'remi', null, false, -3, '11:25',
   'His assistant says mornings work best. He wants the Summer Works results before he decides, so I''ll send the recap ahead of the call.'),
  ('wu_1', 'constituent', 'con:wu', 'priya', null, false, -10, '17:30',
   'Toured Pathways with Andre and spent most of her time in the healthcare lab. Working ask: $100K over two years for the healthcare track.'),
  ('wu_2', 'constituent', 'con:wu', 'remi', 'wu_1', false, -10, '18:00',
   'Let''s put Keisha''s story in the one-pager.'),
  ('lim_1', 'constituent', 'con:bd_lim', 'tasha', null, true, -8, '14:00',
   '@Remi Grace wants the Finance & Audit committee to meet the auditors before the full board. Can you join that call?'),
  ('lim_2', 'constituent', 'con:bd_lim', 'remi', 'lim_1', false, -8, '14:30',
   'Yes, put me on it.'),
  ('kinetic_1', 'constituent', 'con:kinetic', 'andre', null, false, -5, '14:00',
   'Kinetic wants two more IT fellows from Cohort 7 in the spring. Resumes are due early next month.'),
  ('david_1', 'student', 'student:david', 'rosa', null, false, -6, '09:20',
   'Missed six of the last ten sessions. He''s working evening shifts at a grocery store.'),
  ('david_2', 'student', 'student:david', 'miguel', null, true, -3, '09:40',
   '@Remi flagging because David is one of the scholarship students we told the Chens about. Rosa is reaching his mom this week.'),
  ('david_3', 'student', 'student:david', 'rosa', 'david_2', false, -1, '16:05',
   'Left two voicemails for Ms. Tran. Trying again tomorrow after school with one of our Vietnamese-speaking mentors on the line.'),
  ('keisha_1', 'student', 'student:keisha', 'andre', null, false, -4, '12:25',
   'CNA exam is booked. Simone is covering her transit pass from the stipend fund.'),
  ('amara_1', 'student', 'student:amara', 'andre', null, false, -30, '16:00',
   'Day 30 check-in: Amara says the help desk team handed her the printer fleet as her own project. Kinetic would like to feature her in their impact report.')
) as c(k, et, ent, h, parent, mention, dd, hm, body)
order by c.parent nulls first
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. REED — activity log (one row per model turn), threads + Q&A history,
--    drafts, cross-module suggestions, strategy proposals, donor next moves.
--    Created_by follows the app: Reed's ask/tool rows carry the asker's email
--    (ctx.email); decisions carry the decider's email; next moves carry the
--    handle (getAdminUser).
-- ════════════════════════════════════════════════════════════════════════════

-- 3a. Activity log: every assistant turn of the threads below (+ one failed
--     ask, which the app logs without persisting a turn).
insert into public.reed_activity_log
  (id, org_id, created_at, created_by, triggered_by, action_type, surface, thread_id, context_ref,
   prompt_summary, model_used, tokens_input, tokens_output, duration_ms, cost_usd, status, error_message, metadata)
select pg_temp.nb_id('reedlog:' || a.k), pg_temp.nb_org(), pg_temp.ts(a.dd, a.hm), 'agent', a.who, 'ask', a.surface,
       case when a.thr is null then null else pg_temp.nb_id('reedthread:' || a.thr) end,
       a.ctx, a.q, 'claude-sonnet-4-6', a.tin, a.tout, a.ms,
       round(((a.tin * 3 + a.tout * 15) / 1000000.0)::numeric, 6), a.st, a.err,
       jsonb_build_object('tool_calls', a.tools)
from (values
  ('lybunt:1', 'lybunt', -16, '09:10', pg_temp.nb_remi_email(), 'fab', null::jsonb,
   'Which LYBUNT donors should I call this week?', 11840, 512, 9400, 'success', null::text,
   '[{"name":"get_fundraising_forecast","ok":true},{"name":"get_constituent_dossier","ok":true},{"name":"get_constituent_dossier","ok":true}]'::jsonb),
  ('lybunt:2', 'lybunt', -16, '09:13', pg_temp.nb_remi_email(), 'fab', null,
   'Yes, add the Okafor call.', 9210, 188, 4100, 'success', null,
   '[{"name":"propose_next_best_action","ok":true}]'),
  ('runway:1', 'runway', -14, '16:30', pg_temp.nb_remi_email(), 'v2-edge', null,
   'What''s our runway if Meridian says no?', 13420, 431, 8800, 'success', null,
   '[{"name":"get_finance_snapshot","ok":true},{"name":"get_fundraising_forecast","ok":true},{"name":"explain_metric","ok":true}]'),
  ('runway:2', 'runway', -14, '16:34', pg_temp.nb_remi_email(), 'v2-edge', null,
   'Yes. What would San Leandro look like without it?', 12980, 402, 7600, 'success', null,
   '[{"name":"get_fundraising_forecast","ok":true},{"name":"get_partner_dossier","ok":true}]'),
  ('runway:3', 'runway', -14, '16:38', pg_temp.nb_remi_email(), 'v2-edge', null,
   'What should we add to the plan in case Meridian says no?', 15630, 694, 12900, 'success', null,
   '[{"name":"get_strategy_coherence","ok":true},{"name":"get_strategy_plan","ok":true},{"name":"propose_plan_element","ok":true},{"name":"propose_plan_element","ok":true}]'),
  ('hollis:1', 'hollis', -11, '10:15', pg_temp.nb_remi_email(), 'fab', null,
   'Where does the Hollis interim report stand?', 8760, 356, 6200, 'success', null,
   '[{"name":"get_grant_deadlines","ok":true},{"name":"list_documents","ok":true}]'),
  ('failed:1', null, -7, '21:02', pg_temp.nb_remi_email(), 'v2-mobile-plus', null,
   'How many Summer Works interns were rehired by their employer?', 0, 0, 30000, 'failed', 'Request timed out after 30s',
   '[]'),
  ('goldberg:1', 'goldberg', -4, '08:40', pg_temp.nb_remi_email(), 'v2-mobile-plus', null,
   'Draft a thank-you to Aaron Goldberg', 10450, 911, 14300, 'success', null,
   '[{"name":"get_constituent_dossier","ok":true},{"name":"get_org_foundation_and_outcomes","ok":true},{"name":"save_draft","ok":true}]'),
  ('sequoia:1', 'sequoia', -2, '14:00', pg_temp.nb_remi_email(), 'fab', null,
   'Help me prep for the Sequoia Trust intro.', 9930, 472, 7100, 'success', null,
   '[{"name":"get_constituent_dossier","ok":true},{"name":"get_needs_you_queue","ok":true},{"name":"get_org_foundation_and_outcomes","ok":true}]'),
  ('edreport:1', 'edreport', -1, '15:30', pg_temp.nb_remi_email(), 'fab', null,
   'Draft the ED report section for the board packet.', 16220, 1018, 17800, 'success', null,
   '[{"name":"get_status_and_outlook","ok":true},{"name":"get_finance_snapshot","ok":true},{"name":"get_org_foundation_and_outcomes","ok":true},{"name":"save_draft","ok":true}]'),
  ('hollisnarr:1', null, -6, '14:00', 'lena@northbridge.example', 'fab', null,
   'Draft the Pathways program narrative for the Hollis interim report.', 14110, 980, 16400, 'success', null,
   '[{"name":"get_grant_deadlines","ok":true},{"name":"get_org_foundation_and_outcomes","ok":true},{"name":"save_draft","ok":true}]'),
  ('q1narr:1', null, -8, '16:10', 'lena@northbridge.example', 'fab', null,
   'Write the narrative for the quarterly funder update.', 13870, 876, 15200, 'success', null,
   '[{"name":"get_finance_snapshot","ok":true},{"name":"get_status_and_outlook","ok":true},{"name":"save_draft","ok":true}]'),
  ('planreview:1', 'planreview', -2, '08:30', pg_temp.nb_remi_email(), 'strategy', null,
   'Review our strategic plan for the quarterly review.', 18740, 1105, 19600, 'success', null,
   '[{"name":"get_strategy_coherence","ok":true},{"name":"get_strategy_plan","ok":true},{"name":"get_finance_snapshot","ok":true},{"name":"save_draft","ok":true}]'),
  ('sugg:board', null, -3, '07:30', pg_temp.nb_remi_email(), 'fab', null,
   'What should I do next on board giving?', 7210, 264, 5300, 'success', null,
   '[{"name":"get_fundraising_forecast","ok":true},{"name":"propose_next_best_action","ok":true}]'),
  ('sugg:extract', null, -6, '10:20', 'tasha@northbridge.example', 'fab', null,
   'Read the Eastshore WDB contract and tell me what deadlines it creates.', 21480, 540, 11800, 'success', null,
   '[{"name":"list_documents","ok":true},{"name":"read_document","ok":true},{"name":"propose_document_extraction","ok":true}]')
) as a(k, thr, dd, hm, who, surface, ctx, q, tin, tout, ms, st, err, tools)
on conflict do nothing;

-- 3b. Threads (title = first 60 chars of the first question, as /api/reed/ask does)
insert into public.reed_threads (id, org_id, created_by, surface, context_ref, title, created_at, updated_at)
select pg_temp.nb_id('reedthread:' || t.k), pg_temp.nb_org(), pg_temp.nb_remi_email(), t.surface, null,
       left(t.q, 60), pg_temp.ts(t.dd, t.hm), pg_temp.ts(t.dd, t.hm)
from (values
  ('lybunt',   'fab',            -16, '09:10', 'Which LYBUNT donors should I call this week?'),
  ('runway',   'v2-edge',        -14, '16:30', 'What''s our runway if Meridian says no?'),
  ('hollis',   'fab',            -11, '10:15', 'Where does the Hollis interim report stand?'),
  ('goldberg', 'v2-mobile-plus',  -4, '08:40', 'Draft a thank-you to Aaron Goldberg'),
  ('sequoia',  'fab',             -2, '14:00', 'Help me prep for the Sequoia Trust intro.'),
  ('edreport', 'fab',             -1, '15:30', 'Draft the ED report section for the board packet.'),
  ('planreview', 'strategy',      -2, '08:30', 'Review our strategic plan for the quarterly review.')
) as t(k, surface, dd, hm, q)
on conflict do nothing;

-- 3c. The turns (user question one second before the answer it produced)
insert into public.reed_messages (id, thread_id, org_id, role, content, activity_log_id, created_at)
select pg_temp.nb_id('reedmsg:' || m.k || ':' || m.role), pg_temp.nb_id('reedthread:' || split_part(m.k, ':', 1)),
       pg_temp.nb_org(), m.role, m.content,
       case when m.role = 'assistant' then pg_temp.nb_id('reedlog:' || m.k) end,
       pg_temp.ts(m.dd, m.hm) + case when m.role = 'assistant' then interval '9 seconds' else interval '0' end
from (values
  ('lybunt:1', 'user', -16, '09:10', 'Which LYBUNT donors should I call this week?'),
  ('lybunt:1', 'assistant', -16, '09:10',
   'Four donors gave last fiscal year and haven''t given yet this year. Ranked by last year''s giving:' || E'\n\n' ||
   '1. Nnamdi Okafor: $25,000. He prefers a call over email, and his $25,000 renewal is open in the pipeline at Needs Appointment, so the call is the next step.' || E'\n' ||
   '2. Ricardo and Elena Alvarez: $15,000, their gala table. Elena mentors in Mentor Circles, which gives you an easy opener.' || E'\n' ||
   '3. Sarah Bell: $10,000. She gives every December after the year-end letter, so I''d let the letter do the work and add a handwritten note.' || E'\n' ||
   '4. Victor Ramos (board): gave last year, nothing yet this year. He and Ravi Patel are the two board members who haven''t given this fiscal year (7 of 9 have).' || E'\n\n' ||
   'I''d call Okafor and the Alvarezes this week and save Victor for a board-giving conversation. Want me to put the Okafor call forward as a next action?'),
  ('lybunt:2', 'user', -16, '09:13', 'Yes, add the Okafor call.'),
  ('lybunt:2', 'assistant', -16, '09:13',
   'Done. I proposed it as a fundraising next action in your Reed inbox: call Nnamdi Okafor to invite his renewal. Accepting it records the decision; scheduling the call stays with you.'),
  ('runway:1', 'user', -14, '16:30', 'What''s our runway if Meridian says no?'),
  ('runway:1', 'assistant', -14, '16:30',
   'Runway doesn''t change if Meridian says no. Today''s 5.5 months comes from $1.55M in cash against about $280K a month in burn, and the Meridian request isn''t counted as committed revenue.' || E'\n\n' ||
   'What a no changes is the plan. The $300K over two years is earmarked for the San Leandro site, so that expansion would wait for another funder. The board''s 6-month reserve target is about $130K away at current burn; the clearest paths to it are the Hollis second installment ($75K, expected after the interim report) and the next Kinetic Labs installment ($25K).' || E'\n\n' ||
   'Want me to sketch San Leandro without Meridian?'),
  ('runway:2', 'user', -14, '16:34', 'Yes. What would San Leandro look like without it?'),
  ('runway:2', 'assistant', -14, '16:34',
   'Without Meridian, San Leandro needs about $150K a year from other sources to open next school year. Two open opportunities fit: Sequoia Trust for Education ($100K, intro meeting on the calendar) and Alder & Finch Foundation ($50K, still at Identified). Together they would cover year one if both close, but neither is past a first meeting.' || E'\n\n' ||
   'The realistic fallback is a one-school pilot with district cost-sharing, which the San Leandro partner record already describes as a pilot. I''d keep the full expansion tied to Meridian and plan the pilot as the no-case.'),
  ('runway:3', 'user', -14, '16:38', 'What should we add to the plan in case Meridian says no?'),
  ('runway:3', 'assistant', -14, '16:38',
   'I checked the plan first. The reserves goal already has a months-of-reserve KPI and three initiatives, but every San Leandro initiative assumes the Meridian grant lands, and the Durable objective''s 15% cap on any one funder has no measure behind it.' || E'\n\n' ||
   'So I proposed two elements, both in your Reed inbox under Strategy proposals: an initiative under "Open a fourth Launchpad site in San Leandro" to plan a one-school pilot with district cost-sharing if Meridian declines, and a KPI under "Diversify revenue so no funder is more than 15%" that tracks the largest single funder''s share of revenue each quarter. Your plan doesn''t change until you accept.'),
  ('hollis:1', 'user', -11, '10:15', 'Where does the Hollis interim report stand?'),
  ('hollis:1', 'assistant', -11, '10:15',
   'The Hollis interim report is due in 23 days, and Lena Park owns it. It covers the first half of the $150,000 Pathways grant: installment 1 ($75,000) is in, and installment 2 ($75,000) is expected about seven weeks out, after Hollis reviews this report.' || E'\n\n' ||
   'The requirement asks for fellowship outcomes by track, two participant stories, and a budget-to-actual for the restricted fund. Lena''s outline is drafted. The open pieces are the outcome numbers from Ben and the two stories; Amara''s story is already cleared for use.'),
  ('goldberg:1', 'user', -4, '08:40', 'Draft a thank-you to Aaron Goldberg'),
  ('goldberg:1', 'assistant', -4, '08:40',
   'Saved a thank-you letter to Aaron Goldberg in your Reed inbox under Drafts to review. It thanks him for the $20,000 he recommended through Bay Legacy Giving Fund, ties it to Launchpad, and notes that the formal receipt goes to the fund. Nothing was sent.' || E'\n\n' ||
   'His gift arrived 5 days ago and is flagged as a major-gift escalation, so a call from you before the letter goes out would land well.'),
  ('sequoia:1', 'user', -2, '14:00', 'Help me prep for the Sequoia Trust intro.'),
  ('sequoia:1', 'assistant', -2, '14:00',
   'Here''s your brief for Sequoia Trust for Education:' || E'\n\n' ||
   '- Who: Arthur Feld, Executive Director. Sequoia is a new prospect and the intro is in 5 days.' || E'\n' ||
   '- Opportunity: sized at $100,000.' || E'\n' ||
   '- History: none yet. There''s no giving or prior conversation on file beyond setting up this meeting.' || E'\n' ||
   '- What to bring: Launchpad''s 86% attendance across three school sites, Pathways placement results for Cohort 6, and the San Leandro expansion plan.' || E'\n' ||
   '- What to learn: their priorities, typical grant size, and whether they fund multi-year.' || E'\n\n' ||
   'Your prep task is due in 4 days. I can save this as a one-page brief if you want it on paper.'),
  ('edreport:1', 'user', -1, '15:30', 'Draft the ED report section for the board packet.'),
  ('edreport:1', 'assistant', -1, '15:30',
   'Saved a draft ED report section in your Reed inbox. It covers cash and runway (5.5 months against the board''s 6-month target), the audit, the Meridian decision timeline, the Year-End launch, Launchpad attendance including the Laurel Ridge fix, and Cohort 8 recruiting, and it ends with two asks of the board.' || E'\n\n' ||
   'The packet is due in 18 days. Check the cash figure against the quarter close before it goes in.'),
  ('planreview:1', 'user', -2, '08:30', 'Review our strategic plan for the quarterly review.'),
  ('planreview:1', 'assistant', -2, '08:30',
   'Structurally the plan is sound: four objectives, twelve goals, and every goal has at least one KPI and one initiative. The one finding is a missing measure: the Durable objective commits to no single funder above 15% of revenue, and nothing tracks it.' || E'\n\n' ||
   'On the numbers: Cohort 6 placement is 78% at 90 days against 80%, the starting wage is $24.50 against $25, Launchpad attendance is 86% overall with Laurel Ridge at 79%, and reserves are 5.5 months against 6. Reserves and Laurel are the two at-risk lines.' || E'\n\n' ||
   'I saved a draft review in your Reed inbox with three decisions for the meeting. It is a draft; nothing in the plan changed.')
) as m(k, role, dd, hm, content)
on conflict do nothing;

-- 3d. Drafts. "Drafts to review" = drafted (3, incl. one from Capture);
--     "Approved: ready to send / use" = approved (3). The approved
--     report_narrative also fills the Reed narrative slot on Finance → Reports
--     and Impact → Reports (draft mode).
insert into public.reed_drafts (id, org_id, kind, title, body, context_ref, status, created_by, model_used, source_activity_id, created_at, updated_at)
select pg_temp.nb_id('reeddraft:' || d.k), pg_temp.nb_org(), d.kind, d.title, d.body, d.ctx, d.st, d.who,
       'claude-sonnet-4-6', case when d.log is null then null else pg_temp.nb_id('reedlog:' || d.log) end,
       pg_temp.ts(d.dd, d.hm), pg_temp.ts(d.ud, d.uh)
from (values
  ('goldberg_thanks', 'acknowledgment', 'Thank-you letter to Aaron Goldberg', 'drafted', pg_temp.nb_remi_email(), 'goldberg:1',
   -4, '08:40', -4, '08:40', null::jsonb,
   'Dear Aaron,' || E'\n\n' ||
   'Thank you for your gift of $20,000, recommended through your fund at Bay Legacy Giving Fund. It arrived as our Launchpad students were settling into the school year, and it goes straight to work: tutoring blocks, mock interviews, and the paid summer jobs that follow for so many of them.' || E'\n\n' ||
   'You once told us you care most about the kids nobody else calls back. That is exactly who Launchpad is for. This year we are working with about 120 students at three Oakland high schools, and attendance is holding at 86% across our sites.' || E'\n\n' ||
   'Bay Legacy will receive our formal acknowledgment for its records. This letter is simply from us to you: thank you for being someone our students can count on.' || E'\n\n' ||
   'With gratitude,' || E'\n' || 'Remi Sobomehin' || E'\n' || 'Executive Director, Northbridge Youth Alliance'),
  ('ed_report', 'board_update', 'ED report: board packet section', 'drafted', pg_temp.nb_remi_email(), 'edreport:1',
   -1, '15:30', -1, '15:30', null,
   'Executive Director''s Report' || E'\n\n' ||
   'Finances. We closed the ' || pg_temp.nb85_ord(((pg_temp.nb85_fyq(pg_temp.d(0)) + 2) % 4) + 1) || ' quarter with $1.55M in cash, about 5.5 months of operating expenses at our current burn of roughly $280K a month. That is close to, but not yet at, the board''s 6-month reserve goal. About 68% of this year''s revenue goal is received or committed.' || E'\n\n' ||
   'Audit. Fieldwork for the FY' || (pg_temp.fy() - 1) || ' audit is underway with no issues raised to date. Draft financial statements are expected before this meeting.' || E'\n\n' ||
   'Fundraising. Our largest pending request is a $300K, two-year proposal to the Meridian Foundation for Youth Opportunity, with a decision expected in about five weeks; it would fund the San Leandro expansion. The Year-End campaign opens in two weeks with a $400K goal.' || E'\n\n' ||
   'Programs. Launchpad attendance is 86% across three sites. Laurel Ridge dipped after a bell-schedule change; moving our start time to 3:45 has brought it back to 85%. Pathways Cohort 7 is on track, and Cohort 8 has about 40 applications in review.' || E'\n\n' ||
   'Asks of the board. Complete your board gift for the year if you haven''t yet, and bring one introduction for the Year-End campaign.'),
  ('hollis_narrative', 'grant_narrative', 'Hollis interim report: Pathways narrative', 'approved', 'lena@northbridge.example', 'hollisnarr:1',
   -6, '14:00', -5, '10:20', null,
   'Pathways Fellowship, interim narrative' || E'\n\n' ||
   'With the Hollis Family Foundation''s support, Pathways Cohort 7 began with 36 fellows across three tracks: IT support (14), healthcare (12), and the building trades (10). Thirty-four are on track at the midpoint. Two healthcare fellows are completing make-up hours before their clinical rotations at Harbor Health Partners.' || E'\n\n' ||
   'Cohort 6, which graduated in June, shows what the fellowship makes possible. Amara Johnson earned her CompTIA A+ certification and was hired as an IT help-desk technician at Kinetic Labs at $28 an hour. Keisha Brown, now in Cohort 7''s healthcare track, sits her CNA exam next month after a clinical rotation at Harbor Health.' || E'\n\n' ||
   'Hollis funds are held in our restricted Pathways Fellowship Fund and spent only on fellowship costs: coaching, certification fees, and stipends.'),
  ('q1_report_narrative', 'report_narrative', pg_temp.nb85_lastq() || ' funder update: narrative', 'approved', 'lena@northbridge.example', 'q1narr:1',
   -8, '16:10', -7, '09:00', null,
   'Northbridge closed the ' || lower(pg_temp.nb85_ord(((pg_temp.nb85_fyq(pg_temp.d(0)) + 2) % 4) + 1)) || ' quarter on plan.' || E'\n\n' ||
   'Careers. Pathways Cohort 6 reached 78% employment at 90 days (25 of 32 graduates), with an average starting wage of $24.50 an hour and two more offers pending. Amara Johnson, now an IT help-desk technician at Kinetic Labs, is one of them.' || E'\n\n' ||
   'Summer Works. 85 young people completed seven-week paid internships with 22 employers, and most supervisors have asked to host again next summer.' || E'\n\n' ||
   'Launchpad. The school year opened at three high schools with 86% attendance overall. Laurel Ridge dipped to 79% after a new bell schedule pushed dismissal later than our start. With the school we moved the start to 3:45 and added a snack table, and the two weeks since have run at 85%.' || E'\n\n' ||
   'Finances. We hold $1.55M in cash, about 5.5 months of operating expenses against the board''s six-month reserve goal, and about 68% of this year''s revenue goal is received or committed.' || E'\n\n' ||
   'Looking ahead. Cohort 8 recruiting has drawn about 40 applications, and our San Leandro site is in planning for next school year.'),
  ('plan_review', 'strategy_review', 'Quarterly plan review: FY' || pg_temp.fy() || ' Q' || pg_temp.nb85_fyq(pg_temp.d(0)), 'drafted', pg_temp.nb_remi_email(), 'planreview:1',
   -2, '08:30', -2, '08:30', null,
   'Structure. Four objectives and twelve goals. Every goal has at least one KPI and at least one initiative, so the plan hangs together. One gap: the Durable objective names a 15% ceiling on any single funder, but no KPI measures it.' || E'\n\n' ||
   'On track. Reach: Launchpad attendance is 86% network-wide and youth served is ahead of last year''s pace. Careers: Cohort 6 placement is 78% at 90 days against an 80% target, with two offers pending; the average starting wage is $24.50 against a $25 target.' || E'\n\n' ||
   'At risk. Laurel Ridge attendance (79% against 85%) after the bell-schedule change; the 3:45 start and snack table are two weeks in and running at 85%. Reserves: 5.5 months against 6. The path to six assumes the Meridian decision and the state award land on schedule.' || E'\n\n' ||
   'Decisions for the review. (1) Keep the Reach override at on track until the next review shows whether Laurel holds. (2) Accept or reject a funder-concentration KPI. (3) Decide whether to plan a one-school San Leandro pilot now, in case Meridian declines.'),
  ('strategy_review_old', 'strategy_review', 'Strategy review: plan coherence', 'discarded', pg_temp.nb_remi_email(), null,
   -31, '13:00', -30, '09:00', null,
   'Two goals have no KPI yet, and the reserve objective has no initiative under it. Recommend adding a months-of-reserve KPI and a fundraising initiative before the next review.')
) as d(k, kind, title, st, who, log, dd, hm, ud, uh, ctx, body)
on conflict do nothing;

-- 3e. Suggestions: six open (Reed inbox → Suggested next actions), three decided.
insert into public.reed_suggestions
  (id, org_id, domain, title, rationale, priority, target_type, target_id, status, decided_by, decided_at,
   created_by, source_activity_id, payload, created_at, updated_at)
select pg_temp.nb_id('reedsug:' || s.k), pg_temp.nb_org(), s.dom, s.title, s.why, s.pri, s.tt,
       case when s.tk is null then null else pg_temp.nb_id(s.tk)::text end,
       s.st, s.dec_by, case when s.dec_d is null then null else pg_temp.ts(s.dec_d, '10:00') end,
       s.who, case when s.log is null then null else pg_temp.nb_id('reedlog:' || s.log) end,
       s.payload, pg_temp.ts(s.dd, s.hm), pg_temp.ts(coalesce(s.dec_d, s.dd), s.hm)
from (values
  ('goldberg_today', 'fundraising', 'high', 'Send Aaron Goldberg''s thank-you today',
   'His $20,000 gift through Bay Legacy Giving Fund arrived 8 days ago and is still unacknowledged. It''s flagged as a major-gift escalation and your thank-you task is past due. The letter is drafted and waiting in Drafts to review.',
   'gift', 'gift:goldberg_daf', 'suggested', null::text, null::int, pg_temp.nb_remi_email(), null::text, null::jsonb, -1, '06:40'),
  ('david_family', 'program', 'high', 'Reach David Tran''s family before his attendance slips further',
   'David has missed 6 of his last 10 Launchpad sessions at Laurel Ridge since starting an evening job. Rosa''s check-in is due tomorrow; a schedule change (tutoring at 3:30) may keep him in the program.',
   'student', 'student:david', 'suggested', null, null, pg_temp.nb_remi_email(), null, null, -2, '07:15'),
  ('board_giving', 'board', 'medium', 'Ask Victor Ramos and Ravi Patel for their board gifts before the meeting',
   'Seven of nine board members have given this fiscal year. The board meets in 27 days, and a 100% board giving line strengthens the Meridian and Sequoia conversations.',
   'board_meeting', 'boardmtg:next', 'suggested', null, null, pg_temp.nb_remi_email(), 'sugg:board', null, -3, '07:30'),
  ('eastshore_invoice', 'finance', 'medium', 'Confirm Eastshore WDB has the Q' || (((pg_temp.nb85_fyq(pg_temp.d(0)) + 2) % 4) + 1)::text || ' invoice in its payment queue',
   'The $105,000 Q' || (((pg_temp.nb85_fyq(pg_temp.d(0)) + 2) % 4) + 1)::text || ' reimbursement invoice went in 7 days ago under the cost-reimbursement contract, and payment is expected in about 35 days. It''s the largest receivable ahead of the Hollis second installment.',
   'grant', 'grant:workforce_contract', 'suggested', null, null, pg_temp.nb_remi_email(), null, null, -5, '08:20'),
  ('form_990', 'compliance', 'low', 'Confirm the Form 990 extension is on file',
   'The FY' || (pg_temp.fy() - 1) || ' audit is still in fieldwork, so the 990 will likely go on extension. Kwame owns the filing; confirm Form 8868 is submitted before the original deadline.',
   'compliance_item', null, 'suggested', null, null, pg_temp.nb_remi_email(), null, null, -7, '09:05'),
  -- the typed extraction (Accept & apply creates the task, linked to the contract document)
  ('eastshore_q_invoice', 'ops', 'medium',
   'Submit the Q' || pg_temp.nb85_fyq(pg_temp.d(0))::text || ' reimbursement invoice to Eastshore WDB',
   'From the Eastshore Workforce Development Board contract: quarterly invoices are due within 15 days of each quarter''s close, with timesheets and the participant roster attached. Accepting creates a task linked to the contract; nothing else changes.',
   'document', 'doc:workforce_contract', 'suggested', null, null, 'tasha@northbridge.example', 'sugg:extract',
   jsonb_build_object(
     'kind', 'obligation_task',
     'document_id', pg_temp.nb_id('doc:workforce_contract'),
     'title', 'Submit the Q' || pg_temp.nb85_fyq(pg_temp.d(0))::text || ' reimbursement invoice to Eastshore WDB',
     'due_date', to_char((date_trunc('quarter', pg_temp.d(0)) + interval '3 months 14 days')::date, 'YYYY-MM-DD'),
     'category', 'finance',
     'description', 'Due within 15 days of quarter close. Attach timesheets and the participant roster.'),
   -6, '10:20'),
  -- decided history (not shown on the page)
  ('okafor_call', 'fundraising', 'high', 'Call Nnamdi Okafor to invite his renewal',
   'Gave $25,000 last fiscal year and nothing yet this year. He prefers a call, and the $25,000 renewal is open at Needs Appointment.',
   'constituent', 'con:okafor', 'accepted', pg_temp.nb_remi_email(), -15, pg_temp.nb_remi_email(), 'lybunt:2', null, -16, '09:13'),
  ('laurel_view', 'program', 'medium', 'Add a by-site view to the Launchpad attendance dashboard',
   'Attendance is reported as one number across three sites, which hides site-level dips like Laurel Ridge.',
   null, null, 'accepted', pg_temp.nb_remi_email(), -12, pg_temp.nb_remi_email(), null, null, -13, '08:00'),
  ('retreat_move', 'ops', 'low', 'Move the board retreat a week later',
   'Two board members have conflicts on the current date.',
   null, null, 'dismissed', pg_temp.nb_remi_email(), -18, pg_temp.nb_remi_email(), null, null, -19, '15:00')
) as s(k, dom, pri, title, why, tt, tk, st, dec_by, dec_d, who, log, payload, dd, hm)
on conflict do nothing;

-- 3f. Strategy proposals (Reed inbox → Strategy proposals): two genuine gaps
--     in Section 6's plan, laddered to its real goals (pgoal:sanleandro,
--     pgoal:diversify), so Accept applies straight into plan_initiatives /
--     plan_kpis. Plus one dismissed proposal for history.
insert into public.reed_plan_proposals
  (id, org_id, proposed_type, parent_ref, payload, rationale, status, created_by, decided_by, decided_at, source_activity_id, created_at, updated_at)
select pg_temp.nb_id('reedprop:' || p.k), pg_temp.nb_org(), p.typ, p.parent, p.payload, p.why, p.st,
       pg_temp.nb_remi_email(), p.dec_by, case when p.dec_d is null then null else pg_temp.ts(p.dec_d, '11:00') end,
       case when p.log is null then null else pg_temp.nb_id('reedlog:' || p.log) end,
       pg_temp.ts(p.dd, p.hm), pg_temp.ts(coalesce(p.dec_d, p.dd), p.hm)
from (values
  ('sanleandro_pilot', 'initiative', jsonb_build_object('type', 'goal', 'id', pg_temp.nb_id('pgoal:sanleandro')),
   jsonb_build_object('title', 'Plan a one-school San Leandro pilot in case Meridian declines', 'owner', 'Miguel Arreola'),
   'All four San Leandro initiatives assume the $300K Meridian grant. A one-school pilot with district cost-sharing, sized at one cohort of 40, keeps the expansion moving if the answer is no. The partner record already describes San Leandro as a pilot.',
   'proposed', null::text, null::int, 'runway:3', -14, '16:38'),
  ('funder_share_kpi', 'kpi', jsonb_build_object('type', 'goal', 'id', pg_temp.nb_id('pgoal:diversify')),
   jsonb_build_object('title', 'Largest single funder''s share of revenue', 'unit', '%', 'target', 15, 'cadence', 'quarterly',
                      'owner', 'Priya Natarajan', 'source', 'Finance: revenue by source, fiscal year to date'),
   'The Durable objective commits to no single funder above 15% of revenue, but no KPI measures it. The Eastshore contract and Bayview''s grant are the two largest sources, so this is worth watching each quarter.',
   'proposed', null, null, 'runway:3', -14, '16:38'),
  ('alumni_objective_old', 'objective', null::jsonb,
   jsonb_build_object('title', 'Build a youth alumni network', 'owner', 'Ben Okoro'),
   'Alumni show up in two goals but have no objective of their own.',
   'dismissed', pg_temp.nb_remi_email(), -38, null, -40, '10:00')
) as p(k, typ, parent, payload, why, st, dec_by, dec_d, log, dd, hm)
on conflict do nothing;

-- 3g. Next moves on donor profiles (NextMovePanel shows the latest 'suggested').
insert into public.reed_next_moves
  (id, org_id, entity_type, entity_id, action, rationale, channel, due_in_days, email_subject, email_body,
   model_used, cost_usd, generated_by, status, created_at, decided_at, decided_by)
select pg_temp.nb_id('nextmove:' || n.k), pg_temp.nb_org(), 'constituent', pg_temp.nb_id(n.ent), n.action, n.why,
       n.ch, n.due, n.subj, n.body, 'claude-opus-4-8', n.cost, n.by, n.st, pg_temp.ts(n.dd, n.hm),
       case when n.dec_d is null then null else pg_temp.ts(n.dec_d, '12:00') end,
       case when n.dec_d is null then null else n.by end
from (values
  ('okafor', 'con:okafor', 'Call Nnamdi Okafor this morning to invite his renewal',
   'Gave $25,000 last fiscal year and nothing yet this year (LYBUNT). His assistant said mornings work best and that he wants the Summer Works results before deciding, so send the recap first, then call.',
   'call', 0, 'Summer Works results, before we talk',
   'Hi Nnamdi,' || E'\n\n' || 'Ifeoma mentioned you''d like to see how Summer Works went before we talk. The short version: 85 young people in paid internships at 22 employers, and most of their supervisors asked to host again next summer. The full recap is attached.' || E'\n\n' || 'I''ll give you a call this week. Thank you for everything you''ve done for these kids.' || E'\n\n' || 'Remi',
   0.0412, 'remi', 'suggested', -3, '11:40', null::int),
  ('okafor_old', 'con:okafor', 'Send Nnamdi Okafor a personal note before asking for a meeting',
   'Last gift was 10 months ago and there has been no contact since the gala.',
   'email', 3, 'Thinking of you', 'Hi Nnamdi, I wanted to share a quick update from Summer Works...',
   0.0388, 'priya', 'superseded', -20, '10:00', null),
  ('wu', 'con:wu', 'Confirm the ask meeting and send the healthcare-track one-pager ahead of it',
   'Jennifer toured Pathways, connected with the healthcare track, and research puts her capacity near $100K. The ask meeting is being scheduled now; arriving with the one-pager already in her hands keeps the momentum.',
   'email', 1, 'Looking forward to our conversation',
   'Hi Jennifer,' || E'\n\n' || 'Thank you for making time. Priya and I are looking forward to it. Ahead of our meeting I''ve attached a short overview of the Pathways healthcare track, including where our fellows are doing their clinical rotations and the jobs they move into.' || E'\n\n' || 'See you soon,' || E'\n' || 'Remi',
   0.0451, 'remi', 'suggested', -1, '09:00', null),
  ('goldberg', 'con:goldberg', 'Call Aaron Goldberg to thank him personally, then mail the signed letter',
   'A $20,000 gift through his donor-advised fund arrived 7 days ago with no thank-you yet. He has given for four years and prefers a letter, so a short call followed by the signed letter covers both.',
   'call', 0, null, null, 0.0367, 'remi', 'suggested', -2, '10:00', null),
  ('patel', 'con:bd_patel', 'Invite Ravi Patel to make his first board gift at your onboarding check-in',
   'Ravi joined the board three months ago and hasn''t made a gift yet. Your onboarding check-in is the natural moment, and he''s interested in earned revenue with employers, which Summer Works sponsorships speak to.',
   'meeting', 9, null, null, 0.0329, 'remi', 'suggested', -5, '13:30', null),
  ('bell', 'con:bell', 'Wait for the Year-End letter, then add a handwritten note to Sarah Bell''s copy',
   'Sarah gives $10,000 every December after the year-end letter. A call now would interrupt a pattern that works; a personal note on her letter honors it.',
   'wait', 20, null, null, 0.0291, 'priya', 'suggested', -7, '15:10', null),
  ('chen', 'con:chen_margaret', 'Confirm the timing of the Chens'' next pledge installment',
   'The $50,000 installment for this year is due in about seven weeks, and Margaret said at the site visit that their family foundation board meets in December and may move it forward.',
   'email', 7, 'Thank you, and a quick question on timing',
   'Dear Margaret,' || E'\n\n' || 'Thank you again for coming out to Eastlake. Ben has sent David the outcomes summary. When we spoke you mentioned your foundation board meets in December; would it help if we sent the pledge reminder ahead of that meeting?' || E'\n\n' || 'Warmly,' || E'\n' || 'Remi',
   0.0398, 'remi', 'suggested', -8, '09:30', null),
  ('chen_old', 'con:chen_margaret', 'Invite the Chens to a Launchpad site visit',
   'They haven''t seen the program in person since the pledge began.',
   'email', 5, 'Come see Launchpad', 'Dear Margaret, we''d love to host you and David at Eastlake...',
   0.0402, 'priya', 'applied', -25, '11:00', -24)
) as n(k, ent, action, why, ch, due, subj, body, cost, by, st, dd, hm, dec_d)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. AI USAGE LEDGER (ai_calls) — Settings → "AI usage this month" sums
--    month-to-date by surface. Mirrors the Reed asks, the capture parses, the
--    next-move runs, plus the other agents' runs.
-- ════════════════════════════════════════════════════════════════════════════
-- Reed asks (the app mirrors successful asks only)
insert into public.ai_calls (id, org_id, created_at, surface, triggered_by, model_used, tokens_input, tokens_output, cost_usd, status, metadata)
select pg_temp.nb_id('aicall:reedlog:' || l.id::text), l.org_id, l.created_at + interval '9 seconds', 'reed', l.triggered_by,
       l.model_used, l.tokens_input, l.tokens_output, l.cost_usd, l.status,
       case when l.thread_id is null then '{}'::jsonb else jsonb_build_object('thread_id', l.thread_id) end
from public.reed_activity_log l
where l.org_id = pg_temp.nb_org() and l.status <> 'failed'
on conflict do nothing;

-- Next-move runs (Opus): tokens back-solved from the stored cost at $5/$25 per M.
insert into public.ai_calls (id, org_id, created_at, surface, triggered_by, model_used, tokens_input, tokens_output, cost_usd, status, metadata)
select pg_temp.nb_id('aicall:nextmove:' || n.id::text), n.org_id, n.created_at - interval '6 seconds', 'next_move', n.generated_by,
       n.model_used, greatest(0, round((n.cost_usd * 1000000 - 700 * 25) / 5))::int, 700, n.cost_usd, 'success',
       jsonb_build_object('entity_type', n.entity_type)
from public.reed_next_moves n
where n.org_id = pg_temp.nb_org()
on conflict do nothing;

-- Capture parses (Sonnet) and the other agents
insert into public.ai_calls (id, org_id, created_at, surface, triggered_by, model_used, tokens_input, tokens_output, cost_usd, status, metadata)
select pg_temp.nb_id('aicall:' || a.k), pg_temp.nb_org(), pg_temp.ts(a.dd, a.hm), a.surface, a.who, a.model, a.tin, a.tout,
       round(((a.tin * case when a.model like 'claude-opus%' then 5 else 3 end
             + a.tout * case when a.model like 'claude-opus%' then 25 else 15 end) / 1000000.0)::numeric, 6),
       'success', a.meta
from (values
  ('capture:chen',     -12, '15:40', 'capture', 'remi', 'claude-sonnet-4-6', 2940, 712, jsonb_build_object('capture_id', pg_temp.nb_id('capture:chen'), 'card_count', 4, 'youth_skipped', 0, 'dropped', '[]'::jsonb, 'spans', 6, 'candidates', 5)),
  ('capture:laurel',   -16, '16:16', 'capture', 'remi', 'claude-sonnet-4-6', 2210, 418, jsonb_build_object('capture_id', pg_temp.nb_id('capture:laurel'), 'card_count', 2, 'youth_skipped', 0, 'dropped', '[]'::jsonb, 'spans', 3, 'candidates', 3)),
  ('capture:kinetic',   -5, '13:11', 'capture', 'remi', 'claude-sonnet-4-6', 2780, 655, jsonb_build_object('capture_id', pg_temp.nb_id('capture:kinetic'), 'card_count', 4, 'youth_skipped', 0, 'dropped', '[]'::jsonb, 'spans', 5, 'candidates', 4)),
  ('capture:okafor',    -3, '11:20', 'capture', 'remi', 'claude-sonnet-4-6', 2460, 590, jsonb_build_object('capture_id', pg_temp.nb_id('capture:okafor'), 'card_count', 3, 'youth_skipped', 0, 'dropped', '[]'::jsonb, 'spans', 2, 'candidates', 2)),
  ('capture:bayshore',  -1, '18:20', 'capture', 'remi', 'claude-sonnet-4-6', 2690, 604, jsonb_build_object('capture_id', pg_temp.nb_id('capture:bayshore'), 'card_count', 3, 'youth_skipped', 0, 'dropped', '[]'::jsonb, 'spans', 5, 'candidates', 6)),
  ('capture:osei',       0, '07:05', 'capture', 'remi', 'claude-sonnet-4-6', 2830, 688, jsonb_build_object('capture_id', pg_temp.nb_id('capture:osei'), 'card_count', 4, 'youth_skipped', 0, 'dropped', '[]'::jsonb, 'spans', 4, 'candidates', 4)),
  ('research:wu',      -24, '14:02', 'funder_research', 'priya', 'claude-opus-4-8', 48200, 6150, '{"entity":"prospect"}'::jsonb),
  ('research:sequoia', -33, '10:30', 'funder_research', 'priya', 'claude-opus-4-8', 51900, 5820, '{"entity":"prospect"}'::jsonb),
  ('coach:meridian',   -26, '15:45', 'grant_coach', 'lena', 'claude-sonnet-4-6', 18400, 2210, '{"mode":"scorecard"}'::jsonb),
  ('coach:meridian2',  -25, '09:20', 'grant_coach', 'lena', 'claude-sonnet-4-6', 19100, 1980, '{"mode":"defend"}'::jsonb),
  ('coach:cypress',     -2, '11:05', 'grant_coach', 'lena', 'claude-sonnet-4-6', 12600, 1740, '{"mode":"scorecard"}'::jsonb),
  ('nba:pipeline1',    -15, '08:30', 'next_best_action', 'priya', 'claude-opus-4-8', 9800, 1150, '{}'::jsonb),
  ('nba:pipeline2',     -6, '08:35', 'next_best_action', 'priya', 'claude-opus-4-8', 10400, 1220, '{}'::jsonb),
  ('discover:fall',    -41, '13:00', 'prospect_discovery', 'priya', 'claude-opus-4-8', 36500, 4400, '{}'::jsonb),
  ('angles:workforce', -19, '16:20', 'strategy_angle_draft', 'remi', 'claude-sonnet-4-6', 8800, 1350, '{}'::jsonb)
) as a(k, dd, hm, surface, who, model, tin, tout, meta)
on conflict do nothing;

-- Teammates' everyday usage over the last ~60 days (grant coach, pipeline
-- next actions, captures from their own phones; their captures are personal,
-- so Remi never sees those rows, only the spend). Deterministic via rnd().
insert into public.ai_calls (id, org_id, created_at, surface, triggered_by, model_used, tokens_input, tokens_output, cost_usd, status, metadata)
select pg_temp.nb_id('aicall:bulk:' || g.i), pg_temp.nb_org(),
       pg_temp.ts(-1 - floor(pg_temp.rnd('ai:d:' || g.i) * 60)::int,
                  lpad((8 + floor(pg_temp.rnd('ai:h:' || g.i) * 9))::int::text, 2, '0') || ':' ||
                  lpad(floor(pg_temp.rnd('ai:m:' || g.i) * 60)::int::text, 2, '0')),
       x.surface, x.who, x.model, x.tin, x.tout,
       round(((x.tin * case when x.model like 'claude-opus%' then 5 else 3 end
             + x.tout * case when x.model like 'claude-opus%' then 25 else 15 end) / 1000000.0)::numeric, 6),
       case when pg_temp.rnd('ai:fail:' || g.i) < 0.03 then 'partial' else 'success' end,
       case when x.surface = 'capture' then jsonb_build_object('card_count', 1 + floor(pg_temp.rnd('ai:cards:' || g.i) * 4)::int, 'youth_skipped', 0)
            else '{}'::jsonb end
from generate_series(1, 64) as g(i)
cross join lateral (
  select s.surface, s.who, s.model,
         (s.tin_lo + floor(pg_temp.rnd('ai:tin:' || g.i) * s.tin_span))::int as tin,
         (s.tout_lo + floor(pg_temp.rnd('ai:tout:' || g.i) * s.tout_span))::int as tout
  from (values
    (0, 'grant_coach',      'lena',   'claude-sonnet-4-6', 11000, 9000, 1400, 1200),
    (1, 'grant_coach',      'priya',  'claude-sonnet-4-6', 11000, 9000, 1400, 1200),
    (2, 'next_best_action', 'priya',  'claude-opus-4-8',    8000, 4000,  900,  500),
    (3, 'capture',          'priya',  'claude-sonnet-4-6',  2200, 1000,  400,  350),
    (4, 'capture',          'jordan', 'claude-sonnet-4-6',  2000,  900,  350,  300),
    (5, 'capture',          'miguel', 'claude-sonnet-4-6',  2100, 1000,  380,  320),
    (6, 'strategy_angle_draft', 'priya', 'claude-sonnet-4-6', 7000, 3000, 1100, 600),
    (7, 'funder_research',  'lena',   'claude-opus-4-8',   42000, 14000, 5000, 1800)
  ) as s(n, surface, who, model, tin_lo, tin_span, tout_lo, tout_span)
  where s.n = case when g.i % 16 = 0 then 7 else floor(pg_temp.rnd('ai:s:' || g.i) * 7)::int end
) x
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. CAPTURE — four finished recordings whose confirmed cards filed to real
--    records, and two waiting on Remi (Today → Needs you, /admin/capture/[id]).
--    Captures are personal (RLS created_by = auth.uid()), so all are Remi's.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.captures
  (id, org_id, created_by, created_at, updated_at, source_surface, context_type, context_id, transcript,
   duration_seconds, status, parse_error, model_used, ai_call_id, snoozed_until)
select pg_temp.nb_id('capture:' || c.k), pg_temp.nb_org(), pg_temp.nb_remi(), pg_temp.ts(c.dd, c.hm),
       pg_temp.ts(c.ud, c.uh), c.surf, c.ctype, case when c.cid is null then null else pg_temp.nb_id(c.cid) end,
       c.transcript, c.secs, c.st, null, 'claude-sonnet-4-6', pg_temp.nb_id('aicall:capture:' || c.k), null
from (values
  ('chen', -12, '15:39', -12, '15:47', 'mobile_plus', null::text, null::text, 78, 'done',
   'Just walked the Chens through Launchpad at Eastlake. Margaret loved the mock interview stations, and David asked a lot about how we track placement. He wants the Pathways outcomes one-pager, so have Ben send it to him by Friday. Margaret mentioned their family foundation board meets in December and she might bring this year''s installment forward. She also floated putting the family name on the San Leandro site if the expansion happens. Park that one for Priya. And draft a thank-you note to Margaret for coming out.'),
  ('laurel', -16, '16:15', -16, '16:19', 'quick_add', null, null, 52, 'done',
   'Called Jason Whitaker at Laurel Ridge. The new bell schedule pushed dismissal later, so our 3:30 start was losing kids at the bus loop. He''ll give us the library until six. Have Rosa move the Launchpad start to 3:45 and text families by ' || pg_temp.nb85_dow(-14) || '.'),
  ('kinetic', -5, '13:10', -5, '13:14', 'mobile_plus', null, null, 61, 'done',
   'Lunch with Priscilla Gomez at Kinetic. They want to hire two more IT fellows from Cohort 7 in the spring and asked for resumes early next month. She said Amara is doing great on the help desk and they''d love to feature her in their impact report. Andre should send the resumes. And a thought: ask whether Kinetic would co-sponsor the year-end breakfast where Amara speaks. Oh, and log it on Kinetic''s donor record too.'),
  ('okafor', -3, '11:19', -3, '11:23', 'entity_page', 'constituent', 'con:okafor', 34, 'done',
   'Just got off the phone with Nnamdi''s assistant, Ifeoma. He''s back in the office ' || pg_temp.nb85_dow(0) || ' and mornings before ten are best. She said he''d like to see the Summer Works results before he decides on this year. Put a call with Nnamdi on my list for ' || pg_temp.nb85_dow(0) || ', and draft a short note to him with the Summer Works recap so it lands first.'),
  ('bayshore', -1, '18:19', -1, '18:20', 'mobile_plus', null, null, 47, 'ready',
   'Quick one from the Bayshore family night. Chen stopped by and said the outcomes one-pager was exactly what they needed, and they want Launchpad attendance by site before the next installment. Jennifer Wu texted that ' || pg_temp.nb85_dow(4) || ' works for the ask meeting, so draft her a reply. And remind me to ask Theo Brooks to speak with Amara at the year-end breakfast.'),
  ('osei', 0, '07:04', 0, '07:05', 'mobile_plus', null, null, 66, 'ready',
   'Breakfast with Daniel Osei. The bank''s community giving committee meets early in the new year, and he wants our Summer Works renewal in at sixty thousand well before then. Have Priya start the Pacific Summit renewal proposal; let''s aim to have it to him by ' || pg_temp.nb85_md(35) || '. He also said two people on his team want to mentor. And the branch manager wants to know if last summer''s intern can come back next year.')
) as c(k, dd, hm, ud, uh, surf, ctype, cid, secs, st, transcript)
on conflict do nothing;

-- Cards. Candidate rows mirror capture_match_candidates (kind, id, name,
-- org_name, meta, sim). Confirmed cards carry payload.applied_snapshot, as
-- lib/capture/confirm.ts writes it.
with v(cap, pos, dest, st, etype, ekey, heard, conf, cands, body, dec_d, dec_hm, atab, akey, snap) as (values
  -- Chen site visit (done)
  ('chen', 1, 'interaction', 'confirmed', 'constituent', 'con:chen_margaret', 'Margaret', 0.93,
   jsonb_build_array(jsonb_build_object('kind','constituent','id',pg_temp.nb_id('con:chen_margaret'),'name','Margaret Chen','org_name',null,'meta','person · last touch ' || to_char(pg_temp.d(-40),'Mon DD, YYYY'),'sim',0.71)),
   jsonb_build_object('source_sentence','Margaret loved the mock interview stations, and David asked a lot about how we track placement.',
     'kind','meeting','occurred_at',pg_temp.nb85_iso(-12),'entity_name','Margaret Chen',
     'notes','Site visit at Launchpad Eastlake with Margaret and David. Margaret loved the mock interview stations; David asked how we track placement. Their family foundation board meets in December, and Margaret may bring this year''s installment forward.'),
   -12, '15:43', 'interactions', 'interaction:cap_chen', 'interaction'),
  ('chen', 2, 'task', 'confirmed', 'constituent', 'con:chen_david', 'David', 0.88,
   jsonb_build_array(jsonb_build_object('kind','constituent','id',pg_temp.nb_id('con:chen_david'),'name','David Chen','org_name',null,'meta','person · last touch ' || to_char(pg_temp.d(-60),'Mon DD, YYYY'),'sim',0.64)),
   jsonb_build_object('source_sentence','He wants the Pathways outcomes one-pager, so have Ben send it to him by Friday.',
     'title','Send David Chen the Pathways outcomes one-pager','category','fundraising','notes',null,
     'due_date',to_char(pg_temp.d(-12) + coalesce(nullif((12 - extract(isodow from pg_temp.d(-12))::int) % 7, 0), 7),'YYYY-MM-DD'),
     'assignee',jsonb_build_object('handle','ben','user_id',pg_temp.nb_user('ben'),'name','Ben Okoro'),'entity_name','David Chen'),
   -12, '15:44', 'ops_tasks', 'task:cap_chen_onepager', 'task'),
  ('chen', 3, 'thought', 'confirmed', 'constituent', 'con:chen_margaret', 'the Chens', 0.81,
   jsonb_build_array(jsonb_build_object('kind','constituent','id',pg_temp.nb_id('con:chen_margaret'),'name','Margaret Chen','org_name',null,'meta','person · last touch ' || to_char(pg_temp.d(-40),'Mon DD, YYYY'),'sim',0.58)),
   jsonb_build_object('source_sentence','She also floated putting the family name on the San Leandro site if the expansion happens. Park that one for Priya.',
     'text','The Chens floated naming the San Leandro site if the expansion goes ahead. Talk to Priya about a naming opportunity.','label','parking-lot','entity_name','Margaret Chen'),
   -12, '15:44', 'ops_tasks', 'task:cap_chen_naming', 'task'),
  ('chen', 4, 'message_draft', 'confirmed', 'constituent', 'con:chen_margaret', 'Margaret', 0.93,
   jsonb_build_array(jsonb_build_object('kind','constituent','id',pg_temp.nb_id('con:chen_margaret'),'name','Margaret Chen','org_name',null,'meta','person · last touch ' || to_char(pg_temp.d(-40),'Mon DD, YYYY'),'sim',0.71)),
   jsonb_build_object('source_sentence','And draft a thank-you note to Margaret for coming out.',
     'channel','email','subject','Thank you for coming to Eastlake','recipient_name','Margaret Chen','entity_name','Margaret Chen',
     'body','Dear Margaret, thank you and David for spending your afternoon at Eastlake. Watching the two of you talk with our seniors at the mock interview stations was a highlight of my week. Ben will send David the Pathways outcomes summary by Friday. With gratitude, Remi'),
   -12, '15:45', 'reed_drafts', 'reeddraft:cap_chen_thanks', 'draft'),
  -- Laurel Ridge call (done)
  ('laurel', 1, 'interaction', 'confirmed', 'partner', 'partner:laurel', 'Laurel Ridge', 0.95,
   jsonb_build_array(jsonb_build_object('kind','partner','id',pg_temp.nb_id('partner:laurel'),'name','Laurel Ridge High School','org_name',null,'meta','school · Oakland','sim',0.69)),
   jsonb_build_object('source_sentence','The new bell schedule pushed dismissal later, so our 3:30 start was losing kids at the bus loop.',
     'kind','call','occurred_at',pg_temp.nb85_iso(-16),'entity_name','Laurel Ridge High School',
     'notes','Called Jason Whitaker (College & Career Lead). The new bell schedule pushed dismissal later, so the 3:30 start was losing students at the bus loop. The library is ours until 6pm.'),
   -16, '16:18', 'partner_interactions', 'pinteraction:cap_laurel', 'pinteraction'),
  ('laurel', 2, 'task', 'confirmed', 'partner', 'partner:laurel', 'Laurel Ridge', 0.95,
   jsonb_build_array(jsonb_build_object('kind','partner','id',pg_temp.nb_id('partner:laurel'),'name','Laurel Ridge High School','org_name',null,'meta','school · Oakland','sim',0.69)),
   jsonb_build_object('source_sentence','Have Rosa move the Launchpad start to 3:45 and text families by ' || pg_temp.nb85_dow(-14) || '.',
     'title','Move the Laurel Ridge Launchpad start to 3:45 and text families','category','program','notes',null,
     'due_date',pg_temp.nb85_iso(-14),'assignee',jsonb_build_object('handle','rosa','user_id',pg_temp.nb_user('rosa'),'name','Rosa Delgado'),
     'entity_name','Laurel Ridge High School'),
   -16, '16:19', 'ops_tasks', 'task:cap_laurel_start', 'task'),
  -- Kinetic lunch (done; one duplicate discarded)
  ('kinetic', 1, 'interaction', 'confirmed', 'partner', 'partner:kinetic', 'Kinetic', 0.91,
   jsonb_build_array(jsonb_build_object('kind','partner','id',pg_temp.nb_id('partner:kinetic'),'name','Kinetic Labs','org_name',null,'meta','company · Oakland','sim',0.62),
                     jsonb_build_object('kind','constituent','id',pg_temp.nb_id('con:kinetic'),'name','Kinetic Labs','org_name','Kinetic Labs','meta','organization · last touch ' || to_char(pg_temp.d(-30),'Mon DD, YYYY'),'sim',0.62)),
   jsonb_build_object('source_sentence','They want to hire two more IT fellows from Cohort 7 in the spring and asked for resumes early next month.',
     'kind','meeting','occurred_at',pg_temp.nb85_iso(-5),'entity_name','Kinetic Labs',
     'notes','Lunch with Priscilla Gomez. Kinetic wants two more Cohort 7 IT fellows in the spring, with resumes early next month. Amara is thriving on the help desk, and Kinetic would like to feature her in its impact report.'),
   -5, '13:12', 'partner_interactions', 'pinteraction:cap_kinetic', 'pinteraction'),
  ('kinetic', 2, 'task', 'confirmed', 'partner', 'partner:kinetic', 'Kinetic', 0.91,
   jsonb_build_array(jsonb_build_object('kind','partner','id',pg_temp.nb_id('partner:kinetic'),'name','Kinetic Labs','org_name',null,'meta','company · Oakland','sim',0.62)),
   jsonb_build_object('source_sentence','Andre should send the resumes.',
     'title','Send Kinetic Labs resumes for two Cohort 7 IT fellows','category','program','notes','Priscilla Gomez asked for them early next month.',
     'due_date',pg_temp.nb85_iso(10),'assignee',jsonb_build_object('handle','andre','user_id',pg_temp.nb_user('andre'),'name','Andre Mitchell'),
     'entity_name','Kinetic Labs'),
   -5, '13:12', 'ops_tasks', 'task:cap_kinetic_resumes', 'task'),
  ('kinetic', 3, 'thought', 'confirmed', 'partner', 'partner:kinetic', 'Kinetic', 0.91,
   jsonb_build_array(jsonb_build_object('kind','partner','id',pg_temp.nb_id('partner:kinetic'),'name','Kinetic Labs','org_name',null,'meta','company · Oakland','sim',0.62)),
   jsonb_build_object('source_sentence','And a thought: ask whether Kinetic would co-sponsor the year-end breakfast where Amara speaks.',
     'text','Ask Kinetic whether they would co-sponsor the Year-End donor breakfast where Amara speaks.','label','parking-lot','entity_name','Kinetic Labs'),
   -5, '13:13', 'ops_tasks', 'task:cap_kinetic_breakfast', 'task'),
  ('kinetic', 4, 'interaction', 'discarded', 'constituent', 'con:kinetic', 'Kinetic', 0.91,
   jsonb_build_array(jsonb_build_object('kind','constituent','id',pg_temp.nb_id('con:kinetic'),'name','Kinetic Labs','org_name','Kinetic Labs','meta','organization · last touch ' || to_char(pg_temp.d(-30),'Mon DD, YYYY'),'sim',0.62)),
   jsonb_build_object('source_sentence','Oh, and log it on Kinetic''s donor record too.',
     'kind','meeting','occurred_at',pg_temp.nb85_iso(-5),'entity_name','Kinetic Labs',
     'notes','Lunch with Priscilla Gomez about Cohort 7 hiring and featuring Amara.'),
   -5, '13:13', null, null, null),
  -- Okafor's assistant (done; the task became Section 8a's task:okafor_call)
  ('okafor', 1, 'interaction', 'confirmed', 'constituent', 'con:okafor', 'Nnamdi', 0.97,
   jsonb_build_array(jsonb_build_object('kind','constituent','id',pg_temp.nb_id('con:okafor'),'name','Nnamdi Okafor','org_name',null,'meta','person · last touch ' || to_char(pg_temp.d(-120),'Mon DD, YYYY'),'sim',1)),
   jsonb_build_object('source_sentence','Just got off the phone with Nnamdi''s assistant, Ifeoma.',
     'kind','call','occurred_at',pg_temp.nb85_iso(-3),'entity_name','Nnamdi Okafor',
     'notes','Spoke with his assistant, Ifeoma. He is back in the office ' || pg_temp.nb85_dow(0) || '; mornings before 10 are best. He would like the Summer Works results before deciding on this year''s gift.'),
   -3, '11:21', 'interactions', 'interaction:cap_okafor', 'interaction'),
  ('okafor', 2, 'task', 'confirmed', 'constituent', 'con:okafor', 'Nnamdi', 0.97,
   jsonb_build_array(jsonb_build_object('kind','constituent','id',pg_temp.nb_id('con:okafor'),'name','Nnamdi Okafor','org_name',null,'meta','person · last touch ' || to_char(pg_temp.d(-120),'Mon DD, YYYY'),'sim',1)),
   jsonb_build_object('source_sentence','Put a call with Nnamdi on my list for ' || pg_temp.nb85_dow(0) || '.',
     'title','Call Nnamdi Okafor about renewing his support','category','fundraising','notes',null,'due_date',pg_temp.nb85_iso(0),
     'assignee',jsonb_build_object('handle','remi','user_id',pg_temp.nb_remi(),'name','Remi'),'entity_name','Nnamdi Okafor'),
   -3, '11:21', 'ops_tasks', 'task:okafor_call', null),
  ('okafor', 3, 'message_draft', 'confirmed', 'constituent', 'con:okafor', 'Nnamdi', 0.97,
   jsonb_build_array(jsonb_build_object('kind','constituent','id',pg_temp.nb_id('con:okafor'),'name','Nnamdi Okafor','org_name',null,'meta','person · last touch ' || to_char(pg_temp.d(-120),'Mon DD, YYYY'),'sim',1)),
   jsonb_build_object('source_sentence','And draft a short note to him with the Summer Works recap so it lands first.',
     'channel','email','subject','Summer Works, before we talk','recipient_name','Nnamdi Okafor','entity_name','Nnamdi Okafor',
     'body','Hi Nnamdi, Ifeoma mentioned you''d like to see how Summer Works went before we talk. This past summer 85 young people worked paid internships at 22 employers; the recap is attached. I''ll call ' || pg_temp.nb85_dow(0) || ' morning. Remi'),
   -3, '11:22', 'reed_drafts', 'reeddraft:cap_okafor_note', 'draft'),
  -- Bayshore family night (waiting: one held pick + two proposed)
  ('bayshore', 1, 'interaction', 'held', null, null, 'Chen', 0.62,
   jsonb_build_array(jsonb_build_object('kind','constituent','id',pg_temp.nb_id('con:chen_margaret'),'name','Margaret Chen','org_name',null,'meta','person · last touch ' || to_char(pg_temp.d(-12),'Mon DD, YYYY'),'sim',0.62),
                     jsonb_build_object('kind','constituent','id',pg_temp.nb_id('con:chen_david'),'name','David Chen','org_name',null,'meta','person · last touch ' || to_char(pg_temp.d(-12),'Mon DD, YYYY'),'sim',0.62)),
   jsonb_build_object('source_sentence','Chen stopped by and said the outcomes one-pager was exactly what they needed, and they want Launchpad attendance by site before the next installment.',
     'kind','note','occurred_at',pg_temp.nb85_iso(-1),
     'notes','Stopped by Bayshore family night. Said the outcomes one-pager was exactly what they needed; they want Launchpad attendance by site before the next installment.'),
   null, null, null, null, null),
  ('bayshore', 2, 'message_draft', 'proposed', 'constituent', 'con:wu', 'Jennifer Wu', 0.90,
   jsonb_build_array(jsonb_build_object('kind','constituent','id',pg_temp.nb_id('con:wu'),'name','Jennifer Wu','org_name',null,'meta','person · last touch ' || to_char(pg_temp.d(-10),'Mon DD, YYYY'),'sim',1)),
   jsonb_build_object('source_sentence','Jennifer Wu texted that ' || pg_temp.nb85_dow(4) || ' works for the ask meeting, so draft her a reply.',
     'channel','text','subject',null,'recipient_name','Jennifer Wu','entity_name','Jennifer Wu',
     'body','Thank you, Jennifer. ' || pg_temp.nb85_dow(4) || ' works. Priya will send a calendar hold for 10am at our Fruitvale office. Looking forward to it. Remi'),
   null, null, null, null, null),
  ('bayshore', 3, 'task', 'proposed', 'constituent', 'con:bd_brooks', 'Theo Brooks', 0.94,
   jsonb_build_array(jsonb_build_object('kind','constituent','id',pg_temp.nb_id('con:bd_brooks'),'name','Theo Brooks','org_name',null,'meta','person · last touch ' || to_char(pg_temp.d(-30),'Mon DD, YYYY'),'sim',1)),
   jsonb_build_object('source_sentence','And remind me to ask Theo Brooks to speak with Amara at the year-end breakfast.',
     'title','Ask Theo Brooks to speak with Amara at the Year-End donor breakfast','category','fundraising','notes',null,
     'due_date',pg_temp.nb85_iso(3),'assignee',jsonb_build_object('handle','remi','user_id',pg_temp.nb_remi(),'name','Remi'),'entity_name','Theo Brooks'),
   null, null, null, null, null),
  -- Breakfast with Daniel Osei (waiting: four proposed)
  ('osei', 1, 'interaction', 'proposed', 'constituent', 'con:bd_osei', 'Daniel Osei', 0.96,
   jsonb_build_array(jsonb_build_object('kind','constituent','id',pg_temp.nb_id('con:bd_osei'),'name','Daniel Osei','org_name',null,'meta','person · last touch ' || to_char(pg_temp.d(-12),'Mon DD, YYYY'),'sim',1)),
   jsonb_build_object('source_sentence','Breakfast with Daniel Osei.','kind','meeting','occurred_at',pg_temp.nb85_iso(0),'entity_name','Daniel Osei',
     'notes','Breakfast. The bank''s community giving committee meets early in the new year; Daniel wants the Summer Works renewal at $60K well before then. Two people on his team want to mentor.'),
   null, null, null, null, null),
  ('osei', 2, 'task', 'proposed', 'constituent', 'con:pacific_summit', 'Pacific Summit', 0.91,
   jsonb_build_array(jsonb_build_object('kind','constituent','id',pg_temp.nb_id('con:pacific_summit'),'name','Pacific Summit Bank','org_name','Pacific Summit Bank','meta','organization · last touch ' || to_char(pg_temp.d(-12),'Mon DD, YYYY'),'sim',0.74)),
   jsonb_build_object('source_sentence','Have Priya start the Pacific Summit renewal proposal; let''s aim to have it to him by ' || pg_temp.nb85_md(35) || '.',
     'title','Draft the Pacific Summit Bank Summer Works renewal ($60K)','category','fundraising','notes','Daniel Osei wants it well before the bank''s giving committee meets early in the new year.',
     'due_date',pg_temp.nb85_iso(35),'assignee',jsonb_build_object('handle','priya','user_id',pg_temp.nb_user('priya'),'name','Priya Natarajan'),
     'entity_name','Pacific Summit Bank'),
   null, null, null, null, null),
  ('osei', 3, 'thought', 'proposed', 'constituent', 'con:bd_osei', 'Daniel Osei', 0.96,
   jsonb_build_array(jsonb_build_object('kind','constituent','id',pg_temp.nb_id('con:bd_osei'),'name','Daniel Osei','org_name',null,'meta','person · last touch ' || to_char(pg_temp.d(-12),'Mon DD, YYYY'),'sim',1)),
   jsonb_build_object('source_sentence','He also said two people on his team want to mentor.',
     'text','Two people on Daniel Osei''s team want to mentor. Send them the Mentor Circles sign-up.','label','parking-lot','entity_name','Daniel Osei'),
   null, null, null, null, null),
  ('osei', 4, 'thought', 'proposed', null, null, null, null::numeric,
   '[]'::jsonb,
   jsonb_build_object('source_sentence','And the branch manager wants to know if last summer''s intern can come back next year.',
     'text','Pacific Summit''s branch manager wants last summer''s intern back next year. Let Simone know.','label','parking-lot'),
   null, null, null, null, null)
)
insert into public.capture_cards
  (id, org_id, capture_id, created_by, position, dest, payload, entity_type, entity_id, heard_name, match_confidence,
   match_candidates, status, decided_by, decided_at, applied_table, applied_id, created_at, updated_at)
select pg_temp.nb_id('capcard:' || v.cap || ':' || v.pos), pg_temp.nb_org(), pg_temp.nb_id('capture:' || v.cap), pg_temp.nb_remi(),
       v.pos, v.dest,
       v.body || case v.snap
         when 'interaction' then jsonb_build_object('applied_snapshot', jsonb_build_object(
             'constituent_id', pg_temp.nb_id(v.ekey), 'kind', v.body->>'kind',
             'occurred_at', (v.body->>'occurred_at') || 'T12:00:00+00:00', 'notes', v.body->>'notes'))
         when 'pinteraction' then jsonb_build_object('applied_snapshot', jsonb_build_object(
             'partner_id', pg_temp.nb_id(v.ekey), 'kind', v.body->>'kind',
             'occurred_at', (v.body->>'occurred_at') || 'T12:00:00+00:00', 'notes', v.body->>'notes'))
         when 'task' then jsonb_build_object('applied_snapshot', jsonb_build_object(
             'title', coalesce(v.body->>'title', v.body->>'text'),
             'description', case when v.dest = 'task' then v.body->>'notes' end,
             'category', case when v.dest = 'task' then v.body->>'category' else 'other' end,
             'status', 'todo', 'due_date', case when v.dest = 'task' then v.body->>'due_date' end,
             'assigned_to', case when v.dest = 'task' then v.body->'assignee'->>'handle' end,
             'linked_entity_type', v.etype, 'linked_entity_id', pg_temp.nb_id(v.ekey),
             'updated_at', to_char(pg_temp.ts(v.dec_d, v.dec_hm) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"')))
         when 'draft' then jsonb_build_object('applied_snapshot', jsonb_build_object(
             'kind', 'capture_message', 'title', 'Message to ' || (v.body->>'entity_name'), 'body', v.body->>'body',
             'status', 'drafted',
             'updated_at', to_char(pg_temp.ts(v.dec_d, v.dec_hm) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"')))
         else '{}'::jsonb end,
       v.etype, case when v.ekey is null then null else pg_temp.nb_id(v.ekey) end, v.heard, v.conf, v.cands, v.st,
       case when v.dec_d is null then null else pg_temp.nb_remi() end,
       case when v.dec_d is null then null else pg_temp.ts(v.dec_d, v.dec_hm) end,
       v.atab, case when v.akey is null then null else pg_temp.nb_id(v.akey) end,
       c.created_at + make_interval(secs => 8 + v.pos), coalesce(pg_temp.ts(v.dec_d, v.dec_hm), c.created_at + make_interval(secs => 8 + v.pos))
from v join public.captures c on c.id = pg_temp.nb_id('capture:' || v.cap)
on conflict do nothing;

-- 5b. What the confirmed cards filed (provenance exactly as the C3 appliers
--     write it). These rows live in other domains' tables but exist only
--     because of these captures.
insert into public.interactions (id, org_id, constituent_id, kind, occurred_at, notes, logged_by, external_source, external_id, created_at)
select pg_temp.nb_id(m.akey), pg_temp.nb_org(), k.entity_id, k.payload->>'kind',
       ((k.payload->>'occurred_at') || 'T12:00:00+00:00')::timestamptz, k.payload->>'notes', 'remi', 'capture', k.id::text, k.decided_at
from (values ('interaction:cap_chen', 'capcard:chen:1'), ('interaction:cap_okafor', 'capcard:okafor:1')) as m(akey, ckey)
join public.capture_cards k on k.id = pg_temp.nb_id(m.ckey) and k.org_id = pg_temp.nb_org()
on conflict do nothing;

insert into public.partner_interactions (id, org_id, partner_id, kind, occurred_at, notes, logged_by, external_source, external_id, created_at)
select pg_temp.nb_id(m.akey), pg_temp.nb_org(), k.entity_id, k.payload->>'kind',
       ((k.payload->>'occurred_at') || 'T12:00:00+00:00')::timestamptz, k.payload->>'notes', 'remi', 'capture', k.id::text, k.decided_at
from (values ('pinteraction:cap_laurel', 'capcard:laurel:1'), ('pinteraction:cap_kinetic', 'capcard:kinetic:1')) as m(akey, ckey)
join public.capture_cards k on k.id = pg_temp.nb_id(m.ckey) and k.org_id = pg_temp.nb_org()
on conflict do nothing;

-- The partner applier moves partners.last_touch_at forward to the touch's day
-- (never backward); same guarded update, this org only.
update public.partners p
   set last_touch_at = (k.payload->>'occurred_at')::date
  from public.capture_cards k
 where k.id in (pg_temp.nb_id('capcard:laurel:1'), pg_temp.nb_id('capcard:kinetic:1'))
   and k.org_id = pg_temp.nb_org()
   and p.org_id = pg_temp.nb_org() and p.id = k.entity_id
   and (p.last_touch_at is null or p.last_touch_at < (k.payload->>'occurred_at')::date);

-- Tasks and parking-lot thoughts (labels + origin_path are the capture provenance)
insert into public.ops_tasks
  (id, org_id, title, description, category, status, priority, created_by, assigned_to, assigned_to_id, due_date,
   labels, linked_entity_type, linked_entity_id, linked_label, origin_path, completed_at, created_at, updated_at)
select pg_temp.nb_id(m.akey), pg_temp.nb_org(),
       coalesce(k.payload->>'title', k.payload->>'text'),
       case when k.dest = 'task' then k.payload->>'notes' end,
       case when k.dest = 'task' then k.payload->>'category' else 'other' end,
       m.st, 'medium', 'remi',
       case when k.dest = 'task' then k.payload->'assignee'->>'handle' end,
       case when k.dest = 'task' then (k.payload->'assignee'->>'user_id')::uuid end,
       case when k.dest = 'task' then (k.payload->>'due_date')::date end,
       case when k.dest = 'thought' then array['capture', 'sys:ref:capture_card:' || k.id::text, 'parking-lot']
            else array['capture', 'sys:ref:capture_card:' || k.id::text] end,
       k.entity_type, k.entity_id, k.payload->>'entity_name',
       '/admin/capture/' || k.capture_id::text,
       case when m.done_d is null then null else pg_temp.ts(m.done_d, m.done_hm) end,
       k.decided_at,
       coalesce(pg_temp.ts(m.done_d, m.done_hm), k.decided_at)
from (values
  ('task:cap_chen_onepager',    'capcard:chen:2',    'done',        -10, '14:05'),
  ('task:cap_chen_naming',      'capcard:chen:3',    'todo',        null::int, null::text),
  ('task:cap_laurel_start',     'capcard:laurel:2',  'done',        -15, '12:30'),
  ('task:cap_kinetic_resumes',  'capcard:kinetic:2', 'in_progress', null, null),
  ('task:cap_kinetic_breakfast','capcard:kinetic:3', 'todo',        null, null)
) as m(akey, ckey, st, done_d, done_hm)
join public.capture_cards k on k.id = pg_temp.nb_id(m.ckey) and k.org_id = pg_temp.nb_org()
on conflict do nothing;

-- Message drafts (kind capture_message; never sent). The Chen note was
-- approved; the Okafor note waits in Reed → Drafts to review.
insert into public.reed_drafts (id, org_id, kind, title, body, context_ref, status, created_by, model_used, created_at, updated_at)
select pg_temp.nb_id(m.akey), pg_temp.nb_org(), 'capture_message', 'Message to ' || (k.payload->>'entity_name'),
       k.payload->>'body',
       jsonb_build_object('capture_id', k.capture_id, 'capture_card_id', k.id, 'entity_type', k.entity_type,
                          'entity_id', k.entity_id, 'channel', k.payload->>'channel', 'subject', k.payload->>'subject'),
       m.st, 'remi', 'claude-sonnet-4-6', k.decided_at,
       coalesce(pg_temp.ts(m.ud, m.uh), k.decided_at)
from (values
  ('reeddraft:cap_chen_thanks',  'capcard:chen:4',   'approved', -12, '16:30'),
  ('reeddraft:cap_okafor_note',  'capcard:okafor:3', 'drafted',  null::int, null::text)
) as m(akey, ckey, st, ud, uh)
join public.capture_cards k on k.id = pg_temp.nb_id(m.ckey) and k.org_id = pg_temp.nb_org()
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. NOTIFICATIONS for Remi (the bell + /admin/inbox): 17 rows, 5 unread.
--    Message pointers follow fanOutInbox (one standing unread pointer per
--    thread; type message.received, url /admin/messages?t=<thread>); mentions
--    follow the comments API (type mention, linked to the commented record).
-- ════════════════════════════════════════════════════════════════════════════
insert into public.notifications
  (id, org_id, recipient_id, actor_id, type, title, body, linked_entity_type, linked_entity_id, linked_label, url,
   read_at, emailed_at, created_at)
select pg_temp.nb_id('notif:' || n.k), pg_temp.nb_org(), pg_temp.nb_remi(),
       case when n.actor is null then null else pg_temp.nb_user(n.actor) end,
       n.typ, n.title, n.body, n.let, case when n.lek is null then null else pg_temp.nb_id(n.lek) end, n.lbl,
       coalesce(n.url, case when n.let = 'constituent' then '/admin/fundraising/donors/' || pg_temp.nb_id(n.lek)
                            when n.let = 'student' then '/admin/students/' || pg_temp.nb_id(n.lek)
                            when n.let = 'message_thread' then '/admin/messages?t=' || pg_temp.nb_id(n.lek)
                            when n.let = 'grant' then '/admin/fundraising/grants/' || pg_temp.nb_id(n.lek) end),
       case when n.rd is null then null else pg_temp.ts(n.rd, n.rh) end,
       case when n.typ like 'research.%' then pg_temp.ts(n.dd, n.hm) + interval '40 seconds' end,
       pg_temp.ts(n.dd, n.hm)
from (values
  -- unread (5)
  ('msg_priya_now', 'message.received', 'priya', 'New message from Priya Natarajan',
   'Morning! Jennifer replied. She can meet ' || pg_temp.nb85_dow(4) || ' or the following ' || pg_temp.nb85_dow(9) || ' for the ask, and she''d like to keep it to you, me, and her.',
   'message_thread', 'thread:dm_priya', null::text, null::text, 0, '07:12', null::int, null::text),
  ('msg_tasha_now', 'message.received', 'tasha', 'New message from Tasha Greene',
   'Auditors finished the restriction testing with no exceptions. Draft financials are expected in about three weeks, so we''ll have them before the board…',
   'message_thread', 'thread:dm_tasha', null, null, -1, '18:30', null, null),
  ('msg_dev_now', 'message.received', 'jordan', 'New message from Jordan Ellis',
   '@Remi the Goldberg letter is still on your desk. Want me to clear 30 minutes on your calendar today so you can call him first?',
   'message_thread', 'thread:development', null, null, 0, '07:20', null, null),
  ('mention_hollis', 'mention', 'lena', 'Lena Park mentioned you on The Hollis Family Foundation',
   '@Remi the interim report draft is in the Hollis folder. Martin asked for two participant stories. Can I use Keisha''s clinical rotation if she signs the release?',
   'constituent', 'con:hollis', 'The Hollis Family Foundation', null, 0, '07:35', null, null),
  ('capture_osei', 'capture.ready', null, '4 cards waiting from your ' || to_char(pg_temp.ts(0, '07:04') at time zone 'America/Los_Angeles', 'FMHH12:MI AM') || ' recording',
   'Breakfast with Daniel Osei: an interaction, a task for Priya, and two parking-lot thoughts. Nothing is filed until you confirm.',
   null, null, null, '/admin/capture/' || pg_temp.nb_id('capture:osei'), 0, '07:05', null, null),
  -- read (12)
  ('capture_bayshore', 'capture.ready', null, '3 cards waiting from your ' || to_char(pg_temp.ts(-1, '18:19') at time zone 'America/Los_Angeles', 'FMHH12:MI AM') || ' recording',
   'Bayshore family night: one card needs you to pick which Chen, plus a reply to Jennifer Wu and a task.',
   null, null, null, '/admin/capture/' || pg_temp.nb_id('capture:bayshore'), -1, '18:20', -1, '18:22'),
  ('msg_leadership', 'message.received', 'tasha', 'New message from Tasha Greene',
   'Audit update: fieldwork is going smoothly. Two open requests left, both on Kwame''s list for this week. No findings so far.',
   'message_thread', 'thread:leadership', null, null, -1, '09:05', -1, '09:19'),
  ('msg_tasha_cois', 'message.received', 'tasha', 'New message from Tasha Greene',
   'Two COI forms are still out: Ravi and Theo. I''ll nudge them, but a note from you might land faster.',
   'message_thread', 'thread:dm_tasha', null, null, -2, '10:15', -2, '10:30'),
  ('report_hollis', 'report.due', null, 'Report due in 14 days: Hollis interim report',
   'The Hollis Family Foundation · Pathways Fellowship. Lena Park is drafting. Installment 2 ($75,000) follows the report.',
   'grant', 'grant:hollis_pathways', 'The Hollis Family Foundation', null, -2, '06:00', -2, '08:15'),
  ('report_bayview', 'report.due', null, 'Report due in 30 days: Bayview annual report',
   'Bayview Community Foundation · general operating, year 2 of 3. Lena Park owns it.',
   'grant', 'grant:bayview_gos', 'Bayview Community Foundation', null, -4, '06:00', -4, '08:40'),
  ('task_sequoia', 'task.assigned', 'priya', 'Priya Natarajan assigned you: Prep for the Sequoia Trust intro',
   'Due ' || pg_temp.nb85_md(2) || '. Arthur Feld, Executive Director. $100K opportunity.',
   'ops_task', 'task:sequoia_prep', 'Prep for the Sequoia Trust intro', '/admin/work/tasks', -4, '09:00', -4, '09:20'),
  ('mention_david', 'mention', 'miguel', 'Miguel Arreola mentioned you on David Tran',
   '@Remi flagging because David is one of the scholarship students we told the Chens about. Rosa is reaching his mom this week.',
   'student', 'student:david', 'David Tran', null, -3, '09:40', -3, '10:02'),
  ('task_patel', 'task.assigned', 'tasha', 'Tasha Greene assigned you: Ravi Patel onboarding check-in',
   'Due ' || pg_temp.nb85_md(9) || '. Third-month check-in: committees, first board gift, COI form.',
   'ops_task', 'task:patel_onboarding', 'Ravi Patel onboarding check-in', '/admin/work/tasks', -6, '15:00', -6, '15:40'),
  ('mention_lim', 'mention', 'tasha', 'Tasha Greene mentioned you on Grace Lim',
   '@Remi Grace wants the Finance & Audit committee to meet the auditors before the full board. Can you join that call?',
   'constituent', 'con:bd_lim', 'Grace Lim', null, -8, '14:00', -8, '14:28'),
  ('task_wu', 'task.assigned', 'priya', 'Priya Natarajan assigned you: Schedule the ask meeting with Jennifer Wu',
   'Due ' || pg_temp.nb85_md(4) || '. Working ask: $100K over two years for the healthcare track.',
   'ops_task', 'task:wu_ask_meeting', 'Schedule the ask meeting with Jennifer Wu', '/admin/work/tasks', -8, '09:05', -8, '09:30'),
  ('gift_goldberg', 'gift.major', null, 'Major gift: $20,000 from Aaron Goldberg',
   'Recommended through Bay Legacy Giving Fund. Major-gift escalation: a personal thank-you from you is due.',
   'constituent', 'con:goldberg', 'Aaron Goldberg', null, -9, '16:45', -9, '17:30'),
  ('mention_goldberg', 'mention', 'jordan', 'Jordan Ellis mentioned you on Aaron Goldberg',
   'Bay Legacy''s grant letter came in: $20,000 recommended by Aaron Goldberg. The receipt goes to the fund; the thank-you goes to Aaron. @Remi this one is over the major-gift line, so it''s yours…',
   'constituent', 'con:goldberg', 'Aaron Goldberg', null, -9, '17:00', -9, '17:31'),
  ('research_wu', 'research.completed', 'priya', 'Prospect research finished: Jennifer Wu',
   'Capacity estimate around $100K. Gives to workforce programs; strong affinity for the healthcare track.',
   'constituent', 'con:wu', 'Jennifer Wu', null, -24, '14:03', -24, '15:00')
) as n(k, typ, actor, title, body, let, lek, lbl, url, dd, hm, rd, rh)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. BRIEFING — cached morning narratives, the weekly editions, and one
--    decision on the daily feed.
--
-- /admin/briefing and Today read bloomos_briefing_narrative for
-- (org, brief_date = today's UTC date) and use it as-is (no hash check); only
-- a miss triggers a Sonnet call, and the 6am pre-warm cron only warms the
-- resident (AA) org. So today's row below IS what the demo shows until someone
-- clicks Regenerate. Note the key is the UTC date: after 5pm Pacific (4pm in
-- winter) the app looks for tomorrow's row and generates a fresh one.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.bloomos_briefing_narrative (org_id, brief_date, headline, narrative, focus, input_hash, model, generated_at)
select pg_temp.nb_org(), pg_temp.d(k), x.headline, x.narrative, x.focus,
       md5('nb:briefing_narrative:' || pg_temp.d(k)::text), 'claude-sonnet-4-6', pg_temp.ts(k, '06:00')
from generate_series(-2, 0) as k
cross join lateral (select
  case k when 0  then 'Thank Goldberg today; Hollis report due in 12 days'
         when -1 then 'Goldberg''s thank-you is overdue; Sequoia intro this week'
         else 'Board prep and the Goldberg thank-you lead the week' end as headline,
  'Start with Aaron Goldberg: his $20,000 gift through Bay Legacy Giving Fund arrived ' || (9 + k) ||
  ' days ago and still has no thank-you, and it is flagged as a major-gift escalation. Cash stands at $1.55M, about 5.5 months of runway against the 6-month target. ' ||
  'Lena''s Hollis interim report is due in ' || (12 - k) || ' days and unlocks the second $75,000; Bayview''s annual report follows in ' || (26 - k) || '. ' ||
  'Meridian''s $300,000 decision is about five weeks out, and the Sequoia intro is in ' || (3 - k) || ' days.' as narrative,
  case k when 0 then 'Call Aaron Goldberg and get his thank-you letter out today.'
         else 'Call Aaron Goldberg before the letter goes out.' end as focus
) x
on conflict do nothing;

-- The ranked feed's data-age check is HubSpot-based, so a tenant without the
-- HubSpot mirror always gets "The data is stale / never fully synced" as its
-- top critical item. Northbridge doesn't use HubSpot; dismissing that item is
-- what an operator here would do (decision route: dismiss, reversible).
insert into public.bloomos_briefing_state (org_id, item_id, decision, hidden_until, updated_at)
values (pg_temp.nb_org(), 'sync:stale', 'dismiss', null, pg_temp.ts(-21, '08:10'))
on conflict do nothing;

-- Weekly editions (Monday 6am). The numbers are computed from the rows the
-- weekly gather reads (gifts, constituents, audit_log stage moves, pending
-- acks, overdue next steps, compliance, grant requirements, metric snapshots),
-- so the cached edition agrees with the live data at seed time.
insert into public.briefings (id, org_id, kind, headline, narrative, priorities, data, model, created_at)
select pg_temp.nb_id('briefing:weekly:' || w.j), pg_temp.nb_org(), 'weekly', w.headline, w.narrative, w.priorities,
       jsonb_build_object(
         'week', jsonb_build_object('gifts', w.gifts, 'giftTotal', w.gift_total, 'newConstituents', w.new_cons, 'pipelineMoves', w.moves),
         'todos', jsonb_build_object('pendingAcks', w.acks, 'overdueMoves', w.overdue_moves, 'complianceOverdue', w.comp_overdue),
         'deadlines', w.deadlines, 'kpis', w.kpis),
       'claude-sonnet-4-6', w.at
from (
  select j, mon, at, gifts, gift_total, new_cons, moves, acks, overdue_moves, comp_overdue, deadlines, kpis,
         case j when 0  then 'Hollis report and the Year-End launch set the pace this week'
                when -1 then 'Audit fieldwork underway and a major gift to thank'
                when -2 then 'Meridian is in, and Laurel Ridge needs a fix'
                else 'Cohort 7 is off to a strong start' end as headline,
         (case when gifts = 0 then 'No new gifts were recorded last week. '
               else 'Last week brought ' || gifts || ' gift' || case when gifts = 1 then '' else 's' end || ' totaling ' ||
                    to_char(gift_total, 'FM$999,999,990') || '. ' end) ||
         case when pg_temp.d(-9) >= mon - 7 and pg_temp.d(-9) < mon
                then 'The standout is $20,000 from Aaron Goldberg through Bay Legacy Giving Fund, which needs a personal thank-you from Remi. '
              when pg_temp.d(-9) < mon - 7
                then 'Aaron Goldberg''s $20,000 gift from the week before still has no thank-you. '
              else '' end ||
         case when acks > 0 then acks || ' gift' || case when acks = 1 then ' is' else 's are' end || ' still waiting on an acknowledgment. ' else '' end ||
         'Cash sits near $1.55M, about 5.5 months of runway against the 6-month target. ' ||
         'The Hollis interim report is due in ' || (pg_temp.d(12) - mon) || ' days and unlocks the second $75,000; Bayview''s annual report follows ' ||
         (pg_temp.d(26) - pg_temp.d(12)) || ' days later. ' ||
         case when pg_temp.d(-21) <= mon then 'Meridian''s $300,000 decision is about ' || round((pg_temp.d(35) - mon) / 7.0) || ' weeks out. ' else 'The Meridian proposal goes in this month. ' end ||
         case when overdue_moves > 0 then overdue_moves || ' pipeline next step' || case when overdue_moves = 1 then ' is' else 's are' end || ' past due.' else 'Every dated pipeline next step is current.' end
           as narrative,
         case j when 0  then jsonb_build_array('Call Aaron Goldberg and send his thank-you letter this week.',
                                               'Get the Hollis interim report to Martin Hollis-Reyes ahead of the deadline.',
                                               'Lock the Year-End letter and segment before launch.')
                when -1 then jsonb_build_array('Thank Aaron Goldberg personally for his $20,000 gift.',
                                               'Book the Okafor renewal call; he prefers the phone.',
                                               'Confirm the board agenda includes the reserve policy.')
                when -2 then jsonb_build_array('Offer Meridian a Tuesday site visit at Bayshore.',
                                               'Move the Laurel Ridge start time to win back attendance.',
                                               'Finish the audit PBC list before fieldwork starts.')
                else jsonb_build_array('Schedule Jennifer Wu''s Pathways tour with Andre.',
                                       'Send the Meridian proposal with the San Leandro budget.',
                                       'Close out Summer Works employer surveys.') end as priorities
  from (
    select j, mon, at,
           (select count(*) from public.gifts g where g.org_id = pg_temp.nb_org() and g.gift_date >= mon - 7 and g.gift_date < mon)::int as gifts,
           (select coalesce(sum(g.amount), 0) from public.gifts g where g.org_id = pg_temp.nb_org() and g.gift_date >= mon - 7 and g.gift_date < mon) as gift_total,
           (select count(*) from public.constituents c where c.org_id = pg_temp.nb_org() and c.created_at >= (mon - 7)::timestamptz and c.created_at < mon::timestamptz)::int as new_cons,
           (select count(*) from public.audit_log a where a.org_id = pg_temp.nb_org() and a.action = 'fundraising.opportunity.stage'
              and a.ts >= (mon - 7)::timestamptz and a.ts < mon::timestamptz)::int as moves,
           (select count(*) from public.gifts g where g.org_id = pg_temp.nb_org() and g.acknowledgment_status = 'pending' and g.gift_date < mon)::int as acks,
           (select count(*) from public.opportunities o join public.pipeline_stages ps
               on ps.org_id = o.org_id and ps.pipeline = o.pipeline and ps.key = o.stage and ps.stage_type = 'open'
             where o.org_id = pg_temp.nb_org() and o.next_step_due < mon)::int as overdue_moves,
           (select count(*) from public.compliance_items ci where ci.org_id = pg_temp.nb_org()
              and ci.status in ('upcoming', 'in_progress') and ci.due_date < mon)::int as comp_overdue,
           coalesce((select jsonb_agg(jsonb_build_object('what', x.what, 'due', x.due) order by x.due)
             from (select (select gr.name from public.grants gr where gr.id = r.grant_id) || ' · ' || coalesce(r.label, replace(r.kind, '_', ' ')) as what,
                          to_char(r.due_date, 'YYYY-MM-DD') as due
                     from public.grant_requirements r
                    where r.org_id = pg_temp.nb_org() and r.status in ('upcoming', 'in_progress')
                      and r.due_date >= mon and r.due_date <= mon + 14
                   union all
                   select ci.title, to_char(ci.due_date, 'YYYY-MM-DD')
                     from public.compliance_items ci
                    where ci.org_id = pg_temp.nb_org() and ci.status in ('upcoming', 'in_progress')
                      and ci.due_date >= mon and ci.due_date <= mon + 14) x), '[]'::jsonb) as deadlines,
           coalesce((select jsonb_agg(jsonb_build_object('label', md.name, 'value',
                      case md.unit when 'usd' then to_char(s.value, 'FM$999,999,990')
                                   when 'pct' then (round(s.value * 10) / 10)::text || '%'
                                   when 'months' then (round(s.value * 10) / 10)::text || ' mo'
                                   else (round(s.value * 100) / 100)::text end) order by md.department, md.name)
             from public.metric_definitions md
             join lateral (select ms.value from public.metric_snapshots ms
                            where ms.metric_id = md.id and ms.captured_on < mon
                            order by ms.captured_on desc limit 1) s on true
            where md.org_id = pg_temp.nb_org() and md.active), '[]'::jsonb) as kpis
    from (select j, pg_temp.wk(j) as mon, (pg_temp.wk(j)::text || ' 06:00')::timestamp at time zone 'America/Los_Angeles' as at
            from generate_series(-3, 0) as j) mondays
  ) base
) w
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. EMAIL CAMPAIGNS (/admin/fundraising/comms): two sent newsletters with a
--    per-recipient ledger, and the Year-End appeal launch email as a DRAFT.
--    Recipients = this org's people with an email on a reserved domain, not
--    do-not-contact, not archived, created before the send, minus anyone
--    suppressed before it. Suppressions are picked deterministically from bulk
--    supporters (never board, major donors, or funder contacts).
--    No opens/clicks: email_events (comms v2 phase 2) is not in this schema.
-- ════════════════════════════════════════════════════════════════════════════
create temp table _nb85_base on commit drop as
select c.id, lower(c.emails[1]) as email, c.created_at,
       not (c.tags && array['board','major_donor','major_donor_prospect','program_officer','foundation_contact',
                            'funder_contact','government','family_trustee']) as bulk
from public.constituents c
where c.org_id = pg_temp.nb_org() and c.type = 'person' and c.archived_at is null
  and coalesce(c.do_not_contact, false) = false
  and c.emails[1] ~* '^[^@\s]+@example\.(com|org|net)$';

create temp table _nb85_pick (role text primary key, id uuid, email text) on commit drop;
insert into _nb85_pick
select 'manual', b.id, b.email from _nb85_base b
where b.bulk and b.created_at < pg_temp.ts(-100, '09:00')
order by md5(b.id::text || ':manual') limit 1;
insert into _nb85_pick
select 'unsub0', b.id, b.email from _nb85_base b
where b.bulk and b.created_at < pg_temp.ts(-58, '10:00') and b.id not in (select id from _nb85_pick)
order by md5(b.id::text || ':unsub0') limit 1;
insert into _nb85_pick
select 'bounce1', b.id, b.email from _nb85_base b
where b.bulk and b.created_at < pg_temp.ts(-58, '10:00') and b.id not in (select id from _nb85_pick)
order by md5(b.id::text || ':bounce1') limit 1;
insert into _nb85_pick
select 'unsub1', b.id, b.email from _nb85_base b
where b.bulk and b.created_at < pg_temp.ts(-58, '10:00') and b.id not in (select id from _nb85_pick)
order by md5(b.id::text || ':unsub1') limit 1;

create temp table _nb85_sends on commit drop as
select 'newsletter_prev'::text as camp, x.id, x.email,
       'sent'::text as status, null::text as error,
       pg_temp.ts(-58, '10:00') + make_interval(secs => (row_number() over (order by x.email))::int / 25 * 3) as sent_at
from (select distinct on (b.email) b.id, b.email from _nb85_base b
       where b.created_at < pg_temp.ts(-58, '10:00')
         and b.email not in (select email from _nb85_pick where role = 'manual')
       order by b.email, b.id) x
union all
select 'newsletter_fall', x.id, x.email,
       case when x.email = (select email from _nb85_pick where role = 'bounce1') then 'failed' else 'sent' end,
       case when x.email = (select email from _nb85_pick where role = 'bounce1')
            then '550 5.1.1 Recipient address rejected: mailbox unavailable (hard bounce)' end,
       case when x.email = (select email from _nb85_pick where role = 'bounce1') then null
            else pg_temp.ts(-28, '10:00') + make_interval(secs => (row_number() over (order by x.email))::int / 25 * 3) end
from (select distinct on (b.email) b.id, b.email from _nb85_base b
       where b.created_at < pg_temp.ts(-28, '10:00')
         and b.email not in (select email from _nb85_pick where role in ('manual', 'unsub0'))
       order by b.email, b.id) x;

insert into public.email_campaigns
  (id, org_id, name, subject, body, segment_id, status, recipient_count, sent_count, failed_count, sent_at, created_by, created_at, updated_at)
select pg_temp.nb_id('campaign:' || e.k), pg_temp.nb_org(), e.name, e.subject, e.body,
       case when e.k = 'yearend_launch' then null
            else (select s.id from public.segments s
                   where s.org_id = pg_temp.nb_org()
                     and s.name ~* '(newsletter|all supporters|all donors|all active|everyone)'
                   order by s.created_at, s.id limit 1) end,
       e.st,
       (select count(*) from _nb85_sends x where x.camp = e.k)::int,
       (select count(*) from _nb85_sends x where x.camp = e.k and x.status = 'sent')::int,
       (select count(*) from _nb85_sends x where x.camp = e.k and x.status = 'failed')::int,
       case when e.sd is null then null else pg_temp.ts(e.sd, '10:06') end,
       e.who, pg_temp.ts(e.cd, '14:00'), pg_temp.ts(coalesce(e.sd, e.ud), '10:06')
from (values
  ('newsletter_prev', 'Northbridge Notes · ' || to_char(pg_temp.d(-58), 'FMMonth YYYY'),
   'Summer Works, by the numbers',
   'Hi {{first_name}},' || E'\n\n' ||
   'This summer 85 young people from East and West Oakland and San Leandro worked seven-week paid internships at 22 employers, from bank branches to clinics to job sites. For most of them it was a first paycheck.' || E'\n\n' ||
   'Their supervisors keep telling us the same thing: show up on time, ask good questions, and you will be invited back. Many of them were.' || E'\n\n' ||
   'Thank you for making that first job possible.' || E'\n\n' || 'Remi Sobomehin' || E'\n' || 'Executive Director',
   'sent', 'jordan', -63, -58, null::int),
  ('newsletter_fall', pg_temp.nb85_season(pg_temp.d(-28)) || ' newsletter · Northbridge Notes ' || to_char(pg_temp.d(-28), 'FMMonth YYYY'),
   'Where first jobs start',
   'Hi {{first_name}},' || E'\n\n' ||
   'Twelve Summer Works interns spent the summer as library aides at Eastshore Public Library, running reading hours for little kids, shelving, and helping neighbors with job applications on the public computers. Grace Okonkwo, who runs Teen Services there, says the interns made the library feel younger.' || E'\n\n' ||
   'Inside this issue: Launchpad is back at three high schools, Pathways Cohort 7 is underway, and Mentor Circles has more matched pairs than ever.' || E'\n\n' ||
   'Thank you for being part of it.' || E'\n\n' || 'Remi Sobomehin' || E'\n' || 'Executive Director',
   'sent', 'jordan', -33, -28, null),
  ('yearend_launch', 'Year-End ' || extract(year from pg_temp.d(60))::int || ' appeal · launch email (planned ' || to_char(pg_temp.d(14), 'Mon FMDD') || ')',
   'Amara''s first IT job started here',
   'Hi {{first_name}},' || E'\n\n' ||
   'Two years ago Amara Johnson was working retail and wasn''t sure what came next. This year she earned her CompTIA A+ certification through our Pathways Fellowship and started as an IT help-desk technician at Kinetic Labs.' || E'\n\n' ||
   'Our Year-End goal is $400,000, and every dollar goes to the coaching, certifications, and paid internships that make stories like Amara''s possible.' || E'\n\n' ||
   'Will you give today?' || E'\n\n' || 'With gratitude,' || E'\n' || 'Remi Sobomehin',
   'draft', 'priya', -6, null, -1)
) as e(k, name, subject, body, st, who, cd, sd, ud)
on conflict do nothing;

insert into public.email_sends (id, org_id, campaign_id, constituent_id, email, status, error, sent_at, created_at)
select pg_temp.nb_id('send:' || x.camp || ':' || x.id::text), pg_temp.nb_org(), pg_temp.nb_id('campaign:' || x.camp),
       x.id, x.email, x.status, x.error, x.sent_at,
       pg_temp.ts(case x.camp when 'newsletter_prev' then -58 else -28 end, '10:00')
from _nb85_sends x
on conflict do nothing;

insert into public.email_suppressions (id, org_id, email, reason, source_campaign_id, created_at)
select pg_temp.nb_id('suppress:' || p.role), pg_temp.nb_org(), p.email, s.reason,
       case when s.camp is null then null else pg_temp.nb_id('campaign:' || s.camp) end, pg_temp.ts(s.dd, s.hm)
from _nb85_pick p
join (values
  ('manual',  'manual',       null::text,        -100, '11:30'),
  ('unsub0',  'unsubscribed', 'newsletter_prev', -55,  '19:20'),
  ('bounce1', 'hard_bounce',  'newsletter_fall', -28,  '10:03'),
  ('unsub1',  'unsubscribed', 'newsletter_fall', -27,  '08:45')
) as s(role, reason, camp, dd, hm) on s.role = p.role
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. STORIES + COMMS v2 (dormant module: no screen reads these yet).
--    Amara (approved, consented, publishable) · Luis (drafted, guardian consent
--    pending, NOT publishable) · Eastshore Library spotlight (used in last
--    month's newsletter, publishable) · Keisha (raw, consent requested).
-- ════════════════════════════════════════════════════════════════════════════
insert into public.stories (id, org_id, title, body, outcome, status, tags, happened_on, captured_by, rank_order, strategic_goal_id, source, created_at, updated_at)
select pg_temp.nb_id('story:' || s.k), pg_temp.nb_org(), s.title, s.body, s.outcome, s.st, s.tags, pg_temp.d(s.hd), s.who, s.rk,
       (select g.id from public.plan_goals g where g.org_id = pg_temp.nb_org() and g.id = pg_temp.nb_id(s.goal_key)),
       s.src, pg_temp.ts(s.cd, '11:00'), pg_temp.ts(s.ud, '15:00')
from (values
  ('amara', 'Amara''s first IT job',
   'Amara Johnson joined Pathways Cohort 6 two years out of high school, working retail and unsure what came next. Over twelve months she earned her CompTIA A+ certification, completed a help-desk internship, and met weekly with her coach. A few weeks after graduation she started as an IT help-desk technician at Kinetic Labs, one of our employer partners, where her team has already handed her the office printer fleet as her own project.' || E'\n\n' ||
   '"I used to think tech jobs were for other people," she says. "Now people call me when their laptop won''t connect."',
   'Hired as an IT help-desk technician at Kinetic Labs at $28/hour; CompTIA A+ certified.',
   'approved', array['pathways','it_support','placement','alumni','year_end'], -75, 'andre', 1, 'pgoal:placement', 'manual', -60, -30),
  ('luis', 'Luis finds his footing at Pacific Summit Bank',
   'Luis Ortega, a Launchpad senior at Eastlake, spent his Summer Works internship in branch operations at Pacific Summit Bank. He balanced cash drawers, helped customers open their first savings accounts, and by week five was training the newer interns. His branch manager has already asked whether he can come back next summer. Luis is applying to Cal State East Bay to study business.',
   'Completed a seven-week paid internship; invited back; applying to college for business.',
   'drafted', array['summer_works','launchpad','banking','employer_partner'], -70, 'simone', 2, 'pgoal:summerworks', 'manual', -20, -6),
  ('library', 'Eastshore Public Library: where first jobs start',
   'Twelve Summer Works interns worked as library aides at Eastshore Public Library this summer. They ran reading hours for young children, kept the stacks in order, and sat with neighbors at the public computers to help with job applications. Grace Okonkwo, the Teen Services Manager, has hosted our interns for years and now uses the program to recruit her own part-time staff.' || E'\n\n' ||
   '"They make the library feel younger," she says. "Half my current pages started as Northbridge interns."',
   'Twelve paid library-aide internships; three interns hired into part-time library jobs.',
   'used', array['summer_works','employer_spotlight','partner'], -62, 'simone', 3, 'pgoal:summerworks', 'manual', -55, -28),
  ('keisha', 'Keisha''s clinical rotation at Harbor Health',
   'Notes from Andre: Keisha is in Cohort 7''s healthcare track, doing her clinical rotation at Harbor Health Partners. Her preceptor says she is the first to arrive. CNA exam next month; she needed a transit pass to reach the testing center and Simone covered it from the stipend fund.',
   null, 'raw', array['pathways','healthcare','hollis_report'], -4, 'andre', 4, 'pgoal:placement', 'manual', -3, -1)
) as s(k, title, body, outcome, st, tags, hd, who, rk, goal_key, src, cd, ud)
on conflict do nothing;

insert into public.story_subjects (id, org_id, story_id, subject_type, subject_id, display_label, is_minor, created_at)
select pg_temp.nb_id('storysub:' || x.k), pg_temp.nb_org(), pg_temp.nb_id('story:' || x.story), x.typ,
       pg_temp.nb_id(x.ref), x.label, x.minor, pg_temp.ts(x.cd, '11:05')
from (values
  ('amara:1',   'amara',   'participant', 'student:amara',          'Amara Johnson',            false, -60),
  ('amara:2',   'amara',   'partner',     'partner:kinetic',        'Kinetic Labs',             false, -60),
  ('luis:1',    'luis',    'participant', 'student:luis',           'Luis O.',                  true,  -20),
  ('luis:2',    'luis',    'partner',     'partner:pacific_summit', 'Pacific Summit Bank',      false, -20),
  ('library:1', 'library', 'partner',     'partner:library',        'Eastshore Public Library', false, -55),
  ('keisha:1',  'keisha',  'participant', 'student:keisha',         'Keisha B.',                false, -3),
  ('keisha:2',  'keisha',  'partner',     'partner:harbor',         'Harbor Health Partners',   false, -3)
) as x(k, story, typ, ref, label, minor, cd)
on conflict do nothing;

insert into public.story_consents (id, org_id, story_subject_id, scope, requested_at, granted_by, granted_at, expires_at, revoked_at, evidence_document_id, notes, created_at)
select pg_temp.nb_id('consent:' || x.k), pg_temp.nb_org(), pg_temp.nb_id('storysub:' || x.k), x.scope,
       case when x.rq is null then null else pg_temp.d(x.rq) end, x.by,
       case when x.gr is null then null else pg_temp.d(x.gr) end,
       case when x.gr is null then null else pg_temp.d(x.gr + 365) end,
       null, null, x.notes, pg_temp.ts(coalesce(x.rq, x.gr), '12:00')
from (values
  ('amara:1',   array['first_name','full_name','photo','quote','outcome_details'], -50, 'Amara Johnson (participant, adult)', -44,
   'Signed release on file. OK for print and online, including the Year-End appeal. Re-confirm before any video.'),
  ('amara:2',   array['full_name','quote'], -46, 'Priscilla Gomez, Head of Social Impact, Kinetic Labs', -40,
   'Kinetic approved naming the company and quoting Amara''s manager.'),
  ('luis:1',    array['first_name','photo','quote','outcome_details'], -6, null::text, null::int,
   'Luis is 17, so a guardian signature is required. Release form went home with him for Marisol Ortega; Rosa is following up.'),
  ('luis:2',    array['full_name','quote'], -22, 'Daniel Osei for Pacific Summit Bank communications', -18,
   'Bank comms approved naming the branch program.'),
  ('library:1', array['full_name','photo','quote'], -58, 'Grace Okonkwo, Teen Services Manager', -56,
   'Approved the photo of interns at the circulation desk (faces of minors blurred) and her quote.'),
  ('keisha:1',  array['first_name','quote','outcome_details'], -1, null, null,
   'Lena asked for the Hollis interim report. Andre will walk Keisha through the form at her next coaching session.')
) as x(k, scope, rq, by, gr, notes)
on conflict do nothing;

insert into public.story_media (id, org_id, story_id, storage_path, mime, size_bytes, caption, kind, created_at)
select pg_temp.nb_id('storymedia:' || x.k), pg_temp.nb_org(), pg_temp.nb_id('story:' || x.story),
       'stories/' || pg_temp.nb_org() || '/' || pg_temp.nb_id('story:' || x.story) || '/' || x.file,
       'image/jpeg', x.bytes, x.caption, 'photo', pg_temp.ts(x.cd, '13:00')
from (values
  ('amara:1',   'amara',   'amara-helpdesk.jpg',           284113, 'Amara at the Kinetic Labs help desk.', -42),
  ('amara:2',   'amara',   'amara-cohort6-graduation.jpg', 351904, 'Amara with her Cohort 6 certificate.', -42),
  ('library:1', 'library', 'library-interns-desk.jpg',     298650, 'Summer Works interns at the Eastshore Library circulation desk.', -55)
) as x(k, story, file, bytes, caption, cd)
on conflict do nothing;

-- Formats: the monthly donor newsletter, the board update, one archived.
insert into public.comms_formats (id, org_id, name, cadence, slots, is_archived, created_at, updated_at)
select pg_temp.nb_id('commsformat:' || x.k), pg_temp.nb_org(), x.name, x.cadence, x.slots, x.arch, pg_temp.ts(x.cd, '10:00'), pg_temp.ts(x.cd, '10:00')
from (values
  ('notes', 'Northbridge Notes (donor newsletter)', 'monthly',
   '[{"key":"lead_story","label":"Lead story","kind":"story","required":true},
     {"key":"by_the_numbers","label":"By the numbers","kind":"metrics","max":3},
     {"key":"partner_spotlight","label":"Partner spotlight","kind":"text"},
     {"key":"from_the_ed","label":"From Remi","kind":"text"},
     {"key":"ways_to_help","label":"Ways to help","kind":"text"}]'::jsonb, false, -240),
  ('board', 'Board ED update', 'quarterly',
   '[{"key":"headline","label":"The headline","kind":"text","required":true},
     {"key":"impact_story","label":"Story from the field","kind":"story"},
     {"key":"dashboard","label":"Dashboard","kind":"metrics","max":4},
     {"key":"asks_of_board","label":"Asks of the board","kind":"text"}]'::jsonb, false, -200),
  ('mentor_digest', 'Mentor digest', 'monthly',
   '[{"key":"lead_story","label":"Lead story","kind":"story"},{"key":"dates","label":"Upcoming circles","kind":"text"}]'::jsonb, true, -400)
) as x(k, name, cadence, slots, arch, cd)
on conflict do nothing;

insert into public.comms_editions (id, org_id, format_id, title, subject, status, target_date, email_campaign_id, sent_at, created_at, updated_at)
select pg_temp.nb_id('edition:' || x.k), pg_temp.nb_org(), pg_temp.nb_id('commsformat:' || x.fmt), x.title, x.subject, x.st,
       pg_temp.d(x.td), case when x.camp is null then null else pg_temp.nb_id('campaign:' || x.camp) end,
       case when x.sd is null then null else pg_temp.ts(x.sd, '10:06') end,
       pg_temp.ts(x.cd, '09:00'), pg_temp.ts(coalesce(x.sd, x.ud), '10:06')
from (values
  ('notes_prev', 'notes', 'Northbridge Notes · ' || to_char(pg_temp.d(-58), 'FMMonth YYYY'), 'Summer Works, by the numbers',
   'sent', -58, 'newsletter_prev', -58, -70, null::int),
  ('notes_last', 'notes', 'Northbridge Notes · ' || to_char(pg_temp.d(-28), 'FMMonth YYYY'), 'Where first jobs start',
   'sent', -28, 'newsletter_fall', -28, -40, null),
  ('notes_current', 'notes', 'Northbridge Notes · ' || to_char(pg_temp.d(5), 'FMMonth YYYY'), 'Amara''s first IT job',
   'review', 5, null, null, -12, -1),
  ('board_next', 'board', 'Board ED update · ' || to_char(pg_temp.d(24), 'FMMonth YYYY') || ' meeting', null,
   'drafting', 17, null, null, -5, -1)
) as x(k, fmt, title, subject, st, td, camp, sd, cd, ud)
on conflict do nothing;

-- Slots: slot_def copies the format's slot; metric slots resolve Section 6's
-- metric keys when present (empty array otherwise).
insert into public.comms_edition_slots (id, org_id, edition_id, slot_key, slot_def, story_id, metric_ids, content, position, created_at, updated_at)
select pg_temp.nb_id('slot:' || x.ed || ':' || x.slot), pg_temp.nb_org(), pg_temp.nb_id('edition:' || x.ed), x.slot,
       (select f.slots -> (x.pos - 1) from public.comms_formats f join public.comms_editions e on e.format_id = f.id
         where e.id = pg_temp.nb_id('edition:' || x.ed)),
       case when x.story is null then null else pg_temp.nb_id('story:' || x.story) end,
       case when x.mkeys is null then null
            else coalesce((select array_agg(md.id order by array_position(x.mkeys, md.metric_key))
                             from public.metric_definitions md
                            where md.org_id = pg_temp.nb_org() and md.metric_key = any (x.mkeys)), '{}'::uuid[]) end,
       x.content, x.pos, pg_temp.ts(x.cd, '10:00'), pg_temp.ts(x.cd, '10:00')
from (values
  ('notes_prev', 'lead_story', 1, null::text, null::text[], -66,
   'Summer Works by the numbers: 85 interns, 22 employers, seven weeks, and for most of them a first paycheck.'),
  ('notes_prev', 'by_the_numbers', 2, null, array['youth_served','mentor_matches'], -66, null),
  ('notes_prev', 'partner_spotlight', 3, null, null, -66,
   'Pacific Summit Bank hosted eight interns in branch operations and commercial banking, and its people mentored every one of them.'),
  ('notes_prev', 'from_the_ed', 4, null, null, -66,
   'Every summer I watch a kid walk into a job site nervous and walk out seven weeks later with a reference. Thank you for paying for that walk.'),
  ('notes_last', 'lead_story', 1, 'library', null, -36, null),
  ('notes_last', 'by_the_numbers', 2, null, array['youth_served','mentor_matches','attendance_rate'], -36, null),
  ('notes_last', 'partner_spotlight', 3, null, null, -36,
   'Redline Builders opened two active job sites to our building-trades fellows for pre-apprenticeship placements.'),
  ('notes_last', 'from_the_ed', 4, null, null, -36,
   'Launchpad is back at Eastlake, Laurel Ridge, and Bayshore, and our newest Pathways cohort started this fall. The year is off to a strong start.'),
  ('notes_last', 'ways_to_help', 5, null, null, -36,
   'Mentor Circles meets the second Tuesday of every month. Bring a colleague.'),
  ('notes_current', 'lead_story', 1, 'amara', null, -6, null),
  ('notes_current', 'by_the_numbers', 2, null, array['placement_rate','avg_starting_wage','credentials_earned'], -6, null),
  ('notes_current', 'partner_spotlight', 3, null, null, -6,
   'Kinetic Labs sends twelve employee mentors to Mentor Circles, and this year it hired one of our fellows onto its own help desk.'),
  ('notes_current', 'from_the_ed', 4, null, null, -2,
   'In two weeks we launch our Year-End campaign with a $400,000 goal. Amara''s story is why. More soon.'),
  ('notes_current', 'ways_to_help', 5, null, null, -2,
   'Save the date for GivingTuesday, and if your company hires entry-level IT, healthcare, or trades talent, reply to this email.'),
  ('board_next', 'headline', 1, null, null, -4,
   'Reserves are close to the 6-month goal, the audit is clean so far, and Meridian decides in about five weeks.'),
  ('board_next', 'impact_story', 2, 'amara', null, -4, null),
  ('board_next', 'dashboard', 3, null, array['months_of_runway','attendance_rate','placement_rate','donor_retention'], -4, null)
) as x(ed, slot, pos, story, mkeys, cd, content)
on conflict do nothing;

insert into public.comms_outputs (id, org_id, story_id, edition_id, channel, body, status, used_at, model_grounding, created_by, created_at, updated_at)
select pg_temp.nb_id('output:' || x.k), pg_temp.nb_org(), pg_temp.nb_id('story:' || x.story),
       case when x.ed is null then null else pg_temp.nb_id('edition:' || x.ed) end,
       x.ch, x.body, x.st, case when x.ud is null then null else pg_temp.ts(x.ud, '10:06') end,
       case when x.reed then jsonb_build_object('model', 'claude-sonnet-4-6', 'story_id', pg_temp.nb_id('story:' || x.story),
                                                'facts_used', x.facts) end,
       x.who, pg_temp.ts(x.cd, '11:00'), pg_temp.ts(coalesce(x.ud, x.cd), '11:00')
from (values
  ('library_news', 'library', 'notes_last', 'newsletter_section', 'used', -28, true, 'jordan', -35,
   '["12 library-aide interns","Grace Okonkwo quote","3 hired part-time"]'::jsonb,
   'Twelve Summer Works interns spent the summer as library aides at Eastshore Public Library, running reading hours for little kids and helping neighbors with job applications. "They make the library feel younger," says Teen Services Manager Grace Okonkwo, who has hired three of them into part-time jobs.'),
  ('library_forward', 'library', null, 'personal_forward', 'used', -27, false, 'remi', -27, null,
   'Grace, our newsletter this month led with your team and the interns. Thank you for years of first jobs. Remi'),
  ('amara_news', 'amara', 'notes_current', 'newsletter_section', 'approved', null::int, true, 'jordan', -6,
   '["CompTIA A+","Kinetic Labs help desk","$28/hour","Cohort 6"]'::jsonb,
   'Two years ago Amara Johnson was working retail. This year she earned her CompTIA A+ certification through Pathways and started as an IT help-desk technician at Kinetic Labs, at $28 an hour. "I used to think tech jobs were for other people," she says.'),
  ('amara_linkedin', 'amara', null, 'linkedin', 'approved', null, true, 'jordan', -5,
   '["CompTIA A+","Kinetic Labs","Pathways Cohort 6"]'::jsonb,
   'Meet Amara. A year in our Pathways Fellowship, a CompTIA A+ certification, and now an IT help-desk technician at Kinetic Labs. Proud of you, Amara, and grateful to Kinetic for hiring local talent.'),
  ('amara_hollis', 'amara', null, 'grant_anecdote', 'approved', null, true, 'lena', -6,
   '["Cohort 6 IT track","CompTIA A+","$28/hour"]'::jsonb,
   'Amara Johnson, a Cohort 6 fellow in the IT support track, earned her CompTIA A+ certification and was hired by employer partner Kinetic Labs as a help-desk technician at $28 per hour.'),
  ('amara_thanks', 'amara', null, 'thank_you', 'draft', null, true, 'remi', -4,
   '["Kinetic hired Amara","12 employee mentors"]'::jsonb,
   'Priscilla, thank you for hiring Amara and for the twelve Kinetic mentors who show up for our fellows every month. You are proving what our young people can do.'),
  ('amara_board', 'amara', 'board_next', 'board_update', 'draft', null, true, 'remi', -4,
   '["Cohort 6 placement","Kinetic Labs"]'::jsonb,
   'Story from the field: Amara Johnson (Pathways Cohort 6) now works the help desk at Kinetic Labs, one of the employers who also sends us mentors.'),
  ('amara_flash_old', 'amara', null, 'news_flash', 'discarded', null, false, 'jordan', -25, null,
   'Big news from Pathways! Amara got the job!'),
  ('luis_news', 'luis', null, 'newsletter_section', 'draft', null, true, 'simone', -6,
   '["Summer Works","Pacific Summit Bank branch operations"]'::jsonb,
   'Luis spent his Summer Works internship in branch operations at Pacific Summit Bank and was invited back for next summer. (Hold until his guardian release is signed.)')
) as x(k, story, ed, ch, st, ud, reed, who, cd, facts, body)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 10. AUDIT LOG — the rows the app itself writes for this section's actions
--     (capture appliers: capture.<dest>.create; comms send:
--     fundraising.campaign_email.send). No database trigger writes audit_log,
--     so a SQL seed produces none unless it inserts them. audit_log is
--     range-partitioned on ts with partitions only for existing months: each
--     row is inserted on its own and skipped if no partition covers its ts
--     (e.g. after a re-anchor into months that have no partition yet).
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare
  r record;
begin
  for r in
    select k.decided_at as ts, pg_temp.nb_remi() as actor,
           case k.applied_table when 'interactions' then 'capture.interaction.create'
                                when 'partner_interactions' then 'capture.partner_interaction.create'
                                when 'reed_drafts' then 'capture.message_draft.create'
                                else case k.dest when 'thought' then 'capture.thought.create' else 'capture.task.create' end end as action,
           k.applied_table as entity_type, k.applied_id as entity_id,
           jsonb_build_object('capture_id', k.capture_id, 'capture_card_id', k.id, 'dest', k.dest,
                              'entity_type', k.entity_type, 'entity_id', k.entity_id) as after
      from public.capture_cards k
     where k.org_id = pg_temp.nb_org() and k.status = 'confirmed' and k.applied_id is not null
    union all
    select c.sent_at, pg_temp.nb_user('jordan'), 'fundraising.campaign_email.send', 'email_campaigns', c.id,
           jsonb_build_object('recipients', c.recipient_count, 'sent', c.sent_count, 'failed', c.failed_count)
      from public.email_campaigns c
     where c.org_id = pg_temp.nb_org() and c.status = 'sent'
  loop
    begin
      insert into public.audit_log (ts, org_id, actor_user_id, action, entity_type, entity_id, after)
      select r.ts, pg_temp.nb_org(), r.actor, r.action, r.entity_type, r.entity_id, r.after
      where not exists (select 1 from public.audit_log a
                         where a.org_id = pg_temp.nb_org() and a.action = r.action
                           and a.entity_id = r.entity_id and a.ts = r.ts);
    exception when check_violation then
      null; -- no audit_log partition for that month: skip, never fail the seed
    end;
  end loop;
end $$;

commit;
