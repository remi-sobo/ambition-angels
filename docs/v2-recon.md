# BloomOS V2 — Phase 0 recon

Date: 2026-09-03 · read-and-report only, no code or migrations were changed.
Sources: the design bundle (README, Handoff Spec, Stage 0, Stage 5, the 35-screen file, references), the live schema of Supabase project `kzzdtibbwsucloaoqpqa` (read-only queries), and the codebase at `main` (`c1fc37a`).

---

## Decisions needed from Remi

These are the calls that block or shape Phase 1. Everything else in this report is analysis you can read later.

1. **Contract 3, the obligation object — recommendation: Option B (union view + `resolve_obligation()` RPC), not a new table.**
   A proto-obligation view already exists in production: `v_action_items` unions nine sources (ops_tasks, grant_requirements, compliance_items, pending gift acknowledgments, reconciliation items, expiring documents, stale metrics, pending applications, unrecorded sessions). Contract 3 is an upgrade of that view plus one dispatch RPC, not a green-field table. Migrating the 474 rows into a new `obligations` table would mean rewriting every write path in one cutover across four live orgs, for no behavior the view+RPC can't deliver. Full costing in §A.4. **Needs your yes/no.**

2. **Students and constituents (Contract 4) — the bridge exists and is empty.**
   `students.constituent_id` exists (added in the participant-spine work) but is NULL on all 70 rows; `partners.constituent_id` is populated on 2 of 149; `board_members.constituent_id` on 7 of 12. Contract 4 can be satisfied **without merging** `students` into `constituents` — via a backfill of the three `constituent_id` bridges (data write, not schema change) plus an additive `v_people` union view keyed by role tag. But the backfill itself creates ~70–150 new `constituents` rows and links, and dedup against the existing 3,631 (many students' guardians and school contacts may already exist there) is a judgment call. **Decide: backfill-and-view (recommended, additive) vs. leaving students standalone and accepting that Programs → People runs off a different table than the rest of Contract 4.** Detail in §C.

3. **Feature keys with no V2 home** (full mapping in §D.2): `aa.quiz`, `aa.mesa`, `aa.bv`, `aa.site_analytics`, `aa.hubspot_mirror`, `modules.reviews` (staff performance reviews), `modules.comms` (comms editions/mail-merge), `ai.prospect_research` (the prospect-research pipeline pages), and the teen-games gates at `/admin/careers/daily` and `/admin/careers/pool` (they are *content operations*, adjacent to Programs → Content but not in the design). Each needs a seat (a tab, a pinned view, or Settings) or an explicit "stays on its V1 route indefinitely."

4. **Routes with NO V2 HOME in the locked map** (full table in §F): `/admin/queue` maps to "Today → View all" which has no designed screen; `/admin/fundraising/strategy`, `/admin/fundraising/reports`, `/admin/careers/daily`, `/admin/careers/pool`, `/admin/demoday`, `/admin/meet` (booking admin), `/admin/staff/reviews`, `/admin/legacy`, `/admin/briefing/weekly`, and the strategic-plan sub-builders (`/admin/strategic-plan/{narrative,people,setup,scorecard,review}`). None get deleted; each needs a redirect target or a "kept as-is, reachable from Settings/pinned view" ruling.

5. **Data-count discrepancies vs. the prompt's fact sheet** (not blocking, but you should know): live `org_entitlements` shows **AA 27 enabled keys (not 24), YGB 18 (not 17)**; the extra keys are `coaching` (AA+YGB), `modules.messages`/`modules.meetings` (AA+YGB), and `aa.internships`/`aa.app`/`aa.demoday`… full matrix in §D.3. If the 24/17 numbers came from an earlier snapshot, the mapping in §D.2 covers the live 27.

6. **No destructive migration is required by anything in the bundle** (§H). The two places where a destructive change would be *tempting* — merging `students` into `constituents`, and collapsing the three obligation tables — both have additive paths described in §A and §C.

7. **Metric backfill scope (Contract 2):** none of the spec's eight named metrics exists under a matching `metric_key` today (§B.3). Six of the eight need data sources that live in the teen-app platform, not in this database (signed up / started / finished / second track / active-on-platform). The additive migration in §B.4 adds the missing columns and seeds the eight definitions, but five of them will sit at `source_kind='manual'` until a platform export lands. Confirm you accept manual-first seeding.

---

## Method

- Read the bundle in the prescribed order. Where Stage 0 and the Handoff Spec disagree, the Handoff Spec was taken as authoritative (Work lands on Plan & Close; Programs tabs include Content; Fundraising tab is Donors & Funders).
- Live schema facts come from read-only SQL against the production project (entitlements, terminology, tag distributions, view definitions, column lists). No writes of any kind were made.
- Codebase paths were traced by direct reads and search agents; file references are to `main`.

---

## A. Contract 3 — the obligation object

### A.0 What already exists that the spec doesn't know about

The view `public.v_action_items` is a live union over **nine** obligation-like sources — the three tables the spec names plus six more:

| Source in the view | Table | Filter |
|---|---|---|
| `ops_task` | `ops_tasks` | status ≠ done, not archived |
| `grant_requirement` | `grant_requirements` | status ∉ (submitted, waived) |
| `compliance_item` | `compliance_items` | status ∈ (upcoming, in_progress) |
| `acknowledgment` | `gifts` | acknowledgment_status = pending |
| `reconciliation_item` | `fin_reconciliation_items` | status = pending |
| `document_renewal` | `documents` | active with an `expires_at` |
| `metric_stale` | `metric_definitions` + `metric_snapshots` | past cadence |
| `application_pending` | `applications` | new/eligible/waitlisted/offered |
| `session_unrecorded` | `cohort_sessions` | scheduled, in the past |

It normalizes to `(org_id, source, source_id, title, entity_type, entity_id, entity_label, owner_ref, owner_id, due_date, priority, status, module)`. This is 80% of the contract's read side, already deployed. What it lacks against the contract's field list: `type` (partially — `source` plays that role), `why_it_matters`, `state` as a unified enum, `snoozed_until`, `source` in the contract's sense (human vs. importer vs. Reed), `created_by`, `resolved_at`, and the dedup key.

### A.1 Write and read paths for the three tables

**`ops_tasks`** (441 rows: 374 done, 61 todo, 6 in_progress; columns include `parent_id` subtasks, `labels[]`, `linked_entity_type/id/label`, `planned_week/planned_day/day_order`, `roll_count` (carry tracking), `meeting_record_id`, `calendar_event_id`, `booking_id`, `pinned_for_today/this_week` — but **no size/estimate, no `snoozed_until`, no `why_it_matters`, no `source`**; resolution is `status='done'` + `completed_at`).

*Writers:* `app/api/admin/ops/tasks/route.ts` (create) and `…/tasks/[id]/route.ts` (edit/complete); `lib/admin/ops/ingest.ts` (the shared ingest helper other features call); `app/api/admin/rail/capture/route.ts` (quick capture); `app/api/admin/report/route.ts` (report-an-issue, §E); `app/api/admin/grants/[id]/seed-tasks/route.ts` (grant work-back template → tasks); `app/api/reed/suggestions/[id]/route.ts` (accepted Reed suggestion → task); `app/api/admin/meetings/[id]/suggestions/route.ts` (meeting decision → task); `app/api/cron/stewardship-milestones/route.ts` (automation); `app/api/admin/acknowledgments/{log,thankathon}/route.ts`; `app/api/admin/ops/rhythm/route.ts` + `lib/admin/ops/rhythm.ts` (Monday plan / Friday close writes `planned_week`, `roll_count`); `app/api/admin/agenda/blocks/route.ts` and the meet/connections booking routes; `app/api/mcp/[secret]/route.ts` (external MCP surface).

*Readers/renderers:* `/admin/ops` + `/monday` + `/friday` + `/projects` (+`[id]`), `/admin/strategic-plan` (+objective), `/admin/fundraising/donors`, `/admin/fundraising/grants/[id]`, `/admin/fundraising/prospects`, `/admin/partners`, `lib/admin/actionQueue.ts` (the queue/Today feed), `lib/admin/briefing/gather.ts` (executive briefing), `lib/admin/crmOverdue.ts`, `lib/admin/overview/sources.ts` (cockpit widgets), search (`app/api/admin/search/*`), `app/api/hub/v1/snapshot` (external hub API), and — since PR #451 — `work_block_tasks.task_id` (the calendar block↔task join).

**`grant_requirements`** (13 rows; `kind, label, due_date, status, submitted_at, notes` — **no owner column**, no snooze; resolution is `status='submitted'|'waived'` + `submitted_at`).
*Writers:* `app/api/admin/grants/[id]/requirements/route.ts` (create), `app/api/admin/grants/requirements/[id]/route.ts` (update/resolve), `app/api/admin/grants/route.ts` (grant create).
*Readers:* the grants pages, `lib/fundraising/grants.ts`, `lib/fundraising/plan-moments.ts`, `lib/briefing.ts` + `lib/admin/briefing/gather.ts`, `lib/admin/overview/sources.ts`, `lib/agents/reed/tools.ts` (Reed can see them), and the reminder crons `app/api/cron/daily-reminders` + `weekly-digest`.

**`compliance_items`** (20 rows; `kind, jurisdiction, due_date, recur, status, assigned_to(+_id), last_filed_at, checklist`; resolution is `status='filed'` + a `compliance_filings` child row, and `recur` rolls the next date forward).
*Writers:* `app/api/admin/compliance/route.ts` (create), `…/[id]/route.ts` (update), `…/[id]/filings/route.ts` (file it), and `app/api/admin/board/members/[id]/route.ts` (board COI interplay).
*Readers:* `/admin/compliance` (+`[id]`), briefing (`lib/briefing.ts`, `lib/admin/briefing/gather.ts`), `lib/admin/overview/sources.ts`, `lib/admin/entities.ts`, and `app/api/cron/daily-reminders`.

The count that matters for Option A: **~20 distinct write call sites across three tables**, several of them automations, one of them an external API surface (MCP). Every one would need to change in a single cutover if the rows moved.

### A.2 The seven surfaces vs. existing routes

| Spec surface | V1 route that plays the role today | Exists? |
|---|---|---|
| Home → Today | `/admin` (Command Center cockpit) + `/admin/queue` + `/admin/briefing` | yes, as three competing doors |
| Fundraising → Grants | `/admin/fundraising/grants` (+ `[id]`) | yes |
| Organization → Compliance | `/admin/compliance` (+ `[id]`) | yes |
| Work → Tasks | `/admin/ops` (tasks live under the ops section) | yes |
| Work → Plan & Close | `/admin/ops/monday` and `/admin/ops/friday` (two routes, one ritual each) | yes, split in two |
| Organization → Board readiness | `/admin/board` (+ `[id]`) | yes (readiness gating on the close is new) |
| Inbox | `/admin/inbox` | yes |

### A.3 Can `ops_tasks.linked_entity_*` carry `related_entity_*` unchanged?

Yes, with one caveat. `ops_tasks` has `linked_entity_type text`, `linked_entity_id uuid`, `linked_label text` — the same shape as the contract's `related_entity_type + related_entity_id`. Live values of `linked_entity_type`: `constituent` (12), `grant` (9), `partner` (3), NULL (417). The caveat is coverage, not shape: 94% of rows have no linkage, so the dedup key `type + related_entity_id + due_date` degenerates to `type + NULL + due_date` for most existing tasks — which is fine (plain tasks dedup by title/owner in practice and the contract's key is for importers/automations, which do set linkage).

