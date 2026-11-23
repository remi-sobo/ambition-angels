# Handoff prompt: execute the BloomOS repo split

Paste this whole file into a new Claude Code thread running on Remi's computer (repo checked out, browser available). It is written to that agent.

---

You are taking over the BloomOS repo split for Remi. The plan is decided and written down. Your job is to execute it end to end: code, Supabase, Vercel, GitHub, and the dashboard steps, doing as much as you can yourself and stopping only where this prompt says to.

## 0. Before anything else

1. Follow Remi's global instructions (`~/.claude/CLAUDE.md`): pull `remi-sobo/remi-brain`, read its `CLAUDE.md`, then `areas/10-ambition-angels.md` and `areas/13-sobo-products.md`. Write to Remi the way the brain says: plain, direct, no em dashes.
2. In the `remi-sobo/ambition-angels` checkout, fetch branch `claude/awesome-galileo-ec56gf` and read **`specs/bloomos-repo-split.md`** in full. That spec is the source of truth for what goes where and why. This handoff adds what was learned since and the order to execute in.
3. That branch is 45+ commits behind `main`. Start your work from a fresh branch off current `main`, and bring the two spec files over with `git checkout origin/claude/awesome-galileo-ec56gf -- specs/bloomos-repo-split.md specs/bloomos-repo-split-handoff.md`. Don't merge the old branch.

## 1. Decisions already made (don't reopen)

- BloomOS owns all BloomOS code. It was built on Remi's own time. Ambition Angels (a nonprofit) was its first user and never owned it. No board or lawyer step.
- New repo: **`remi-sobo/bloomos`** (exists, empty).
- Teen games and the career library stay with Ambition Angels, in a new Ambition Angels database.
- Board portal, meeting scheduler, Strategy Room, unsubscribe: BloomOS features, served at app.bloomos.org.
- Ambition Coach stays a founder feature inside BloomOS. Public sign-up stays on ambitionangels.org/coach and sends to BloomOS. Private links move to app.bloomos.org/coach/me.
- `/shannon` gets deleted.
- Ambition Angels keeps free access to BloomOS forever (the founder plan), plus website connections no other tenant has: form intake, the `aa.*` screens, a "Website admin" sidebar link, and website numbers flowing into its BloomOS metrics.
- **ambitionangels.org/admin becomes a website-only admin**: careers curation, games health, site analytics, form delivery health, website numbers. People, money, and programs stay in BloomOS. Any other old `/admin/*` link 308s to app.bloomos.org.
- The Ambition Angels repo keeps its full git history.

## 2. Ground truth as of 2026-11-23 (verified, but re-check before acting)

**Supabase** (one org: "remi-sobo's Org", `kpulualqozrupcjhlhdt`)
- `kzzdtibbwsucloaoqpqa`, name **BloomOS**, us-east-1. The live production database for everything today. Stays BloomOS. Tenants: `ambition-angels`, `young-life-epa`, `young-gifted-black`, `safespace`, `northbridge-demo`.
- `sfmlktoeveovujjurihn`, name **ambition angels**, **us-west-1**, created 2026-11-20. Empty (no public tables). This is the new Ambition Angels database.
- `zegznwcbsalhhvqhhllz` "aa-fundraising-hub" is unrelated to this work. Don't touch it.

**Rows to move to the new Ambition Angels database** (small, safe to copy with SQL): `ms_occupations` 774, `ms_cards` 85, `ms_sessions` 453, `ms_explored` 88, `ms_rooms` 0, `ms_deliveries` 0, `game_pool` 217, `game_daily` 67, `cut_rooms` 7, `cut_players` 5, `cut_votes` 17, `page_views` ~11,900, `click_events` ~570. Plus the `ms_catalog` view.

**Rows that stay in BloomOS as Ambition Angels tenant data** (written through intake later): `applications` 44, `partners` 189, `quiz_submissions` 55, `demoday_signups` 14, `ygb_registrations` 8, `partner_waitlist` 5, `donations` 3, `coach_people` 3.

**Vercel** (team "remi-3257's projects", `team_CUIE9OVNZ6gnj4TcuTzirmTw`)
- Project **`bloomos`** (`prj_Pf0ZVBrBCMQYsqmzwnN0q77QCs62`) was renamed from the old Ambition Angels project and still serves **all four domains**: `app.bloomos.org`, `ambitionangels.org` (redirects to www), `www.ambitionangels.org`, `ambition-angels.vercel.app`. It holds every environment variable and the crons. It stays BloomOS.
- **There is no Ambition Angels Vercel project yet.** Remi thought he made one. It isn't in the team, so check with him whether it's under another account. Otherwise you create it (section 4, step C1).
- The Vercel MCP connector returns **403 on listing env vars**. Use the Vercel dashboard in the browser, or the `vercel` CLI logged in on this machine, to see variable names and copy values. **Never paste a secret value into chat or a file in a repo.**
- Separate project `bloomos-site` is bloomos.org marketing. Don't touch it.

