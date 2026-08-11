-- Teen games Phase 5: The Cut room state (specs/teen-games-v1.md).
--
-- Ephemeral by design, like ms_rooms: a room lives for one class period
-- and expires. Three tables instead of one jsonb blob because 25 phones
-- vote concurrently — votes are rows with a primary key, so a student
-- refreshing mid-vote upserts their own vote instead of racing a
-- read-modify-write on shared state (Phase 5 definition of done: the room
-- survives a refresh).
--
-- No PII anywhere: unlike ms_rooms there is no host email (The Cut
-- delivers nothing afterward), voters are client-generated random ids in
-- localStorage, and the board snapshot is career data. The full board —
-- pay, job zone, RIASEC — lives server-side in cut_rooms.state; the
-- public state route serializes only what the current phase may show
-- (un-cut careers never expose the stats the rules are quizzing on).
--
-- Access model: service-path only, same as every ms_/game table. anon and
-- authenticated get nothing; all reads and writes go through
-- /api/games/the-cut/* route handlers.

create table if not exists cut_rooms (
  id         uuid primary key default gen_random_uuid(),
  room_code  text not null unique,            -- 4-char, lib/ms/claim.ts alphabet
  host_token uuid not null default gen_random_uuid(),
  -- Snapshot at creation: careers (with stats), shuffled rule deck, cuts
  -- so far, lives. Rules resolve against this snapshot — a pool edit
  -- mid-game cannot change a board already on a projector.
  state      jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '3 hours'
);

create table if not exists cut_players (
  room_id   uuid not null references cut_rooms(id) on delete cascade,
  voter_id  text not null,                    -- random client id, no identity
  joined_at timestamptz not null default now(),
  primary key (room_id, voter_id)
);

create table if not exists cut_votes (
  room_id   uuid not null references cut_rooms(id) on delete cascade,
  round     int not null,
  voter_id  text not null,
  soc_code  text not null,
  voted_at  timestamptz not null default now(),
  primary key (room_id, round, voter_id)      -- one vote per phone per round; re-vote replaces
);

create index if not exists cut_votes_room_round_idx on cut_votes (room_id, round);

-- ── Access control ────────────────────────────────────────────────────────
alter table cut_rooms enable row level security;
alter table cut_players enable row level security;
alter table cut_votes enable row level security;
revoke all on cut_rooms from anon, authenticated;
revoke all on cut_players from anon, authenticated;
revoke all on cut_votes from anon, authenticated;