### A.4 Option A vs. Option B, honestly

**Option A — new `obligations` table, migrate the 474 rows.**
- Cost: every write path in A.1 must be rewritten in a single cutover (the report-an-issue flow, briefing/queue automation, grant and compliance CRUD, Reed task creation, template instantiation). `ops_tasks` is not purely an obligations table — 374 of its 441 rows are *done* history and many are plain personal to-dos with subtasks, sizes, labels, project links, work-block links (`work_block_tasks.task_id → ops_tasks`); moving them breaks the calendar time-blocking feature shipped last week unless that FK moves too. Grant requirements carry grant-specific fields (kind, label, grant_id), compliance items carry filing cadence and `compliance_filings` children; a merged table needs nullable type-specific columns or a JSON bag — the thing single-table designs always grow. Data migration × RLS × four live orgs, applied by hand. The "no data loss" constraint is at maximum exposure here.
- Benefit: one FK target (`obligation_id`) for Inbox/notifications; a real writable row; dedup enforceable with a unique index.

**Option B — union view + `resolve_obligation(source, source_id)` dispatch RPC.**
- Cost: the view is not writable — every mutation goes through the RPC, which dispatches per source (`update ops_tasks set status='done'` / `update grant_requirements set status='submitted'` / `update compliance_items set status='filed', insert compliance_filings…`). Dedup cannot be a single unique index; it becomes an insert-guard the importer/automation paths must call (an RPC `upsert_obligation()` doing key lookup across the three tables) — discipline, not a constraint. Fields the contract wants that no underlying table has need additive columns on each table (`snoozed_until`, `why_it_matters`, `source`, `resolved_at` on `ops_tasks`; `owner_id`, `snoozed_until` on `grant_requirements`; `snoozed_until` on `compliance_items`) — three small additive migrations instead of one big one. Notifications/Inbox reference obligations as `(source, source_id)` pairs, not a single FK.
- Benefit: zero data migration, zero write-path rewrites on day one (existing CRUD keeps working and the view sees it), each surface can adopt the RPC incrementally, and the six extra sources already in `v_action_items` (acknowledgments, unrecorded sessions, …) come along free — which is exactly what "Needs you" on Today wants.

**Recommendation: Option B.** Concretely: a new `v_obligations` view (leave `v_action_items` untouched for V1 compatibility) with the contract's field list, additive columns on the three tables, `resolve_obligation()` + `snooze_obligation()` + `upsert_obligation()` RPCs, and the dedup key enforced inside `upsert_obligation()` plus partial unique indexes per table where the key is expressible (`grant_requirements (grant_id, kind, due_date)` can carry a real unique index today — additive). Option A remains available later as a Phase-3 consolidation once V2 owns all the write paths; choosing B now does not foreclose it.

**Not built. Awaiting your call.**

---

## B. Contract 2 — metric definitions

### B.1 What `metric_definitions` has vs. the contract's ten fields

Live columns: `metric_key, name, description, department, unit, direction, cadence, source_kind, source_key, target, baseline, baseline_date, owner_id, active` (+ id/org/timestamps). Mapping to the contract's ten fields:

| Contract field | Today | Gap |
|---|---|---|
| Metric name | `name` | — |
| Definition | `description` | — |
| Numerator | — | **missing** |
| Denominator | — | **missing** |
| Reporting period | `cadence` (capture cadence, not reporting period) | close enough; period semantics differ — flagged |
| Population | — | **missing** |
| Source | `source_kind` + `source_key` | — |
| Freshness | derived from `metric_snapshots.captured_on` vs `cadence` (the `metric_stale` branch of `v_action_items` already computes it) | — |
| Confirmed state | — | **missing** |
| Owner | `owner_id` | — |

### B.2 Where program/impact numbers are computed today

There are **two metric registries plus a long tail of inline computes** — exactly the "two answers to one question" failure Contract 2 exists to end:

1. **The Metric Catalog** (`lib/admin/metrics/{catalog,resolvers,staleness,format}.ts`) — reads `metric_definitions` + `metric_snapshots`. Its resolver registry `METRIC_RESOLVERS` (keyed by `source_key`) contains **only two live resolvers** (`monthly_burn`, `gifts_this_month`); every other definition marked `source_kind='computed'` (a dozen-plus in production: `cash_runway_months`, `dollars_raised_fy26`, `weighted_pipeline_fy26`, `anchor_gifts_closed`, …) logs "no resolver for source_key — skipping" and never actually computes. Snapshots are written by `app/api/cron/metric-snapshots` and by hand via `/admin/kpis` (`MetricUpdateForm` → `app/api/admin/metrics/[id]/snapshot`). Readers: `/admin/kpis`, `lib/briefing.ts`, `lib/admin/entities.ts`, Reed's `metricGlossary.ts`, and the `metric_stale` branch of `v_action_items`.

2. **The plan-KPI registry** (`lib/admin/plan/metrics.ts`, `PLAN_METRICS`) — keyed by `plan_kpis.metric_key`, computes ~7 numbers directly from raw tables (`grants`, `constituents`, `opportunities`, `students`, `email_campaigns`, `recurring_plans`, `plan_reviews`), refreshed by the weekly cron and the plan-page button, snapshotted into `plan_kpi_snapshots` (with `metric_snapshots` fallback). Readers: `/admin/strategic-plan` + scorecard.

3. **Inline computes that read neither registry:** `lib/admin/finance.ts` (`getFinanceSnapshot` — runway, burn), `lib/admin/strategy/money.ts` (`computeRunwayMonths`, `computeSecuredFy`, `computeWeightedPipeline`, `computeCorporateRaisedFy` — used by strategy pages), `lib/admin/overview/sources.ts` (the cockpit widgets), `lib/admin/crmOverdue.ts`, and — the smoking gun for Contract 1 — `lib/agents/reed/tools.ts:61` which carries finance math with the literal comment "*Copied from lib/admin/finance.ts (pure; not imported…)*". Runway is computed in at least three places today.

Contract 2's implementation is therefore mostly *consolidation*: one resolver registry, `metric_definitions` as the single catalog, `plan_kpis.metric_key` resolving through it, and the inline computes replaced by catalog reads.

### B.3 The spec's eight named metrics vs. live `metric_key`s

All 72 live definitions were listed from production. None of the eight exists under a matching key:

| Spec metric | Closest existing key | Verdict |
|---|---|---|
| Reached, all time | `youth_served_yr` (per-year estimate, manual) | **no key** — different question |
| Active on platform (30-day app activity) | `active_teens_2x_week` (manual, different window) | **no key** |
| Enrolled in a cohort | — | **no key** (computable from `cohort_members`) |
| Finish the 30 days | `unit_completion_rate` (manual, unit ≠ 30-day track) | **no key** |
| Start a second track | `coach_return_rate` (coaches, not teens) | **no key** |
| Attendance rate | `saturday_attendance` (YGB-only, manual) | **no key for AA** (computable from `attendance`) |
| Cost per teen | — | **no key** (computable: fin program expense ÷ reached) |
| Active guides | `adults_active_weekly` (manual) | **no key** — near-miss, different definition |

Only **Enrolled in a cohort**, **Attendance rate**, and (partially) **Cost per teen** have in-database numerators/denominators today. Reached/Active/Finish/Second-track live in the teen-app platform, outside this schema — they can only be `source_kind='manual'` (or a future platform export) at seeding time. The 27%-vs-74%-vs-86% return-rate conflict the spec names is real in the data: `coach_return_rate` is manual with no snapshot lineage, and nothing enforces a single answer.

### B.4 Draft additive migration (NOT applied — for review only)

```sql
-- Contract 2: additive columns on metric_definitions.
-- No renames, no drops, no type changes. Existing rows are untouched
-- (new columns are nullable; confirmed_state defaults to 'unconfirmed'
-- only for NEW rows via the application layer, not a column default,
-- so 72 existing rows stay NULL = "not yet classified").

alter table public.metric_definitions
  add column if not exists numerator text,
  add column if not exists denominator text,
  add column if not exists population text,
  add column if not exists confirmed_state text
    check (confirmed_state in ('confirmed','unconfirmed','conflict','stale') or confirmed_state is null);

comment on column public.metric_definitions.numerator is
  'Contract 2: what is being counted, in words (e.g. "second-track starts, FY26 cohort").';
comment on column public.metric_definitions.denominator is
  'Contract 2: the base population expression (e.g. "finishers of the 30 days, FY26"). NULL for plain counts.';
comment on column public.metric_definitions.population is
  'Contract 2: who the metric is about (e.g. "teens on a facilitated roster, current term").';
comment on column public.metric_definitions.confirmed_state is
  'Contract 2: confirmed | unconfirmed | conflict | stale. A number with no definition cannot render; a conflict blocks export.';

-- Seed the eight spec metrics for Ambition Angels only, idempotently.
-- org_id comes from the session context at apply time — Remi runs this with
-- the AA org id substituted; it is NOT a column default.
insert into public.metric_definitions
  (org_id, metric_key, name, description, department, unit, direction, cadence,
   source_kind, source_key, numerator, denominator, population, confirmed_state, active)
values
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','reached_all_time','Reached, all time',
   'Distinct teens with any recorded engagement, since inception','program','count','up','monthly',
   'manual',null,'distinct teens with any recorded engagement',null,'all teens, since inception','unconfirmed',true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','active_on_platform','Active on platform',
   'Teens with app activity in the last 30 days','program','count','up','weekly',
   'manual',null,'teens with app activity in last 30 days',null,'all teens on the platform','unconfirmed',true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','enrolled_in_cohort','Enrolled in a cohort',
   'Teens on a facilitated group roster, current term','program','count','up','weekly',
   'computed','enrolled_in_cohort','active cohort_members rows, current term',null,'teens on a facilitated roster','confirmed',true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','finish_30_days','Finish the 30 days',
   'Finishers over starters, FY26 cohort since Jul 1','program','pct','up','monthly',
   'manual',null,'teens who finished a 30-day track','teens who started a track, FY26','FY26 cohort','conflict',true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','second_track_rate','Start a second track',
   'Second starts over finishers, FY26 cohort','program','pct','up','monthly',
   'manual',null,'teens who started a second track','teens who finished the 30 days','FY26 finishers','conflict',true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','attendance_rate','Attendance rate',
   'Present or late over marked, across active cohorts, 3-week window','program','pct','up','weekly',
   'computed','attendance_rate','present + late marks','all marks, active cohorts, 3 weeks','enrolled teens in active cohorts','confirmed',true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','cost_per_teen','Cost per teen',
   'Program expense over teens reached, fiscal year to date','finance','usd','down','quarterly',
   'computed','cost_per_teen','program-function expense, FYTD','teens reached, FYTD','all teens reached this FY','unconfirmed',true),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22','active_guides','Active guides',
   'Adult guides with a matched teen and activity in 60 days','program','count','up','monthly',
   'manual',null,'guides with a matched teen and activity in 60 days',null,'all adult guides','unconfirmed',true)
on conflict do nothing;
```

