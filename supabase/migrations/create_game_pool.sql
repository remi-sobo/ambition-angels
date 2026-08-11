-- Teen games Phase 1: the play pool (specs/teen-games-v1.md).
--
-- The gate between the ~900 imported occupations and anything a teen sees
-- in Higher Wage, Never Heard of It, or The Cut. The raw O*NET import
-- contains catch-all SOC codes ("Managers, All Other"), duplicate
-- near-titles, and occupations with null pay — none of which make a fair
-- round. An occupation is not playable until a row here says it is, and a
-- row only says so after a human (Remi, in /admin/careers/pool) flipped it
-- eligible and approved its one-line reveal.
--
-- Same access model as the other ms_/game tables (no org_id — this is
-- public-product data, not tenant data): anon and authenticated get
-- nothing; the games read it service-role through /api/games/* route
-- handlers, and all writes are service-role through the admin routes.
-- Games never write here (locked decision 5) — the only writers are the
-- admin review screen.

create table if not exists game_pool (
  soc_code    text primary key references ms_occupations(soc_code) on delete cascade,
  eligible    boolean not null default false,
  -- Per-game opt-outs: a row can be pool-eligible but held out of one game
  -- (e.g. a title too guessable for the daily, fine for Higher Wage).
  higher_wage boolean not null default true,
  daily       boolean not null default true,
  the_cut     boolean not null default true,
  -- One line, read aloud or shown at reveal ("Designs the sound for
  -- concerts and games"). Written or approved by a human, never a model.
  reveal_line text,
  approved_by text,
  approved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A row cannot be eligible without a reveal line and a human approval
-- stamp — structural, like ms_cards_approved_requires_review, so even
-- future service-role code can't flip a row eligible unreviewed.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'game_pool_eligible_requires_approval'
      and conrelid = 'game_pool'::regclass
  ) then
    alter table game_pool add constraint game_pool_eligible_requires_approval
      check (
        not eligible
        or (
          reveal_line is not null and length(trim(reveal_line)) > 0
          and approved_by is not null and approved_at is not null
        )
      );
  end if;
end $$;

create index if not exists game_pool_eligible_idx on game_pool (eligible);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists game_pool_set_updated_at on game_pool;
create trigger game_pool_set_updated_at
  before update on game_pool
  for each row execute function set_updated_at();

-- ── Access control ────────────────────────────────────────────────────────
alter table game_pool enable row level security;
revoke all on game_pool from anon, authenticated;
