-- /ms Phase 4: deliveries (specs/ms-career-game.md "Adult handoff", D6).
--
-- One row per deck email sent to an adult. The email address here belongs
-- to a grown-up by design: the only email field in the whole /ms product
-- sits behind a screen that says it is for a grown-up, and no field a
-- student under 13 fills exists anywhere (COPPA is structural).
--
-- app_code is nullable on purpose (D6): the Ambition app is a separate
-- codebase and v1 ships store links. When a real redeemable code exists,
-- filling this column is an additive change, not a schema one.
--
-- Service-path only, like every ms_ table.

create table if not exists ms_deliveries (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references ms_sessions(id) on delete cascade,
  adult_email text not null,
  app_code    text,
  sent_at     timestamptz not null default now()
);

create index if not exists ms_deliveries_session_idx on ms_deliveries (session_id);

alter table ms_deliveries enable row level security;
revoke all on ms_deliveries from anon, authenticated;
