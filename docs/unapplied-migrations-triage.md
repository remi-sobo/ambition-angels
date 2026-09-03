# Unapplied-migrations triage — the 40 files with no ledger entry (2026-09-03)

Read-only. Nothing was written to production. Companion to
`docs/schema-drift-audit.md`, which found 27 migrations applied to production
with no file in the repo (recoverable verbatim from
`supabase_migrations.schema_migrations.statements`) and 40 files in
`supabase/migrations/` with no ledger entry. This document settles the 40.

**Method.** Every `create table`, `add column`, `rename column`,
`alter column`, `add/drop constraint`, `create index`, `create policy`,
`create function`, `create view`, `create trigger`, `enable row level
security`, and every `insert`/`update`/`delete` target was extracted from each
file (225 objects across the 40). Every structural object was then checked for
existence in production (`kzzdtibbwsucloaoqpqa`) by name through the system
catalogs; every data migration was checked by the rows it leaves behind. Code
references were traced for anything absent.

## 1. Result

| Class | Files | Meaning |
|---|---|---|
| `legacy-applied` | **36** | Production already has every object or row the file produces (in a few cases under a different index name or with a reconstruction inaccuracy noted below). The file is harmless. |
| `never-applied-PRODUCT` | **1** | Production lacks the effect; no code path depends on it, but the product does (169 of 598 opportunities). Reclassified 2026-09-03, see section 4. |
| `never-applied-BREAKING` | **3** | Production lacks the object and shipped code reads or writes it. |

**No additional breaking files beyond the three already known.** But one of the
three is worse than previously described: `hs_sync_jobs_add_totals.sql` does
not just blank a denominator. Its missing column sits in the job-creation
insert, so **the HubSpot sync has not started a single job since 2026-07-30**
(section 2.3).

Of the 225 objects checked, 10 are absent from production:

| Absent object | File | Class |
|---|---|---|
| `constituents.is_volunteer` (+ `constituents_is_volunteer_idx`) | `add_constituents_is_volunteer.sql` | BREAKING |
| `students.leader_id` (+ `students_leader_idx`, FK) | `add_students_leader_id.sql` | BREAKING |
| `hs_sync_jobs.totals` | `hs_sync_jobs_add_totals.sql` | BREAKING |
| `donations.name`, `donations_created_at_idx` | `create_donations.sql` | legacy-applied (reconstruction invented them; see 3.8) |
| `partner_waitlist_created_at_idx`, `partner_waitlist_role_idx` | `create_partner_waitlist.sql` | legacy-applied (reconstruction; the `role` column exists, the indexes never did) |
| `ops_tasks_parent_id_idx` | `upgrade_ops_tasks_priority_subtasks_labels.sql` | legacy-applied (production has the same index as `ops_tasks_parent_idx`) |
| `bookings.google_meet_url` | `add_meeting_location_options.sql` | legacy-applied (absent because the rename to `meeting_url` ran; expected) |
| rows with `pipeline = 'archived_partnership'` | `archive_migrated_partnership_opportunities.sql` | never-applied-PRODUCT |

Everything else (32 tables, 22 columns, 61 indexes, 3 constraints, 11
policies, 2 functions, 12 triggers, 1 view, 32 RLS flags, and every seed
marker) is present.

## 2. The three `never-applied-BREAKING` files

