-- Ambition Angels website database: baseline (specs/bloomos-repo-split.md §5b, phase 2b).
--
-- Applied to the Ambition Angels Supabase project (sfmlktoeveovujjurihn), never
-- to BloomOS. Lives under supabase/site/ until split day, when it becomes the
-- first file of the Ambition Angels repo's supabase/migrations/.
--
-- Copied column for column from the BloomOS production definitions as of
-- 2026-11-23, with three deliberate differences:
--
--   1. page_views and click_events lose org_id. This database belongs to one
--      website; there is no orgs table here and nothing to point at.
--   2. Their read policies (BloomOS has_permission(..., 'reports.read')) are
--      gone. Every table here is service-role only: RLS on, no policies. The
--      website admin reads through the server after checking SITE_ADMIN_EMAILS.
--      (The games and career-library tables were already service-role only in
--      BloomOS; the has_permission() policies the spec mentions had been
--      dropped there before this baseline was cut.)
--   3. New: intake_outbox, the website's record of every form it sent to the
--      BloomOS intake API, and the queue for any that didn't land.
--
-- Hard rules that carry over: ms_catalog never exposes title or clue_8, and
-- no table here holds a student name or email.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Career library ─────────────────────────────────────────────────────

create table if not exists public.ms_occupations (
  soc_code          text primary key,
  onet_soc_code     text,
  title             text not null,
  title_variants    text[] not null default '{}'::text[],
  description       text,
  tasks             text[] not null default '{}'::text[],
  riasec            jsonb not null,
  job_zone          integer not null check (job_zone >= 1 and job_zone <= 5),
  pay_median        integer,
  pay_p90           integer,
  education_typical text,
  pay_source_url    text not null,
  pay_as_of         text not null,
  imported_at       timestamptz not null default now()
);
create index if not exists ms_occupations_job_zone_idx on public.ms_occupations (job_zone);

create table if not exists public.ms_cards (
  soc_code         text primary key references public.ms_occupations(soc_code) on delete cascade,
  field            text check (field = any (array['business','tech','health','creative','trades','public'])),
  day_vignette     text,
  clue_1           text,
  clue_2           text,
  clue_3           text,
  clue_4           text,
  clue_5           text,
  clue_6           text,
  clue_7           text,
  clue_8           text,
  status           text not null default 'draft' check (status = any (array['draft','approved','retired'])),
  generated_by     text,
  generated_at     timestamptz,
  reviewed_by      text,
  reviewed_at      timestamptz,
  reading_grade    numeric,
  last_gate_result jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint ms_cards_approved_requires_review
    check (status <> 'approved' or (reviewed_by is not null and reviewed_at is not null))
);
create index if not exists ms_cards_status_idx on public.ms_cards (status);
drop trigger if exists ms_cards_set_updated_at on public.ms_cards;
create trigger ms_cards_set_updated_at before update on public.ms_cards
  for each row execute function public.set_updated_at();

-- Approved cards only, and never title or clue_8 (those reach a player only
-- through the reveal route, which records clues_used).
create or replace view public.ms_catalog as
  select c.soc_code, c.field, c.day_vignette,
         c.clue_1, c.clue_2, c.clue_3, c.clue_4, c.clue_5, c.clue_6, c.clue_7,
         o.riasec, o.job_zone, o.pay_median, o.pay_p90, o.pay_as_of, o.pay_source_url
  from public.ms_cards c
  join public.ms_occupations o using (soc_code)
  where c.status = 'approved';

-- ── What Are You Built For ─────────────────────────────────────────────

create table if not exists public.ms_rooms (
  id                uuid primary key default gen_random_uuid(),
  room_code         text not null unique,
  host_email        text not null,
  host_token        uuid not null default gen_random_uuid(),
  table_assignments jsonb,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default (now() + interval '6 hours')
);

create table if not exists public.ms_sessions (
  id             uuid primary key default gen_random_uuid(),
  claim_code     text not null unique,
  trait_scores   jsonb not null,
  ranked_careers jsonb not null,
  summary_text   text,
  room_id        uuid references public.ms_rooms(id) on delete set null,
  created_at     timestamptz not null default now(),
  handle         text
);
create index if not exists ms_sessions_created_at_idx on public.ms_sessions (created_at);
create index if not exists ms_sessions_claim_code_idx on public.ms_sessions (claim_code);
create index if not exists ms_sessions_room_id_idx on public.ms_sessions (room_id);

