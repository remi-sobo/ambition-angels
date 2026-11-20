# BloomOS repo split: BloomOS leaves the Ambition Angels repo

Status: draft for Remi's review, 2026-11-20
Builds on: `specs/bloomos-core-fence.md` (Phases A to F complete, cutover to app.bloomos.org done). That spec listed "Repo extraction" as out of scope "until the first paying tenant." BloomOS now has clients, so this is that spec.

## 1. Problem statement

Ambition Angels is a nonprofit. BloomOS is a for-profit product. They live in one repo, one Vercel project, and one Supabase database. They can't keep sharing a home.

BloomOS owns its code. It was built on Remi's own time, outside Ambition Angels. Ambition Angels was its first user and never owned the code. No board or legal step is needed before the split.

The goal is two separate products with a clean line between them, plus a deliberate, narrow connection that gives Ambition Angels founder privileges inside BloomOS.

## 2. Decisions already made (Remi, 2026-11-20)

1. BloomOS owns all BloomOS code.
2. Teen games and the career library stay with Ambition Angels.
3. Board portal and meeting scheduler become BloomOS features.
4. The Ambition Angels repo keeps its full git history, old BloomOS code included.
5. Ambition Angels gets free access to BloomOS forever, as the founding tenant, with a few website connections no other tenant has.
6. The BloomOS repo lives on Remi's GitHub: `remi-sobo/bloomos`.
7. Ambition Coach stays inside BloomOS as a founder feature.
8. `/shannon` is deleted.
9. Website numbers feed into BloomOS as part of this work, not later.
10. ambitionangels.org/admin becomes a website-only admin for the Ambition Angels team. It holds website work only. CRM, fundraising, and program work stay in BloomOS.

## 3. Who's affected

- **Remi and Shannon.** No change to BloomOS logins: same database, same app.bloomos.org. They sign in once at the new website admin (ambitionangels.org/admin) to curate careers and see website numbers.
- **Board members.** The board portal moves from ambitionangels.org/board to app.bloomos.org/board. Old links redirect.
- **People booking meetings.** /meet moves to app.bloomos.org/meet. Old links redirect.
- **Ambition Coach coaches and students.** Coach stays a founder feature in BloomOS. The public sign-up stays on ambitionangels.org/coach and sends to BloomOS. Private links move to app.bloomos.org/coach/me. Old links redirect.
- **Funders with the Strategy Room password.** The room moves to app.bloomos.org. Old link redirects.
- **Teens playing games.** No visible change. Same URLs, new database underneath.
- **Other BloomOS tenants (Young Life EPA, YGB demo).** No change.

## 4. Where things stand today

- One repo: about 550 admin screen files, about 300 API files, most of the 275 shared library files, and 237 migrations belong to BloomOS. The website, games, and career library are the smaller piece.
- One Vercel project serves both ambitionangels.org and app.bloomos.org. `middleware.ts` keeps the marketing site off the app host.
- One Supabase project (`kzzdtibbwsucloaoqpqa`) holds every tenant, every login, and every table, games included.
- Public website routes write straight into the shared database with the service-role key. Org is set by `getResidentOrgId()` in `lib/admin/orgs.ts`, which the code already names as "the single seam to change."
- `aa.*` entitlement flags already fence Ambition Angels-only screens inside BloomOS (`lib/admin/entitlements.ts`).

## 5. Where everything goes

### 5a. Code

