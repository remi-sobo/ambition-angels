-- ─── Northbridge demo seed: shared prelude ──────────────────────────────────
-- Session-local helpers (pg_temp schema: nothing persists, no DDL lands in the
-- database). Every section file starts with this prelude, so each section can
-- be applied on its own through the SQL editor / MCP.
--
-- Dates: every date in the seed is RELATIVE to the anchor day (today, unless
-- the GUC nb.anchor is set, e.g. `set nb.anchor = '2027-02-10'` to rehearse a
-- refresh). Re-running teardown + seed re-anchors the whole story to "now".
-- Ids: md5('nb:<domain>:<key>')::uuid, so cross-section references resolve
-- by key and a re-seed regenerates the same ids (bookmarked URLs survive).

create or replace function pg_temp.nb_org() returns uuid language sql immutable
  as $$ select md5('nb:org')::uuid $$;

-- nb_id('con:chen') → stable uuid for that key
create or replace function pg_temp.nb_id(k text) returns uuid language sql immutable
  as $$ select md5('nb:' || k)::uuid $$;

-- Remi signs in with a DEDICATED demo login that belongs to this org only
-- (remisobo+northbridge@gmail.com — plus-addressing delivers to his own inbox).
-- It is deliberately NOT his everyday account: several BloomOS reads and
-- Google Calendar writes are not yet fenced per org for users with more than
-- one membership, so a single-org login keeps Ambition Angels' real data out
-- of the demo and the demo out of his real calendar. Teammates are seeded auth
-- users that are banned, so nobody can ever sign in as them.
create or replace function pg_temp.nb_remi() returns uuid language sql immutable
  as $$ select md5('nb:user:remi')::uuid $$;

create or replace function pg_temp.nb_remi_email() returns text language sql immutable
  as $$ select 'remisobo+northbridge@gmail.com'::text $$;

-- user uuid by handle (remi → the demo login; others → seeded teammates)
create or replace function pg_temp.nb_user(h text) returns uuid language sql immutable
  as $$ select md5('nb:user:' || h)::uuid $$;

create or replace function pg_temp.nb_anchor() returns date language sql stable
  as $$ select coalesce(nullif(current_setting('nb.anchor', true), '')::date, current_date) $$;

-- d(n): the anchor day + n days
create or replace function pg_temp.d(n int) returns date language sql stable
  as $$ select pg_temp.nb_anchor() + n $$;

-- ts(n, 'HH:MI'): timestamptz at a Pacific wall-clock time, n days from anchor
create or replace function pg_temp.ts(n int, hhmi text default '10:00') returns timestamptz
  language sql stable
  as $$ select ((pg_temp.nb_anchor() + n)::text || ' ' || hhmi)::timestamp at time zone 'America/Los_Angeles' $$;

-- mon(k): first day of the month k months from the anchor's month
create or replace function pg_temp.mon(k int) returns date language sql stable
  as $$ select (date_trunc('month', pg_temp.nb_anchor()) + make_interval(months => k))::date $$;

-- Fiscal year runs July–June and is named for the year it ends (FY2027 =
-- Jul 2026–Jun 2027), matching lib/admin/fiscal.ts.
create or replace function pg_temp.fy() returns int language sql stable
  as $$ select extract(year from pg_temp.nb_anchor())::int
             + case when extract(month from pg_temp.nb_anchor()) >= 7 then 1 else 0 end $$;
create or replace function pg_temp.fy_start() returns date language sql stable
  as $$ select make_date(pg_temp.fy() - 1, 7, 1) $$;

-- School year: starts the Monday on/after Aug 18 of the year it begins.
create or replace function pg_temp.sy_year() returns int language sql stable
  as $$ select extract(year from pg_temp.nb_anchor())::int
             - case when pg_temp.nb_anchor() < make_date(extract(year from pg_temp.nb_anchor())::int, 8, 18) then 1 else 0 end $$;
create or replace function pg_temp.sy_start() returns date language sql stable
  as $$ select d + ((8 - extract(isodow from d)::int) % 7) from (select make_date(pg_temp.sy_year(), 8, 18) d) x $$;

-- Most recent summer (on or before the anchor): Summer Works starts the
-- Monday on/after June 16 and runs 7 weeks.
create or replace function pg_temp.summer_start() returns date language sql stable
  as $$ select d + ((8 - extract(isodow from d)::int) % 7) from (
           select make_date(extract(year from pg_temp.nb_anchor())::int
                  - case when pg_temp.nb_anchor() < make_date(extract(year from pg_temp.nb_anchor())::int, 6, 16) then 1 else 0 end, 6, 16) d) x $$;

-- Monday of the anchor's week, + n weeks
create or replace function pg_temp.wk(n int default 0) returns date language sql stable
  as $$ select pg_temp.nb_anchor() - (extract(isodow from pg_temp.nb_anchor())::int - 1) + 7 * n $$;

-- Deterministic pseudo-random in [0,1) from a key (never random(): a re-seed
-- must reproduce the same story).
create or replace function pg_temp.rnd(k text) returns float8 language sql immutable
  as $$ select ('x' || substr(md5(k), 1, 8))::bit(32)::bigint / 4294967296.0 $$;

-- Pick one element of an array deterministically by key.
create or replace function pg_temp.pick(arr text[], k text) returns text language sql immutable
  as $$ select arr[1 + floor(pg_temp.rnd(k) * array_length(arr, 1))::int] $$;
-- ─────────────────────────────────────────────────────────────────────────────