**Things that changed on `main` after the spec was written** (re-verify the spec's file lists against current `main`):
- The meeting scheduler now uses a stored, reconnectable Google token (#613). The Gmail read sync has its own Internal OAuth client (#615). Two-step login for everyone (#602). HubSpot sync runs daily (#618). More crons now exist in `vercel.json` (comms-queue, stewardship-milestones, daily-reminders, weekly-digest, meet-reminders, hubspot-sync). All of these go with BloomOS.
- `middleware.ts` and `lib/admin/entitlements.ts` changed. Re-read both before editing.

**How migrations reach production here** (read `scripts/check-migration-ledger.ts` and `.github/workflows/db-migrate.yml` first):
- Every PR runs a ledger check that diffs production's `supabase_migrations.schema_migrations` against `supabase/migrations/`. DDL applied without a committed file fails CI. So does a committed file that was never applied.
- Apply BloomOS migrations with the Supabase MCP `apply_migration`, using a name equal to the committed filename without `.sql`, so the ledger matches. Commit the file in the same PR.
- `tests/migrations.test.ts` requires `if not exists` on every `create table` / `create index`.

## 3. Ground rules

- **One phase at a time, explicit commit points.** Open a PR per step named in the spec (section 7). Run typecheck, lint, and `npm test` before each push.
- **Merging to `main` deploys production for both sites.** Show Remi each PR in one or two lines and get a yes before merging. He wants this done fast, so batch the approvals: ask once per phase, not per file.
- **Applying migrations to the BloomOS production database** needs the same yes, because it's live data for five tenants. Migrations on the empty Ambition Angels database (`sfmlktoeveovujjurihn`) need no approval.
- **Never destructive on BloomOS data** in this project. No dropping the games tables from BloomOS until phase 4 (30 days after split day), and only with Remi's yes.
- Don't move `ambitionangels.org` off the `bloomos` Vercel project until the new Ambition Angels project is fully tested on its own `*.vercel.app` address (section 4, step D).
- Don't change Stripe, Google, HubSpot, or DNS settings without telling Remi exactly what you're changing first. These are dashboard steps in his browser. Do them with him watching, or ask him to click.
- If something in this prompt turns out to be wrong, say so, fix the plan, and keep going.

## 4. Execution order

Each step is a PR (or an operator action), in this order. Spec section 7 has the details for each.

**A. BloomOS side, in the ambition-angels repo** (spec phase 1)
- A1 `feat(intake)`: `org_api_keys` table (hashed keys, scopes, revoke) + submission-id dedupe + `/api/intake/v1/{kind}` + `GET /api/intake/v1/options/application`. Move each public form's insert logic into `lib/intake/*`. Ambition Angels-only kinds also require the matching `aa.*` entitlement. Tests: key auth, scopes, entitlement gate (a Young Life EPA key gets 403 on `ygb_registration`), revoked key 401, idempotency, org from key only. Add the new table to `supabase/tests/rls-leak-test.sql`. Seed Ambition Angels' key with a `.MANUAL.sql` seed, and give Remi the raw key once, through the Vercel env UI, never in chat.
- A2 `feat(orgs)`: founder plan (`orgs.settings.plan = 'founder'`, `billing_exempt = true` on the Ambition Angels org), add `aa.site_admin` and `aa.site_signals` to `FEATURE_KEYS`, a "Website admin" sidebar link to `https://www.ambitionangels.org/admin`, and an entitlement seed.
- A3 `feat(host)`: serve `/board`, `/meet`, `/strategy`, `/coach/me` on app.bloomos.org (middleware prefixes). Switch their email links from `marketingOrigin()` to `appOrigin()`. Add 308s from the ambitionangels.org host for those paths and for `/api/unsubscribe` and `/api/meet/booking/:token/*`.
- A4 **Operator, with Remi**: point the Stripe webhook at `https://app.bloomos.org/api/stripe-webhook`. Confirm the Trellis hub snapshot, task ingest, the BloomOS MCP connector, the HubSpot webhook, and the Google Calendar watch all use app.bloomos.org. Authenticated callers lose their `Authorization` header on cross-host redirects, so each must be updated directly.

**B. Ambition Angels side, still in the ambition-angels repo** (spec phase 2)
- B1 Apply the Ambition Angels baseline migration to `sfmlktoeveovujjurihn`: the games and career-library tables, the `ms_catalog` view (still never exposing `title` or `clue_8`), `page_views`, `click_events`, `intake_outbox`. Rewrite the two policies that call `has_permission()` (`game_pool`, the career-library migration) as a website-admin check. Then copy the rows listed in section 2 from BloomOS with SQL, in batches, preserving primary keys. Verify the counts match. Copy again just before the flip, for rows newer than the first copy.
- B2 `feat(site)`: `lib/bloomos.ts` intake client with outbox fallback and `submission_id`. Switch every form route behind `INTAKE_MODE=api|db` (ship `db`, flip to `api` after a check). `/apply` reads cohorts from the options endpoint.
- B3 `feat(site-db)`: a `getSiteSupabase()` client on new env vars (`SITE_SUPABASE_URL`, `SITE_SUPABASE_SERVICE_ROLE_KEY`, plus the anon key), used by every games, ms, and analytics route. Move the `ms-refresh-oews` edge function to the new project.
- B4 `feat(site-admin)`: `app/site-admin` + `app/api/site-admin`, with magic-link auth on the Ambition Angels database limited to `SITE_ADMIN_EMAILS`. Middleware on the ambitionangels.org host rewrites the owned `/admin` paths (`/admin`, `/admin/careers/*`, `/admin/games`, `/admin/analytics`, `/admin/forms`) to `/site-admin` and 308s every other `/admin/*` to app.bloomos.org. Move the careers screens in. Build the games, analytics, and forms screens. Remove Careers and Analytics from BloomOS nav.
- B5 `feat(site)`: outbox retry cron.
- B6 `feat(site-signals)`: `GET /api/site-admin/stats` (daily totals only, bearer `SITE_STATS_KEY`), the website admin home reading it, and on the BloomOS side encrypted per-org config, `/api/cron/site-signals`, `metric_definitions` seed (`site.*`), and a first-run backfill. Upsert by metric and day.
- B7 `chore(site)`: delete `/shannon` and its `SiteChrome` entry.

**C. Vercel setup for Ambition Angels** (can start any time)
- C1 Create project `ambition-angels-site` (or whatever Remi prefers) in the team, framework Next.js, connected to `remi-sobo/ambition-angels`. Set the function region to **sfo1**, because the new database is in us-west-1. Don't add any domain yet.
- C2 Env vars for it, per spec section 5d, from the dashboard or CLI: the new Supabase URL and keys (from the `sfmlktoeveovujjurihn` dashboard), its own `ANTHROPIC_API_KEY` and `RESEND_API_KEY` (Remi creates them), `STRIPE_SECRET_KEY`, `GAMES_TOKEN_SECRET`, `DEMO_*`, `DEMODAY_PASSWORD`, `BLOOMOS_INTAKE_URL`, `BLOOMOS_INTAKE_KEY`, `SITE_ADMIN_EMAILS`, `SITE_STATS_KEY`, `NEXT_PUBLIC_SITE_URL`, `MARKETING_ORIGIN`. **No BloomOS Supabase key of any kind.**
- C3 Until split day this project builds the whole monorepo, so builds may fail for missing BloomOS vars. That's fine as long as no domain is attached. Or point it at a branch and leave it alone.

**D. Split day** (spec phase 3; tell Remi the night before)
1. Push this repo's full history to `remi-sobo/bloomos` (`git push --mirror` from a full clone, or push `main` plus tags).
2. BloomOS repo PR: delete everything the spec sends to Ambition Angels. The middleware becomes app-only. Rewrite `CLAUDE.md`. Keep all BloomOS CI.
3. Ambition Angels repo PR: delete everything the spec sends to BloomOS. Add the redirects. Replace `supabase/migrations` with the baseline from B1. Rewrite `CLAUDE.md`. Trim CI to typecheck, lint, games and ms tests, backup. Trim `package.json`.
4. Point the `bloomos` Vercel project's Git connection at `remi-sobo/bloomos` and deploy. Check app.bloomos.org: login, a few modules, crons listed.
5. Deploy the Ambition Angels project from the trimmed repo. On its `*.vercel.app` address, test every public page, each form (it should arrive in BloomOS), each game, and the website admin.
6. With Remi: move `ambitionangels.org` and `www.ambitionangels.org` from the `bloomos` project to the Ambition Angels project. Check DNS in Cloudflare if Vercel asks. `ambition-angels.vercel.app` can stay on `bloomos` or be removed.
7. Re-register the Google Calendar watch. Run spec section 8's checks and report each as passed or failed.

**E. Cleanup** (spec phase 4, about 30 days later): drop the moved tables from BloomOS after a backup (Remi's yes), rotate the BloomOS service-role key, remove `getResidentOrgId()` leftovers, and optionally rename `app/site-admin` to `app/admin`.

## 5. What to report back

After each phase, give Remi a few lines: what shipped, what's live, what's next, and anything he needs to click. Keep a checklist in the PR descriptions. When something fails, say so plainly with the error. Don't paper over it.
