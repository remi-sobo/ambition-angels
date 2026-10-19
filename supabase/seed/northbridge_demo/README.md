# Northbridge Youth Alliance demo tenant

A fully connected, fictional demo org for showing BloomOS. The full spec, including the story,
the safety design, and the known gaps, is in `specs/northbridge-demo-tenant.md`.

- **Sign in:** `remisobo+northbridge@gmail.com` on the admin login screen. Use **Forgot password?**
  the first time.
- **Apply:** `./apply.sh <DATABASE_URL>`. This applies the sections in order, each with
  `00_prelude.sql` prepended and in its own transaction. Re-running is safe.
- **Refresh:** when the dates get stale, run `./apply.sh <DATABASE_URL> --teardown` and then
  `./apply.sh <DATABASE_URL>`. Every date is relative to the day the seed is applied.
- **Rehearse a different day:** `NB_ANCHOR=2027-02-10 ./apply.sh <DATABASE_URL>`.

Never move these files into `supabase/migrations/`. They write `auth.users`, and CI applies every
migration to a throwaway database.
