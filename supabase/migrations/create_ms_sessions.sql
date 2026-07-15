-- /ms Phase 2: sessions (specs/ms-career-game.md architecture sketch,
-- amended by ms-decisions-after-recon.md D4: ranked_careers, not top_ten).
--
-- One row per assessment run. No student account, no login, no email —
-- the row is reachable two ways only: the unguessable session uuid (the
-- results URL) and the six-character claim code (the deck, Phase 4).
-- trait_scores holds the six kid-facing sums; no free text from a child
-- exists anywhere on this table by construction (the instrument is
-- tap-only).
--
-- Service-path only, like the career library base tables: RLS on, no
-- policies, grants revoked. All reads/writes go through /api/ms/* route
-- handlers and server components on the service role. room_id arrives with
-- Phase 5 (ms_rooms); summary_text with Phase 6. Both are nullable columns
-- now so those phases are data changes, not schema churn.

create table if not exists ms_sessions (
  id             uuid primary key default gen_random_uuid(),
  claim_code     text unique not null,          -- 6 chars, unambiguous alphabet, app-generated
  trait_scores   jsonb not null,                -- {build,analyze,create,help,lead,organize} sums
  ranked_careers jsonb not null,                -- ordered [{soc_code, score, job_zone, promoted}]
  summary_text   text,                          -- Phase 6: the AI "what you're built for", human-gated prompts
  room_id        uuid,                          -- Phase 5: FK added with ms_rooms
  created_at     timestamptz not null default now()
);

create index if not exists ms_sessions_claim_code_idx on ms_sessions (claim_code);
create index if not exists ms_sessions_created_at_idx on ms_sessions (created_at);

alter table ms_sessions enable row level security;
revoke all on ms_sessions from anon, authenticated;
