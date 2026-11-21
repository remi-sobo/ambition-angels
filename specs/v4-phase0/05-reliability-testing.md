# V4 Phase 0, Track 5: Reliability, performance, testing, accessibility

Brief deliverable 8. Read-only audit. Checkout HEAD `dff62859` (a merge of main `37472e56` into the brief branch; includes `37472e56`). Production evidence is from the BloomOS Supabase project `kzzdtibbwsucloaoqpqa` (catalog and stats SELECTs, performance advisor, log counts) and GitHub Actions run history via `gh`. No row contents were read. Date: 2026-11-20.

Status key: **V** verified, **A** assumption, **R** needs runtime access.

## Findings first

| # | Pri | Finding | Evidence | Status |
|---|---|---|---|---|
| 1 | **P0** | **There is no working off-platform backup, and there never has been.** The nightly `pg_dump` workflow has failed 162 of 162 runs since 2026-06-12, every time because `SUPABASE_DB_URL` is not set. Docs and the architecture spec describe it as live. Even when fixed, it excludes `auth` and `storage` schemas, so a restore loses every login and every file reference. No restore has ever been tested. | `gh run list --workflow db-backup.yml`: 162 failure, 0 success; log line `SUPABASE_DB_URL secret is not set`. `.github/workflows/db-backup.yml:44-48` excludes `auth`, `storage`. `docs/bloomos/04-security-compliance.md:10` claims nightly dump + quarterly restore test. | V |
| 2 | **P0** | **Six cron jobs are not scheduled anywhere.** `vercel.json` schedules 5 of 11 cron routes. `hubspot-sync`, `journeys`, `meet-reminders`, `daily-reminders`, `weekly-digest`, `stewardship-milestones` have route handlers, docs and tests, but no Vercel or pg_cron schedule. Meeting reminders, deadline emails, the Monday digest and milestone tasks do not happen. Nobody is told. | `vercel.json` (5 entries). `cron.job` in prod holds only `audit-log-partitions` and `capture-transcript-purge`. `docs/cron-restoration-plan.md` lists all ten as scheduled. | V |
| 3 | **P0** | **Silent 1,000-row truncation on program and finance loaders.** PostgREST caps a response at 1,000 rows (the code itself says so in `app/api/hub/v1/snapshot/route.ts:198` and drains pages in `fundraising/donors/page.tsx:45`). Several loaders read whole tables with no range and aggregate in JS. Northbridge Youth Alliance has 4,687 attendance rows and 1,165 transactions since 2025-07, so attendance rates and FY totals on these pages are computed from a partial set with no warning. `programs/overview` orders ascending, so it keeps only the oldest 1,000 marks. | `app/admin/programs/overview/page.tsx:66-69`, `app/admin/programs/attendance/page.tsx:65`, `app/admin/cohorts/page.tsx:59`, `app/admin/finance/page.tsx:69-74`, `lib/admin/finance.ts:137-144` (cash on hand), `app/admin/finance/report/BoardReport.tsx:41`. Per-org counts from prod. Max-rows setting itself not readable from SQL. | V (code, counts), R (max_rows config) |
| 4 | **P1** | **No error reporting exists.** No Sentry or equivalent, no `instrumentation.ts`, no log drain in code. `app/admin/error.tsx` "reports" with a browser `console.error`, which reaches nobody. Route handlers log 348 `console.error` calls to Vercel runtime logs that nobody watches. Only Comms G4 raises an in-app alarm. | `package.json` deps; `app/admin/error.tsx:28-33`; `grep console.error app/api` = 348 | V |
| 5 | **P1** | **Donors & Funders list hits the 8s statement timeout.** `v_fr_rollups` computes rollups over every constituent before ordering by `lifetime_total`, with `count: exact`. 20 calls average 2.0s, max 7.9s. Today 9 requests in one hour returned 500 with `canceling statement due to statement timeout`; the page then shows the raw Postgres message. This grows with data, at only 3,589 AA constituents. | `pg_stat_statements`; edge logs: 9 x 500 on `/rest/v1/v_fr_rollups`, postgres logs: 9 statement timeouts; `authenticated` role `statement_timeout=8s`; `lib/admin/donorsFunders.ts:169-198`; `donors-funders/page.tsx:151` | V |
| 6 | **P1** | **The HubSpot mirror is four months stale and the product barely says so.** The last `hs_sync_jobs` update was 2026-07-30 (status `partial`); no run has ever finished `completed`, so the trust clock reads "never". The staleness badge renders only in Settings. Donor pages that read `hs_engagements`/`hs_deals` show no age. | `hs_sync_jobs` status counts; `lib/admin/dataAge.ts`; only consumer UI `app/admin/settings/_components/HubspotSyncPanel.tsx:83` | V |
| 7 | **P1** | **No staging, preview isolation or tested deploy path for schema.** `db-migrate.yml` has run twice and failed both times; migrations are applied by hand through the Supabase MCP. Deploy order (schema before code) is a human habit, not a gate. No down migrations. Preview deploys likely hit production data. | `gh run list --workflow db-migrate.yml`; commit messages "applied to prod via the MCP"; no `VERCEL_ENV` branching in `lib/` | V (workflow), A/R (previews) |
| 8 | **P1** | **Overlays: 26 hand-rolled, 1 uses the accessible `ui/Modal`.** Of the 26, 17 close on Escape, 9 have `role="dialog"`, 12 move focus at all, 1 (`GlobalSearch`) traps Tab. Keyboard and screen reader users fall behind the backdrop. | grep counts over `app/admin`; `app/admin/_components/ui/Modal.tsx` is imported only by `today/_components/popout/NeedsYouPopout.tsx` | V |
| 9 | **P1** | **Form labels.** 681 text-like controls in `app/admin`. 277 sit inside a `<label>`, 10 carry `aria-label`, and up to 394 have no programmatic label (heuristic upper bound; shared `Field` wrappers hide some). `htmlFor` is used 10 times, so `ui/Input`'s `Field` mostly renders orphan labels. Placeholder-only inputs confirmed, e.g. `partners/[id]/_components/PartnerProfileControls.tsx:98,108,109`. | script over `app/admin/**/*.tsx` | V (count is heuristic) |
| 10 | **P1** | **No end-to-end tests.** `e2e/visual-qa.spec.ts` has 7 desktop-only screenshot routes, at least 3 of them V1 paths that now 308 (`/admin/kpis`, `/admin/fundraising`, `/admin/fundraising/prospects`), requires a human to log in, has no assertions beyond "loaded and not on Sign in", and does not run in CI. | `e2e/visual-qa.spec.ts:12-20`; `next.config.mjs:70,87,90`; `playwright.config.ts` | V |
| 11 | P2 | Stripe webhook swallows handler errors with a 200, so Stripe never retries a failed renewal write. Initial donations are saved client-side only (`DonateModal → save-donation`), so a closed tab after payment loses the record. Dedupe is fine (`donations_stripe_payment_id_key`). | `app/api/stripe-webhook/route.ts:172-176, 110-112` | V |
| 12 | P2 | `calendar_sync_jobs` grows ~1,600 rows a day with no retention: 117,829 rows, 39 MB. 6 rows stuck in `running` since 2026-09-30 (sequential per-connection loop in a 60s function). | prod counts; `lib/agenda/calendar-sync.ts:359-410` | V |
| 13 | P2 | Ledger check is not a required gate: Comms G4 failed it on the PR and was merged 3 minutes later, turning main red until #581. | `gh run list --workflow migration-ledger.yml` | V |
| 14 | P2 | Founder-specific copy in the generic error path: "tell Remi if it keeps happening". | `lib/admin/errors.ts:56-57` | V |
| 15 | P2 | Advisor: 30 RLS policies re-evaluate `auth.*()` per row (all of Reed, messages, notifications, calendar_events), 153 multiple-permissive-policy warnings, 143 unindexed FKs (incl. `interactions.org_id` on a 58k-row table), 4 duplicate indexes. | `get_advisors(performance)` | V |
| 16 | P2 | Boards (`PipelineBoard`, `StageBoard`, `TaskBoardView`, `PartnersBoard`) are drag-only on the board; a single-pointer alternative exists through edit modals for pipeline and tasks, not for partners (assumed). | `onKeyDown` absent in those files | V/A |
| 17 | P3 | Integration timeouts: 3 of 9 raw `fetch` sites set an abort signal; Google, Resend and HubSpot calls rely on library defaults inside 60s functions. Anthropic SDK defaults (2 retries, 10 min timeout) exceed `maxDuration = 60`. | grep; `lib/ai/gateway.ts:94` | V |

