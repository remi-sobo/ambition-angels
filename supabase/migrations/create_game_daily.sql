-- Teen games Phase 4: the daily calendar (specs/teen-games-v1.md).
--
-- One row per game per day, pre-scheduled by a human in
-- /admin/careers/daily. Nothing about the daily is random at runtime —
-- the server reads today's row (today in America/Los_Angeles) and serves
-- it, which means nothing about a Monday morning can surprise anyone.
-- The scheduler enforces the pacing rule from the spec (at least three
-- of every seven daily jobs at job zone 3 or lower, so the reveal lands
-- as "a thing you could do", not "a thing you will never be").
--
-- Service-path only like every game table: the daily route joins this to
-- the approved card and the pool gate before anything reaches a teen.

create table if not exists game_daily (
  game       text not null check (game in ('nhoi')),
  day        date not null,
  soc_code   text not null references ms_occupations(soc_code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (game, day)
);

-- ── Access control ────────────────────────────────────────────────────────
alter table game_daily enable row level security;
revoke all on game_daily from anon, authenticated;
