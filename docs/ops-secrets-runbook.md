# Ops runbook: the four secrets that are currently unset

As of 2026-09-04 four credentials gate four broken systems. None of them can
be set from a Claude session — GitHub Actions secrets and Vercel environment
variables have no API surface exposed to the agent — so this is a checklist
for a human with dashboard access.

Nothing here is a value to invent twice: generate each once, paste it, and
keep the copy in the org password manager.

## 1. `SUPABASE_DB_URL` — GitHub Actions secret

**Unblocks:** the nightly off-platform backup, and the migration runner.

This is the highest-value item on the list. The nightly backup workflow has
failed **85 times out of 85** (2026-06-12 → 2026-09-04), every run dying on
`SUPABASE_DB_URL secret is not set`. There has never been an off-platform
backup; the only copies that exist are Supabase's on-platform 7-day dailies.

The same missing secret is why `db-migrate.yml` failed both times it was
dispatched (2026-06-11, 2026-07-14). That is the root cause of the schema
drift catalogued in `docs/schema-drift-audit.md`: the migration runner never
worked once, so migrations were applied by hand in the SQL editor, so 27 of
them exist in production's ledger with no committed file.

- Supabase → Project Settings → Database → Connection string → **Session
  pooler**. Copy it whole; substitute the database password for
  `[YOUR-PASSWORD]`. Reset the password on that same page if you don't have
  it — note the reset invalidates anything else using it.
- Use the **session** pooler (port 5432), not the direct
  `db.<ref>.supabase.co` host: GitHub runners are IPv4-only and the direct
  host is IPv6-only, so a direct URI cannot connect. Not transaction mode
  (6543) either — `pg_dump` needs a session.
- GitHub → Settings → Secrets and variables → Actions → New repository
  secret, name `SUPABASE_DB_URL`.

This string is effectively superuser: full read/write on every table. That is
exactly why the ledger guard below got its own scoped role instead of reusing
it.

## 2. `BACKUP_PASSPHRASE` — GitHub Actions secret

**Unblocks:** encryption of the nightly dump (the step after the one above).

- Generate: `openssl rand -base64 32`.
- GitHub → Settings → Secrets and variables → Actions → `BACKUP_PASSPHRASE`.
- **Store a copy outside GitHub** (org password manager). If it lives only in
  GitHub secrets, losing the account loses both the backups and the key to
  them, which defeats the point of an off-platform copy.

Because no backup has ever succeeded, no artifact exists encrypted under any
earlier passphrase — there is nothing to lose by choosing a fresh one now.

**Then:** Actions → "Nightly DB backup" → Run workflow. Confirm it goes
green. That is the first real backup this project will have had. Download the
artifact and rehearse a restore into a scratch database before treating it as
a control; an unrehearsed backup is a hypothesis, not a backup.

## 3. `MIGRATION_LEDGER_DATABASE_URL` — GitHub Actions secret

**Unblocks:** the migration-ledger drift guard (`.github/workflows/migration-ledger.yml`),
which currently fails on every PR by design rather than skipping silently.

The `migration_ledger_reader` role **already exists in production** — applied
2026-09-04, verified as: no superuser, no bypassrls, no role memberships, SELECT
on `supabase_migrations.schema_migrations` only, and no read on any application
table. See `supabase/roles/migration_ledger_reader.sql`.

Assemble the string from the same session-pooler host as step 1, swapping in
the role and the password used at creation:

```
postgresql://migration_ledger_reader:<password>@<session-pooler-host>:5432/postgres
```

Verify before trusting CI:

```sh
psql "$MIGRATION_LEDGER_DATABASE_URL" -c "select count(*) from supabase_migrations.schema_migrations"   # expect 199
psql "$MIGRATION_LEDGER_DATABASE_URL" -c "select 1 from constituents limit 1"                           # MUST fail: permission denied
```

If the second command succeeds, the role has more grants than intended — stop
and re-check before storing the secret.

To rotate: `alter role migration_ledger_reader with password '<NEW>';` and
update the secret. To revoke entirely: `drop role migration_ledger_reader;`.

## 4. `CRON_SECRET` — Vercel environment variable

**Unblocks:** all ten cron jobs, every one of which currently returns 401.

Note this one is **not** a GitHub secret — it belongs to the deployed app.
Vercel sends the same value as `Authorization: Bearer <secret>` on cron
invocations and exposes it to the function as `process.env.CRON_SECRET`, so
any random string works provided it is set for the **Production**
environment. Nothing else consumes it, so replacing it outright is safe.

- Generate: `openssl rand -hex 32`.
- Vercel → Project → Settings → Environment Variables → `CRON_SECRET`, with
  the **Production** checkbox ticked. Then redeploy — environment changes do
  not reach already-built deployments.

Then follow the staged restoration order in `docs/cron-restoration-plan.md`.
Do not restore all ten at once: several send outbound email, and the blast
radius per job is documented there. Issue #457 (anniversary milestone key
omits the constituent) should land before the stewardship cron is restored.

## Why this went unnoticed for 85 days

A scheduled GitHub workflow that fails produces no signal anyone reads. The
backup workflow now opens a tracking issue labelled `backup-failure` on
failure and closes it on success, using the built-in `GITHUB_TOKEN` — no
extra secret. Any future outage of this kind surfaces as an open issue rather
than as a quiet red dot in a tab nobody opens.
