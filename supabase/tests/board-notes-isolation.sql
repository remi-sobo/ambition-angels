-- Board portal: private-notes isolation.
--
-- The handoff's condition, stated as a test rather than as a promise:
-- "member_notes is readable only by the owning board member. board_admin must
--  have NO read path to it, in policy and in practice. Verify this by querying
--  as an admin and getting zero rows."
--
-- This is the property the whole feature rests on. If a director suspects the
-- CEO can read her notes she stops writing honest ones, and an unused feature
-- is better than a dishonest one. So the guarantee is asserted from the
-- database's own point of view, as each principal, rather than trusted to
-- application code.
--
-- Run by scripts/test-rls.sh against a scratch Postgres. Never production.

\set ON_ERROR_STOP on

do $$
declare
  aa        uuid;
  u_admin   uuid := '00000000-0000-0000-0000-0000000000a1';
  u_lara    uuid := '00000000-0000-0000-0000-0000000000a2';
  u_todd    uuid := '00000000-0000-0000-0000-0000000000a3';
  m_lara    uuid;
  m_todd    uuid;
  mtg       uuid;
  item      uuid;
begin
  select id into aa from orgs where slug = 'ambition-angels';

  -- Three principals: one board_admin (holds board.write) and two directors.
  insert into auth.users (id, email) values
    (u_admin, 'notes-admin@example.org'),
    (u_lara,  'notes-lara@example.org'),
    (u_todd,  'notes-todd@example.org')
  on conflict (id) do nothing;

  insert into memberships (user_id, org_id, role) values
    (u_admin, aa, 'admin'),
    (u_lara,  aa, 'board_viewer'),
    (u_todd,  aa, 'board_viewer')
  on conflict do nothing;

  insert into board_members (org_id, name, email, status)
  values (aa, 'Notes Lara', 'notes-lara@example.org', 'active')
  on conflict (org_id, lower(email)) where email is not null do update set status = 'active'
  returning id into m_lara;
  if m_lara is null then
    select id into m_lara from board_members where org_id = aa and email = 'notes-lara@example.org';
  end if;

  insert into board_members (org_id, name, email, status)
  values (aa, 'Notes Todd', 'notes-todd@example.org', 'active')
  on conflict (org_id, lower(email)) where email is not null do update set status = 'active'
  returning id into m_todd;
  if m_todd is null then
    select id into m_todd from board_members where org_id = aa and email = 'notes-todd@example.org';
  end if;

  insert into board_meetings (org_id, meeting_date, title, fiscal_label)
  values (aa, '2099-01-01', 'Notes isolation fixture', 'TEST')
  returning id into mtg;

  insert into agenda_items (org_id, meeting_id, position, title)
  values (aa, mtg, 1, 'Fixture item') returning id into item;

  -- Lara's private note, written as the service role (stands in for her own
  -- authenticated write; the policy is exercised on the reads below).
  insert into member_notes (org_id, meeting_id, agenda_item_id, board_member_id, body)
  values (aa, mtg, item, m_lara, 'Lara private: the price is too low for a Title I school.');

  -- And a question, to prove the two tables behave DIFFERENTLY on purpose:
  -- questions are visible to board_admin, notes are not.
  insert into member_questions (org_id, meeting_id, board_member_id, body)
  values (aa, mtg, m_lara, 'Lara question: what is the EOYDC floor?');
end $$;

set role authenticated;

-- ── As Lara: she sees her own note ────────────────────────────────────────
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$
begin
  if (select count(*) from member_notes) <> 1 then
    raise exception 'FAIL: the author cannot read her own note (got %)', (select count(*) from member_notes);
  end if;
end $$;

-- ── As Todd, another director: he sees nothing ────────────────────────────
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$
begin
  if (select count(*) from member_notes) <> 0 then
    raise exception 'FAIL: another director can read the note (got % rows)', (select count(*) from member_notes);
  end if;
end $$;

-- ── As board_admin: ZERO ROWS. This is the assertion that matters. ────────
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare n int;
begin
  select count(*) into n from member_notes;
  if n <> 0 then
    raise exception 'FAIL: board_admin can read % private note row(s)', n;
  end if;

  -- An admin must not be able to write into a director's notes either —
  -- an UPDATE that silently affects zero rows is the correct outcome.
  update member_notes set body = 'tampered';
  if found then
    raise exception 'FAIL: board_admin can write to member_notes';
  end if;

  -- ...but questions ARE visible to the admin, who answers them. If this
  -- fails, the asymmetry has been flattened in the wrong direction.
  if (select count(*) from member_questions) <> 1 then
    raise exception 'FAIL: board_admin cannot read member_questions (got %)',
      (select count(*) from member_questions);
  end if;
end $$;

-- ── As anon: nothing, obviously ───────────────────────────────────────────
reset role;
reset request.jwt.claim.sub;
set role anon;
do $$
begin
  if (select count(*) from member_notes) <> 0 then
    raise exception 'FAIL: anonymous can read member_notes';
  end if;
end $$;

reset role;
reset request.jwt.claim.sub;

select 'board notes isolation: ALL CHECKS PASSED' as result;
