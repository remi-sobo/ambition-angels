-- /ms Phase 5: rooms (specs/ms-career-game.md group flow, D5).
--
-- A room is a facilitator's 30 minutes: a 4-character code on a projected
-- screen, students joining from their own devices, random tables of four
-- with career dedup, and one email to the facilitator at the end.
--
-- host_email is an adult's (the facilitator opens the room; students never
-- type an email anywhere). host_token gates the two host-only actions —
-- assigning tables and sending the delivery — because the room code itself
-- is on the wall for every kid in the room to see.
--
-- Students carry no names: ms_sessions.handle is an auto-assigned
-- "Swift Fox" style label (lib/ms/handles.ts). The spec said the room
-- screen fills with names; the harder rule won — no free text from a child
-- ever exists, and a typed name is free text.
--
-- Service-path only, like every ms_ table.

create table if not exists ms_rooms (
  id                uuid primary key default gen_random_uuid(),
  room_code         text unique not null,        -- 4 chars, unambiguous alphabet
  host_email        text not null,
  host_token        uuid not null default gen_random_uuid(),
  table_assignments jsonb,                       -- {assigned_at, tables:[{n, members:[{session_id, handle, soc_code}]}]}
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '6 hours'
);

-- Sessions join a room and get a handle. Both were reserved in Phase 2;
-- the FK and handle column land here with the table they reference.
alter table ms_sessions add column if not exists handle text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ms_sessions_room_id_fkey'
      and conrelid = 'ms_sessions'::regclass
  ) then
    alter table ms_sessions
      add constraint ms_sessions_room_id_fkey
      foreign key (room_id) references ms_rooms(id) on delete set null;
  end if;
end $$;

create index if not exists ms_sessions_room_id_idx on ms_sessions (room_id);

alter table ms_rooms enable row level security;
revoke all on ms_rooms from anon, authenticated;