| Piece | Goes to | Notes |
|---|---|---|
| `app/admin/*`, `app/api/admin/*` (except careers) | BloomOS | |
| Board portal: `app/board`, `app/api/board`, `lib/board` | BloomOS | Served at app.bloomos.org/board |
| Meeting scheduler: `app/meet`, `app/api/meet`, `lib/meet`, `lib/availability.ts` | BloomOS | Served at app.bloomos.org/meet |
| Strategy Room: `app/strategy`, `app/api/strategy` | BloomOS | It reads BloomOS strategy tables live, so it belongs with them |
| Unsubscribe: `app/api/unsubscribe` | BloomOS | |
| Crons, Google, HubSpot webhook, Reed, MCP server, hub API, task ingest: `app/api/{cron,google,webhooks,reed,mcp,hub,ingest}` | BloomOS | `vercel.json` crons go with them |
| Stripe webhook: `app/api/stripe-webhook` | BloomOS | Records Ambition Angels' gifts into its tenant |
| `lib/{admin,fundraising,finance,agents,capture,agenda,meetings,hubspot,google,briefing,comms,messaging,notifications,documents,comments,reports,impact,demoday,crypto}` and the rest of BloomOS `lib/` | BloomOS | |
| Public pages, `components/`, `components/site`, `app/site.css`, `public/images` | Ambition Angels | |
| Games and career library: `app/teens`, `app/api/games`, `app/api/ms`, `lib/games`, `lib/ms` | Ambition Angels | |
| Career curation: `app/admin/careers`, `app/api/admin/careers` | Ambition Angels | Rehomed in the website admin at ambitionangels.org/admin/careers (see 6d) |
| Site analytics: `app/api/analytics`, `app/admin/analytics`, `app/admin/impact/analytics` | Ambition Angels | Screen rehomed at ambitionangels.org/admin/analytics |
| Donate flow: `create-payment-intent`, `send-receipt`, `DonateModal` | Ambition Angels | The donor-facing half stays on the website |
| Form routes: `apply`, `schools-inquiry`, `program-partner-signup`, `partner-waitlist`, `coach-signup`, `ygb/register`, `demoday/signup`, `quiz-submit`, `save-donation` | Ambition Angels | Pages stay. They send to the BloomOS intake API instead of the database (see 6a) |
| `career-match`, `demo`, `mesa`, `twilio`, `update`, `founder`, `program-partners`, `ygb` page | Ambition Angels | No BloomOS data |
| `app/shannon`, `app/api/shannon` | Deleted | Remove in phase 2, along with its `SiteChrome` entry |
| `scripts/import-onet.ts`, `scripts/preview-ms-summaries.ts`, `supabase/functions/ms-refresh-oews`, `supabase/seed/ms_*.json` | Ambition Angels | |
| All other scripts, `supabase/tests`, `supabase/roles`, `supabase/seed/ygb_demo_tenant.sql` | BloomOS | |
| Tests: `games-*`, `ms-*` | Ambition Angels | Everything else in `tests/` goes to BloomOS |
| `specs/bloomos-*`, `docs/bloomos`, other BloomOS specs and docs | BloomOS | `ms-*`, `teen-games-v1.md`, `site-redesign-v2.md` stay with Ambition Angels |
| Shared helpers: `lib/supabase`, `lib/rate-limit.ts`, `lib/ai/gateway.ts`, `lib/origins.ts`, `lib/email` sending | Both, copied | Small. Each side trims what it doesn't use |

### 5b. Database tables

**New Ambition Angels database** (website and games only):
`ms_occupations`, `ms_cards`, `ms_catalog` (view), `ms_sessions`, `ms_rooms`, `ms_deliveries`, `ms_explored`, `game_pool`, `game_daily`, `cut_rooms`, `cut_players`, `cut_votes`, `page_views`, `click_events`, plus a new `intake_outbox` (see 6a).

These tables barely touch BloomOS. Their only links are to each other. Two policies (`game_pool`, `create_ms_career_library.sql`) call `has_permission()`. The new baseline swaps that for a studio-admin check.

**Stays in BloomOS as Ambition Angels tenant data**, written through the intake API:
`applications`, `partners`, `coach_people`, `coach_matches`, `coach_sessions`, `ygb_registrations`, `ygb_attendance`, `demoday_signups`, `demoday_notes`, `quiz_submissions`, `partner_waitlist`, `donations`, `recurring_plans`. `bv_*` stays where it is, dormant.

Why this line: anything that is a person or relationship Ambition Angels manages (an applicant, a partner, a donor, a coach, a registrant) is CRM data and belongs in Ambition Angels' BloomOS tenant. Anything that only runs the website (game state, the career catalog, page views) belongs to the website. This also keeps anonymous teen game data out of the for-profit's database.

### 5c. Accounts and hosting

| Account | BloomOS | Ambition Angels |
|---|---|---|
| GitHub | New repo `remi-sobo/bloomos` | `remi-sobo/ambition-angels`, unchanged |
| Vercel | **The current project.** Reconnect its Git source to the BloomOS repo. It keeps app.bloomos.org, env vars, crons, and logs | **New project** from the ambition-angels repo. ambitionangels.org and www move to it on split day |
| Supabase | **The current project.** Transfer it to a BloomOS-owned Supabase organization if it isn't in one. Address, keys, and logins don't change | **New project** for the 5b tables |
| Stripe | Holds the webhook secret for Ambition Angels' account | Ambition Angels' account. Holds the secret key for checkout |
| Google (Gmail, Calendar) | All of it | None |
| HubSpot | All of it | None |
| Resend | Its own key | Its own key (receipts) |
| Anthropic | Its own key | Its own key (career match, card drafts, game summaries) |
| Cloudflare DNS | app.bloomos.org unchanged | ambitionangels.org points at the new Vercel project |