All three were committed after the ledger was in use (PR #401 on 2026-07-21,
PR #431 on 2026-07-31) and no ledger statement mentions their columns, so they
were never applied through any tracked path and were not pasted into the SQL
editor either. They fail in production with `42703 column ... does not exist`.

### 2.1 `add_constituents_is_volunteer.sql` — `constituents.is_volunteer`

Referenced in 11 places. What fails, per surface:

| Surface | Code | Failure in production |
|---|---|---|
| `/admin/fundraising/volunteers` (the Volunteers / Leaders list) | `app/admin/fundraising/volunteers/page.tsx:39` filters `.eq("is_volunteer", true)`; the `error` field is never read | Query errors, `data` is null, page renders **"0 on the roster"** as if there were no volunteers. False empty state. |
| "New volunteer" form on that page | `VolunteerControls.tsx:34` POSTs `is_volunteer: true` to `/api/admin/constituents`; `route.ts:59` puts it in the insert | Insert fails, route returns **500 "Could not create constituent"**, form shows the alert. No volunteer can be created. |
| Unflag action on that page | `VolunteerControls.tsx:107` PATCHes `is_volunteer: false` to `/api/admin/constituents/[id]`; `route.ts:37` puts it in the update | **500**. |
| `/admin/students` (list) and `/admin/students/[id]` (profile) | `page.tsx:47` and `[id]/page.tsx:87` load the leader picker with `.eq("is_volunteer", true)` | Query errors silently, `leaders` is empty, and by design an empty list means **the leader picker never renders**. Silent feature absence. |
| `POST /api/admin/students`, `PATCH /api/admin/students/[id]` with a `leader_id` | `route.ts:37`, `[id]/route.ts:70` validate the leader with `.eq("is_volunteer", true)` | Lookup errors, `leader` is null, route returns **400 "Unknown leader"** for every leader. |
| `POST /api/admin/constituents`, `PATCH /api/admin/constituents/[id]` with `is_volunteer` in the body | as above | **500** whenever the flag is present; other constituent writes are unaffected because the key is only added when the body carries it. |

### 2.2 `add_students_leader_id.sql` — `students.leader_id`

Referenced in 19 places, but **every write path is masked by 2.1**: the student
forms only send `leader_id` when the leader list is non-empty
(`StudentControls.tsx:264`, `StudentProfileControls.tsx:128`), and that list is
always empty because its query fails; the API routes reject any `leader_id`
with 400 before reaching the write because the `is_volunteer` validation
lookup fails first. The only reachable failure is `PATCH /api/admin/students/[id]`
with `leader_id: null` (a direct API call, no UI does this), which sets
`update.leader_id = null` and fails the update with 42703 → 500. Reads
(`student.leader_id` on the list and profile) select `*` and simply see no such
field, so nothing crashes. Net effect today: **leader assignment is silently
unavailable**, not erroring. Applying this file alone would surface the 2.1
errors; the two go together.

### 2.3 `hs_sync_jobs_add_totals.sql` — `hs_sync_jobs.totals`

This is the one that was understated. `createJob` in
`lib/hubspot/sync-engine.ts:254` includes `totals: await fetchTotals()` in the
**insert** that creates every sync job, and throws on insert error
(`create job: column "totals" of relation "hs_sync_jobs" does not exist`).

| Surface | Failure |
|---|---|
| `POST /api/admin/hubspot/sync` (the "Sync now" button on `/admin/settings`) | `createJob` throws, route returns **500 "Could not start sync"**. |
| `/api/cron/hubspot-sync` (Vercel cron, `0 7,19 * * *`) | Never reaches `createJob`: every invocation returns **401** (14 in the last 7 days). Correction 2026-09-03: the cron has never authenticated, see `docs/interaction-capture-diagnostic.md` §1.4. The `totals` failure breaks the manual button only. |
| HubSpot sync panel on `/admin/settings` | Shows the last job from 2026-07-30 (status `partial`) forever. |

Production evidence: `hs_sync_jobs` holds 19 rows, the newest started
**2026-07-30 16:57 UTC**, zero rows after 2026-07-31; `hs_contacts.updated_at`
maxes at the same minute; the `imports` mirror's last row is the same job. The
HubSpot mirror (2,541 contacts, 1,051 companies, 590 deals, 36,419
engagements) has been frozen for five weeks. Everything fed by it is stale:
the prospect-bench import picker (`hubspot_bench_candidates` reads
`hs_contacts`), the spine projection (`fr_sync_hubspot_to_spine`: constituents,
opportunities, gifts, interactions from HubSpot), constituent name backfill,
and the fundraising dashboards that read those. Two jobs are stuck in
`running` from before the break.

The totals denominator on the panel is the least of it.

## 3. The 36 `legacy-applied` files, with the evidence

### 3.1 Applied under a different ledger name (7)

| File | Ledger entry | Verified in production |
|---|---|---|
| `add_meeting_location_options.sql` | `add_meeting_location_options_and_rename_meet_url` | `meeting_types.location_options`, `default_in_person_address`, `bookings.location_type`, `location_details`, `meeting_url` present; `google_meet_url` gone; `donor-conversation` and `corporate-partnership` carry `{video,in_person}` |
| `add_meeting_type_duration_options.sql` | `add_meeting_type_duration_options_and_other_type` | `duration_options` present; `something-else` row exists with `{30,45}` |
| `create_fin_reconciliation_items.sql` | `fin_reconciliation_items` | table, `fin_recon_source_ref_pending`, `fin_recon_status_idx` |
| `create_fr_prospect_promoted.sql` | `fr_prospect_promoted` | table |
| `create_fr_prospects.sql` | `fr_prospects_bench` | table, `fr_prospects_status_idx` |
| `rls_reed_phase1_four_tables.sql` | `rls_reed_phase1` | RLS on all 6 tables, all 11 policies, `fin_reconciliation_items.org_id`, NOT NULL on the three backfilled columns, `fr_prospects.org_id` default dropped |
| `upgrade_ops_tasks_priority_subtasks_labels.sql` | `tasks_tier1_priority_subtasks_status_category` | `priority`, `parent_id`, `labels`; all three check constraints. Index exists as `ops_tasks_parent_idx` (ledger name), not `ops_tasks_parent_id_idx` (file name); production additionally has `ops_tasks_priority_idx`, which the reconstruction dropped. |

### 3.2 Reconstructions of tables that predate the ledger (11)

These files were written after the fact to give the harness something to
build. Production has the tables; where the reconstruction is inaccurate it is
noted, because those inaccuracies are what a folder replay would build.

| File | Verified in production | Reconstruction deviates |
|---|---|---|
| `create_donations.sql` | table, `donations_email_idx`, RLS | invents `name` column and `donations_created_at_idx`; production has neither. `save-donation`'s legacy fallback branch (`route.ts:89`) writes `name`, but it is only reached if the primary insert errors on `first_name`/`last_name`, which exist. Dormant. |
| `update_donations_schema.sql` | `first_name`, `last_name`, `subscription_id`, `status`, both indexes; 2 rows carry names | none |
| `create_quiz_submissions.sql` | table, RLS | none observed |
| `create_partner_waitlist.sql` | table, RLS, `role` column | invents `partner_waitlist_created_at_idx`, `partner_waitlist_role_idx`; no code names an index |
| `create_ygb_schema.sql` | both tables, 4 indexes, RLS (ledger `harden_ygb_rls_and_indexes` added the indexes) | three consent booleans nullable in the file, NOT NULL in production; `showcase_guest_count >= 0` check in the file, absent in production |
| `create_fin_schema.sql` | 7 tables, 7 indexes, `set_updated_at`, 6 triggers, seeds (99 AA categories, budget rows) | `fin_config` singleton (`id = 1`); production restructured to PK `org_id` on 2026-07-16 (ledger `fin_config_org_scoped_restructure`) |
| `create_fr_agent_schema.sql` | 5 tables, 18 indexes, 4 triggers | none |
| `create_hs_mirror_and_fr_scores.sql` | 5 tables, 16 indexes | production later added `prospect_id` to `fr_prospect_scores` (ledger only) |
| `create_hs_sync_jobs.sql` | table, 2 indexes | none (the missing `totals` is the separate file above) |
| `create_ops_projects_and_tasks.sql` | 2 tables, 11 indexes, `set_updated_at`, 2 triggers | none |
| `create_bloomos_briefing_state.sql` | table, RLS | none |

### 3.3 Schema or function changes applied outside the ledger, effect present (4)

| File | Verified |
|---|---|
| `drop_households_org_id_default.sql` | `households.org_id` has no default (also covered by the ledger's `drop_product_table_org_id_defaults`, which lists `households`) |
| `add_planned_week_to_ops_tasks.sql` | column present; `ops_tasks_planned_week_idx` present with a `WHERE planned_week IS NOT NULL` predicate the file lacks |
| `fr_sync_exclude_partnership_pipeline.sql` | `fr_sync_hubspot_to_spine` body in production is byte-identical (after comment stripping) to the folder's |
| `dedup_commitments_against_gifts.sql`, `fix_due_tier_overdue_commitments_and_stale_grants.sql` | `v_revenue_schedule` definition in production hashes identically to the folder replay (the second file supersedes the first) |

### 3.4 Data migrations, effect present (6)

| File | Marker in production |
|---|---|
| `consolidate_partnership_pipeline_into_partners.sql` | 64 `partners` rows with `external_source = 'partnership_pipeline_2026'` |
| `seed_partners_2026.sql` | 77 `partners` and 135 `partner_contacts` with `external_source = 'partner_import_2026'` |
| `seed_aa_hubspot_mirror_entitlement.sql` | `org_entitlements` row `aa.hubspot_mirror` for AA |
| `seed_aa_ai_prospect_research.sql` | `org_entitlements` row `ai.prospect_research` for AA |
| `close_projects_of_terminal_grants.sql` | 0 active `ops_projects` on declined/closed grants; 6 done |
| (counted in 3.3) | |

### 3.5 `*.MANUAL.sql` (8), effect present

Excluded from the harness by convention; checked anyway because they are in
the 40.

| File | Marker in production |
|---|---|
| `2026_finbudget_rebase.MANUAL.sql` | 4 AA `fin_budget` rows carry contingency tiers |
| `2026_ogsm_reseed.MANUAL.sql` | superseded: its v2 plan is what `2027_ogsm_v3_phase1_archive` snapshotted |
| `2027_ogsm_v3_phase1_archive.MANUAL.sql` | `plan_archives` row `2026-ogsm-v2` dated 2026-08-11 |
| `2027_ogsm_v3_phase2_seed.MANUAL.sql` | AA's 6 `plan_objectives` titles match the file exactly, in order |
| `2027_ogsm_v3_phase3_keys.MANUAL.sql` | 5 of 5 sampled metric keys present (60 AA `metric_definitions`) |
| `2027_ogsm_v3_phase4_open_items.MANUAL.sql` | 2 `plan_objective_tasks`, 1 `plan_objective_notes` |
| `participant_aa_custom_fields.MANUAL.sql` | 6 AA `custom_field_defs` (grade, school, dob, guardian_name/email/phone); 10 students carry values |
| `participant_aa_stage_rename.MANUAL.sql` | AA `participant_stages` labels are New / Exploring / Practicing / Connecting / Launched / Alumni / Inactive |

## 4. The one `never-applied-PRODUCT` file (reclassified)

`archive_migrated_partnership_opportunities.sql` is one statement:
`update opportunities set pipeline = 'archived_partnership' where pipeline = '59855776'`.
It was first classed "unused" because no code path filters on
`archived_partnership`. That was the wrong test. Production holds **598
opportunities: 421 in `default`, 169 in `59855776`, 8 in `727459407`**. 28% of
the pipeline sits in a pipeline labeled "Partnership Pipeline (retired)" in
`pipelines`. Unused in code, used in product.

What the migration would do to the 169 rows (119 `identify`, 21 `cultivate`,
14 `lost`, 12 `steward`, 3 `solicit`; all `external_source = 'hubspot'`,
created 06-12 to 06-26, untouched since 06-29; 134 linked to a constituent, 64
with a `partners` row from the consolidation, 1 with an ask, sum of asks $60k):

- The update succeeds. `opportunities_stage_fk` is `(org_id, pipeline, stage)
  → pipeline_stages`, and `archived_partnership` carries the same six stage
  keys as `59855776` (`identify`, `qualify`, `cultivate`, `solicit`, `steward`,
  `lost`), seeded by the ledger's `fundraising_pipeline_config`.
- On the Major Gifts board (`app/admin/fundraising/page.tsx`), which shows one
  pipeline at a time from the `pipelines` table, the 169 move from the
  "Partnership Pipeline (retired)" tab to the "Archived Partnership" tab. The
  default (Sales) tab is unaffected either way.
- Nothing numeric changes: `v_revenue_schedule` includes 0 of them (its
  pipeline tier needs an ask and a future `expected_close`; none qualify), and
  the overview's cold-prospect check sees 1 open ≥$10k row before and after.
- It is not undone afterwards: `fr_sync_hubspot_to_spine` excludes pipeline
  `59855776` since `fr_sync_exclude_partnership_pipeline.sql`, and the sync is
  not running regardless (section 2.3).
- It is reversible with the inverse update.

Whether it was applied in June and then reset by the sync, or never applied,
still cannot be told from the data; either way production is not in the state
the file describes.

## 5. What this means for the next step

- The 36 legacy files need nothing; a folder replay recreates their objects,
  with the reconstruction inaccuracies in 3.2 being the only places where the
  replay diverges from production (`fin_config` being the one that matters).
- The three breaking files are the only never-applied schema. Two of them
  (`is_volunteer`, `leader_id`) are one feature and should be treated as a
  pair. The third has taken the HubSpot integration down since 2026-07-30 and
  is the most urgent live defect found in either audit.
- The archive data migration is a product decision about 28% of the pipeline, not a defect.

No file was written or applied. Remediation order stays with Remi.
