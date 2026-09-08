-- Board portal seed: the FY26 Q2 and 2026 Annual Meeting, September 9, 2026.
--
-- MANUAL: a data seed run by hand in the SQL editor, never part of the
-- migration chain (scripts/check-migration-ledger.ts skips *.MANUAL.sql).
-- Re-runnable — every statement is an upsert keyed on natural identity.
--
-- Apply create_board_portal.sql FIRST; this file assumes those tables exist.
--
-- Content is the real board pack: 01-agenda-2026-09-09.md and
-- 02-pre-read-2026-09-09.md. Financial figures are the pre-read's, which
-- carry Remi's own [CONFIRM] note about the September 8 cash figure ($267,619)
-- against the August 31 balance sheet ($173,550) — the portal shows the
-- September 8 number with the August 31 close named beneath it, so a director
-- who opens both documents sees the reconciliation rather than a discrepancy.

do $$
declare
  aa        uuid;
  mtg       uuid;   -- September 9, 2026
  mar       uuid;   -- March 12, 2026
  m_todd    uuid;
  m_lara    uuid;
  m_michelle uuid;
  m_jerrel  uuid;
  m_remi    uuid;
  m_shannon uuid;
  d         record;
  item      uuid;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then raise exception 'ambition-angels org not found'; end if;

  -- ── The roster ──────────────────────────────────────────────────────────
  -- Four directors already exist from create_board.sql with names only.
  -- Match on name, fill in everything the portal needs. Remi and Shannon are
  -- new rows. Email is the sign-in key, so it is the one field that must be
  -- exactly right.
  -- Officer titles are the signed 2026 Board Elections Resolution (written
  -- ballot, final ballot received July 14 2026, certified by the Secretary
  -- July 24 2026) — NOT the design prototype, which had Vilchez and Brown as
  -- plain directors.
  --
  -- term_start / term_end are deliberately left NULL. No document in the board
  -- pack records an individual director's term dates, and /board/people prints
  -- whatever is here as governance fact. It renders "Not recorded" for a null,
  -- which is true; a plausible-looking invented range would not be.
  --
  -- Two steps, so this is correct whether or not the four legacy rows from
  -- create_board.sql are present. Step one attaches the email to any existing
  -- row matched by name — that is what lets the email-keyed upsert below find
  -- it instead of creating a duplicate. Step two upserts all six on email, so
  -- a fresh database ends up with the same roster as production does.
  update board_members set email = 'toddsingleton@gmail.com'
   where org_id = aa and name = 'Todd Singleton' and email is null;
  update board_members set email = 'lara.sellers@gmail.com'
   where org_id = aa and name = 'Lara Sellers' and email is null;
  update board_members set email = 'michelle@webuildpower.org'
   where org_id = aa and name = 'Michelle Vilchez' and email is null;
  update board_members set email = 'jerrelbrown@ymail.com'
   where org_id = aa and name = 'Jerrel Brown' and email is null;

  insert into board_members (org_id, name, email, officer_role, title, is_voting, is_staff, status) values
    (aa, 'Todd Singleton',   'toddsingleton@gmail.com',   'chair',      'Chair',                        true,  false, 'active'),
    (aa, 'Michelle Vilchez', 'michelle@webuildpower.org', 'vice_chair', 'Director and Vice Chair',      true,  false, 'active'),
    (aa, 'Lara Sellers',     'lara.sellers@gmail.com',    'secretary',  'Director and Secretary',       true,  false, 'active'),
    (aa, 'Jerrel Brown',     'jerrelbrown@ymail.com',     'treasurer',  'Director and Treasurer',       true,  false, 'active'),
    (aa, 'Remi Sobomehin',   'remi@ambitionangels.org',   'member',
     'President and CEO, voting member under Article IV',                                               true,  false, 'active'),
    (aa, 'Shannon Fair',     'shannon@ambitionangels.org','member',     'Staff, records the minutes',   false, true,  'active')
  on conflict (org_id, lower(email)) where email is not null do update set
    name = excluded.name, officer_role = excluded.officer_role, title = excluded.title,
    is_voting = excluded.is_voting, is_staff = excluded.is_staff, status = excluded.status;

  select id into m_todd     from board_members where org_id = aa and email = 'toddsingleton@gmail.com';
  select id into m_lara     from board_members where org_id = aa and email = 'lara.sellers@gmail.com';
  select id into m_michelle from board_members where org_id = aa and email = 'michelle@webuildpower.org';
  select id into m_jerrel   from board_members where org_id = aa and email = 'jerrelbrown@ymail.com';
  select id into m_remi     from board_members where org_id = aa and email = 'remi@ambitionangels.org';
  select id into m_shannon  from board_members where org_id = aa and email = 'shannon@ambitionangels.org';

  -- ── Sign-in provisioning ────────────────────────────────────────────────
  -- The magic link creates the auth user; on_auth_user_created reads this
  -- allowlist to grant the membership. Without a row here a director signs in
  -- successfully and then sees nothing, which is the worst possible failure
  -- on Wednesday. board_viewer holds board.read and reports.read, nothing
  -- more — no finance, no donors, no HR.
  -- Remi (owner) and Shannon (admin) are already seeded and are left alone;
  -- both already carry board.read AND board.write, which is what makes them
  -- board_admin in the portal.
  insert into org_email_allowlist (email, org_id, role) values
    ('toddsingleton@gmail.com',    aa, 'board_viewer'),
    ('lara.sellers@gmail.com',     aa, 'board_viewer'),
    ('michelle@webuildpower.org',  aa, 'board_viewer'),
    ('jerrelbrown@ymail.com',      aa, 'board_viewer')
  on conflict (email) do update set org_id = excluded.org_id, role = excluded.role;

  -- Anyone who already signed in before this seed (none expected) gets the
  -- membership retroactively rather than being stranded.
  insert into memberships (user_id, org_id, role)
  select u.id, aa, 'board_viewer'
  from auth.users u
  join org_email_allowlist a on a.email = lower(u.email)
  where a.org_id = aa and a.role = 'board_viewer'
  on conflict do nothing;

  -- ── The meeting ─────────────────────────────────────────────────────────
  select id into mtg from board_meetings where org_id = aa and meeting_date = '2026-09-09';
  if mtg is null then
    insert into board_meetings (org_id, meeting_date, title)
    values (aa, '2026-09-09', 'FY26 Q2 and 2026 Annual Meeting')
    returning id into mtg;
  end if;
  update board_meetings set
    title = 'FY26 Q2 and 2026 Annual Meeting',
    fiscal_label = 'FY26 Q2',
    meeting_type = 'annual',
    starts_at = timestamptz '2026-09-09 16:00:00-07',
    ends_at   = timestamptz '2026-09-09 17:30:00-07',
    location = 'Zoom',
    zoom_url = 'https://us06web.zoom.us/j/5320728761',
    zoom_room = '532 072 8761',
    status = 'upcoming',
    quorum_required = 3,
    published_at = now(),
    -- Pre-read section 3. The cash figure is September 8 and the balance
    -- sheet is the August 31 close; the note names both so a director who
    -- opens both documents sees a reconciliation rather than a contradiction
    -- (the pre-read's own CONFIRM item).
    headline_stats = jsonb_build_array(
      jsonb_build_object('value','$267,619','label','Cash on hand',
        'note','September 8. Bank balances were $173,550 at the August 31 close.'),
      jsonb_build_object('value','4.9 months','label','Runway on cash',
        'note','At the $54,723 planning burn. 10.7 months counting near-term pledges.'),
      jsonb_build_object('value','$365,000','label','Open pledges',
        'note','$115,000 of it past due since May.'))
  where id = mtg;

  -- March 12, 2026 — the record being approved on Wednesday's consent agenda.
  select id into mar from board_meetings where org_id = aa and meeting_date = '2026-03-12';
  if mar is null then
    insert into board_meetings (org_id, meeting_date, title)
    values (aa, '2026-03-12', 'FY26 Q1 Board Meeting') returning id into mar;
  end if;
  -- Titles, times and place are the filed minutes: "Board of Directors 2026 Q1
  -- Meeting Minutes", 4:00–6:00pm at Playground Global with Remi's Zoom room.
  update board_meetings set
    title = 'FY26 Q1 Board Meeting', fiscal_label = 'FY26 Q1', meeting_type = 'regular',
    starts_at = timestamptz '2026-03-12 16:00:00-07',
    ends_at   = timestamptz '2026-03-12 18:00:00-07',
    location = 'Playground Global, 380 Portage Ave., Palo Alto, CA, and Zoom',
    zoom_url = 'https://us06web.zoom.us/j/5320728761', zoom_room = '532 072 8761',
    status = 'closed', quorum_required = 3
  where id = mar;

  -- ── Agenda, seven items ─────────────────────────────────────────────────
  delete from agenda_items where meeting_id = mtg;
  insert into agenda_items (org_id, meeting_id, position, starts_at_label, title, owner,
                            duration_minutes, item_type, description, brief) values
  (aa, mtg, 1, '4:00', 'Call to order, quorum, agenda review', 'Todd Singleton', 3, 'information',
   'No additions expected. Any director may add an item here.', null),
  (aa, mtg, 2, '4:03', 'Consent agenda', 'Todd Singleton', 4, 'decision',
   'One motion covering both items. Any director may pull an item for separate discussion. Approve the minutes of the March 12, 2026 meeting, and accept the 2026 conflict of interest disclosures.',
   jsonb_build_object(
     'decision', 'Approve the March 12 minutes and accept the 2026 conflict of interest disclosures.',
     'recommends', 'Approve as one motion.',
     'motion', 'That the Board approve the minutes of the March 12, 2026 meeting and accept the 2026 conflict of interest disclosures.')),
  (aa, mtg, 3, '4:07', 'Annual meeting business', 'Todd Singleton', 10, 'decision',
   'Required under Section 6 of the Bylaws. Election of directors, receipt of the signed 2026 Board Elections Resolution, and noting the July 14, 2026 written consent amending Section 7. Note that the 2026 OFFICER election was already completed between meetings by written ballot under Section 5211 — final ballot received July 14, 2026, certified by the Secretary July 24 — electing Singleton as Chair, Vilchez as Vice Chair, Sellers as Secretary and Brown as Treasurer. That resolution is filed and is received here for the record rather than re-run.',
   jsonb_build_object(
     'decision', 'Elect the slate of directors, and receive the signed 2026 Board Elections Resolution recording the officer election of July 14, 2026.',
     'recommends', 'Elect the director slate as presented, and receive the officer resolution for the record.',
     'why', 'Section 6 of the Bylaws requires an annual meeting, and the July 14 written consent deliberately left Section 6 in force, which is why this meeting is designated the 2026 annual meeting. The officer election itself is already of record.',
     'motion', 'That the Board elect the slate of directors named in the 2026 Board Elections Resolution, and receive and file the signed 2026 Board Elections Resolution recording the election of officers effective July 14, 2026.')),
  (aa, mtg, 4, '4:17', 'CEO and financial update', 'Remi Sobomehin', 13, 'information',
   'Pre-read sections 2 and 3 carry the detail. This block is questions only, not a walkthrough. The one thing to surface live is collections: $115,000 of committed pledges is past due, some by four months.', null),
  (aa, mtg, 5, '4:30', 'Ambition for Schools: live walkthrough', 'Remi Sobomehin', 17, 'demonstration',
   'What a 9th grader sees, what her advisor sees, and one internship end to end. No slides.', null),
  (aa, mtg, 6, '4:47', 'The schools move: what it opens up, and what we charge', 'Remi Sobomehin', 33, 'decision',
   'The main work of the meeting. Pre-read sections 5 and 6. Open on the sustainability question, not on the price. We are 99.7 percent philanthropy and twelve schools covers the operating budget; then the three payers, then the price sheet and the motion.',
   jsonb_build_object(
     'decision', 'Adopt the Ambition for Schools and Organizations price sheet.',
     'recommends', 'Approve, with execution authority at or above the listed floor.',
     'why', 'School contracting conversations are open now and none of them can close without an approved floor. Sales cycles run six to nine months against budget calendars, so a price set in September is a contract signed in the spring.',
     'tradeoff', 'A $25,000 Launch tier is defensible and funds the adult surface that makes the product work. It is also more than some Title I schools will approve without a Golden State Pathways or Perkins line to draw on, and a floor set here is the anchor for every negotiation after it.',
     'motion', 'That the Board adopt the Ambition for Schools and Organizations price sheet as presented; authorize the President and CEO to execute agreements at or above the listed floor without further Board action; require Chair approval for any agreement below the floor; and approve East Palo Alto Academy as a research and design partner for the 2026-27 school year at no cost, under a written agreement naming the year two price.')),
  (aa, mtg, 7, '5:20', 'Records, next meeting dates, adjourn', 'Todd Singleton', 10, 'discussion',
   'Note for the record that agendas and minutes are now generated from the board portal for the corporate minute book, drafted by Shannon, signed by the Secretary, and filed back to the portal before the following meeting. Set FY27 meeting dates.', null);

  -- ── March 12 minutes, as structured JSON ────────────────────────────────
  -- Converted per spec §6 from the FILED minutes (Board of Directors 2026 Q1
  -- Meeting Minutes, March 12 2026). This is the template for every meeting
  -- after it; the rest of the archive stays as filed PDFs.
  --
  -- One thing to be exact about: the meeting recorded exactly ONE motion —
  -- approval of the FY25 Q3 special meeting minutes. The board "affirmed",
  -- "expressed enthusiasm for" and "encouraged" the village strategy and the
  -- subscription pilots, and confirmed the dashboard on the roadmap, but none
  -- of that was moved, seconded or voted. They are minuted as discussion, and
  -- they do NOT appear in `resolutions`. A decisions register that lists
  -- motions the board never made is a false corporate record.
  insert into minutes (org_id, meeting_id, called_to_order_at, adjourned_at, quorum_met,
                       approved_at, body)
  values (aa, mar, '4:21 PM Pacific', '6:12 PM Pacific', true, null, jsonb_build_object(
    'present', jsonb_build_array('Todd Singleton','Michelle Vilchez','Lara Sellers','Remi Sobomehin'),
    'absent', jsonb_build_array('Jerrel Brown'),
    'staff_present', jsonb_build_array('Shannon Fair'),
    'sections', jsonb_build_array(
      jsonb_build_object('type','heading','text','Welcome, call to order'),
      jsonb_build_object('type','paragraph','text','Called to order by Todd Singleton at 4:21 PM. Quorum established. Todd reviewed the agenda with the Board; no additions or changes were requested.'),
      jsonb_build_object('type','heading','text','Approval of minutes'),
      jsonb_build_object('type','paragraph','text','The Board reviewed the FY25 Q3 Special Board Meeting Minutes. Lara Sellers confirmed she had reviewed the minutes following distribution by Shannon prior to the meeting.'),
      jsonb_build_object('type','decision','motion','That the Board approve the FY25 Q3 Special Board Meeting Minutes.','moved_by','Lara Sellers','seconded_by','Todd Singleton','for',3,'against',0,'abstained',jsonb_build_array('Michelle Vilchez'),'outcome','passed','note','Passed by majority. Vilchez abstained, not present at the meeting in question.'),
      jsonb_build_object('type','heading','text','Financial overview'),
      jsonb_build_object('type','paragraph','text','Remi presented the Q1 FY26 financial overview, noting the organization is at one of its lowest cash positions since founding. Two of its largest funders were lost: the Koshland Foundation ($250,000, conclusion of a planned three-year grant) and the Pelling Foundation ($150,000, following a three-year cycle and an RFP process in which Ambition Angels was not selected for renewal), against an approximately $900,000 annual budget. The organization had also expanded the team more rapidly than warranted, increasing expenses without accelerating fundraising, and has since returned to a lean two-person structure of Remi Sobomehin and Shannon Fair. Remi reported $325,000 in pledges expected, providing some runway at the current burn rate.'),
      jsonb_build_object('type','heading','text','Funding diversification'),
      jsonb_build_object('type','paragraph','text','The Board discussed diversifying beyond major institutional grants: corporate philanthropy through Fast Forward''s network, including a warm connection to the head of corporate philanthropy at Twilio made during the accelerator; government partnerships through the juvenile justice system, where Lara noted the FLY Program recently applied for a $10.5 million grant and suggested exploring whether Ambition Angels could access part of that ecosystem for partner programs; and San Mateo County, where Michelle noted a projected $70–100 million deficit that may reduce direct county funding, alongside potential through Measure K dollars and increased outsourcing of services to nonprofits.'),
      jsonb_build_object('type','heading','text','Product roadmap: learnings from direct-to-teen engagement'),
      jsonb_build_object('type','paragraph','text','Approximately 1,000 teens were recruited to the Ambition App over six months. Fewer than 50 were consistently engaged, a retention rate the Board agreed is insufficient for a scalable app-based model; the small financial stipend tested as the primary engagement driver proved insufficient on its own. Analysis of the highest-performing students showed a clear pattern: consistent engagement with a trusted adult is the strongest predictor of sustained use and positive outcomes, with the highest engagement among students embedded in structured relationships through CASA, Aim High and Big Brothers Big Sisters. The Board affirmed that the impact visible in student digital journal reflections represents meaningful, documentable outcomes. Remi highlighted Ethan, who completed seven internships, earned $775, and recorded a video reflection on a sales internship.'),
      jsonb_build_object('type','heading','text','Product pivot: the village strategy'),
      jsonb_build_object('type','paragraph','text','Remi presented a confirmed shift in go-to-market strategy, from direct-to-teen engagement to building through the adults in a student''s life — parents, grandparents, mentors, CASA volunteers, after-school program staff and charter school teachers. An adult dashboard login was confirmed on the product roadmap with an MVP expected within 90 days, allowing adults to view students within their purview and track internship completions and career exploration, send nudges through the app, and access quarterly data reports for organizational accounts. The Board discussed a subscription-based earned revenue model at approximately $5 to $6 per student per month, expressed enthusiasm for the direction, and encouraged moving forward with small pilot runs.'),
      jsonb_build_object('type','heading','text','Ambition Coach pilot'),
      jsonb_build_object('type','paragraph','text','Remi introduced the Ambition Coach concept, connecting high-engagement students with mentors in their field of interest for a structured short-term coaching experience. A four-week pilot is launching with Charles, a 20-year-old who used the app to explore marketing and secured an internship at a tech company, now being connected with a former NVIDIA marketing manager to co-design the first offering. Charles is also the featured student in the Fast Forward mini-documentary.'),
      jsonb_build_object('type','heading','text','Fundraising strategy'),
      jsonb_build_object('type','paragraph','text','The first Launch and Learn is scheduled for Saturday, April 25, 2026, 4:00 to 7:00 PM in Los Altos, hosted by Sheela and Jay Boddu, who will cover food and beverages. The event includes a student story presentation and a fundraising ask, with donation tiers beginning at $500 and no ceiling, and a target of at least 20 guests. Each board member committed to identifying three to five individuals from their network. Remi will pitch at Fast Forward Demo Day in San Francisco on May 28, 2026, where the mini-documentary featuring Charles will screen and a public fundraising goal of $500,000 will be announced.'),
      jsonb_build_object('type','heading','text','Board development'),
      jsonb_build_object('type','paragraph','text','The Board discussed adding up to three new members focused on the funding and corporate philanthropic community. Mieke Barrows: the Board''s recommendation was to cultivate her as a major donor rather than a board member, based on her prior board experience and comfort level with fundraising asks. Steve Harrod, introduced through Lara Sellers: discussed positively as a candidate with strong corporate and VC connections and a personal interest in youth career development, and effective at opening doors to corporate partners.'),
      jsonb_build_object('type','heading','text','Adjournment'),
      jsonb_build_object('type','paragraph','text','Adjourned at 6:12 PM by Todd Singleton. The date of the next board meeting was not confirmed at that time.')
    )))
  on conflict (meeting_id) do update set
    body = excluded.body, called_to_order_at = excluded.called_to_order_at,
    adjourned_at = excluded.adjourned_at, quorum_met = excluded.quorum_met
  where minutes.approved_at is null;

  -- ── Continuity: what the board decided, and what is still open ──────────
  -- One motion, because one motion is what the minutes record.
  delete from resolutions where meeting_id = mar;
  insert into resolutions (org_id, meeting_id, motion_text, moved_by, seconded_by,
                           votes_for, votes_against, abstentions, passed, notes) values
  (aa, mar, 'That the Board approve the FY25 Q3 Special Board Meeting Minutes.',
   'Lara Sellers', 'Todd Singleton', 3, 0, '{"Michelle Vilchez"}', true,
   'Passed by majority. Vilchez abstained; not present at the meeting in question.');

  -- The 2026 officer election happened between meetings, by written ballot
  -- under Section 5211 — final ballot July 14, certified by the Secretary
  -- July 24. It belongs in the decisions register: it is a board action of
  -- record, and a director looking for "when did we elect officers" will look
  -- here. It hangs off the March meeting because that is the meeting it
  -- follows; there is no separate written-consent meeting row.
  insert into resolutions (org_id, meeting_id, motion_text, moved_by, seconded_by,
                           votes_for, votes_against, abstentions, passed, notes)
  select aa, mar,
    'That, based on the results of the 2026 Board election, the following individuals are elected as officers effective July 14, 2026: Todd Singleton as Chair, Michelle Vilchez as Vice Chair, Lara Sellers as Secretary, and Jerrel Brown as Treasurer, to serve until their successors are duly elected and qualified.',
    null, null, null, null, '{}', true,
    'Adopted by written ballot circulated to all directors outside a meeting under Bylaws and California Corporations Code Section 5211. Final ballot received July 14, 2026; certified by Lara Sellers, Secretary, July 24, 2026.'
  where not exists (
    select 1 from resolutions r
    where r.meeting_id = mar and r.motion_text like 'That, based on the results of the 2026 Board election%');

  -- Open items carried into Wednesday. These are the real action items from
  -- the March minutes, plus the two commitments the pre-read reports against.
  delete from follow_ups where meeting_id = mtg and source_meeting_id = mar;
  insert into follow_ups (org_id, meeting_id, source_meeting_id, description, owner, due_date, status, completed_at, note) values
  (aa, mtg, mar, 'Return to the Board with a framework for evaluating board candidates, prioritising individuals with access to the funding community',
   'Remi Sobomehin', null, 'in_progress', null, 'Action item recorded March 12'),
  (aa, mtg, mar, 'Each director identify three to five individuals from their network for the Launch and Learn',
   'All directors', '2026-04-25', 'done', '2026-04-25', 'Launch and Learn held April 25'),
  (aa, mtg, mar, 'Send calendar invitations for the April 25 Launch and Learn and the May 28 Fast Forward Demo Day',
   'Shannon Fair', '2026-04-25', 'done', '2026-04-01', 'Both events held'),
  (aa, mtg, mar, 'Ship the adult dashboard MVP within 90 days',
   'Remi Sobomehin', '2026-06-10', 'done', '2026-06-04', 'Confirmed on the roadmap March 12; shipped and became the foundation of Ambition for Schools'),
  (aa, mtg, mar, 'Run small subscription pilots at the per-student licensing fee the Board encouraged',
   'Remi Sobomehin', null, 'in_progress', null, 'Became the Schools and Organizations price sheet, on Wednesday''s agenda'),
  (aa, mtg, mar, 'Sign the 2026 conflict of interest disclosure',
   'Jerrel Brown', null, 'overdue', null, 'Outstanding for the 2026 cycle');

  -- ── Per-director prep, RSVP, and COI ────────────────────────────────────
  -- Completion is per-director and never shown to another director.
  for d in select id, is_staff from board_members where org_id = aa and status = 'active' loop
    insert into meeting_attendance (org_id, meeting_id, board_member_id, is_staff)
    values (aa, mtg, d.id, d.is_staff)
    on conflict (meeting_id, board_member_id) do update set is_staff = excluded.is_staff;

    if not d.is_staff then
      insert into prep_items (org_id, meeting_id, board_member_id, position, label, sub_label, href, minutes_est) values
        (aa, mtg, d.id, 1, 'Read the board pre-read', 'Twelve pages. Section 6 is the decision.', '/board/meetings/' || mtg || '#item-4', 8),
        (aa, mtg, d.id, 2, 'Review the March 12, 2026 minutes for approval', 'On the consent agenda.', '/board/meetings/' || mtg || '#item-2', 3),
        (aa, mtg, d.id, 3, 'Sign your 2026 conflict of interest disclosure', 'Annual cycle.', '/board/library', 2),
        (aa, mtg, d.id, 4, 'Bring one school district and one youth organization introduction', 'An introduction to whoever decides, not a fundraising ask.', null, 5)
      on conflict (meeting_id, board_member_id, label) do nothing;

      -- 2026 cycle per the pre-read: signed by Sellers, Singleton, Sobomehin
      -- and Vilchez, outstanding from Brown. The signing DATES are not in any
      -- document we hold, so status carries the fact and signed_at stays null.
      insert into coi_disclosures (org_id, board_member_id, year, status)
      select aa, d.id, 2026,
             case when d.id = m_jerrel then 'outstanding' else 'signed' end
      on conflict (board_member_id, year) do update set status = excluded.status;
    end if;
  end loop;

  -- Directors who have already told Remi they are coming. Attendance is not
  -- private — quorum is the board's business — so this tally shows to everyone.
  update meeting_attendance set rsvp = 'yes'
   where meeting_id = mtg and board_member_id in (m_todd, m_lara, m_remi, m_michelle);

  raise notice 'Board portal seeded: meeting %, 6 members, 7 agenda items.', mtg;
end $$;