Keeping the current Vercel and Supabase projects with BloomOS means BloomOS has no downtime. All the risk sits on the website, which is the simpler of the two.

Separate keys also mean separate bills. Ambition Angels pays for its website. BloomOS pays for everything inside BloomOS, including Ambition Angels' usage under the founder plan.

### 5d. Environment variables

- **BloomOS only:** `APP_ORIGIN`, `BLOOMOS_TOKEN_ENC_KEY`, `CAPTURE_EVAL_*`, `CRON_SECRET`, `FINANCE_MODEL_WEBHOOK_*`, `FINANCE_SHEET_ID`, `GOOGLE_*`, `HUBSPOT_*`, `HUB_SNAPSHOT_SECRET`, `MEET_HOST_EMAIL`, `MIGRATION_LEDGER_DATABASE_URL`, `ORG_MONTHLY_AI_CAP_USD`, `RESIDENT_ORG_SLUG`, `STAFF_EMAIL_DOMAIN`, `STRATEGY_ROOM_PASSWORD`, `STRIPE_WEBHOOK_SECRET`, `TASK_INGEST_SECRET`, `UNSUBSCRIBE_SECRET`, `ZOOM_*`, `INTAKE_NOTIFY_EMAIL`, `YGB_NOTIFY_EMAIL`, `DEMODAY_NOTIFY_EMAIL`
- **Ambition Angels only:** `DEMODAY_PASSWORD`, `DEMO_COOKIE_SECRET`, `DEMO_PASSWORD`, `GAMES_TOKEN_SECRET`, `STRIPE_SECRET_KEY`, plus new `BLOOMOS_INTAKE_URL`, `BLOOMOS_INTAKE_KEY`, `SITE_ADMIN_EMAILS`, `SITE_STATS_KEY`
- **Both, different values:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_SITE_URL`, `MARKETING_ORIGIN`

Hard rule: after the split, the Ambition Angels deployment holds **no BloomOS database key of any kind**. Its only way into BloomOS is the intake key.

## 6. Architecture

### 6a. The intake API (the main bridge)

A tenant-generic BloomOS feature: "connect your website forms." Ambition Angels is the first org to use it. Any future tenant could.

- **Keys:** new table `org_api_keys` (`id`, `org_id`, `name`, `key_hash`, `scopes text[]`, `created_at`, `last_used_at`, `revoked_at`). The key is shown once at creation and stored hashed. RLS: owners of the org read and revoke their own keys. Ambition Angels' key is created by seed SQL in v1. A settings screen can come later.
- **Endpoint:** `POST https://app.bloomos.org/api/intake/v1/{kind}` with `Authorization: Bearer <key>`. The key resolves the org. The payload never names the org.
- **Kinds (v1):** `application`, `partner_inquiry` (schools and program partners), `company_contact` (partner waitlist), `coach_signup`, `ygb_registration`, `demoday_signup`, `quiz_submission`, `donation` (donor name details from `save-donation`, upserted by `stripe_payment_id`).
- **Gating:** generic kinds (`application`, `partner_inquiry`, `company_contact`) need scope `intake:forms`. Ambition Angels-only kinds also need the matching `aa.*` entitlement on the org (`aa.coach`, `aa.ygb`, `aa.demoday`, `aa.quiz`). Unknown kind: 404. Missing scope or entitlement: 403.
- **Logic moves, not rewritten:** today's insert code in each public route moves into `lib/intake/{kind}.ts` in BloomOS, with `org_id` from the key instead of `getResidentOrgId()`. Operator notification emails move with it, since BloomOS knows the admin links.
- **Read endpoint:** `GET /api/intake/v1/options/application` returns cohorts accepting applications, for the `/apply` picker. This is the only read the website needs.
- **Validation:** each kind keeps its current zod schema, now on the BloomOS side. The website keeps its own validation and rate limiting too.
- **Never lose a form:** the website's client (`lib/bloomos.ts`) posts to BloomOS. On failure, it writes the payload to `intake_outbox` in the Ambition Angels database and returns success to the visitor. A small cron on the Ambition Angels Vercel project retries the outbox every 15 minutes and emails Remi after 24 hours of failures.
- **Idempotency:** every payload carries a `submission_id` (uuid made on the website). BloomOS stores it and ignores repeats, so outbox retries never double-insert.

