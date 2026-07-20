# Spec: Young, Gifted & Black — demo tenant

Status: v1, 2026-07-20. Companion seed: `supabase/seed/ygb_demo_tenant.sql` (applied to prod by hand / MCP, **never** via `supabase/migrations/` — CI applies every migration to a throwaway Postgres and this seed writes `auth.users`).

Not to be confused with `aa.ygb` — Ambition Angels' own YGB program surface (`/ygb`, `ygb_registrations`). This spec creates a **separate tenant org** used for sales/walkthrough demos.

## What this is

A third org in BloomOS, fully backfilled with a believable ~$500K/yr community nonprofit so every module has real-looking data on screen: **Young, Gifted & Black** (slug `young-gifted-black`), a fictional org serving Black families on the SF Peninsula — community among families, plus summer and weekend programming for the kids. Everything in the seed is fictional; names were invented for the demo and any resemblance to real people or funders is coincidental.

## The story the data tells

- **Org**: founded 2019, East Palo Alto / Belle Haven / Redwood City corridor. Programs run out of St. Mark AME Church and partner school sites.
- **Leader**: Raymond Williams, CEO. The demo login **remisobo@gmail.com is Raymond** — the auth user is pre-created (confirmed, random password), allowlisted as `owner`, profile display-name "Raymond Williams", and sits at the top of the staff org chart. First login: use **Forgot password?** (or magic link) on the admin login screen with remisobo@gmail.com, set a password, land in YGB.
- **Team (6)**: Raymond Williams (CEO) ← Denise Carter (Director of Programs), Alicia Fontaine (Development & Communications Manager), Gloria Hines (Operations & Finance Manager, PT); Denise ← Marcus Boyd (Program Coordinator), Jamal Porter (Family Engagement Coordinator, PT). The five teammates are seeded auth users on the fictional domain `@ygbpeninsula.org` (confirmed, random passwords, allowlisted with sensible roles) so the Staff module, assignee pickers, and profiles all work; nobody can log in as them without a reset email to a domain that doesn't exist.
- **Board (7)**: Dr. Vanessa Holloway (chair), Terrence Gaines (vice chair), Michelle Okafor (treasurer, CPA), Rev. Curtis Daniels (secretary), Latoya Brooks, Damon Ellis, Simone Reyes-Jackson. Bimonthly meetings: Jan/Mar/May approved minutes, Jul 15 draft minutes, Sep 16 upcoming with agenda. All board members are also donor constituents.
- **Programs**: Saturday Academy (school-year; Crews: Rising Scholars K-2, Griot Scholars 3-5, Legacy Scholars 6-8 — completed June 2026; 2026-27 in planning, accepting applications), Freedom Summer Camp (**active now**, Jun 22–Jul 31, Juniors + Seniors crews with weekly held sessions and tap-sheet attendance), Family Village Nights (monthly, sessions held Jan–Jul), Teen Leadership Corps (8 high-schoolers, active).
- **Terminology**: student → **Scholar**, cohort → **Crew**, volunteer → **Mentor**, partner → **Community Partner**, staff → **Team**.
- **Scholar lifecycle**: Interested → Waitlist → Enrolled (engaged) → Alumni / Stepped Away (terminal). ~40 scholars with per-org custom fields (grade, school, guardian name/phone/email, t-shirt size); several sibling families.
- **Fundraising ($500K goal, ~mid-year)**: funds (General Operating, Freedom Summer Fund restricted, Scholarship Fund restricted); campaigns Village Builders 2025/2026 with appeals (GivingTuesday 2025, Spring Family Appeal, Juneteenth Jubilee Gala). Donor base: 4 foundations (Bayfront Community Foundation $75K active grant; Sand Hill Family Foundation $50K awarded/paid; Copley Family Foundation $25K submitted; Westbay Fund for Children $40K in LOI), San Mateo County Youth Development $60K government grant (restricted to Freedom Summer, interim report submitted), corporate sponsors (Menlo Tech Gives, Peninsula Credit Union), board giving, major donors (the Lawrences $25K, Andre Whitfield $10K, …), ~7 monthly donors, gala gift cluster on Jun 14. Pledges with payment schedules (Gaines $15K/3yr, Holloway $10K quarterly; the July 15 Holloway installment is a few days overdue on purpose). Pipeline on the default 10-stage set with ~$155K of open opportunities and dated next steps — the walkthrough punchline is "**$347K received or committed, $148K in play (~$95K weighted), against a $500K goal — and here's the board you work it on**." A few July gifts are deliberately `pending` acknowledgment so the stewardship queue is non-empty.
- **Finance**: FY Jan–Dec, 2026 budget ≈ $505K expense / $500K revenue across YGB's own category tree (`ygb.*` ids — `fin_categories.id` is a **global** text PK, hence the prefix); Jan–Jul actuals (~payroll $29K/mo, rent, program spikes in Jun/Jul for camp, gala revenue in June); cash anchor $208,435 on Jan 1, ~$170K today — the deliberate mid-summer trough (~4 months runway against a 6-month target) that the strategy "reserve" goal, the treasurer's May minutes, and the fall pipeline all point at. Revenue commitments split secured/received/projected back the same story.
- **Metrics**: scholars_served (target 120), summer_enrollment (60), saturday_attendance_rate (85%), families_engaged (75), monthly_donors (25), scholar_retention (80%) with monthly snapshots Jan–Jul.
- **Strategy**: mission/vision/values + 3 objectives (Deepen scholar impact / Build the village / Fund the future), 6 goals, initiatives, KPIs (some bound to metric definitions), mixed on_track/at_risk statuses.
- **Ops**: 6 projects (Freedom Summer execution, gala follow-up, 2026-27 recruitment, FY25 990, board retreat, Westbay LOI) and ~18 tasks across statuses/priorities, assigned via `assigned_to_id` to real seeded profiles. `created_by` is forced to `'remi'` by a legacy AA check constraint on `ops_projects`/`ops_tasks` — known cosmetic wart, invisible in the main views.
- **Compliance**: Form 990 (in progress, checklist), CA RRF-1, SI-100 (biennial), GL + D&O insurance renewals, child-safety policy (filed), DE-9 quarterly payroll filing, St. Mark facility MOU renewal.
- **Community partners**: St. Mark AME Church (anchor, MOU signed), Ravenswood City School District, Belle Haven Elementary, Bayside Community Center (pilot), Peninsula Black Professionals Network (mentor pipeline), TechBridge Menlo (outreach).