Already good enough: the feedback layer (0 `alert()`, `no-alert` lint rule, 108 files use `userMessage`), the Comms send worker (claim RPC, `unknown` status, stuck-send alarm), HubSpot client backoff on 429/5xx (`lib/hubspot/client.ts:41-87`), Gmail transport's `invalid_grant` detection that flips the connection to `error`, the contrast gate in CI, reduced-motion CSS, and the overall DB size (513 MB; the hottest app queries are sub-millisecond).

## 1. Observability

| Capability | State | Evidence |
|---|---|---|
| Error reporting | None. | no Sentry/Datadog/Axiom/Langfuse dep or import |
| Structured logging | None. Free-text `console.error` with ad hoc prefixes. | 348 sites in `app/api` |
| Action tracking | `audit_log` (partitioned, ~180-300 rows a month) records audited mutations; failures are not recorded. | prod `pg_stat_user_tables` |
| Cron monitoring | None. Crons return 500 on failure; Vercel shows it if someone looks. `*_sync_jobs` tables hold status but nothing reads them for alerts. | `app/api/cron/*` |
| Alerting | Comms only: `lib/comms/safety.ts` notifies org managers in-app on stuck sends. | |
| Product analytics | `page_views`/`click_events` cover the public site only. | `app/admin/AnalyticsView.tsx` |