### 6b. Stripe

- The website keeps checkout (`create-payment-intent`, `DonateModal`) and the donor receipt (`send-receipt`).
- In the Stripe dashboard, the webhook endpoint moves to `https://app.bloomos.org/api/stripe-webhook`. The route code doesn't change. It already resolves the Ambition Angels org and writes `donations` and `recurring_plans`.
- `save-donation` stops writing to the database and sends a `donation` intake call with the donor's name.
- Later, not in this spec: a per-org Stripe connector so any tenant can connect Stripe. Today's route is effectively that connector for one org.

### 6c. BloomOS features that move hosts

Board portal, meeting scheduler, Strategy Room, coach private links, and unsubscribe.

- In the monorepo first: add `/board`, `/meet`, `/strategy`, `/coach/me` to `APP_HOST_PREFIXES` in `middleware.ts`, so they work on app.bloomos.org before the split.
- Switch their email links from `marketingOrigin()` to `appOrigin()`: `app/api/board/signin/route.ts`, `lib/email/templates/cancellation.ts`, `lib/email/format.ts`, `lib/fundraising/unsubscribe.ts`, `lib/coach/server.ts`.
- On the Ambition Angels host, 308 these paths to app.bloomos.org (see 6f).
- Meeting scheduler stays single-host (Remi's calendar) in this spec. Making it per-tenant is a later BloomOS feature.

### 6d. The website admin (ambitionangels.org/admin)

A small admin for the Ambition Angels team, for the website and nothing else. It takes back the `/admin` address on ambitionangels.org, which today only redirects to BloomOS.

**The line:** if the work is about the website, the games, or the career library, it lives here. If it's about people, money, or programs (donors, applicants, partners, coaches, board, tasks), it lives in BloomOS. When a request is unclear, it goes to BloomOS. This admin should stay small on purpose.

**Screens (v1):**

| Screen | What it does | Source |
|---|---|---|
| `/admin` (home) | Sign in, then website numbers at a glance: games played, Built For completions, decks claimed, rooms run, page views by week. A "Go to BloomOS" link for everything else | New. Same numbers BloomOS receives (6e item 5) |
| `/admin/careers` | Career library curation: queue, review, approve, pool eligibility, daily calendar for Never Heard of It | Today's `/admin/careers` and `/admin/careers/{pool,daily}`, moved as is |
| `/admin/games` | Per-game health: plays per day, Higher Wage pairs served, The Cut rooms, Built For room sessions. Read-only | New, light. Reads the games tables |
| `/admin/analytics` | Page views and click events | Today's analytics screen, moved |
| `/admin/forms` | Website form delivery health: what was sent to BloomOS in the last 30 days, anything stuck in `intake_outbox`, a "retry now" button. Shows delivery status only. The records themselves stay in BloomOS, with a link to each one | New, small |

Later candidates, only if they stay website-only: a Demo Day lookbook password setting, page-level SEO checks.

**Auth:** Supabase magic link on the Ambition Angels database. Access is limited to `SITE_ADMIN_EMAILS` (Remi and Shannon to start), checked in middleware and again in every `/api/site-admin/*` route. This replaces the `lib/admin/auth` calls in the careers code. No roles in v1: on the list means full access.

**Rules that carry over unchanged:** approval is a human click, never code. `ms_catalog` never exposes `title` or `clue_8`. No LLM in the matching path. No student names or emails anywhere.

**Old BloomOS links that still say ambitionangels.org/admin.** Emails and bookmarks from before the cutover may still point at ambitionangels.org/admin/fundraising and similar. The website admin owns a fixed list of paths: `/admin`, `/admin/careers/*`, `/admin/games`, `/admin/analytics`, `/admin/forms`. Middleware sends any other `/admin/*` path to `https://app.bloomos.org/admin/*` with a 308. `/admin/careers` and `/admin/analytics` collide with old BloomOS paths, which is fine: those screens are exactly the ones moving here. The sign-in screen at `/admin` carries a plain line: "Looking for BloomOS? Go to app.bloomos.org."

**How it's built while still in one repo.** During phases 1 and 2, `/admin` in the codebase is still BloomOS. So the website admin lives in `app/site-admin/` and `app/api/site-admin/`. On the ambitionangels.org host only, middleware rewrites the owned `/admin` paths to `/site-admin` and redirects everything else under `/admin` to app.bloomos.org. On app.bloomos.org, `/site-admin` 404s (the existing host guard already does this, since it isn't an allowed prefix). After the split, the folder can be renamed to `app/admin` in the Ambition Angels repo and the rewrite dropped. That rename is a separate, later tidy-up PR, not a split-day task.