## Entitlements

All 15 generic modules on, plus `ai.reed`, `ai.prospect_research`, `coaching` (full-tier demo). **No `aa.*` flags** — those fence AA's website-coupled surfaces. Source tag: `seed:ygb_demo`.

## Mechanics / decisions

1. **Data over code** — zero application code changes; the entire tenant is rows, same as the YL EPA onboarding pattern (`specs/younglife-epa-tenant-onboarding.md`).
2. **Deterministic, idempotent seed** — every row id is `md5('ygb:<domain>:<key>')::uuid`, every insert is `on conflict do nothing`, so the seed can be re-run (or partially re-run) safely. Attendance is generated from cohort membership × held sessions with a hash-based present/late/absent pattern (~87% present).
3. **Allowlist-only access** (no `email_domain` in org settings). `org_email_allowlist` PK is the bare email — verified remisobo@gmail.com was unbound before seeding.
4. **Seeded auth users** — inserted directly into `auth.users` with confirmed emails, bcrypt-random passwords, and the GoTrue empty-string token fields; the `on_auth_user_created` trigger + explicit backstop insert give them memberships. This is what makes Staff (FK to `auth.users`), profile-based assignees, metric owners, and compliance assignees real.
5. **Not the org's ledger of record** — like every tenant, Stripe stays AA-coupled; YGB money lives in `gifts`/`fin_transactions` as manually-entered mirrors.
6. **Documents/comms/messages/meetings** modules are ON but empty (nothing to fake there without real files; empty states read as "mid-build", which is the demo's framing).

## Teardown

Everything is keyed by the org id `md5('ygb:org')::uuid` plus the seven seeded auth users (emails remisobo@gmail.com + five @ygbpeninsula.org). Deleting the org row cascades where FKs cascade; a full teardown script would delete by `org_id` across the seeded tables, then the allowlist rows, then the auth users. Not automated in v1.