When an admin API route throws, Next returns a 500, the client calls `userMessage()` and shows a sentence; 75 of 266 admin routes return raw `error.message` in JSON, which `userMessage` passes through if it looks like a sentence. When a server page throws, `app/admin/error.tsx` shows a retry inside the shell with a digest. **No one but the person who hit the failure ever learns of it**, unless they report the digest. Vercel log retention (likely 1 day on Pro without Observability Plus) bounds how far back anyone can look (R). Scorecard item "We can detect, investigate, and respond to production failures" is not met.

## 2. Performance

**Production volume (largest public tables):**

| Table | Rows | Size | Note |
|---|---|---|---|
| calendar_sync_jobs | 117,829 | 39 MB | job log, no retention |
| interactions | 58,120 | 77 MB | 57,576 are AA |
| hs_engagements | 36,419 | 329 MB | `raw_json` heavy |
| page_views | 11,753 | 2.7 MB | public site |
| attendance | 4,918 | 1.4 MB | 4,687 Northbridge |
| constituents | 4,205 | 3 MB | 3,589 AA |
| gifts | 1,772 | 0.7 MB | 1,453 Northbridge |
| fin_transactions | 1,709 | 1 MB | |
| ops_tasks | 1,159 | 2.8 MB | 905 AA |

**Slow query shapes (pg_stat_statements since 2026-04-10):**

| Shape | Calls | Mean | Max |
|---|---|---|---|
| `v_fr_rollups` list (Donors & Funders) | 20 | 2,034 ms | 7,914 ms |
| `hs_engagements` by `contact_ids` + `order occurred_at limit 50` (Donor/Prospect profile, next-move) | 18 | 3,150 ms | 7,090 ms |
| `fr_sync_hubspot_to_spine()` | 13 | 3,525 ms | 7,906 ms |
| `constituents` wide select | 330 | 109 ms | 240 ms |
| `memberships` + org lookup (every request) | 367,102 | 0.8 ms | 84 ms |

The `hs_engagements` shape has both a GIN on `contact_ids` and a btree on `occurred_at`; the planner likely walks `occurred_at` backwards and filters (A; EXPLAIN not run).

**Loader patterns:** 109 `force-dynamic` files under `app/admin`. Heaviest by query fan-out: `lib/admin/overview/sources.ts` (28 `.from` calls, 1,023 lines), `fundraising/donors/[id]/DonorProfile.tsx` (23), `lib/admin/briefing/gather.ts` (12), `finance/page.tsx` (7), `programs/overview/page.tsx` (6, includes `select("*")` on students). Mostly `Promise.all`, so latency is the slowest query, not the sum. A scan found 72 unbounded selects on the 15 largest tables; most are scoped by a small id set and safe, but those in finding 3 are not. Real N+1 writes: `finance/rules/apply-all/route.ts:64` and `finance/categorize/apply/route.ts:75` update one row per round trip; a timeout mid-loop leaves a partial apply with no report.

**DataTable:** `app/admin/_components/DataTable.tsx` paginates in the browser and is used by 2 surfaces (`fundraising/donors`, legacy `prospects`); `donors` drains gifts in 1,000-row pages, so it is correct. The main list (Donors & Funders) is already server-paginated. Recommendation: server-side pagination and search is warranted **now** for Donors & Funders rollups (move rollups to a maintained table or materialized view; the view is the bottleneck, not the UI), attendance aggregates (do counts in SQL), and anything over `interactions`. Client-side tables remain fine below ~1,000 rows per org, which today covers tasks, opportunities, transactions per FY for AA, prospects and partners.

## 3. Integrations and crons