**Housekeeping:** the BloomOS PWA files under `/admin` (`manifest.webmanifest`, icons) and the `PUBLIC_ADMIN_PATHS` list leave with BloomOS. The website admin is not a PWA.

### 6e. Founder privileges for Ambition Angels in BloomOS

What makes Ambition Angels' tenant special, all as data or `aa.*` flags, none of it hardcoded:

1. **Founder plan, free forever.** `orgs.settings.plan = 'founder'` and `orgs.settings.billing_exempt = true` on the Ambition Angels org. Every module and tier entitlement stays on (`ai.reed`, `ai.prospect_research`, `coaching`, all `modules.*`). When billing ships, it must read `billing_exempt` and skip the org.
2. **Website intake.** The intake API, including the Ambition Angels-only kinds.
3. **Ambition Angels screens stay.** Coach, YGB, Demo Day, quiz submissions, legacy donations, HubSpot mirror, finance model, Ambition App, internships, all behind their existing `aa.*` flags.
4. **Website admin link.** New flag `aa.site_admin`. When it's on, the BloomOS sidebar shows "Website admin," linking out to ambitionangels.org/admin. It replaces the Careers and Analytics nav items for Ambition Angels.
5. **Website numbers (in scope now).** New flag `aa.site_signals`.
   - The Ambition Angels site serves `GET /api/site-admin/stats?from=&to=` behind a bearer key (`SITE_STATS_KEY`). It returns daily totals only: games played per game, Built For completions, decks claimed, rooms run, unique visitors, page views. No rows, no handles, no IPs.
   - The stats URL and key are stored on the Ambition Angels org in BloomOS, encrypted with `BLOOMOS_TOKEN_ENC_KEY` like other integration tokens. Nothing Ambition Angels-specific goes in BloomOS's environment.
   - A daily BloomOS cron (`/api/cron/site-signals`), for orgs with `aa.site_signals`, pulls yesterday's totals and writes them to `metric_snapshots` against new `metric_definitions` rows for the Ambition Angels org (`site.games_played`, `site.builtfor_completions`, `site.decks_claimed`, `site.rooms_run`, `site.unique_visitors`, `site.page_views`). It backfills from launch on first run and is safe to re-run (upsert by metric and day).
   - Those numbers then show up wherever metrics already do: KPIs, the impact scorecard, board and funder reports.
   - The website admin home shows the same endpoint's numbers, so both sides always agree.

Record the founder terms in a short letter so they outlast memory: free access for as long as BloomOS exists, Ambition Angels owns its data and can export it at any time.

### 6f. Redirects (Ambition Angels repo, `next.config.mjs`, permanent)

| From ambitionangels.org | To app.bloomos.org |
|---|---|
| `/admin/:path*`, except the website admin's own paths (6d) | `/admin/:path*` (keep forever; done in middleware, not `next.config.mjs`, because of the exceptions) |
| `/board/:path*` | `/board/:path*` |
| `/meet/:path*` | `/meet/:path*` |
| `/strategy` | `/strategy` |
| `/coach/me/:token` | `/coach/me/:token` |
| `/api/unsubscribe` | `/api/unsubscribe` |
| `/api/meet/booking/:token/:action` | same path (cancel and reschedule links in sent emails) |

Redirects cover links people click. They **don't** cover machine callers. Browsers and `fetch` drop the `Authorization` header when a redirect crosses hosts, so each authenticated caller has to be updated directly: Trellis hub snapshot (`/api/hub/v1`), task ingest (`/api/ingest/tasks`), the BloomOS MCP connector URL (`/api/mcp/[secret]`), the HubSpot webhook, the Stripe webhook, and the Google Calendar watch.

### 6g. CI

