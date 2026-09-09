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
  u_second  uuid := '00000000-0000-0000-0000-0000000000a4';
  m_lara    uuid;
  m_todd    uuid;
  m_admin   uuid;
  m_second  uuid;
  mtg       uuid;
  item      uuid;
begin
  select id into aa from orgs where slug = 'ambition-angels';

  -- Three principals: one board_admin (holds board.write) and two directors.
  insert into auth.users (id, email) values
    (u_admin, 'notes-admin@example.org'),
    (u_lara,  'notes-lara@example.org'),
    (u_todd,  'notes-todd@example.org'),
    (u_second,'notes-second-admin@example.org')
  on conflict (id) do nothing;

  insert into memberships (user_id, org_id, role) values
    (u_admin, aa, 'admin'),
    (u_lara,  aa, 'board_viewer'),
    (u_todd,  aa, 'board_viewer'),
    -- A SECOND holder of board.write, standing in for Shannon. She may run
    -- the meeting and file materials; she may not read a note a director
    -- addressed to somebody else.
    (u_second, aa, 'admin')
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

  -- The designated recipient: holds board.write AND carries the flag.
  insert into board_members (org_id, name, email, status, receives_shared_notes)
  values (aa, 'Notes Remi', 'notes-admin@example.org', 'active', true)
  on conflict (org_id, lower(email)) where email is not null
    do update set status = 'active', receives_shared_notes = true
  returning id into m_admin;

  -- Board admin, but NOT the recipient. This row is the whole point.
  insert into board_members (org_id, name, email, status, receives_shared_notes)
  values (aa, 'Notes Second Admin', 'notes-second-admin@example.org', 'active', false)
  on conflict (org_id, lower(email)) where email is not null
    do update set status = 'active', receives_shared_notes = false
  returning id into m_second;

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

-- ── Sharing: a deliberate copy, not a hole in the wall ────────────────────
-- Lara sends her note on. The private note must be untouched by it, and the
-- admin must be able to read the COPY while still reading none of the source.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$
declare
  v_org   uuid;
  v_mtg   uuid;
  v_item  uuid;
  v_other uuid;
begin
  -- Taken from the fixture row rather than hardcoded, so this block cannot
  -- pass for the wrong reason if the fixture ids change.
  select org_id, meeting_id, agenda_item_id into v_org, v_mtg, v_item
  from member_notes limit 1;

  insert into shared_notes (org_id, meeting_id, agenda_item_id, board_member_id, body)
  select org_id, meeting_id, agenda_item_id, board_member_id, body from member_notes;

  -- She can read back what she sent.
  if (select count(*) from shared_notes) <> 1 then
    raise exception 'FAIL: the author cannot read the note she sent (got %)',
      (select count(*) from shared_notes);
  end if;

  -- Sending copies. It does not move, delete or alter the private note.
  if (select count(*) from member_notes) <> 1 then
    raise exception 'FAIL: sending changed member_notes (got % rows)',
      (select count(*) from member_notes);
  end if;

  -- She cannot send as somebody else. A real director's id, so this is
  -- refused by the policy and not by a foreign key.
  select id into v_other from board_members
  where org_id = v_org and id <> private.board_member_id(v_org) limit 1;
  if v_other is null then
    raise exception 'FIXTURE: expected a second board member to forge against';
  end if;
  begin
    insert into shared_notes (org_id, meeting_id, agenda_item_id, board_member_id, body)
    values (v_org, v_mtg, v_item, v_other, 'forged');
    raise exception 'FAIL: a director can send a note as another director';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- ── As Todd: another director sees no part of a note sent to the Chair ─────
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$
begin
  if (select count(*) from shared_notes) <> 0 then
    raise exception 'FAIL: another director can read a sent note (got % rows)',
      (select count(*) from shared_notes);
  end if;
end $$;

-- ── As the OTHER board admin: board.write is not enough ───────────────────
-- She holds board.write, so she can run the meeting and file materials. The
-- note was addressed to one person and she is not that person.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
do $$
begin
  if (select count(*) from shared_notes) <> 0 then
    raise exception 'FAIL: board.write alone can read a note sent to someone else (got % rows)',
      (select count(*) from shared_notes);
  end if;
  if (select count(*) from member_notes) <> 0 then
    raise exception 'FAIL: a second board_admin can read member_notes (got % rows)',
      (select count(*) from member_notes);
  end if;
end $$;

-- ── As the designated recipient: the copy YES, the private note still NO ──
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
begin
  if (select count(*) from shared_notes) <> 1 then
    raise exception 'FAIL: the recipient cannot read a note sent to him (got %)',
      (select count(*) from shared_notes);
  end if;

  -- The whole point. Sharing one note must not have opened member_notes.
  if (select count(*) from member_notes) <> 0 then
    raise exception 'FAIL: the recipient gained a read path to member_notes (got % rows)',
      (select count(*) from member_notes);
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
  if (select count(*) from shared_notes) <> 0 then
    raise exception 'FAIL: anonymous can read shared_notes';
  end if;
end $$;

reset role;
reset request.jwt.claim.sub;

select 'board notes isolation: ALL CHECKS PASSED' as result;