| Integration | Timeout | Retry | Failure the user sees | Token handling |
|---|---|---|---|---|
| Google Calendar | library default | none; next 15-min run | stale calendar; `CalendarSyncBanner` | per-user refresh in `connections`; failure logged per run, connection not flipped |
| Gmail (interaction sync) | default | next hourly run | nothing | single connection `google_gmail` |
| Gmail (Comms send) | default | never on `unknown` (correct) | campaign status, in-app alarm | `invalid_grant` → `status=error`, reconnect (`lib/comms/transport/gmail.ts:67`) |
| HubSpot | default | backoff on 429/5xx | Settings panel only | private-app token; 401 message says reconnect |
| Stripe | n/a | swallowed (finding 11) | none | n/a |
| Resend | default | none; journeys throttle a failing enrollment | toast on manual sends | sender domain was unverified on 2026-09-03 (`docs/cron-restoration-plan.md:17`); current state R |
| Anthropic | SDK 10 min | SDK 2 | toast | key from env |
| QuickBooks, Read AI | not integrated (only CSV parsers and an MCP) | | | |

**Crons:**

| Route | Scheduled | Idempotent | On failure |
|---|---|---|---|
| `comms-queue` (every minute) | yes | claim RPC | logs + in-app alarm |
| `calendar-sync` (*/15) | yes | upsert + stale delete | job row `failed`; can orphan `running` |
| `gmail-sync` (:45) | yes | upsert on external id | job row |
| `calendar-watch-renew` (daily) | yes | yes; inert without `APP_ORIGIN` | log |
| `metric-snapshots` (daily) | yes | day-unique upserts | 500 |
| `hubspot-sync`, `journeys`, `meet-reminders`, `daily-reminders`, `weekly-digest`, `stewardship-milestones` | **no** | mostly (labels, sent flags) | n/a |

Before the six are switched back on, `docs/cron-restoration-plan.md` §1 still applies: operator recipients are not org-scoped and `daily-reminders` reads across orgs (`tests/operator-email-scope.test.ts` exists; whether it fully closes this was not re-verified here). Vercel cron has no retries (`docs/bloomos/03-architecture.md:114`); Inngest was never adopted.

## 4. Deploy safety

| Item | State |
|---|---|
| Migration ledger | `scripts/check-migration-ledger.ts` diffs prod ledger both ways on every PR. Works; not enforced (finding 13). 243 files, 45 mention MANUAL, 10 are `*.MANUAL.sql` data seeds skipped by the check. |
| Idempotency | `tests/migrations.test.ts` enforces `if not exists`. `rls-test.yml` applies all migrations to Postgres 16 and runs `supabase/tests/rls-leak-test.sql` (green). |
| Apply path | by hand via MCP; the audited `db-migrate.yml` failed both runs (2026-06-11, 2026-07-14). |
| Order | merge to main auto-deploys Vercel (A); schema must already be applied. No expand/contract rule. |
| Rollback | Vercel instant rollback for code (A/R); no down migrations; schema rollback is a hand-written forward fix. |
| Backups | off-platform: none (finding 1). On-platform: Supabase daily, per docs (R). `archive_mode=on`, `wal_level=logical`; PITR add-on status not visible (R). |
| Restore | never tested; no runbook. |
| Previews | no env separation in code; likely prod Supabase (R). |

## 5. Test coverage

**Baseline (this checkout):** `npm test` 158 files, **2,161 passed, 0 failed, 10.1 s**. `npx tsc --noEmit` **pass**, 47 s. `npm run lint` **0 errors, 5 warnings** (`react-hooks/exhaustive-deps` in `AnalyticsView.tsx:127-128`, `ops/_components/TaskListView.tsx:128`), 14 s. CI runs all three plus RLS and ledger on every PR.

| Area | Files |
|---|---|
| Fundraising, donors, gift tables, stewardship | 35 |
| Capture | 23 |
| AI, Reed, briefing, ranking | 15 |
| Design system, shell, nav, terminology | 15 |
| Programs, impact, metrics | 13 |
| Public site, games, `/teens/built-for` | 12 |
| Meetings, work, calendar | 12 |
| Migrations, ops, documents, compliance | 11 |
| Comms and email | 9 |
| Tenancy, auth, entitlements | 6 |
| Finance | 5 |
| Other | 2 |

61 of 158 files read source files as text (structural pins), not behavior. Route handlers: 266 under `app/api/admin`, 9 imported by any test, 35 referenced by path. Zero coverage: `lib/crypto` (token encryption), `lib/messaging`, `lib/meet`, `lib/coach`, `lib/comments`, the finance page aggregation, every cron route's scheduling, and any rendered page. SQL tests: 5 files in `supabase/tests`.

**Minimum regression set for a staged redesign of ~146 pages** (Playwright on the `verify` mock, run in CI, desktop 1440 and mobile 390):