- **BloomOS** takes `ci.yml`, `rls-test.yml`, `migration-ledger.yml`, `db-migrate.yml`, `db-backup.yml` as they are. The RLS leak test adds `org_api_keys`.
- **Ambition Angels** gets a trimmed `ci.yml` (typecheck, lint, `games-*` and `ms-*` tests), `db-backup.yml` pointed at the new database, and its own `supabase/migrations` starting from one baseline file. `tests/migrations.test.ts` (idempotent DDL) comes along. The migration ledger check can be added later if the Ambition Angels schema grows.

## 7. Staged build order

Each phase ships on its own and leaves both sites working. Phases 1 and 2 happen in the current repo, so split day is mostly deletion and DNS.

**Phase 0: setup (Remi, about an hour)**
- Create the empty BloomOS GitHub repo.
- Create the Ambition Angels Supabase project and a new Vercel project (no domain yet).
- Confirm which Supabase and Vercel organization BloomOS lives in. Transfer if needed.

**Phase 1: BloomOS side, in the monorepo**
- 1a `feat(intake): org api keys and intake API v1`: migration for `org_api_keys` plus submission-id dedupe, `lib/intake/*`, `/api/intake/v1/*`, tests (key auth, scope and entitlement gates, idempotency, org from key only), leak-test rows. Seed Ambition Angels' key (Remi applies).
- 1b `feat(orgs): founder plan, website admin link`: add `aa.site_admin` and `aa.site_signals` to `FEATURE_KEYS`, sidebar link, seed SQL for the founder settings.
- 1c `feat(host): board, meet, strategy, coach links on app host`: middleware prefixes, `appOrigin()` switch in the five files in 6c, 308s from the Ambition Angels host for those paths.
- 1d Operator steps (Remi): Stripe webhook URL to app.bloomos.org. Update the Trellis hub, task ingest, and MCP connector URLs and the HubSpot webhook to app.bloomos.org if any still point at ambitionangels.org.

**Phase 2: Ambition Angels side, in the monorepo**
- 2a `feat(site): send forms to BloomOS intake`: `lib/bloomos.ts` client, switch each form route, `/apply` reads options from the API. An env switch `INTAKE_MODE=api|db` lets rollback be one env change. Ship with `db`, flip to `api`, watch a week.
- 2b `feat(site-db): Ambition Angels database for games`: baseline migration for the 5b tables plus `intake_outbox`, policies rewritten without `has_permission()`, a `getSiteSupabase()` client (new env vars) used by every games, ms, and analytics route. Copy the data with `pg_dump` of those tables only, then flip. Move the `ms-refresh-oews` edge function.
- 2c `feat(site-admin): website admin shell and careers`: `app/site-admin` with magic-link auth on the Ambition Angels database, the host-aware `/admin` rewrite and fallback redirect in middleware (6d), and the careers screens moved in. Remove Careers from BloomOS nav.
- 2d `feat(site-admin): games, analytics, forms screens`: the other three v1 screens. Remove Analytics from BloomOS nav.
- 2e `feat(site): intake outbox retry cron`.
- 2f `feat(site-signals): website numbers into BloomOS`: the stats endpoint on the site, the admin home reading it, and on the BloomOS side the encrypted per-org config, the `site-signals` cron, metric definitions seed, and first-run backfill.
- 2g `chore(site): delete /shannon`.

**Phase 3: split day (one session, Remi and Claude)**
1. Mirror-push this repo, full history, into the BloomOS repo.
2. BloomOS repo PR: delete everything 5a sends to Ambition Angels. Middleware becomes app-only ("/" to "/admin", no marketing paths). Rewrite `CLAUDE.md`. CI as in 6g.
3. Ambition Angels repo PR: delete everything 5a sends to BloomOS. Add the 6f redirects. Replace `supabase/migrations` with the baseline (old files stay in git history). Rewrite `CLAUDE.md`. Trim `package.json` dependencies. CI as in 6g.
4. Vercel: point the current project at the BloomOS repo, deploy, and check app.bloomos.org. Deploy the Ambition Angels project at its vercel.app address and check every page, form, and game there first.
5. Move ambitionangels.org and www to the Ambition Angels Vercel project. This is the only moment of real risk, and it takes minutes.
6. Re-register the Google Calendar watch. Smoke test (section 8).

**Phase 4: cleanup (30 days after split day)**
- BloomOS migration: drop the 5b tables from the BloomOS database, after one more backup.
- Rotate the BloomOS service-role key, since the old shared Vercel project had it in the website's environment. Rotate `GAMES_TOKEN_SECRET` too if it was ever set on the BloomOS side.
- Remove `getResidentOrgId()` callers left in BloomOS. Intake resolves org from the key now.
- Optional tidy-up PR in the Ambition Angels repo: rename `app/site-admin` to `app/admin` and drop the rewrite.

