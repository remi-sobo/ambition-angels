-- Read-only ledger role for the CI drift guard (.github/workflows/migration-ledger.yml).
--
-- The guard compares production's applied-migration ledger with
-- supabase/migrations/. It needs to read exactly one table and nothing else,
-- so it does NOT use SUPABASE_DB_URL (the full-privilege session-pooler URI
-- the backup and migration-runner workflows use).
--
-- Apply by hand in the Supabase SQL editor, substituting a generated password
-- (e.g. `openssl rand -base64 32`). This is not a migration: it creates a
-- role with a secret, so it must never sit in supabase/migrations/ where the
-- RLS harness replays it.
--
--   1. Replace <PASSWORD> below and run it.
--   2. Build the connection string from the Supabase session-pooler host,
--      swapping in this role and password.
--   3. Store it as the repository secret MIGRATION_LEDGER_DATABASE_URL
--      (Settings → Secrets and variables → Actions).
--
-- What it can do: connect, and SELECT supabase_migrations.schema_migrations.
-- What it cannot do: read any application table. It holds no membership in
-- anon / authenticated / service_role and no table privilege in `public`, so
-- every row of tenant data stays out of reach. It does carry USAGE on schema
-- `public` — that is Postgres's implicit grant to PUBLIC, not something this
-- file grants, and it confers nothing without a table privilege to pair it
-- with. It keeps the catalog visibility every Postgres role has (table names,
-- not contents).
--
-- APPLIED 2026-09-04 to project kzzdtibbwsucloaoqpqa. Verified on creation:
--   rolsuper=f rolbypassrls=f rolcreatedb=f rolcreaterole=f connlimit=4
--   select on schema_migrations = t, insert = f
--   select on public.constituents = f, public.gifts = f, memberships = 0
-- Re-running this file is a no-op; it will not reset the password.
--
-- To rotate: `alter role migration_ledger_reader with password '<NEW>';` and
-- update the secret. To revoke: `drop role migration_ledger_reader;`.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'migration_ledger_reader') then
    create role migration_ledger_reader
      with login password '<PASSWORD>'
      nosuperuser nocreatedb nocreaterole noinherit nobypassrls
      connection limit 4;
  end if;
end $$;

grant usage on schema supabase_migrations to migration_ledger_reader;
grant select on supabase_migrations.schema_migrations to migration_ledger_reader;

-- Belt and braces: no write on the ledger, ever.
revoke insert, update, delete, truncate on supabase_migrations.schema_migrations
  from migration_ledger_reader;

-- Verify (expect exactly one row, and an error from the second statement):
--   set role migration_ledger_reader;
--   select count(*) from supabase_migrations.schema_migrations;
--   select count(*) from public.constituents;  -- must fail: permission denied
--   reset role;