| Flow | Roles and orgs |
|---|---|
| Sign in, land on Today, open each of 7 destinations + Inbox, no console errors, h1 present | owner AA; staff SafeSpace; board_viewer; zero-row org (Young Life EPA has 2 members and little data) |
| Donors & Funders: search, page 2, open donor, log interaction, add gift | owner AA, staff SafeSpace |
| Tasks: create, edit in modal, complete, keyboard-only | staff |
| Finance snapshot loads; transactions filter; cash card shows as-of | owner, finance role |
| Programs: take attendance on mobile, totals update | program staff Northbridge (4,687 marks: exercises the 1,000-row bug) |
| Comms: compose, test send to self, schedule | owner, `modules.comms` on and off |
| Permission-restricted: board_viewer hits a write route and a gated module | board_viewer, member of two orgs (active-org switch) |
| SafeSpace no-regression: its terminology and modules render | SafeSpace staff |

Add axe-core checks to the same flows. **Frozen-token tests:** `tests/design-tokens.test.ts` (13 expects, contrast gate) helps: any new palette must clear 4.5:1 on all three backgrounds. `tests/type-drift.test.ts` allowlists fail when an entry goes stale, and the 61 source-text pins fail on file moves and renames. Expect every redesign stage to edit tests; budget for it and require that edits change paths, never weaken assertions.

## 6. Accessibility (WCAG 2.2 AA, from code)

| Criterion | Count / state | Pri |
|---|---|---|
| Dialog focus and Escape (2.1.2, 2.4.3) | 26 hand-rolled overlays: Escape 17, `role=dialog` 9, focus move 12, trap 1 | P1 |
| Labels (1.3.1, 4.1.2) | up to 394 of 681 controls unlabeled; `htmlFor` 10 | P1 |
| Icon-only buttons (4.1.2) | 838 buttons, 161 `aria-label`; heuristic finds 1 unnamed (`strategy/_components/ReedAngleWizard.tsx:138`) | P3 |
| Focus visible (2.4.7, 2.4.11) | `outline-none` 177, `focus-visible:` 4, `focus:ring` 5 | P1 |
| Custom controls (2.1.1) | 8 clickable `div/span/li/tr` with no role; 35 `onKeyDown` | P2 |
| Dragging (2.5.7) | 9 drag files; board-level keyboard path in 0 of 4 boards | P2 |
| Color-only status (1.4.1) | ~20 files with small colored dots; HubSpot age dot is paired with text | P2 (A) |
| Contrast (1.4.3) | CI gate on tokens; bypasses: 5 arbitrary `text-[#hex]`, 5 opacity text classes; `ink-3` used 906 times, now passing | P3 |
| Target size (2.5.8) | 5 buttons likely under 24px by class; most icon buttons sized adequately | P3 |
| Reduced motion (2.3.3) | 3 `prefers-reduced-motion` blocks in `globals.css`, `framer-motion` usage not individually checked | P3 |
| Landmarks, headings | `<main>` in `app/admin/layout.tsx`; type-drift pins every h1 to PageHeader/TYPE; 83 of 148 page files render an h1 directly (others delegate) | P3 |

## 7. Data freshness and source labeling

| Number | Source | Freshness shown | Missing vs zero |
|---|---|---|---|
| Cash on hand, runway | `fin_config` anchor (from Wells Fargo email alert skill) + transactions | yes, `ReconcileCard` "reconciled X ago", Board report "Cash reconciled <date>" | no config reads as $0 (`lib/admin/finance.ts:121`) |
| FY totals, attendance rates | DB | no; and truncated (finding 3) | no |
| HubSpot-derived engagements, deals, pipeline | `hs_*` mirror, last touched 2026-07-30 | Settings only; Today/briefing read `getDataAge` | "never" when no full sync |
| Calendar agenda | 15-min sync | `CalendarSyncBanner` on failure | yes |
| Imported gifts/constituents | `imports` | import record only | n/a |
| KPI/metric snapshots | daily cron | per-snapshot date on Strategic Plan | partial |

Recommendation for the spec: one `SourceStamp` pattern ("HubSpot, synced 4 months ago") on every number fed by a sync, and a distinct "no data" state wherever a missing config or empty sync would otherwise render as 0.

## Could not check

Vercel runtime logs, cron execution history, deployment and rollback settings, preview environment variables (Vercel tools out of scope); Supabase plan, on-platform backup schedule and PITR add-on; the PostgREST `max_rows` value (behavior inferred from code and per-org counts); Resend domain verification today; EXPLAIN plans for the slow shapes; rendered accessibility (no browser run; all counts are static heuristics).
