# Schema drift audit — production vs. the migration folder (2026-09-03)

Read-only audit. Nothing was applied to production, no migration was written, no
schema was changed. This document is the only output.

**What was compared.** A fresh Postgres 16 scratch database was built by running
`supabase/tests/setup-supabase-stub.sql` and then every file in the ordered list
in `scripts/test-rls.sh` (190 files, plus `create_audit_log.sql` as the harness
applies it), exactly as CI does. Its `public` and `private` schemas were then
diffed against production (`kzzdtibbwsucloaoqpqa`, Postgres 17.6) across tables,
columns (`pg_attribute` + `pg_attrdef`), constraints (`pg_constraint`), indexes
(`pg_indexes`, predicates included), RLS flags and policies (`pg_class`,
`pg_policies`), functions (`pg_proc` + `pg_namespace`, `public` and `private`),
views (`pg_views` + `reloptions`), triggers (`pg_trigger`), plus extensions and
the realtime publication. `information_schema` was not used for any column
comparison. A second scratch copy ("scratch-full") additionally received the
files the harness deliberately excludes (`bloomos_staff_phase1..4`,
`bloomos_global_search_phase3`, `pin_function_search_path`, `grant_shannon_owner`)
after inserting the production AA org id, to separate "excluded from the harness"
from "no file exists".

**Framing.** Production is the source of truth for what the system does today.
The folder is the source of truth for what can be rebuilt. Every difference
below says which side is correct; both sides are wrong in places.

---

## 1. Summary

### 1.1 The headline

The fifty `org_id` default drops are not untracked. Production's own migration
ledger, `supabase_migrations.schema_migrations`, records a migration named
`drop_product_table_org_id_defaults` (version `20260716234958`, created by
remi@ambitionangels.org) whose stored statement is a `DO` block that drops the
`org_id` default on an explicit list of 50 "product tables", with the comment
"The 14 AA-site tables keep theirs". That SQL is Appendix 4b of
`specs/bloomos-migration-runbook.md` (Step 13). It was applied through the
Supabase tooling, which recorded the full statement text, but the file was
never added to `supabase/migrations/` or to the harness list. The same ledger
holds 26 other applied migrations with no file in the repo, with full statement
text for each, so the "lost" DDL is recoverable verbatim from production.

The migration folder is therefore not a random drift away from production. It is
production minus a specific set of applied-but-uncommitted files, plus a set of
committed-but-never-applied files. The `add_org_id_to_tenant_tables.sql`
re-install of defaults is not a bug in that file; it is the state of the world
before Step 13, and the folder simply has no Step 13.

### 1.2 Counts

Objects in scope (public schema unless noted):

| | Production | Scratch (folder) |
|---|---|---|
| Tables (incl. `audit_log` partitions) | 186 | 167 |
| Tables with an `org_id` column | 169 | 151 |
| Tables carrying an `org_id` **default** | **12** | **62** |
| Tables with `org_id` nullable | 3 | 3 |
| RLS enabled | 186 / 186 | 164 / 167 |
| Policies | 316 | 280 |
| Views | 8 | 5 |
| Functions (`public` + `private`, non-extension) | 32 | 21 |
| Triggers (non-internal) | 90 | 73 |

Differences, per category (partition tables that differ only because the scratch
build ran in September are noted but not counted as drift):

| Category | Prod-only | Folder-only | Differ on shared objects | Notes |
|---|---|---|---|---|
| 1. Tables | 18 | 0 | — | 165 tables shared. Partitions: prod has 2026_06/07/08, scratch has 2026_10/11 (time artifact). |
| 2. Columns | 4 | 5 | 7 nullability + **50 `org_id` defaults** | On 52 shared tables the only column difference is the `org_id` default. Stub tables (`bv_*`, `page_views`, `click_events`) add 19 more stub-shape mismatches, listed separately. |
| 3. Constraints | 2 | 3 | 1 (`fin_config` PK redefined) | |
| 4. Indexes | 21 | 7 | 1 predicate | 7 of the 21 are pg_trgm indexes from a file the harness excludes. |
| 5. RLS enabled | 0 | 0 | 1 (audit_log_2026_09 off in scratch) | Scratch-only partitions also off. |
| 5. Policies | 36 (all on prod-only tables) | 0 | **0** | Policy sets are identical on all 165 shared tables. |
| 6. Functions | 11 | 0 | 5 search_path pins + 2 comment-only | All 21 shared bodies are identical after stripping comments. |
| 7. Views | 3 | 0 | 1 (column order only) | All views on both sides have `security_invoker` except `ms_catalog` (same on both). |
| 8. Triggers | 17 (all on prod-only tables) | 0 | **0** | |
| Migration ledger | 27 applied migrations have no file | 40 files have no ledger entry | | Section 4. |

The four tables the missing-tables audit found absent (`fr_plan_strategies`,
`fr_plan_gift_levels`, `ai_calls`, `program_partners`) **now exist in
production**: their migrations were applied and recorded at 18:00:57, 18:01:10
and 18:01:21 UTC today, and their shapes match the folder exactly. They are not
counted above.

### 1.3 Differences that can cause silent wrong-tenant or invisible-row behavior, by severity

1. **[High, CI blind spot] 50 tables where scratch carries an AA `org_id` default and production does not.** A writer that omits `org_id` on any of them passes the RLS leak test and the tenant-default ratchet (both run against scratch, which silently fills in AA) and throws `null value in column "org_id"` in production. Section 2.2 names the set. Production is correct; the folder is missing `drop_product_table_org_id_defaults`. The ratchet baseline in `supabase/tests/tenant-default-ratchet.sql` still lists these 50 as legitimately defaulted, so it can never detect a regression on them.

2. **[High, live wrong-tenant surface] 12 tables where production still carries the AA default** (`bv_showcase_submissions`, `click_events`, `demoday_notes`, `demoday_signups`, `hs_companies`, `hs_contacts`, `hs_deals`, `hs_engagements`, `hs_sync_jobs`, `page_views`, `partner_waitlist`, `quiz_submissions`). Production has four orgs today (Ambition Angels, Young Life EPA, Young, Gifted & Black, SafeSpace); an insert omitting `org_id` on these lands in AA silently. Both sides agree here, so this is not drift, but it is the whole remaining wrong-tenant surface and it is the twelve-table cleanup. Every row in all 12 is currently AA. These were the "14 AA-site tables" Step 13 deliberately kept; two of the 14 have since been dropped (`bv_newsletter_subscribers` by `comms_phase1_story_schema`, untracked in the repo; `donations` by `drop_donations_org_id_default.sql`, tracked).