create table if not exists public.ms_explored (
  session_id uuid not null references public.ms_sessions(id) on delete cascade,
  soc_code   text not null references public.ms_cards(soc_code) on delete cascade,
  clues_used integer not null check (clues_used >= 1 and clues_used <= 8),
  created_at timestamptz not null default now(),
  primary key (session_id, soc_code)
);
create index if not exists ms_explored_soc_code_idx on public.ms_explored (soc_code);

create table if not exists public.ms_deliveries (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.ms_sessions(id) on delete cascade,
  adult_email text not null,
  app_code    text,
  sent_at     timestamptz not null default now()
);
create index if not exists ms_deliveries_session_idx on public.ms_deliveries (session_id);

-- ── Teen games ─────────────────────────────────────────────────────────

create table if not exists public.game_pool (
  soc_code    text primary key references public.ms_occupations(soc_code) on delete cascade,
  eligible    boolean not null default false,
  higher_wage boolean not null default true,
  daily       boolean not null default true,
  the_cut     boolean not null default true,
  reveal_line text,
  approved_by text,
  approved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint game_pool_eligible_requires_approval check (
    not eligible or (
      reveal_line is not null and length(trim(both from reveal_line)) > 0
      and approved_by is not null and approved_at is not null
    )
  )
);
create index if not exists game_pool_eligible_idx on public.game_pool (eligible);
drop trigger if exists game_pool_set_updated_at on public.game_pool;
create trigger game_pool_set_updated_at before update on public.game_pool
  for each row execute function public.set_updated_at();

create table if not exists public.game_daily (
  game       text not null check (game = 'nhoi'),
  day        date not null,
  soc_code   text not null references public.ms_occupations(soc_code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (game, day)
);

create table if not exists public.cut_rooms (
  id         uuid primary key default gen_random_uuid(),
  room_code  text not null unique,
  host_token uuid not null default gen_random_uuid(),
  state      jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '3 hours')
);

create table if not exists public.cut_players (
  room_id   uuid not null references public.cut_rooms(id) on delete cascade,
  voter_id  text not null,
  joined_at timestamptz not null default now(),
  primary key (room_id, voter_id)
);

create table if not exists public.cut_votes (
  room_id  uuid not null references public.cut_rooms(id) on delete cascade,
  round    integer not null,
  voter_id text not null,
  soc_code text not null,
  voted_at timestamptz not null default now(),
  primary key (room_id, round, voter_id)
);
create index if not exists cut_votes_room_round_idx on public.cut_votes (room_id, round);

-- ── Site analytics ─────────────────────────────────────────────────────

create table if not exists public.page_views (
  id               uuid primary key default gen_random_uuid(),
  page             text not null,
  referrer         text,
  device           text,
  browser          text,
  session_id       text,
  duration_seconds integer,
  created_at       timestamptz default now()
);
create index if not exists page_views_created_at_idx on public.page_views (created_at);

create table if not exists public.click_events (
  id         uuid primary key default gen_random_uuid(),
  event_name text not null,
  page       text not null,
  session_id text,
  metadata   jsonb,
  created_at timestamptz default now()
);
create index if not exists click_events_created_at_idx on public.click_events (created_at);

-- ── Intake outbox ──────────────────────────────────────────────────────
-- One row per form the website sent to BloomOS. A delivered row keeps only
-- what the forms health screen needs (kind, when, the BloomOS record id); the
-- payload is cleared on delivery so personal details don't pile up here. A
-- row that didn't land keeps its payload until the retry cron delivers it.

create table if not exists public.intake_outbox (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null unique,
  kind            text not null,
  payload         jsonb,
  status          text not null default 'pending' check (status in ('pending', 'delivered', 'dead')),
  attempts        integer not null default 0,
  last_error      text,
  last_attempt_at timestamptz,
  delivered_at    timestamptz,
  bloomos_id      text,
  created_at      timestamptz not null default now()
);
create index if not exists intake_outbox_pending_idx on public.intake_outbox (status, created_at)
  where status = 'pending';
create index if not exists intake_outbox_created_at_idx on public.intake_outbox (created_at desc);

-- ── Access ─────────────────────────────────────────────────────────────
-- Service role only. RLS on every table with no policies, and no grants to
-- the browser roles beyond reading the public catalog view.

do $$
declare t text;
begin
  foreach t in array array[
    'ms_occupations','ms_cards','ms_rooms','ms_sessions','ms_explored','ms_deliveries',
    'game_pool','game_daily','cut_rooms','cut_players','cut_votes',
    'page_views','click_events','intake_outbox'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke all on public.ms_catalog from anon, authenticated;
grant select on public.ms_catalog to anon, authenticated;