Two seeding notes: (1) `finish_30_days` and `second_track_rate` are seeded as `conflict` on purpose — that is the state the spec demands until the 27/74/86 question is settled, and it is what blocks export under Contract 7. (2) If `metric_definitions` lacks a unique constraint on `(org_id, metric_key)`, the `on conflict do nothing` needs a target — add `create unique index if not exists metric_definitions_org_key_uidx on metric_definitions(org_id, metric_key)` first (additive; verify no dupes precede it — the live data shows `monthly_donors` appears twice with different departments, which would block this index and is itself a Contract-2 violation worth cleaning by hand).

---

## C. Contract 4 — one person, several roles

### C.1 What "one relationship table" meets in reality

The spec assumes one table with role tags. Production has **four**:

| Table | Rows | Bridge to `constituents` |
|---|---|---|
| `constituents` | 3,631 (2,582 person / 1,049 organization) | — |
| `students` | 70 | `constituent_id` exists, **0 of 70 populated** |
| `partners` (+135 `partner_contacts`) | 149 | `constituent_id` exists, **2 of 149 populated** |
| `board_members` | 12 | `constituent_id` exists, **7 of 12 populated** |

`constituents.tags[]` is real but sparse: only ~70 of 3,631 rows carry any tag (`board` 7, `funder` 6, `foundation` 6, `major_donor` 6, `monthly_donor` 7, `corporate` 3, `parent` 2, `partner` 1 …). Roles today are mostly *inferred from adjacent tables* (a gift makes you a donor, an opportunity makes you a prospect), not declared as tags. There is no volunteers/guides table at all — "adult guide" exists only as AA terminology and as `students.custom_fields`/guide names in program data.

The participant-spine spec (`specs/bloomos-participant-spine.md`, Jul 2026) already committed the architecture to *keeping* `students` as the participant spine (universal columns + per-org `custom_field_defs`/`participant_stages`) with `constituent_id` as the identity bridge. Contract 4 should build on that decision, not reopen it.

### C.2 Can Contract 4 be satisfied without merging `students` into `constituents`?

**Yes.** The smallest additive path:

1. **Backfill the bridges** — for each `students`, `partners`, `board_members` row with a NULL `constituent_id`, find-or-create the matching `constituents` row and link it. Data write, no schema change. The judgment calls: dedup against existing constituents (guardians and school contacts may already be there from the fundraising import), and whether minors belong in `constituents` at all (privacy: program notes stay on `students`; the constituent row carries identity only). ~230 links total.
2. **Tag on write** — when the bridge is created, stamp the role tag (`participant`, `partner contact`, `board member`, `volunteer`) into `constituents.tags`. Additive data.
3. **One additive view** — `v_people(org_id, constituent_id, display_name, roles text[], student_id, partner_id, board_member_id)` that unions the bridges, so Programs → People, Fundraising → Donors & Funders, and search all read one shape while writes keep going to the tables that own each workflow.

What this does *not* give you: a guardian who gives, volunteers, and sits on the board is one identity **only if the backfill correctly matches them** — matching is by email/name and will have misses. And "volunteers" has no home table; if Programs → People (volunteers view) is wanted in V2, a role tag on `constituents` is the cheapest store (no new table), with guide-matching data staying wherever the program module puts it.

**This is Remi's decision** (top of report, item 2). Merging `students` into `constituents` is *not* required by the contract and would be a destructive migration; it is off the table under the hard constraints.

---

## D. Entitlements and the locked route map

### D.1 How the sidebar is built today

