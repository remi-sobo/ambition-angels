# Spec: Northbridge Youth Alliance — demo tenant

Status: v1, 2026-10-19. Seed: `supabase/seed/northbridge_demo/` (applied to prod by hand / MCP, **never** via `supabase/migrations/` — CI applies every migration to a throwaway Postgres, and this seed writes `auth.users`).

## What this is

A BloomOS org built for showing the product: a fictional, well-run, well-funded youth workforce nonprofit that uses every generic module, with the data connected across them, so a walkthrough can go from Today → a donor → the grant → the board meeting → the budget → the participant and back. Everything in it is invented; no real person, funder, school, or agency is named. Successor to the YGB demo (`specs/ygb-demo-tenant.md`), which covers fewer modules and was built around a cash crunch.

## Access: only Remi

- **Login: `remisobo+northbridge@gmail.com`** (Gmail plus-addressing delivers to Remi's own inbox). The auth user is pre-created with a confirmed email and a random password; first sign-in is **Forgot password?** (or a magic link) on the admin login screen. Its profile is "Remi Sobomehin", owner, Executive Director on the org chart.
- **A dedicated login, not Remi's everyday account, on purpose.** Several BloomOS paths are not yet fenced per org for a user with more than one membership: meeting records and calendar events, Reed drafts/suggestions/next-best-actions, the notification count, and Google Calendar writes from work blocks (`getActiveCalendarConnection` is per user, not per org). On a multi-org account, real Ambition Angels data would show inside the demo and demo work blocks could land on a real calendar. A login that belongs only to this org closes all of that by construction (RLS), and it has no Google connection.
- **Ten teammates are real auth users that can never sign in**: `banned_until` far in the future, random passwords, emails on the reserved `northbridge.example` domain (RFC 2606). They exist so assignees, staff, reviews, messages, and mentions are real people. A concrete ban timestamp, not `infinity` (GoTrue's Go driver cannot scan an infinite timestamptz).
- **No `org_email_allowlist` rows and no email-domain rule**, so the membership bootstrap trigger grants nothing and operator emails (reminder crons) resolve to nobody.

## Safety: nothing reaches a real inbox or another tenant

- Every fictional email is on `example.com` / `example.org` / `example.net` / `northbridge.example`; phones are `(510) 555-01xx`. The comms from-address is `hello@northbridge.example`.
- Journeys are **paused** (an active journey is picked up by the hourly journeys cron). No stewardship rule uses auto-email. The Year-End email campaign is a **draft with no segment** (Send disabled). Bookings are all in the past (the meet-reminders cron emails upcoming confirmed bookings through the shared Gmail). Meeting types are **inactive** (the public `/meet` page reads active types from every org).
- No `connections`, no `*_sync_jobs`, no `donations` rows (that trigger fans out into constituents/gifts).
- Entitlements: all 15 generic modules + `ai.reed`, `ai.prospect_research`, `ai.capture`, `coaching`. **Never `aa.*`** (AA's website-coupled surfaces) and **never `modules.content`** (the global career library — editing it from a demo would change the live teen games). Source tag `seed:northbridge_demo`.

## The story (as of the day it is seeded)

- **Org:** Northbridge Youth Alliance (slug `northbridge-demo`), Oakland, founded 2011. Mission: connects Oakland youth ages 14–24 to the people, skills, and paid opportunities that launch careers. Fiscal year July–June.
- **Money:** ~$3.4M expense / $3.55M revenue budget; cash ~$1.57M; burn ~$276K/mo; **runway 5.5 months against a 6-month reserve target** (the app's own math lands there on any day — the June 30 opening balance is solved for it). Forecast ~101% of goal; ~$1.17M open pipeline (~$530K weighted) across two pipelines (Major Gifts & Grants, Corporate Partnerships); 15 grants (Bayview 3-year general operating, Hollis Pathways, Eastshore WDB cost-reimbursement contract, CA Youth Opportunity Initiative, Meridian $300K decision pending, …); Year-End gift table; ~1,450 gifts over ~27 months; 45 monthly donors.
- **People:** Remi (ED) + 10 staff with an org chart, goals, KPIs, and a mid-year 360 review cycle in progress; a 9-member board (chair Celeste Harrington, treasurer Grace Lim, new member Ravi Patel onboarding, youth seat Theo Brooks) with six meetings, minutes, resolutions, COI (8/9), and board giving (7/9).
- **Programs:** Launchpad Academy (3 high-school sites, Mon–Thu), Summer Works (paid internships, last summer), Pathways Fellowship (Cohort 7 active, Cohort 6 graduated with 78% placement at ~$24.50/hr, Cohort 8 recruiting with ~44 applications), Mentor Circles. ~294 participants, ~4,700 attendance marks (~86%, Laurel Ridge dipping after a bell-schedule change), 34 partners.
- **The demo-day threads:** Aaron Goldberg's $20K DAF gift unthanked for 9 days (major-gift escalation); Hollis interim report due in 12 days; Bayview annual report in 26; Sequoia intro in 3 days; Jennifer Wu's $100K ask to schedule; Nnamdi Okafor lapsed (call today); David Tran's attendance flag; board meeting in 24 days with the packet in progress; FY audit in fieldwork; Statement of Information due this week.
- Also seeded: strategic plan (4 objectives, 12 goals, 34 initiatives, 26 KPIs), metric catalog (17 metrics with ~16 months of history), finance ledger (~1,165 bank-feed transactions, budget, rules, imports, reconcile inbox, close stamps, report artifacts), ops (20 projects, ~180 tasks linked to their records, weekly plan/close, work blocks), meetings with summaries and AI-suggested tasks, calendar, messages (5 threads, unread for Remi), notifications, Reed threads/drafts/suggestions/next moves/proposals, Capture recordings (two waiting), cached morning and weekly briefings, comms (newsletters, stories with consents), documents (metadata), compliance (20 items).

## Mechanics

1. **Data over code.** The whole tenant is rows, applied by hand; nothing in the app knows it exists.
2. **Sections, in order** (each one transaction): `10_core` → `20_identity` → `25_anchors` (named entities every section references) → `30_donors` → `35_pipeline` → `40_finance` → `50_programs` → `60_impact` (computes today's metric snapshots from the rows above) → `65_links` (funder angles, which need Section 6's angles) → `70_org` → `80_work` → `85_inbox_ai`. `apply.sh` runs them.
3. **The prelude** (`00_prelude.sql`) defines session-local `pg_temp` helpers and must precede every section (it is not a migration and leaves nothing behind): ids `nb_id('<domain>:<key>') = md5('nb:<domain>:<key>')::uuid`, the org `nb_org() = md5('nb:org')::uuid`, users `nb_user('<handle>')`.
4. **Every date is relative to the anchor day** (`current_date`, or `set nb.anchor = 'YYYY-MM-DD'` to rehearse): `d(n)`, `ts(n,'HH:MI')` (Pacific wall clock), `mon(k)`, `wk(n)`, `fy()`, `fy_start()`, `sy_start()`, `summer_start()`. Labels that carry a year or quarter are computed. Re-seeding re-anchors the whole story to "now", and the deterministic ids keep bookmarked URLs working.
5. **Idempotent and deterministic.** Every insert is `on conflict do nothing` (or `where not exists`); no `random()` in content (`rnd(key)` / `pick(arr, key)` instead). A second apply inserts nothing.
6. **`fin_categories.id` is a global text key**, so this org's ids are prefixed `nb.`.

## Refreshing (when the dates go stale)

The story reads best within the same school year it was seeded in; a refresh re-anchors everything to the new day. Run `99_teardown.sql`, then the sections in order (`apply.sh <url> --teardown`, then `apply.sh <url>`, or the same files through the SQL editor / MCP with the prelude prepended to each section). The teardown refuses to run unless the org row is the demo org (slug `northbridge-demo`), deletes by that `org_id` across every table in FK-safe passes, then deletes only the 11 seeded auth users (by seeded id AND seeded email). Remi's everyday account and every other org are never touched.

## How it was verified (2026-10-19)

Against an exact replica of production's schema rebuilt from its catalogs (tables, constraints, functions, triggers, RLS policies, grants — production has drift the migration chain does not reproduce), with PostgREST capped at production's 1,000 rows and the real Next.js production build signed in as the demo login: every section applies twice with identical counts, applies re-anchored to 2027-02-10 and 2027-06-01, teardown + re-apply round-trips, RLS lets the owner read every row, and 66 admin routes (every V2 tab plus detail pages) render with zero server errors.

## Known gaps

- **Documents are metadata only.** Files must live in the `bloomos-documents` storage bucket, which a SQL seed cannot fill, so opening a seeded document, ask attachment, or report export fails. Anything uploaded through the UI works.
- **History panels are empty** (no trigger writes `audit_log`; production only holds partitions for existing months).
- **Ambition Angels copy is hardcoded in a few tenant surfaces** and shows in this org: the board portal ("Quorum is N of 5", "Minutes: Shannon Fair", AA in titles), receipt letters (AA address, EIN, 501(c)(3) line), the strategy-room link.
- **Volunteers page is empty**: it reads `constituents.is_volunteer`, a column production does not have. Mentors are visible through the `mentor` tag and the Mentors segment.
- **Stories and comms editions** are seeded but no screen reads them yet.
- **During a demo, avoid:** setting a meeting type Active (it would publish on AA's public booking page) and adding a blackout with no meeting types selected (it would block AA's booking page) — both read across orgs today.
- Not seeded (AA-only or integration-only): HubSpot mirror, site analytics, Demo Day, YGB, quiz, career library, Gmail/Calendar sync.
