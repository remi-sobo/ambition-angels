-- Shared notes: a director's deliberate act of sending a private note on.
--
-- WHY A SECOND TABLE, AND NOT A READ PATH ON member_notes.
--
-- member_notes is private absolutely: only the director who wrote a note can
-- read it, board_admin has no read path in RLS or in application code, and
-- supabase/tests/board-notes-isolation.sql proves it. That guarantee is the
-- reason the notes box gets used at all — the moment a director suspects the
-- Chair can read her thinking, she stops writing it down, and the feature is
-- worth nothing.
--
-- So sending a note does not expose the note. It COPIES the text into this
-- table, by an explicit act of its author. Three consequences, all wanted:
--
--   * member_notes keeps its policy unchanged and its test still passes.
--   * The copy is frozen at the moment of sending. Editing the private note
--     afterwards does not rewrite what the Chair received, which is what
--     makes this a record rather than a live document.
--   * The director can see exactly what she sent, because it is a row she
--     owns, not a view onto something else.
--
-- No update and no delete policy, for anyone. A sent note is a record.

create table if not exists public.shared_notes (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id) on delete cascade,
  meeting_id       uuid not null references public.board_meetings(id) on delete cascade,
  -- Null when the note was written against the meeting as a whole rather than
  -- one agenda item, and on set null so deleting an item never destroys a
  -- director's sent record.
  agenda_item_id   uuid references public.agenda_items(id) on delete set null,
  board_member_id  uuid not null references public.board_members(id) on delete cascade,
  body             text not null,
  created_at       timestamptz not null default now()
);

create index if not exists shared_notes_meeting_idx
  on public.shared_notes (meeting_id, created_at desc);
create index if not exists shared_notes_author_idx
  on public.shared_notes (board_member_id, created_at desc);

alter table public.shared_notes enable row level security;

-- Only the author may send, and only as herself.
drop policy if exists "author sends note" on public.shared_notes;
create policy "author sends note" on public.shared_notes
  for insert to authenticated
  with check ( board_member_id = (select private.board_member_id(org_id)) );

-- The author reads back what she sent; board.write reads what was sent to it.
-- This is the only admin read path over director-authored text in the board
-- schema, and it is sound because every row here was put here on purpose by
-- the director named on it. member_notes must never gain a policy like this.
drop policy if exists "author or admin reads note" on public.shared_notes;
create policy "author or admin reads note" on public.shared_notes
  for select to authenticated
  using (
    board_member_id = (select private.board_member_id(org_id))
    or (select private.has_permission(org_id, 'board.write'))
  );