**Yes, it reads `org_entitlements`, and the machinery V2 needs already exists.** `lib/admin/nav.ts` holds `NAV_SECTIONS` — the single IA model both the sidebar (`app/admin/_components/Sidebar.tsx`) and the horizontal sub-topic bar (`SectionSubNav.tsx`) render from. Every `NavItem`/`SectionTab` can carry:
- `feature?: FeatureKey` — filtered by `visibleSections(features)` / `allowed()`; the features list comes from `getEntitlements(orgId)` in `lib/admin/entitlements.ts` (request-cached, session-client so RLS scopes it; unknown keys are OFF; the `FEATURE_KEYS` union makes a typo'd key a compile error). `FeatureGate.tsx` and per-module layouts gate the routes themselves.
- `term?: string` — resolved through the terminology reader (`org_terminology` → `entity_types.display_name` fallback) via `itemLabel()`; already live for `student`, `cohort`, `volunteer`, `partner`, `staff`, `board`.
- `match?: string[]` — longest-prefix route ownership, which is exactly the mechanism a V2 redirect/tab map needs.

`resolveSectionNav()` builds up to **two** stacked pill rows (section sub-topics + the active item's own tabs) — the V1 double-row problem the V2 shell removes; V2 keeps the model and renders one row per destination. Note two V1 mapping quirks worth fixing in V2: the Career Library item is gated on `aa.quiz` (not an internships/content key), and Volunteers is gated on `modules.fundraising` because its route lives under `/admin/fundraising/volunteers`.

### D.2 Proposed feature_key → V2 destination/tab mapping

Live entitlements (queried 2026-09-03) give AA **27** enabled keys — three more than the 24 in the brief (`coaching`, and the live set includes keys the brief's count evidently excluded). The full proposal, flagging every key with no V2 home:

| feature_key | V2 destination · tab | Note |
|---|---|---|
| `modules.fundraising` | Fundraising (all five tabs) | |
| `modules.finance` | Finance (all five tabs) | |
| `modules.program` | Programs → Overview · People · Intake · Cohorts · Attendance | |
| `modules.partners` | Programs → Partners | |
| `modules.metrics` | Impact → KPIs · Outcomes (+ Home health tiles) | |
| `modules.strategy` | Organization → Strategy | |
| `modules.board` | Organization → Board | |
| `modules.compliance` | Organization → Compliance | |
| `modules.staff` | Organization → Team | |
| `modules.ops` | Work → Plan & Close · Tasks · Projects | the obligation/task engine |
| `modules.meetings` | Work → Meetings | |
| `modules.documents` | Work → Documents | |
| `modules.messages` | Inbox → Messages tab | |
| `ai.reed` | Reed panel (shell-level, `showReed`) | |
| `ai.prospect_research` | **no V2 home** — today `/admin/fundraising/prospects` pipeline; proposal: a saved view + drawer inside Donors & Funders | ⚑ |
| `modules.comms` | **no V2 home** — comms editions/mail-merge; nearest seat Fundraising → Campaigns, but it is a distinct workflow | ⚑ |
| `modules.reviews` | **no V2 home** — staff performance reviews (`/admin/staff/reviews`); nearest seat Organization → Team, as a section | ⚑ |
| `coaching` | **no V2 home** — no designed surface | ⚑ |
| `aa.demoday` | Programs → Cohorts, pinned Group view (per Handoff Spec §05) | |
| `aa.ygb` | Programs → Cohorts, pinned Group view | |
| `aa.internships` | Programs → Content (career-library tracks feed `/curriculum`) | partial fit |
| `aa.app` | Impact → Analytics (app funnel panels) | partial fit |
| `aa.site_analytics` | Impact → Analytics | |
| `aa.quiz` | **no V2 home** for the quiz intake itself (`quiz_submissions`); note this key currently double-duties as the Career Library gate in `nav.ts` — V2's Programs → Content should get its own key | ⚑ |
| `aa.mesa` | **no V2 home** — AA-site module | ⚑ |
| `aa.bv` | **no V2 home** — showcase/newsletter (`bv_*` tables) | ⚑ |
| `aa.hubspot_mirror` | **no V2 home** as a screen — it is a sync, not a page; Settings → Fundraising (sync status) | ⚑ |

Unmapped by any key: the teen-games content gates `/admin/careers/daily` and `/admin/careers/pool` (they ride `aa.internships`/career-library adjacency today). Proposal: they become sections of Programs → Content, entitlement-gated by an `aa.*` key.

### D.3 Per-org check against the live entitlement matrix

Live matrix (org → enabled keys): AA all 27; **YGB 18** (everything module-side except `modules.documents`? — no: YGB lacks none of the module set except it has no `aa.*` keys; exact set: `ai.prospect_research, ai.reed, coaching, modules.{board,comms,compliance,documents,finance,fundraising,meetings,messages,metrics,ops,partners,program,reviews,staff,strategy}`); **Young Life EPA 9** and **SafeSpace 9**, both exactly: `modules.{board,compliance,documents,finance,fundraising,metrics,ops,partners,program}`.

Per-destination result for the two 9-key orgs (Young Life EPA and SafeSpace are identical):

| V2 destination | Entitled tabs | Zero-tab? | "Lands on" problem |
|---|---|---|---|
| Home | Today · Organization Health | no | Health's seven rows: strategy + team rows unentitled → render 5 of 7 |
| Work | Tasks · Projects (`modules.ops`) · Documents | no | **lands on Plan & Close, which belongs to `modules.ops` — OK; but My Week (calendar) and Meetings are unentitled** → landing tab OK, row shrinks to Plan & Close · Tasks · Projects · Documents |
| Programs | Overview · People · Intake · Cohorts · Attendance · Partners | no | Content tab hidden (no career-library key) — as the spec intends |
| Fundraising | all five | no | — |
| Finance | all five | no | — |
| Impact | KPIs · Outcomes (`modules.metrics`) | no | Analytics is AA-keyed (`aa.site_analytics`/`aa.app`) → hidden; Reports keeps `modules.metrics` |
| Organization | Board · Compliance | no | **lands on Strategy, which is unentitled → must land on Board** (first entitled tab). Also Team hidden (no `modules.staff`). |
| Inbox | Needs awareness only | no | Messages tab hidden (no `modules.messages`) |

So the rule the shell needs is: **a destination lands on its first *entitled* tab, and a destination with zero entitled tabs disappears from the sidebar.** No org currently hits the zero-tab case, but Organization for YLEPA/SafeSpace is a 2-tab destination landing on Board, and Work loses My Week/Meetings for them. YGB (18 keys) matches AA's layout minus every `aa.*` surface (no Content tab, no Analytics AA panels, no pinned Demo Day/Camp views).

### D.4 Can tab labels read from `org_terminology`?

Yes, and they must. Live `org_terminology` (13 rows): YLEPA overrides `cohort→Group`, `student→Kid`, `volunteer→Leader`, `partner→School`, `board→Committee`, `board_meeting→Committee meeting`; YGB overrides `student→Scholar`, `cohort→Crew`, `volunteer→Mentor`, `partner→Community Partner`, `staff→Team`; SafeSpace overrides `student→Youth`, `partner→Community Partner`. AA has zero rows (its words are the defaults). The spec's tab named **Cohorts** is therefore AA's default label for term-key `cohort` — the V2 tab row must resolve `cohort`, `partner`, `student`, `board`, `staff` through the terminology reader, or Young Life EPA's sidebar will say "Cohorts" over rows it calls Groups. The term-key set needed for the tab row (`cohort`, `partner`, plus `people` already generic) is within the existing 7-key vocabulary; no new mechanism required.

---

## E. Report an issue

**Fully traced.** It must survive V2; it is not in the bundle.

- **Entry points:** `app/admin/_components/QuickAddButton.tsx:56` (the FAB, `label="Report an issue"`), `app/admin/_components/rail/CaptureDock.tsx` / `CaptureBox.tsx:172` (right-rail dock), `app/admin/_components/MobileTabBar.tsx:255` (mobile). All open `app/admin/_components/ReportModal.tsx` — a guided interview (bug / confusing / idea, text or voice, optional photo, AI follow-up questions).
- **API:** `POST /api/admin/report/debug` (`app/api/admin/report/debug/route.ts`) runs the Claude interview and synthesizes a Claude Code prompt; `POST /api/admin/report` (`app/api/admin/report/route.ts`) files it.
- **Where the data lands:** an `ops_tasks` row — `category: 'product'`, `labels: ['report', <type>, 'claude-prompt'?]`, priority high for bugs, assigned to the org owner — inside an auto-created `ops_projects` row titled **"BloomOS Upgrades"** (`category: 'other'`). The photo goes to the private `bloomos-reports` storage bucket (1-year signed URL embedded in the task). Both operators get an email via `sendOperatorEmail` (Resend/Gmail) with the synthesized prompt and a deep link to `/admin/ops/projects/{id}`. No Slack, no GitHub.
- **Payload coverage:** `org_id` yes (`getOrgContext()`, service-role insert with explicit org). User yes (`getAdminUser()`, recorded in `created_by` and a "Reported by …" line). Originating route **partially** — `pageContext.path` is sent to the interview endpoint and usually ends up inside the synthesized prompt text, but it is *not* stored as a structured field on the task.
- **Admin-side reading:** no dedicated screen; submissions are ordinary tasks in the BloomOS Upgrades project (`/admin/ops/projects/[id]`), where the `claude-prompt` label enables one-tap copy.

**Proposed V2 placement (net-new):** keep the trigger inside **Quick Add** (it is already a capture action, and Quick Add survives in V2's shell) and in the mobile **More** sheet; the modal itself is shell-level, destination-independent. Submissions keep landing in `ops_tasks` — under Contract 3 Option B they then surface in Work → Tasks automatically via the obligation view, filtered by the `report` label. Add `origin_path` as a structured field when the V2 modal is rebuilt (additive column or reuse `linked_label`).

---

## F. Route delta and redirects

### F.1 The delta table

Source: Stage 0's 42-row map, corrected by the Handoff Spec where they conflict, checked against the actual route tree (96 `page.tsx` routes under `app/admin`). Dispositions: `kept` (same job, same seat), `renamed`, `re-homed` (new destination), `merged` (loses its front door, keeps its data), `settings`, `NO V2 HOME` (the bundle gives it no seat — decision needed).

| V1 route | V2 destination | Disposition |
|---|---|---|
| `/admin` (Command Center) | Home → Today | re-homed (recomposed) |
| `/admin/inbox` | Inbox | kept |
| `/admin/messages` | Inbox → Messages tab | merged |
| `/admin/strategic-plan` | Organization → Strategy | re-homed |
| `/admin/strategic-plan/narrative` | — | **NO V2 HOME** (builder; nearest: Strategy detail) |
| `/admin/strategic-plan/objective/[id]` | Organization → Strategy (objective card) | merged |
| `/admin/strategic-plan/people` | — | **NO V2 HOME** |
| `/admin/strategic-plan/review` | Organization → Strategy (monthly review CTA) | merged |
| `/admin/strategic-plan/scorecard` | Impact → KPIs | merged |
| `/admin/strategic-plan/setup` | Settings | settings |
| `/admin/briefing` | Home → Today (briefing section) | merged |
| `/admin/briefing/weekly` | — | **NO V2 HOME** (weekly narrative; nearest: Work → Plan & Close Friday) |
| `/admin/queue` | Home → Today → "View all" | merged (**the View-all screen is undesigned**) |
| `/admin/ops` | Work → Tasks | re-homed |
| `/admin/ops/monday` | Work → Plan & Close | merged |
| `/admin/ops/friday` | Work → Plan & Close | merged |
| `/admin/ops/my-week` | Work → My Week | kept |
| `/admin/calendar` | Work → My Week (the week grid) | kept (Handoff Spec folds Calendar into My Week; Stage 0 kept them separate) |
| `/admin/ops/projects` (+`[id]`) | Work → Projects | kept |
| `/admin/meetings` (+ subroutes) | Work → Meetings | re-homed |
| `/admin/meetings/connections`, `/booking-page` | Settings → Calendar/Meetings | settings |
| `/admin/meet` | — | **NO V2 HOME** (public-scheduler admin; nearest: Settings) |
| `/admin/staff` (+`[id]`) | Organization → Team | re-homed |
| `/admin/staff/reviews` (+`[cycleId]`) | — | **NO V2 HOME** (`modules.reviews`) |
| `/admin/documents` | Work → Documents | re-homed |
| `/admin/fundraising/today` | Fundraising → Today | kept |
| `/admin/fundraising` | Fundraising → Today | merged |
| `/admin/fundraising/plan` (+`[id]`) | Fundraising → Campaigns → Plan | merged |
| `/admin/fundraising/donors` (+`[id]`) | Fundraising → Donors & Funders | merged |
| `/admin/fundraising/prospects` (+`[id]`, `by-hubspot`, `import`) | Fundraising → Donors & Funders saved view | merged |
| `/admin/fundraising/asks` (+`[id]`) | Fundraising → Pipeline | merged |
| `/admin/fundraising/acknowledgments` (+letters, templates) | Fundraising → Today ("Thank someone") + Settings for templates | merged |
| `/admin/fundraising/pledges` (+`[id]`) | Finance → Forecast (pledges tier) + Donors & Funders | merged |
| `/admin/fundraising/recurring` | Fundraising → Donors & Funders saved view | merged |
| `/admin/fundraising/journeys` | Fundraising → Donors & Funders saved views | merged |
| `/admin/fundraising/comms` | — | **NO V2 HOME** (`modules.comms`) |
| `/admin/fundraising/campaigns` | Fundraising → Campaigns | kept |
| `/admin/fundraising/grants` (+`[id]`) | Fundraising → Grants | kept |
| `/admin/fundraising/duplicates`, `/import`, `/settings`, `/settings/stages` | Settings → Fundraising | settings |
| `/admin/fundraising/reports` | — | **NO V2 HOME** (nearest: Impact → Reports or Finance → Reports) |
| `/admin/fundraising/strategy` (+`[key]`) | — | **NO V2 HOME** (funder-angle briefs; nearest: Donors & Funders drawer) |
| `/admin/fundraising/volunteers` | Programs → People, volunteer view | merged |
| `/admin/finance` | Finance → Snapshot | renamed |
| `/admin/finance/transactions`, `/reconcile` | Finance → Transactions | merged |
| `/admin/finance/close` | Finance → Transactions (gated close) | merged |
| `/admin/finance/budget` (+import) | Finance → Budget | kept |
| `/admin/finance/forecast`, `/model` | Finance → Forecast | merged |
| `/admin/finance/revenue` | Finance → Forecast (commitments tier) | merged |
| `/admin/finance/report` | Finance → Reports | merged |
| `/admin/finance/rules`, `/config`, `/upload` | Settings → Finance | settings |
| `/admin/imports` | Settings (import history) | settings |
| `/admin/analytics` | Impact → Analytics | re-homed |
| `/admin/kpis` | Impact → KPIs | re-homed |
| `/admin/students` (+`[id]`) | Programs → People | re-homed |
| `/admin/intake` | Programs → Intake | kept |
| `/admin/cohorts` (+`[id]`, sessions) | Programs → Cohorts | re-homed |
| `/admin/program` | Programs → Overview | re-homed |
| `/admin/partners` (+`[id]`) | Programs → Partners | re-homed |
| `/admin/demoday` | Programs → Cohorts, pinned Group view | merged (**pinned-view mechanism undesigned**) |
| `/admin/careers` | Programs → Content | re-homed (Handoff Spec overrides Stage 0's "Settings") |
| `/admin/careers/daily` | — | **NO V2 HOME** (game calendar; proposal: Programs → Content section) |
| `/admin/careers/pool` | — | **NO V2 HOME** (game pool gate; proposal: Programs → Content section) |
| `/admin/board` (+`[id]`) | Organization → Board | re-homed |
| `/admin/compliance` (+`[id]`) | Organization → Compliance | re-homed |
| `/admin/reed` | Reed contextual panel | merged (utility) |
| `/admin/howto` | Help | settings |
| `/admin/settings` | Settings | kept |
| `/admin/legacy` | — | **NO V2 HOME** (nearest: delete-never, keep route unlinked) |
| `/admin/reset-password` | (auth utility) | kept |

### F.2 Deep-link consumers that constrain the redirect map

Roughly **137 files** construct `/admin/*` links (`href=`, `router.push`, `redirect`). Most are intra-app and get rewritten with their screens. The ones that outlive the cutover — links already stored in data, sitting in inboxes, or served to external callers — are the redirect map's real constraints:

1. **`lib/admin/actionQueue.ts:80-88`** — the central source→route table for queue/Today deep links: `ops_task → /admin/ops`, `grant_requirement → /admin/fundraising/grants`, `compliance_item → /admin/compliance`, `acknowledgment → /admin/fundraising/acknowledgments`, `reconciliation_item → /admin/finance/reconcile`, `document_renewal → /admin/documents`, `metric_stale → /admin/kpis`, `application_pending → /admin/intake`, `session_unrecorded → /admin/cohorts`. This one map is where the V2 obligation feed's primary actions come from — update it once, every queue link moves.
2. **`notifications.url`** — written by `lib/notifications/notify.ts` (relative `/admin/...` paths, absolutized with `appOrigin()` for the email copy) from `app/api/admin/fundraising/research/[id]`, `app/api/admin/comments`, and `lib/messaging/threads.ts`. Stored rows keep V1 paths forever → **server-side 308 redirects are mandatory**, client-side rewrites are not enough. `notifications.linked_entity_type/id/label` also exist for entity-addressed rendering.
3. **`ops_tasks.linked_entity_type/id`** — 24 linked rows today (`constituent`, `grant`, `partner`); consumers resolve them via `lib/admin/entities.ts` to entity URLs, so the entity-URL resolver is a second choke point that moves everything at once.
4. **Emails already sent** — `lib/origins.ts` `adminUrl()` is used by the report-an-issue email (`/admin/ops/projects/{id}`), operator notifications from public routes (`save-donation`, `quiz-submit`, `demoday/signup`, `partner-waitlist`), and the cron reminder/digest emails deep-link into grants/compliance/queue. All V1 paths, live in inboxes.
5. **Briefings** — `lib/admin/briefing/engine.ts` emits `deepLink: "/admin/briefing"`, and gathered items carry queue-style links; stored briefing rows (`briefings`, `bloomos_briefing_narrative`) persist those paths.
6. **External surfaces** — `app/api/mcp/[secret]/route.ts` and `app/api/hub/v1/snapshot` expose task data (and links) to callers outside the app.

Consequence: the redirect layer must be `next.config.mjs`/middleware 308s covering every row of the F.1 table (including query params like `?student=`), shipped **before or with** the first destination cutover, and kept forever — the same policy the site already uses for `/ms/* → /teens`.

---

## G. Data-binding audit — the 35 screens

Format: screen → panels → the table/query that would feed each. `UNBOUND` = no source exists in this database today. `QBO` = the panel's honest source is QuickBooks, which is an unresolved spike (today: manual CSV import via `fin_imports` + a Gmail-scraped cash anchor in `fin_config`; `lib/finance/qb-budget.ts` parses QB budget exports — there is **no live QBO API integration anywhere in the codebase**).

**Home → Today**
- Orientation + interpreting line — composed; briefing engine exists (`briefings`, `bloomos_briefing_narrative`, `bloomos_briefing_state`)
- Needs you (3–7 rows with why-it-matters) — `v_action_items` today → the Contract-3 `v_obligations` view; `why_it_matters` is **UNBOUND** until the additive columns land
- Money health tile — `fin_config` + `fin_transactions` (runway calc in `lib/finance`); freshness line **QBO**
- Mission health tile — `attendance`/`cohort_members` computable; "active on platform" + "finish the 30 days" **UNBOUND** (platform data, manual snapshots only)
- My day — `calendar_events` (Google sync exists) + approvals (`reed_drafts`, finance close state)
- Recent movement — derivable feed from `gifts`, `opportunities` stage changes, `cohort_members`, `interactions`; no unified movement feed exists (**UNBOUND as a feed**; buildable as a query union)

**Home → Organization Health** — seven computed rows: money (`fin_*`), fundraising (`gifts`+`opportunities` vs. goal), programs (`attendance`), team execution (`ops_tasks` weekly counts), strategy (`plan_objectives`+`plan_reviews`), governance (`board_members`+`compliance_items`), data freshness (`metric_snapshots` vs. cadence — the `metric_stale` logic already exists). All bindable; the *cause* sentences are composed.

**Inbox** — `notifications` (6 rows; thin), `message_threads`/`messages`, `reed_drafts` (approvals). Bindable; the "graduates into Today" rule is new logic.

**Fundraising → Today** — goal band: goal = `fr_plan_strategies.goal` summed for the plan year (the fundraising-plan decomposition); Raised = `gifts` reconciled; committed = `fin_revenue_commitments`; pledged = `pledges`; weighted open = `opportunities` × probability. Overdue/due/no-next-step groups = `opportunities.next_step`/`fr_touches`; Thank someone = `gifts.acknowledgment_status` + `reed_drafts`. All bindable.

**Fundraising → Donors & Funders** — `constituents` + rollups from `gifts` (lifetime), `interactions` (last touch), `opportunities` (next move); saved views = `segments` table exists. Bindable.

**Fundraising → Donor 360** — `constituents`, `interactions` (timeline), `opportunities` (open ask), `gifts` (giving by year), `ops_tasks` via `linked_entity_type='constituent'`, `relationships` + `households` (connected), `documents`/`document_links`, `grant_requirements` (reporting owed), "Why they matter" narrative — **UNBOUND** (new field or Reed-drafted, human-approved).

**Fundraising → Pipeline** — `opportunities` + `pipelines`/`pipeline_stages`. Bindable (board exists today).

**Fundraising → Grants** — `grants`, `grant_requirements` (requirements rail), `grant_payments`, `grant_contacts`. Bindable. "Work-back starts Sep 9" = task-template instantiation (`ops_tasks` templates) — partial.

**Fundraising → Campaigns** — `campaigns`, `appeals`, `gifts.campaign` attribution; "unattributed gifts" = `gifts` where campaign NULL. Bindable.

**Finance → Snapshot** — headline runway: `fin_config` cash anchor + burn from `fin_transactions` — **the live source is QBO and it does not exist; Stage 5's "one source failed / stale" state is the honest default for this screen**, exactly as the recon prompt anticipated. Confirmed: Stage 5 defines "QuickBooks did not answer" and "stale, shown but flagged" as first-class states; Snapshot should launch in the "stale, flagged" state driven by `fin_config.updated_at` / `fin_imports` recency, not pretend to be live. Rev/expense chart = `fin_transactions` by month; What changed = derivable.
- Six-month chart — `fin_transactions` ✓; Next-risk cell — composed from `opportunities` unconfirmed + forecast (bindable)

**Finance → Transactions** — `fin_transactions`, `fin_categories`, `fin_category_rules`, `fin_reconciliation_items`; close gating = existing `/admin/finance/close` logic; waiver audit trail — **UNBOUND** (needs an additive audit/waiver table or `audit_log` usage per Contract 7).

**Finance → Budget** — `fin_budget` (+ QB budget CSV import). Bindable.

**Finance → Forecast** — received `gifts`/`fin_transactions`, committed `fin_revenue_commitments`, pledges due `pledges`(+`pledge_payments`), weighted open `opportunities`; scenarios ("Sobrato slips") — **UNBOUND** (no scenario store; `/admin/finance/model` has some of this — verify overlap).

**Finance → Reports** — builder is new; sources bindable (`fin_*`); Reed narrative = `reed_drafts`; "recent reports" store — **UNBOUND** (no report-artifact table; nearest `comms_outputs`/`documents`).

**Programs → Overview** — Needs-attention rows (attendance drop, missing guardian, guide matches) = `attendance` + `students.custom_fields`(guardian) + intake data; **FY26 funnel (signed up → started → mid-track → finished → second track) is UNBOUND** — platform-app data, only manual `metric_snapshots` today. Next sessions = `cohort_sessions`.

**Programs → People** — `students` (70 rows) + saved views over track/day/cohort — track/day fields are platform data (**partially UNBOUND**); guide column — no guide table (**UNBOUND**); volunteers view — **UNBOUND** (no volunteer store; see §C).

**Programs → Person profile** — `students` + `attendance` + `interactions`-equivalent program notes; day-N journal ("wrote on day 15") — **UNBOUND** (app data); consent/forms — `students.custom_fields` (guardian, media release) partial.

**Programs → Intake** — `applications` (0 rows — the table exists, unused) + `participant_stages`; stage counts bindable once intake writes `applications`.

**Programs → Cohorts** — `cohorts`, `cohort_members`, `cohort_sessions`, `attendance` rollups. Bindable.

**Programs → Attendance** — `cohort_sessions` + `attendance`; offline queue = client-side build (Stage 5 defines it). Bindable.

**Programs → Partners** — `partners`, `partner_contacts`, `partner_interactions`; MOU columns exist (`mou_status`, `mou_start`, `mou_end`, `data_agreement_signed`) plus `teen_count`, `last_touch_at` — fully bindable; "task lands in Partner relationship tasks" = `ops_projects` kept-by-BloomOS pattern (exists for BloomOS Upgrades; generalizing is new logic).

**Programs → Content** — `ms_occupations` (874), `ms_cards`, approval queue = existing `/admin/careers`; pay-stale check = existing gates in `lib/ms`. Bindable. (Games pool/daily are adjacent sections; see decision 3.)

**Impact → Outcomes** — day-1/day-30 "can name a career" — **UNBOUND** (in-app prompts, no export); completion/second-track — **UNBOUND**/conflict (manual snapshots); "adult guide who stayed" — **UNBOUND**. This whole screen is population-and-provenance framing over numbers that today arrive by hand (`metric_snapshots`).

**Impact → KPIs** — `metric_definitions` + `metric_snapshots` + `plan_kpis`/`plan_kpi_snapshots` (objective link). Bindable — the strongest-bound screen in Impact.

**Impact → Analytics** — site visits = `page_views`/`click_events` (`aa.site_analytics`); app installs / started-track / source attribution — **UNBOUND** (store exports, platform data); most-started tracks — **UNBOUND**.

**Impact → Reports** — same as Finance → Reports: builder new, measures bindable via `metric_definitions`, citations + data-check gating = Contract 2/7 logic; artifact store **UNBOUND**.

**Work → Plan & Close** — `rhythm_sessions` (Monday/Friday ritual state — exists), three committed outcomes = rhythm data; carried-items = `ops_tasks` age; load-per-day = `work_blocks` + `calendar_events`. Bindable (this is a recomposition of `/admin/ops/monday` + `/friday`).

**Work → My Week** — `calendar_events`, `work_blocks`, `work_block_tasks`, `calendar_prefs` (working hours). Shipped last week (PR #451). Bindable.

**Work → Tasks** — `ops_tasks` (labels, priority, subtasks via `parent_id`, carry via `roll_count`, plan via `planned_week/day` — all exist). The design's five-value **size/estimate has no column** (**UNBOUND — additive column needed**; the 9h30m-unscheduled math depends on it). Templates: grant work-back instantiation exists (`app/api/admin/grants/[id]/seed-tasks`); a general template store (Board meeting, Staff onboarding, …) does not (**UNBOUND-additive**).

**Work → Projects** — `ops_projects` + task rollups; "serves objective" is bindable today: `ops_projects.initiative_id → plan_initiatives → plan_objectives` (and `grant_id` for grant projects); kept-by-BloomOS projects = existing pattern (BloomOS Upgrades proves it).

**Work → Meetings** — `meeting_records`, `meeting_suggested_tasks` (decisions → follow-up! exists), `calendar_events`, `meetings` routes. Bindable — the decisions-waiting panel maps to `meeting_suggested_tasks`.

**Work → Documents** — `documents`, `document_links` (attached-to). Bindable.

**Organization → Strategy** — `plan_objectives`, `plan_goals`, `plan_kpis`, `plan_initiatives`, `plan_reviews` (monthly review due). Bindable.

**Organization → Team** — `staff`, `staff_goals`, `memberships`, `invitations`, load = `ops_tasks`/`work_blocks` per person. Bindable.

**Organization → Board** — `board_meetings`, `board_members` (`term_start/end`, `officer_role`, `coi_signed_at` — conflict form is bindable; gave-this-year via `gifts` join on `constituent_id`, populated for 7 of 12 members — needs the §C backfill for the rest); packet-gated-on-close = new logic across `fin_*` close state. Mostly bindable.

**Organization → Compliance** — `compliance_items` + `compliance_filings` (filed → next-date roll-forward exists in concept). Bindable.

**Setup (Settings → onboarding)** — `org_settings`, `orgs`, `org_terminology`, `imports`/`import_rows`, `invitations`; step-state store — **UNBOUND** (additive `org_settings` JSON or a small table).

**QBO-source panels, listed separately** (the unresolved spike): Finance → Snapshot headline runway + freshness chip; Finance → Transactions "synced 2h ago" framing and the 214-entries feed (today: CSV import); Home → Today Money-health freshness; Organization Health money row's cause line. **Confirmed: Stage 5's "one source failed" / "stale, shown but flagged" states are designed to be a screen's default, and Finance → Snapshot should launch in that state.**

---

## H. Feasibility read

**Restructuring vs. new build.**
Restructuring (data and logic exist; the work is recomposition + the new shell): Fundraising Today/Donors & Funders/Pipeline/Grants/Campaigns, Finance Transactions/Budget/Forecast, Programs People/Intake/Cohorts/Attendance/Partners/Content, Impact KPIs, Work My Week/Tasks/Projects/Meetings/Documents/Plan & Close, Organization all four, Inbox. That is ~27 of 35 screens.
Genuinely new build: the V2 shell itself (sidebar/tab/entitlement/terminology resolution + mobile bottom bar), Home → Today's obligation feed with why-it-matters, Organization Health's cause engine, the two report builders (Finance/Impact) with Contract-7 gating and waiver audit, the Outcomes screen's provenance framing, onboarding chapters, and the Contract-2 render-blocking rule ("a number with no definition cannot render") which touches every screen that shows a program number.

**Riskiest single piece:** Contract 3's "resolving it anywhere resolves it everywhere" across four live orgs — not because the SQL is hard, but because it rewires the semantics of three tables that 20+ surfaces and the report-an-issue flow write to, while the calendar feature that shipped last week holds an FK into one of them. Second riskiest: the shell cutover (every deep link in emails, notifications, and briefings points at V1 routes).

**Destructive migrations required:** none. The two candidates (students-merge, obligations-table) both have additive paths (§A.4 Option B, §C.2). The one pre-existing item worth fixing while in there: `ms_catalog` still lacks `security_invoker=on` (known), and the 12 AA-defaulted `org_id` columns remain on the AA-site tables — neither blocks V2, both are additive fixes.

**Stageable behind a flag?** Yes — and the architecture makes it unusually clean, because V1 routes are never deleted, only redirected. Recommended shape: the V2 shell mounts at the same `/admin` root behind a per-user (or per-org) flag; destinations cut over one at a time by flipping their sidebar row from V1 route → V2 screen while unmigrated destinations keep rendering their V1 pages *inside* the V2 shell (the tab row falls back to the V1 secondary nav for that destination). The genuinely global pieces that must land first regardless: the shell, the entitlement/terminology resolver, and the redirect map. The only big-bang element is the shell swap itself, and even that can be per-user-flagged since it is layout, not data. No forced big-bang cutover.

---

*End of recon. Nothing was built, no migrations were applied, no branches beyond the designated recon branch were touched.*