## 8. Definition of done (observable)

1. Two repos. `grep -r "ms_cards\|game_pool\|app/teens" ` in BloomOS returns nothing. `grep -r "lib/admin\|lib/fundraising" ` in Ambition Angels returns nothing.
2. The Ambition Angels Vercel project has no BloomOS Supabase key in any environment.
3. Submitting each website form lands a row in Ambition Angels' BloomOS tenant with the right `org_id`, and the operator email links to app.bloomos.org.
4. With BloomOS intake down (bad key on a preview), a form submission still shows success and lands in `intake_outbox`. With the key restored, the retry cron delivers it once, not twice.
5. A test donation on Stripe test mode shows up in BloomOS fundraising for Ambition Angels with the donor's name.
6. A Young Life EPA admin calling the intake API with Ambition Angels' kinds gets 403 (no `aa.*` entitlement). A revoked key gets 401.
7. Every game works on ambitionangels.org against the new database. `ms_catalog` still exposes no `title` or `clue_8`.
8. Remi signs in at ambitionangels.org/admin and approves a card. Someone not on `SITE_ADMIN_EMAILS` can't get past sign-in, and `/api/site-admin/*` returns 401 to them.
9. Old links work: ambitionangels.org/board, /meet, /strategy, a booking cancel link, an unsubscribe link, and an old BloomOS path like /admin/fundraising all land on app.bloomos.org. /admin/careers stays on the website admin.
10. BloomOS for Ambition Angels shows the "Website admin" link. No other tenant sees it.
11. Crons, Gmail and Calendar sync, HubSpot sync, and the MCP connector all still run from the BloomOS project.
12. The day after launch, Ambition Angels' KPIs in BloomOS show yesterday's website numbers, and they match the website admin home for the same day. Re-running the cron doesn't double them.
13. `/shannon` returns 404.

## 9. Failure modes

- **A form silently drops during the switch.** Mitigation: `INTAKE_MODE` env switch, the outbox, and a week of running in `api` mode before split day.
- **An authenticated caller still points at the old host.** Its `Authorization` header gets dropped on the redirect and it fails with 401. Mitigation: the caller checklist in 6f, done in phase 1d, plus a check of BloomOS logs for 401s on split day.
- **Domain move breaks the website for a few minutes.** Mitigation: the Ambition Angels project is fully tested on its vercel.app address first. Do the move at a quiet hour. Rollback is moving the domain back to the old project, which still has the website code until the BloomOS deletion PR deploys. So deploy the BloomOS deletion PR only after the domain move is confirmed.
- **Games data copy misses rows written during the copy.** Mitigation: copy, flip the env vars, then copy again for rows newer than the first copy (sessions and rooms are append-mostly and short-lived).
- **Supabase auth cookie confusion on ambitionangels.org.** During phases 1 and 2, one host carries cookies for two Supabase projects. Supabase names cookies by project ref, so they don't collide. Check in the website admin smoke test anyway.
- **An old BloomOS link lands on the website admin.** Only possible for the owned paths (`/admin`, `/admin/careers`, `/admin/analytics`), and those screens really did move here. Everything else falls through to app.bloomos.org. The sign-in screen's "Looking for BloomOS?" line catches the rest.
- **The website admin creeps into a second CRM.** Mitigation: the line in 6d. Any screen that shows a person's record belongs in BloomOS.
- **Website numbers stop arriving.** The cron fails quietly if the key or URL breaks. Mitigation: the cron logs to BloomOS's existing sync status, and a gap of 3 days in `site.*` snapshots shows on the data-age screen.
- **Demo Day page loses its admin pass-through.** `/demoday` let signed-in BloomOS admins skip the password. That session won't exist on the Ambition Angels host after the split. Website admins pass through instead.
- **Founder plan quietly lost when billing ships.** Mitigation: `billing_exempt` is data on the org row, and the billing spec must name it.

## 10. Open decisions

All four from the first draft are settled (section 2, items 6 to 9). Two small ones remain, neither blocks phase 1:

1. **Who else gets website admin access** beyond Remi and Shannon? It's one env var, so this can change any time.
2. **Should `/admin/games` ship in v1** or wait? Recommend v1. It's read-only and small, and it's the first place to look when a teacher says a game broke.