3. **[Medium, rebuild produces a wrong-tenant shape] `fin_config`.** Production is one row per org (PK `org_id`, `id` dropped, 3 rows). The folder still builds the `id = 1` singleton. A rebuild from the folder yields a table that can hold exactly one tenant's finance config; the app reads it by `org_id`. Production is correct; the folder is missing `fin_config_org_scoped_restructure`.

4. **[Medium, invisible rows in prod-only columns the folder cannot see] `plan_objectives.deleted_at`, `fr_prospect_scores.prospect_id`, `fr_prospect_briefs.prospect_id`, `funder_angles.prospect_id`** exist only in production, and the app filters and keys on them (soft-deleted objectives are hidden by `deleted_at is null`; prospect scores upsert on `prospect_id`). The folder cannot rebuild these, and nothing in CI exercises them. Production is correct.

5. **[Medium, columns the app writes that production does not have] `constituents.is_volunteer`, `students.leader_id`, `hs_sync_jobs.totals`.** Three committed migrations were never applied to production (no ledger entry, no column). The Volunteers page filters on `is_volunteer` and the flag/unflag actions write it; the student profile writes `leader_id`; the HubSpot sync engine writes `totals` on every job row. In production these fail with `column does not exist` (42703). Not a tenant problem, but the same failure class as the missing-tables audit. The folder is correct; production is behind.

6. **[Low, confirmed but inert] the three nullable `org_id` columns.** `calendar_sync_jobs`, `fr_prospect_disqualified`, `fr_prospect_promoted` are nullable with no default on both sides. Zero NULL rows exist. `calendar_sync_jobs` has no RLS policies at all (service-role only) so RLS already hides every row from every tenant; its single writer stamps `org_id` from the parent connection row, which is NOT NULL. The two `fr_prospect_*` tables have no writer left in the codebase. Section 2.1.

7. **[Low] RLS off on `audit_log` partitions in scratch.** The harness runs `create_audit_log.sql` last, after `fix_audit_partition_rls.sql`, so the partitions it creates never get RLS. Production's partitions all have RLS on. The harness ordering is wrong; production is right. PostgREST exposes partitions directly, which is why the fix migration exists.

8. **[Low] `hubspot_bench_candidates` / `hubspot_bench_candidates_count`** exist only in production, are SECURITY INVOKER, and carry EXECUTE for `anon` (Supabase default privileges; `reed_has_permission_revoke_anon` fixed only `has_permission`). They read `hs_contacts`, which has RLS and no anon policy, so anon gets an empty set. Not a leak, but an unfenced permission surface with no file.

Everything else in the diff is rebuildability, not tenant safety: the comms
module (8 tables, 3 views, 1 function, 16 policies) exists only in production
with no file anywhere; the staff module (10 tables, 7 functions, 1 view, 20
policies) has files but the harness excludes them.

---

## 2. The three specific confirmations

### 2.1 The three nullable `org_id` columns

Confirmed on both sides. Of the 169 production tables with `org_id`, 166 are
NOT NULL; these three are nullable with no default:

| Table | Rows (prod) | NULL `org_id` rows | Non-AA rows | Policies |
|---|---|---|---|---|
| `calendar_sync_jobs` | 217 | **0** | 196 (Young Life EPA) | none (RLS on, service-role only) |
| `fr_prospect_disqualified` | 20 | **0** | 0 | members read/write via `has_permission(org_id, 'fundraising.*')` |
| `fr_prospect_promoted` | 0 | **0** | 0 | same pattern |

**No NULL `org_id` rows exist today.**

Code paths that insert into them:

- `calendar_sync_jobs`: exactly one insert, `lib/agenda/calendar-sync.ts:366` in
  `runCalendarSync`, which sets `org_id: conn.orgId`. `conn.orgId` comes from
  `connections.org_id` via `listActiveCalendarConnections` in
  `lib/google/connection.ts`, and `connections.org_id` is NOT NULL in
  production. Callers: `app/api/cron/calendar-sync/route.ts` and
  `app/api/admin/agenda/sync/route.ts`. The webhook route
  (`app/api/google/calendar-webhook/route.ts`) calls `syncUserCalendar` directly
  and writes no job row. The only reader is `getCalendarConnectionStatus`
  (`lib/google/connection.ts:257`), service-role, filtered by `owner_user_id`,
  not `org_id`, so a NULL `org_id` row would in fact still be visible there.
  No path can write NULL short of hand SQL.
- `fr_prospect_disqualified` and `fr_prospect_promoted`: **no code path reads
  or writes either table.** They are the pre-bench suppression sets keyed by
  HubSpot id; `fr_prospects_bench` (2026-06-24) replaced them with
  `fr_prospects.status in ('active','promoted','disqualified')`, and the current
  routes (`app/api/admin/fundraising/prospects/{disqualify,promote}/route.ts`)
  write `fr_prospects`. The 20 rows in `fr_prospect_disqualified` predate that
  and were backfilled to AA by `rls_reed_phase1`. The invisible-row claim is
  correct for these two (a NULL `org_id` makes `has_permission(NULL, …)` NULL
  and the row vanishes for every tenant), but there is no writer to produce
  one. They are dead tables carrying a live footgun.

Which side is correct: neither. Both sides reproduce the nullable columns
faithfully, and `create_fr_prospect_promoted.sql` says so in its header
("PRE-hardening state — org_id nullable"). The ledger's `rls_reed_phase1`
statement explicitly left them nullable ("org_id left nullable").

### 2.2 The false-negative surface

The exact set of tables where scratch carries an `org_id` default and
production does not is **50 tables**:

```
acknowledgments  appeals  blackouts  board_meetings  board_members  bookings
briefings  bv_newsletter_subscribers  campaigns  compliance_items
connection_candidates  connections  constituents  email_sends  fin_budget
fin_categories  fin_category_rules  fin_config  fin_imports
fin_revenue_commitments  fin_transactions  fr_agent_activity_log
fr_email_drafts  fr_funding_opportunities  fr_prospect_briefs
fr_prospect_scores  fr_touches  funder_angles  funds  gifts
grant_requirements  grants  interactions  journey_enrollments  journey_steps
journeys  meeting_types  opportunities  ops_projects  ops_tasks
partner_contacts  partner_interactions  partners  pledge_payments  pledges
recurring_plans  relationships  soft_credits  strategy_angles
strategy_room_meta
```

That is 49 of the 50 tables in `drop_product_table_org_id_defaults` (the 50th,
`households`, is also dropped in the folder by
`drop_households_org_id_default.sql`) plus `bv_newsletter_subscribers`, whose
default was dropped by `comms_phase1_story_schema` (ledger only). There are no
tables in the other direction: every production default is also a scratch
default.

What this means for the test suite (1,115 vitest tests on this branch, 76
files, plus the SQL leak test and ratchet): on these 50 tables an insert that
omits `org_id` succeeds in CI and fails in production. The suite's only
default-related assertion is the "default smuggle" check in
`rls-leak-test.sql`, which tests `gifts` from a tenant-two session and passes
for the wrong reason (the default resolves to AA, RLS rejects the row). The
ratchet's frozen baseline of 62 tables is exactly the pre-Step-13 world.

Which side is correct: production. The folder is missing one file; its content
is in the ledger and in the runbook's Appendix 4b.

### 2.3 `bv_newsletter_subscribers` vs `bv_showcase_submissions`, and whether hardening was piecemeal

Confirmed: in production `bv_newsletter_subscribers.org_id` is NOT NULL with no
default; `bv_showcase_submissions.org_id` is NOT NULL with the AA default. Both
have RLS on with the same two policies (`members read/write` via
`has_permission(org_id, 'program.read'|'program.write')`), identical to scratch.

The piecemeal hypothesis does not hold for the bulk of the hardening. The
ledger shows one batch of 50 (`drop_product_table_org_id_defaults`,
2026-07-16 23:49:58 UTC), preceded by tracked per-domain drops that are also in
the repo (`bloomos_strategy_phase1b`: 2 tables, `program_spine_schema`: 8,
`comms_v2_phase1_default_drops`: 2, `drop_fr_prospects_org_id_default`,
`drop_donations_org_id_default`, `drop_households_org_id_default`). The
`bv_newsletter_subscribers` drop is the one genuinely one-off case: it rode
along inside `comms_phase1_story_schema` (2026-08-19) as "the one comms-adjacent
org_id default", because the comms module reuses that table. Its sibling was
simply out of scope for that migration. So the pattern is: batches for the
product tables, deliberate exemption for the 14 AA-site tables, and one
opportunistic drop inside an unrelated feature migration. What *was* done table
by table, and outside any batch, is the set of committed-but-unapplied and
applied-but-uncommitted single-purpose migrations in section 4.

Where the same "one sibling hardened, the other not" shape does repeat, it is
in the stub rather than production: `setup-supabase-stub.sql` models `bv_*`,
`page_views` and `click_events` with minimal invented shapes (wrong id types,
missing columns, wrong nullability), so the folder cannot rebuild any of the
four correctly. Their real DDL is in the ledger (`bv_showcase_submissions`,
`create_bv_newsletter_subscribers`); `page_views` and `click_events` predate the
ledger and have no recorded DDL anywhere except production itself.

---

## 3. Full diff

Legend for "correct side": **P** = production is right, folder should carry it;
**F** = folder is right, production should have it; **B** = both wrong;
**A** = artifact of the harness/stub, not real drift.

### 3.1 Tables

**Present in production, not buildable from the folder (18):**

| Table | Rows | Origin | Correct | Notes |
|---|---|---|---|---|
| `stories` | 0 | `comms_phase1_story_schema` (ledger only) | P | org_id NOT NULL, no default; RLS + 2 policies (`comms.manage`); `set_updated_at` trigger |
| `story_subjects` | 0 | same | P | participant-subject rows additionally gated by `comms.subjects.read` |
| `story_consents` | 0 | same | P | check constraints `story_consents_scope_vocab`, `story_consents_requested_or_granted` |
| `story_media` | 0 | same | P | |
| `comms_outputs` | 0 | `comms_phase3_outputs` (ledger only) | P | |
| `comms_formats` | 0 | `comms_phase4_editions` (ledger only) | P | |
| `comms_editions` | 0 | same | P | FK to `email_campaigns` |
| `comms_edition_slots` | 0 | same | P | |
| `staff` | 8 | `bloomos_staff_phase1.sql` (file exists, harness-excluded) | A | rebuilds byte-identical in scratch-full once the AA org id `17c75da8…` exists |
| `staff_goals` | 0 | `bloomos_staff_phase2.sql` | A | same |
| `staff_kpis` | 0 | phase 2 | A | same |
| `staff_kpi_snapshots` | 0 | phase 2 | A | same |
| `review_cycles` | 0 | `bloomos_staff_phase3.sql` | A | same |
| `review_competencies` | 5 | phase 3 | A | same |
| `review_feedback` | 0 | phase 3 | A | same |
| `review_manager_notes` | 0 | phase 3 | A | same |
| `review_summaries` | 0 | phase 3 | A | same |
| `org_terminology` | 13 | `bloomos_staff_phase4.sql` | A | same |

All 18 have `org_id uuid NOT NULL` with no default and RLS enabled with
policies. Full column, constraint, index, policy and trigger listings for the
comms tables are in Appendix A (they are the only ones the folder cannot
reproduce). The staff-phase files cannot run in the harness only because their
seed rows reference the production AA org id and `storage.buckets`, which the
stub does not provide.

**Present in the folder, not in production: none.** (`audit_log_2026_10` and
`audit_log_2026_11` exist only because the scratch build ran in September and
`create_audit_log.sql` creates current+next partitions; production's pg_cron job
creates them monthly and has produced 2026_06 through 2026_09. Not drift.)

