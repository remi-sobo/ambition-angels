create table if not exists public.shared_notes (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id) on delete cascade,
  meeting_id       uuid not null references public.board_meetings(id) on delete cascade,
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

drop policy if exists "author sends note" on public.shared_notes;
create policy "author sends note" on public.shared_notes
  for insert to authenticated
  with check ( board_member_id = (select private.board_member_id(org_id)) );

drop policy if exists "author or admin reads note" on public.shared_notes;
create policy "author or admin reads note" on public.shared_notes
  for select to authenticated
  using (
    board_member_id = (select private.board_member_id(org_id))
    or (select private.has_permission(org_id, 'board.write'))
  );
