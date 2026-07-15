-- /ms Phase 3: explored cards (specs/ms-career-game.md, D8).
--
-- One row per (session, career) a student has taken all the way to THE
-- ANSWER. clues_used is the calibration metric — the only number that says
-- whether the clue ladder works (median should land around clue 4-5). It
-- cannot be skipped: the answer reveal and this insert are the same route
-- handler call (/api/ms/reveal), so getting the title means telling us
-- which clue the table was on.
--
-- These rows are also the deck (Phase 4): everything a student explored,
-- reachable later by claim code. Service-path only, like every ms_ table.

create table if not exists ms_explored (
  session_id  uuid not null references ms_sessions(id) on delete cascade,
  soc_code    text not null references ms_cards(soc_code) on delete cascade,
  clues_used  int not null check (clues_used between 1 and 8),
  created_at  timestamptz not null default now(),
  primary key (session_id, soc_code)
);

create index if not exists ms_explored_soc_code_idx on ms_explored (soc_code);

alter table ms_explored enable row level security;
revoke all on ms_explored from anon, authenticated;