**The four previously missing tables** (`fr_plan_strategies`,
`fr_plan_gift_levels`, `ai_calls`, `program_partners`): present in production as
of 2026-09-03 18:00–18:01 UTC (ledger entries `fundraising_plan`,
`create_ai_calls_ledger`, `create_program_partners`), identical to the folder in
every compared category.

### 3.2 Columns

Compared as name, `format_type`, `attnotnull`, `pg_get_expr(adbin)`, per table,
via `pg_attribute` and `pg_attrdef`. 95 of the 165 shared tables are identical
in every category. 67 differ in columns; on 52 of those the only difference is
the `org_id` default (section 2.2). The remaining 15 tables:

| Table | Column | Production | Folder (scratch) | Correct | Cause |
|---|---|---|---|---|---|
| `constituents` | `is_volunteer` | absent | `boolean NOT NULL default false` | **F** | `add_constituents_is_volunteer.sql` (PR #401, 2026-07-21) never applied. `app/admin/fundraising/volunteers/page.tsx:39` filters on it; `VolunteerControls.tsx` writes it. |
| `students` | `leader_id` | absent | `uuid` (FK to constituents, partial index) | **F** | `add_students_leader_id.sql` (PR #401) never applied. `app/api/admin/students/route.ts:40` writes it; profile page reads it. |
| `hs_sync_jobs` | `totals` | absent | `jsonb` | **F** | `hs_sync_jobs_add_totals.sql` (PR #431, 2026-07-31) never applied. `lib/hubspot/sync-engine.ts:254` writes it on every job; settings panel reads it. |
| `plan_objectives` | `deleted_at` | `timestamptz` (+ partial index) | absent | **P** | `strategy_objective_soft_delete` in the ledger only; its comment says "See supabase/migrations/strategy_objective_soft_delete.sql", a file that was never committed. |
| `fr_prospect_scores` | `prospect_id` | `uuid` (+ unique index) | absent | **P** | `prospect_scores_briefs_by_prospect_id` ledger only |
| `fr_prospect_scores` | `hubspot_contact_id` | nullable | NOT NULL | **P** | same migration |
| `fr_prospect_briefs` | `prospect_id` | `uuid` (+ index) | absent | **P** | same |
| `fr_prospect_briefs` | `hubspot_contact_id` | nullable | NOT NULL | **P** | same |
| `funder_angles` | `prospect_id` | `uuid` (+ index) | absent | **P** | `funder_angles_prospect_link` ledger only |
| `fin_config` | `id` | absent | `integer NOT NULL default 1` | **P** | `fin_config_org_scoped_restructure` ledger only; see 3.3 |
| `donations` | `name` | absent | `text` | **B** | `create_donations.sql` is a reconstruction that invented a `name` column; production never had it (the pre-migration table). `save-donation`'s legacy fallback branch writes `name` and would fail, but the primary insert does not use it. |
| `bloomos_briefing_narrative` | `input_hash`, `model` | NOT NULL | nullable | **P** | `tenant_scope_briefing_narrative.sql` re-creates the table if missing with looser nullability than the ledger's `bloomos_briefing_narrative` |
| `ygb_registrations` | `liability_waiver_signed`, `medical_consent_signed`, `photo_video_release_signed` | NOT NULL | nullable | **P** | `create_ygb_schema.sql` is a reconstruction; production is the pre-migration table |
| `bv_newsletter_subscribers` | `source` | `text NOT NULL default 'site'` | absent | **P** (stub) | stub shape |
| `bv_newsletter_subscribers` | `email`, `created_at` | NOT NULL | nullable | **P** (stub) | stub shape |
| `bv_showcase_submissions` | `session_id`, `kind`, `status`, `target`, `value`, `file_path`, `file_name`, `file_mime`, `file_size_bytes` | present | absent | **P** (stub) | stub shape; stub also invents a `name` column production lacks |
| `page_views` | `id` | `uuid default gen_random_uuid()` | `bigint` serial | **P** (stub) | stub shape |
| `page_views` | `page` | NOT NULL | nullable | **P** (stub) | |
| `click_events` | `id` | `uuid default gen_random_uuid()` | `bigint` serial | **P** (stub) | |
| `click_events` | `event_name`, `page` | NOT NULL | nullable | **P** (stub) | |

`org_id` default values: on the 12 tables where both sides carry a default,
scratch's literal is the scratch-generated AA org uuid (`add_org_id_to_tenant_tables.sql`
looks the org up by slug), production's is `17c75da8-…`. Same semantics, not
drift.

`org_id` nullability: identical on both sides for all 151 shared `org_id`
columns (the three nullable ones in 2.1, all others NOT NULL).

### 3.3 Constraints

Compared by name, type and `pg_get_constraintdef`. Identical on 160 of the 165
shared tables. Differences:

| Table | Constraint | Production | Folder | Correct | Cause |
|---|---|---|---|---|---|
| `fin_config` | `fin_config_pkey` | `PRIMARY KEY (org_id)` | `PRIMARY KEY (id)` | **P** | `fin_config_org_scoped_restructure` (ledger): dropped `fin_config_singleton`, dropped PK on `id`, added PK on `org_id`, dropped `id`. Production has 3 rows (one per org with finance). The folder's `finance_v2_config_runway_inputs.sql` still says "fin_config is still addressed as the id=1 singleton". |
| `fin_config` | `fin_config_singleton` (`check (id = 1)`) | absent | present | **P** | same |
| `students` | `students_leader_id_fkey` | absent | present | **F** | unapplied `add_students_leader_id.sql` |
| `ygb_registrations` | `ygb_registrations_showcase_guest_count_check` | absent | present | **P** | reconstruction in `create_ygb_schema.sql` added a check production never had |
| `bv_newsletter_subscribers` | `bv_newsletter_subscribers_email_key` (unique) | present | absent | **P** (stub) | |
| `bv_showcase_submissions` | `bv_showcase_submissions_kind_check` | present | absent | **P** (stub) | |

Primary keys, foreign keys and checks on all other shared tables match,
including every `org_id` FK to `orgs`. Constraints on the 18 prod-only tables
are listed in Appendix A.

### 3.4 Indexes

Compared by name and full `indexdef` (predicates included). Identical on 149 of
165 shared tables.

**Production only (21):**

| Index | Table | Definition | Correct | Cause |
|---|---|---|---|---|
| `constituents_first_name_trgm`, `constituents_last_name_trgm`, `constituents_org_name_trgm` | `constituents` | gin `gin_trgm_ops` | A | `bloomos_global_search_phase3.sql` exists, harness-excluded (needs pg_trgm) |
| `fr_prospects_name_trgm`, `fr_prospects_org_name_trgm` | `fr_prospects` | gin trgm | A | same |
| `interactions_notes_trgm` | `interactions` | gin trgm | A | same |
| `ops_tasks_description_trgm` | `ops_tasks` | gin trgm | A | same |
| `fr_prospect_scores_prospect_id_key` | `fr_prospect_scores` | unique btree (prospect_id) | **P** | `prospect_scores_briefs_by_prospect_id` ledger only; the scores upsert conflicts on this |
| `fr_prospect_briefs_prospect_id_idx` | `fr_prospect_briefs` | btree (prospect_id) | **P** | same |
| `funder_angles_prospect_id_idx` | `funder_angles` | btree (prospect_id) | **P** | `funder_angles_prospect_link` ledger only |
| `plan_objectives_active_idx` | `plan_objectives` | btree (org_id) WHERE deleted_at IS NULL | **P** | `strategy_objective_soft_delete` ledger only |
| `ops_tasks_parent_idx` | `ops_tasks` | btree (parent_id) | B | ledger's `tasks_tier1_priority_subtasks_status_category` named it this; the repo's reconstruction `upgrade_ops_tasks_priority_subtasks_labels.sql` names it `ops_tasks_parent_id_idx` (same definition) |
| `ops_tasks_priority_idx` | `ops_tasks` | btree (priority) | **P** | in the ledger migration, dropped from the reconstruction |
| `fin_config_pkey` | `fin_config` | unique (org_id) | **P** | see 3.3 |
| `bv_newsletter_subscribers_email_key` | | unique (email) | P (stub) | |
| `bv_showcase_submissions_created_at_idx`, `_kind_target_idx`, `_session_idx` | | | P (stub) | |
| `idx_ygb_attendance_date` | `ygb_attendance` | btree (attendance_date) | B | **duplicate** of `ygb_attendance_date_idx` (same column, both live in prod) |
| `idx_ygb_reg_email` | `ygb_registrations` | btree (parent_email) | B | duplicate of `ygb_registrations_parent_email_idx` |
| `idx_ygb_reg_status` | `ygb_registrations` | btree (status) | B | duplicate of `ygb_registrations_status_idx` |

**Folder only (7):**

| Index | Table | Correct | Cause |
|---|---|---|---|
| `constituents_is_volunteer_idx` | `constituents` | **F** | unapplied `add_constituents_is_volunteer.sql` |
| `students_leader_idx` | `students` | **F** | unapplied `add_students_leader_id.sql` |
| `ops_tasks_parent_id_idx` | `ops_tasks` | B | naming, see above |
| `fin_config_pkey` on `(id)` | `fin_config` | P | see 3.3 |
| `donations_created_at_idx` | `donations` | B | reconstruction `create_donations.sql`; harmless, never applied |
| `partner_waitlist_created_at_idx`, `partner_waitlist_role_idx` | `partner_waitlist` | B | reconstruction `create_partner_waitlist.sql`; harmless, never applied |

**Same name, different definition (1):** `ops_tasks_planned_week_idx` is
`btree (planned_week) WHERE planned_week IS NOT NULL` in production and
`btree (planned_week)` in the folder (`add_planned_week_to_ops_tasks.sql`, which
has no ledger entry; production's column and index arrived by a different
route). **P**, cosmetic.

### 3.5 RLS and policies

**RLS enabled.** All 186 production tables have `relrowsecurity = true`
(`relforcerowsecurity = false` everywhere on both sides). In scratch, 164 of 167;
the three `audit_log` partitions are off because the harness applies
`create_audit_log.sql` after `fix_audit_partition_rls.sql` and the stubbed
pg_cron job never runs. Production's four partitions all have RLS on. **P**;
harness ordering.

**Policies.** 316 in production, 280 in scratch. On every one of the 165 shared
tables the policy set (name, permissiveness, roles, command, `USING`,
`WITH CHECK`) is **identical**. The 36 extra production policies are all on the
18 prod-only tables (Appendix A). This includes:

- `calendar_sync_jobs`, `bloomos_briefing_narrative`, `bloomos_briefing_state`,
  `connections`, `webhook_events`, `org_settings`, `cut_*`, `game_*`, `ms_*`
  and the `audit_log` partitions: RLS on, zero policies, on both sides
  (service-role only by design).
- The 12 AA-site tables that still carry the default (`bv_*`, `page_views`,
  `click_events`, `demoday_*`, `hs_*`, `partner_waitlist`, `quiz_submissions`)
  all have `members read` (and, except `page_views`/`click_events`, `members
  write`) policies keyed on `has_permission(org_id, …)`, identical on both
  sides.
- `fr_prospect_disqualified`, `fr_prospect_promoted`: `members read/write` via
  `has_permission(org_id, 'fundraising.read'|'fundraising.write')`, both sides.

**Function grants that back policies.** `public.has_permission` has EXECUTE for
`postgres`, `authenticated`, `service_role` in production and for `postgres`,
`authenticated` in scratch (the stub has no `service_role`); `anon` is revoked
on both. `private.has_permission` carries a PUBLIC EXECUTE grant on both sides.
Artifact, not drift.

### 3.6 Functions

`pg_proc` joined to `pg_namespace`, schemas `public` and `private`,
extension-owned functions excluded. Production: 32 (20 `public`, 12 `private`),
of which 21 are shared with scratch and 11 are production-only. Scratch: 21.

**Production only (11):**

| Function | Kind | Correct | Cause |
|---|---|---|---|
| `private.can_view_staff(uuid)`, `private.staff_is_self(uuid)`, `private.subject_may_see_feedback(uuid,uuid,text)`, `public.staff_validate_reports_to()`, `public.staff_guard_self_update()`, `public.staff_goals_guard_approval()` | SECURITY DEFINER, `search_path=''` | A | `bloomos_staff_phase1..3.sql`, harness-excluded; scratch-full reproduces them with identical normalized bodies |
| `public.can_view_staff(uuid)` | SECURITY DEFINER wrapper | **P** | `bloomos_staff_phase2b_shim_and_seed`, ledger only (plus one seed row) |
| `private.story_subject_is_participant(uuid)` | SECURITY DEFINER | **P** | `comms_phase1_story_schema`, ledger only |
| `public.hubspot_bench_candidates(text,text,int,int)`, `public.hubspot_bench_candidates_count(text,text)` | SECURITY INVOKER, `search_path` pinned, EXECUTE granted to `anon` | **P** | `hubspot_bench_candidates`, ledger only; `pin_function_search_path.sql` references them, which is why that file cannot apply in the harness |
| `public.ms_apply_oews(jsonb,text)` | SECURITY DEFINER, `search_path=public`, EXECUTE only `postgres`/`service_role` | **P** | **no file and no ledger entry**; created outside both. Called by the edge function `supabase/functions/ms-refresh-oews/index.ts`. Only object in this audit with no recorded DDL anywhere but production. |

**Folder only: none.**

**Shared (21).** After stripping comments and collapsing whitespace, every
shared function body hashes identically on both sides. Differences that remain:

| Function | Production | Folder | Correct |
|---|---|---|---|
| `demoday_notes_touch_updated_at()`, `fr_donations_after_update()`, `fr_ingest_donation(donations)`, `fr_ingest_donation_tg()`, `fr_stage_probability(text)` | `SET search_path = public, extensions, pg_temp` | no `search_path` | A / P — `pin_function_search_path.sql` exists but is harness-excluded (it also pins the two ledger-only bench functions, so it errors in scratch). `set_updated_at`, `fr_pursue_funder_angle`, `fr_sync_hubspot_to_spine`, `fr_backfill_constituent_names_from_hubspot`, `bloomos_search_people` are pinned on both sides. |
| `private.handle_new_user()`, `public.sync_assigned_to_id()` | comments stripped | comments present | A — same code |

`private` schema: 8 functions on both sides plus the 4 prod-only above; no
tables or views exist in `private` on either side.

### 3.7 Views

`pg_views` with `reloptions` from `pg_class`:

| View | Production `reloptions` | Folder | Correct |
|---|---|---|---|
| `ms_catalog` | none | none | same on both. The only view without `security_invoker`; it runs as owner over `ms_cards`/`ms_occupations` (approved rows only, by design). |
| `v_action_items` | `security_invoker=on` | same | identical |
| `v_ops_task_health_config` | `security_invoker=true` | same | identical |
| `v_revenue_schedule` | `security_invoker=true` | same | identical |
| `v_ops_task_health` | `security_invoker=true` | same | Definition differs only in the order `t.*` columns are expanded inside the `base` CTE (follows physical column order of `ops_tasks`, which differs by migration order). Output columns identical. A. |
| `v_publishable_stories` | `security_invoker=on` | absent | **P**, `comms_phase2_views` ledger only |
| `v_story_suggestions` | `security_invoker=on` | absent | **P**, `comms_phase2_views` then replaced by `comms_phase6_loop`, ledger only |
| `v_review_feedback_visible` | `security_invoker=true` | absent | A, `bloomos_staff_phase3.sql` harness-excluded |

Every view that reads tenant tables has `security_invoker` set on both sides.

### 3.8 Triggers

Non-internal triggers via `pg_get_triggerdef`. Identical on all 165 shared
tables (73 triggers). Production carries 17 more, all on prod-only tables:
`set_updated_at` BEFORE UPDATE triggers on `stories`, `comms_outputs`,
`comms_formats`, `comms_editions`, `comms_edition_slots`, `org_terminology`,
`review_competencies`, `review_cycles`, `review_feedback`,
`review_manager_notes`, `review_summaries`, `staff`, `staff_goals`,
`staff_kpis`; plus `staff_validate_reports_to` (BEFORE INSERT OR UPDATE OF
reports_to, org_id), `staff_guard_self_update` (BEFORE UPDATE) and
`staff_goals_guard_approval` (BEFORE INSERT OR UPDATE OF approval_status).
Correct side: **P** for the comms ones (no file), A for the staff ones.

### 3.9 Extensions, publications, storage (outside the requested scope, noted for completeness)

- Extensions: production has `pg_trgm 1.6`, `uuid-ossp 1.1`, `pgcrypto 1.3`,
  `pg_stat_statements 1.11` in schema `extensions`, `pg_net 0.20.0` and
  `citext 1.6` in `public`, `pg_cron 1.6.4`, `supabase_vault 0.3.1`. Scratch has
  `citext` and `pgcrypto` in `public`. The stub installs `pgcrypto` into
  `public`; nothing depends on the schema, so this is an artifact.
- Realtime publication `supabase_realtime`: identical (`message_reactions`,
  `message_thread_members`, `messages`, `notifications`).
- Enum types: only `org_role` on both sides.
- Storage: `comms_phase2_storage` (ledger only) created four RLS policies on
  `storage.objects` for the comms-media bucket, and `bv_showcase_submissions`
  created the `bv-showcase-uploads` bucket. The folder has none of this; the
  staff-photos bucket policies in `bloomos_staff_phase1.sql` are the only
  storage DDL in the repo.

---

## 4. The migration ledger vs. the folder

Production tracks applied migrations in `supabase_migrations.schema_migrations`
(193 rows, every one `created_by = remi@ambitionangels.org`, each with the full
`statements` array). The missing-tables audit's statement that "migrations are
applied by hand with no applied-set tracking" is half right: anything applied
through the Supabase MCP/CLI path is recorded with its SQL; anything pasted into
the SQL editor is not.

### 4.1 Applied to production, no file of that name in the repo (27)

| Ledger name (version) | Repo status | What it did |
|---|---|---|
| `drop_product_table_org_id_defaults` (20260716234958) | **no equivalent**; SQL lives in `specs/bloomos-migration-runbook.md` Appendix 4b | dropped `org_id` default on 50 product tables (section 2.2) |
| `fin_config_org_scoped_restructure` (20260716234929) | no equivalent | `fin_config`: PK `id` → PK `org_id`, dropped `id` and the singleton check |
| `strategy_objective_soft_delete` (20260715024015) | no equivalent (statement cites a repo path that was never committed) | `plan_objectives.deleted_at` + partial index |
| `prospect_scores_briefs_by_prospect_id` (20260624201453) | no equivalent | `prospect_id` on scores/briefs, `hubspot_contact_id` made nullable, backfill, unique index |
| `funder_angles_prospect_link` (20260624203410) | no equivalent | `funder_angles.prospect_id` + index |
| `hubspot_bench_candidates` (20260624223540) | no equivalent | the two bench RPC functions |
| `bloomos_staff_phase2b_shim_and_seed` (20260707180307) | no equivalent | `public.can_view_staff` wrapper + one `staff_kpis` seed row |
| `comms_phase1_story_schema`, `comms_phase2_storage`, `comms_phase2_views`, `comms_phase3_outputs`, `comms_phase4_editions`, `comms_phase6_loop` (20260819–20260824) | **no equivalent** (phase 6 statement cites a repo path that was never committed) | the whole comms module: 8 tables, 3 views (one replaced), 1 function, 16 policies, storage policies, and the `bv_newsletter_subscribers` default drop |
| `reed_has_permission_revoke_anon` (20260625215948) | no file; effect present on both sides (anon has no EXECUTE) | `revoke execute on public.has_permission from anon` |
| `enable_rls_exposed_tables` (20260611182445) | no file; effect present via reconstructions | RLS on `donations`, `quiz_submissions`, `partner_waitlist` |
| `harden_ygb_rls_and_indexes` (20260525213232) | no file; effect present, except the pre-existing `idx_ygb_*` duplicates it left behind | RLS on ygb tables, drop anon policies, add indexes |
| `partner_interactions_external_idx_full` (20260626023656) | equivalent DDL in `add_external_ids_to_partner_interactions.sql` (index identical in prod and scratch) | non-partial unique index |
| `tasks_tier1_priority_subtasks_status_category` (20260615212410) | reconstructed as `upgrade_ops_tasks_priority_subtasks_labels.sql`, index name differs and `ops_tasks_priority_idx` was lost | priority/parent/labels on ops_tasks |
| `bloomos_briefing_narrative` (20260624184601) | reconstructed inside `tenant_scope_briefing_narrative.sql`, nullability differs | table create |
| `fr_prospect_promoted` (20260624192245) | `create_fr_prospect_promoted.sql` (explicit reconstruction, identical) | |
| `fr_prospects_bench` (20260624200145) | `create_fr_prospects.sql` (identical shape after later files) | |
| `fin_reconciliation_items` (20260624211345) | `create_fin_reconciliation_items.sql` (identical) | |
| `rls_reed_phase1` (20260625222326) | `rls_reed_phase1_four_tables.sql` (identical effect) | |
| `add_meeting_type_duration_options_and_other_type`, `add_meeting_location_options_and_rename_meet_url` (20260520) | `add_meeting_type_duration_options.sql`, `add_meeting_location_options.sql` (identical effect) | |
| `bv_showcase_submissions` (20260521203359), `create_bv_newsletter_subscribers` (20260611174319) | only the stub's invented shapes | real DDL for the two `bv_*` tables (and the storage bucket) |

### 4.2 In the repo, no ledger entry (40)

| Group | Files | Verified effect in production |
|---|---|---|
| **Never applied** (3) | `add_constituents_is_volunteer.sql`, `add_students_leader_id.sql`, `hs_sync_jobs_add_totals.sql` | columns absent; ledger has no statement mentioning them; app code depends on all three (section 1.3 item 5) |
| Applied under a different ledger name (7) | `add_meeting_location_options.sql`, `add_meeting_type_duration_options.sql`, `create_fin_reconciliation_items.sql`, `create_fr_prospect_promoted.sql`, `create_fr_prospects.sql`, `rls_reed_phase1_four_tables.sql`, `upgrade_ops_tasks_priority_subtasks_labels.sql` | present (see 4.1) |
| Reconstructions of tables that predate the ledger (11) | `create_donations.sql`, `update_donations_schema.sql`, `create_quiz_submissions.sql`, `create_partner_waitlist.sql`, `create_ygb_schema.sql`, `create_fin_schema.sql`, `create_fr_agent_schema.sql`, `create_hs_mirror_and_fr_scores.sql`, `create_hs_sync_jobs.sql`, `create_ops_projects_and_tasks.sql`, `create_bloomos_briefing_state.sql` | tables present; shapes match except the deviations in 3.2–3.4 (`donations.name`, `ygb_registrations` nullability/check, `fin_config` singleton, extra indexes) |
| Applied via SQL editor, effect present (11) | `drop_households_org_id_default.sql` (households has no default), `add_planned_week_to_ops_tasks.sql` (column present, index predicate differs), `fr_sync_exclude_partnership_pipeline.sql` (function body identical in prod), `consolidate_partnership_pipeline_into_partners.sql` (partners columns identical), `seed_partners_2026.sql` (149 partner rows), `seed_aa_hubspot_mirror_entitlement.sql` and `seed_aa_ai_prospect_research.sql` (entitlement rows present), `archive_migrated_partnership_opportunities.sql`, `close_projects_of_terminal_grants.sql`, `dedup_commitments_against_gifts.sql`, `fix_due_tier_overdue_commitments_and_stale_grants.sql` (data-only; not verifiable from schema) | |
| `*.MANUAL.sql` (8) | `2026_finbudget_rebase`, `2026_ogsm_reseed`, `2027_ogsm_v3_phase1..4`, `participant_aa_custom_fields`, `participant_aa_stage_rename` | data seeds by design, out of scope |

### 4.3 Harness exclusions that matter

`scripts/test-rls.sh` skips seven files on purpose. Two of the reasons are now
stale: `pin_function_search_path.sql` fails only because it also pins the two
ledger-only bench functions, and `bloomos_global_search_phase3.sql` applies
cleanly once `pg_trgm` is installed in an `extensions` schema (both verified in
scratch-full). The staff phases apply cleanly once the production AA org id
exists in `orgs`.

---

## 5. What the folder would build today, in one sentence each

- **Tenant defaults:** a database in which 50 tables silently route `org_id`-less
  inserts to AA, which production stopped doing on 2026-07-16.
- **Finance config:** a single-tenant `fin_config` that production replaced with
  one row per org.
- **Prospects and strategy:** tables missing the `prospect_id` links and the
  soft-delete column the app reads.
- **Comms module:** nothing; eight tables, three views and their policies exist
  only in production and in the ledger's statement text.
- **Staff module:** everything, but only if the harness stops excluding it and
  the stub seeds the real AA org id.
- **Three features the app already ships:** volunteers, student leaders and
  HubSpot sync totals, which production cannot serve because their migrations
  were never applied.

Remediation order is deliberately not proposed here.

---

## Appendix A — the comms-module objects only production has

Columns (name type, NOT NULL unless marked `?`, defaults in brackets):

- `stories`: id uuid [gen_random_uuid()], org_id uuid, title text, body? text,
  outcome? text, status text ['raw'], tags text[] ['{}'], happened_on? date,
  captured_by? text, rank_order? int, strategic_goal_id? uuid, source text
  ['manual'], created_at/updated_at timestamptz [now()].
  Constraints: PK; FK org_id→orgs CASCADE; FK strategic_goal_id→plan_goals SET
  NULL; check status in (raw, drafted, approved, used, retired); check source in
  (manual, reed, import). Indexes: `stories_org_status_idx (org_id, status)`,
  `stories_org_rank_idx (org_id, rank_order)`, `stories_org_happened_idx
  (org_id, happened_on DESC NULLS LAST)`. Policies: `read stories` SELECT /
  `write stories` ALL, both `has_permission(org_id, 'comms.manage')`.
- `story_subjects`: id, org_id, story_id (FK→stories CASCADE), subject_type
  text (check in participant, constituent, partner, staff, none), subject_id?
  uuid, display_label text, is_minor bool [false], created_at. Indexes on
  (story_id) and (org_id, subject_type). Policies: `comms.manage` AND
  (subject_type <> 'participant' OR `comms.subjects.read`).
- `story_consents`: id, org_id, story_subject_id (FK→story_subjects CASCADE),
  scope text[] (check non-empty and ⊆ {first_name, full_name, photo, video,
  quote, outcome_details}), requested_at? date, granted_by? text, granted_at?
  date, expires_at? date, revoked_at? timestamptz, evidence_document_id? uuid
  (FK→documents SET NULL), notes? text, created_at; check (requested_at IS NOT
  NULL OR granted_at IS NOT NULL). Indexes on (story_subject_id), (org_id).
  Policies: `comms.manage` AND (NOT `story_subject_is_participant(...)` OR
  `comms.subjects.read`).
- `story_media`: id, org_id, story_id (FK CASCADE), storage_path text, mime?
  text, size_bytes? bigint, caption? text, kind text ['photo'] (check photo,
  video), created_at. Indexes on (story_id), (org_id). Policies `comms.manage`.
- `comms_outputs`: id, org_id, story_id (FK→stories CASCADE), edition_id? uuid
  (FK→comms_editions SET NULL), channel text (check in linkedin,
  newsletter_section, thank_you, grant_anecdote, board_update, news_flash,
  personal_forward), body text, status text ['draft'] (check draft, approved,
  used, discarded), used_at? timestamptz, model_grounding? jsonb, created_by?
  text, created_at/updated_at. Indexes `(org_id, story_id, created_at DESC)`,
  `(org_id, status)`. Policies `comms.manage`.
- `comms_formats`: id, org_id, name text, cadence text ['quarterly'] (check
  monthly, quarterly, annual, adhoc), slots jsonb ['[]'], is_archived bool
  [false], created_at/updated_at. Index `(org_id) WHERE is_archived = false`.
  Policies `comms.manage`.
- `comms_editions`: id, org_id, format_id (FK→comms_formats RESTRICT), title
  text, subject? text, status text ['planning'] (check planning, drafting,
  review, compiled, sent, archived), target_date? date, email_campaign_id? uuid
  (FK→email_campaigns SET NULL), sent_at? timestamptz, created_at/updated_at.
  Indexes `(org_id, target_date DESC NULLS LAST)`, `(org_id, status)`. Policies
  `comms.manage`.
- `comms_edition_slots`: id, org_id, edition_id (FK→comms_editions CASCADE),
  slot_key text, slot_def jsonb, story_id? uuid (FK→stories SET NULL),
  metric_ids? uuid[], content? text, position int [0], created_at/updated_at;
  UNIQUE (edition_id, slot_key). Indexes `(edition_id, position)`, `(story_id)
  WHERE story_id IS NOT NULL`. Policies `comms.manage`.

All eight: RLS enabled, `set_updated_at` BEFORE UPDATE trigger where an
`updated_at` column exists, `org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE
CASCADE` with no default. Views: `v_publishable_stories` (approved/used stories
with no revoked and at least one live consent per non-'none' subject) and
`v_story_suggestions` (recency/usage score, joins `comms_edition_slots` and
`comms_editions`), both `security_invoker=on`. Function
`private.story_subject_is_participant(uuid)` SECURITY DEFINER,
`search_path=''`.

## Appendix B — method notes

- Per-table hashes of the canonical column, constraint, index, policy and
  trigger text were compared first; only tables with differing hashes were
  pulled in full from production, so every difference above was verified on the
  raw definitions, not inferred.
- Postgres major versions differ (17 vs 16); no `pg_get_*` formatting
  differences were observed in any pulled definition.
- `information_schema.columns` was not used anywhere. The tenant-default
  ratchet still uses it.
- The vitest count on this branch is 1,115 tests in 76 files (`npm test`, all
  passing).
- Scratch databases (`scratch`, `scratch_full`) lived on this session's local
  Postgres and are disposable. No connection was made to production other than
  read-only catalog and `count(*)` queries through the Supabase MCP server.
