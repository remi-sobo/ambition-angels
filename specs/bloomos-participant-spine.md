# BloomOS — Participant spine + custom fields (Phase D, spec #4)

Status: draft for review, 2026-07-16
Depends on: Phase C complete (multi-tenancy gate open — org-scoped inserts, defaults dropped, active-org cookie). Live schema reads of project `kzzdtibbwsucloaoqpqa`.
Companion docs: `specs/bloomos-core-fence.md` (§5 lists this as out-of-scope-until-now; §6a names the target spine), `docs/bloomos-migration-runbook.md` (Appendix 5 = Safespace seed).

## 1. Problem statement

The program module is the last single-tenant island in BloomOS. The fence (Phase B/C) made org name, entitlements, terminology, and every write path tenant-derived — but the **program data model still hardcodes Ambition Angels' program shape**. `students` carries AA-specific columns (`grade`, `school`, `guardian_*`, `dob`) and an AA-specific lifecycle enum (`stage in ('discover','learn','practice','connect','launch','alumni','withdrawn')`); `cohorts.program` is a free-text label rather than a real program; enrollment assumes a cohort-bound cycle.

Safespace — the first external tenant, unblocked by Phase C — has a materially different shape: **student leaders** (not students), organized into **chapters** (not cohorts) that sit across many schools plus a central hub, with **continuous membership** rather than a fixed-term cohort, and a different lifecycle. None of that fits the AA columns and enum. B3 terminology already relabels the nouns ("Student leader", "Chapter"), but a label can't add a `chapter_school` field AA doesn't have, remove a `guardian_email` field Safespace won't use, or replace AA's five-stage funnel with Safespace's lifecycle.

The generalization is structural: **the universal spine (program → group → enrollment → session → attendance) stays in shared columns; everything tenant-specific moves to a per-org custom-field registry and a per-org stage set.**

## 2. Who's affected

- **Safespace onboarding**: blocked on this. Their student-leader/chapter shape can't be entered until custom fields and per-org stages exist.
- **AA program staff**: their `grade`/`school`/`guardian`/`dob` fields and the discover→alumni funnel must survive the move byte-for-byte — same UI, same data, now expressed as AA custom fields + an AA stage set instead of hardcoded columns.
- **Every future tenant**: this defines how a tenant describes its participants without a schema change or a deploy.
- **The import layer (spec #5, next)**: custom fields are the target its field-mapping writes into, so this must land first.

## 3. Current behavior

- `students` (27 rows; 8 carry AA-specific fields): universal columns (`org_id`, `constituent_id`, `first_name`, `last_name`, `email`, `phone`, `stage`, `partner_id`, `location`, `external_source`/`external_id`) **plus AA-specific columns** `dob`, `grade`, `school`, `guardian_name`, `guardian_email`, `guardian_phone`. `stage` is a hardcoded CHECK enum.
- `cohorts` (1 row): `name`, `program` (free text, e.g. "YGB Creators Camp"), `term`, `location`, `partner_id`, `capacity`, dates, `status`.
- `cohort_members` (8 rows): enrollment `student → cohort`, `status`, `joined_on`. Cohort-scoped; no notion of continuous membership.
- `cohort_sessions` (5 rows) → `attendance` (0 rows): the session/attendance spine, already generic.
- `applications` (0 rows), `participant_stages` (exists as groundwork — a per-org stage table, currently unread by the students UI).
- `programs` (exists — the intended parent) is not yet the parent of `cohorts` (`cohorts.program` is text, not an FK).
- ~19 code files read/write these tables (`app/admin/students`, `app/admin/cohorts`, `app/admin/intake`, plus `lib/`), all assuming the AA columns and enum.

## 4. Desired behavior

- **Universal spine, tenant-neutral columns.** `students` (the participant) keeps only columns every org has: identity (`first_name`/`last_name`/`email`/`phone`), `org_id`, `constituent_id`, `partner_id`, `location`, `external_ref`, timestamps, and a `stage_id`. AA's `grade`/`school`/`guardian_*`/`dob` become AA custom fields.
- **Per-org custom fields.** A registry (`custom_field_defs`) defines, per `(org_id, entity_type)`, the fields that org shows: `key`, `label`, `type` (text/number/date/select/multiselect/boolean/phone/email), `options` (for selects), `required`, `sort_order`, `archived`. Values live in a `custom_fields jsonb` column on the entity (cheap reads, no join; GIN-indexed for filtering). The registry drives the form, validation, and display — no code change to add a field.
- **Per-org lifecycle.** `students.stage` (hardcoded enum) becomes `stage_id → participant_stages`, a per-org ordered stage set. AA seeds its seven stages; Safespace seeds its own. Board/verdict logic reads the stage's attributes (e.g. `is_terminal`, `is_active`), never a hardcoded name.
- **Real program parent.** `cohorts.program_id → programs`. A group belongs to a program; a program belongs to an org. `cohorts` stays the physical "group" table, relabeled per org via terminology ("Chapter").
- **Continuous or cohort-bound membership.** Enrollment (`cohort_members`) gains an `ended_on` (nullable) so an org can model continuous membership (open-ended) or fixed cycles (dated), without a new table.
- **Terminology throughout.** The B3 reader relabels participant/group/session/stage nouns per org; this spec extends the term-key set and routes every program-nav and page label through it.

## 5. Scope

**In:**
- `custom_field_defs` registry + `custom_fields jsonb` on `students` (and the pattern generalized so `constituents`/`partners` can adopt it later — but only `students` is wired here).
- Custom-field reader/writer + registry-driven form component + validation (`lib/admin/customFields.ts`).
- Migrate AA's `grade`/`school`/`guardian_*`/`dob` → AA `custom_field_defs` rows + backfill the 8 students' values into `custom_fields`; then drop the six columns.
- Wire `students.stage` → `participant_stages` (`stage_id` FK); seed AA's seven stages; migrate the 27 rows; drop the enum column. Board/health/queue logic reads stage attributes.
- `cohorts.program_id → programs` FK; backfill AA's one cohort to an AA program; the group create/edit UI picks a program.
- `cohort_members.ended_on` for continuous membership.
- Extend `org_terminology` term keys (`participant`, `group`, `session`, `stage`, `program`) and route the program surfaces through the label reader.
- The AA data migration (trivial: 27 + 1 + 8 + 5 rows) and its RLS-leak-test coverage.

**Out (each its own spec):**
- **Import layer / connector framework (spec #5)** — custom fields are its write target; it comes next, gated on this.
- Custom fields on `constituents`/`partners`/other entities — the registry is built entity-generic, but only `students` is wired now.
- Participant self-service / the student-facing app surface (the "Ambition App" nav placeholder).
- Cross-org participant sharing, household/guardian as first-class constituents (guardians stay custom fields for now).
- Reporting/segmentation UI over custom fields (GIN index lands here; the query UI is later).

## 6. Architecture sketch

### 6a. The custom-field registry

```
custom_field_defs (
  id uuid pk,
  org_id uuid not null references orgs(id),
  entity_type text not null,            -- 'student' now; 'constituent'/'partner' later
  key text not null,                    -- 'grade', stable, snake_case; (org_id, entity_type, key) unique
  label text not null,                  -- 'Grade', tenant-facing
  field_type text not null check (field_type in
    ('text','number','date','select','multiselect','boolean','phone','email')),
  options jsonb,                        -- ['9','10','11','12'] for select/multiselect
  required boolean not null default false,
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz, updated_at timestamptz
)
```

Values live in `students.custom_fields jsonb not null default '{}'::jsonb` keyed by `key`. Reasoning: reads are the hot path (list + profile), and a JSONB column keeps them join-free; a GIN index (`create index on students using gin (custom_fields)`) makes `custom_fields @> '{"grade":"9"}'` filterable. The registry — not the JSON — is the source of truth for *what fields exist*, so the form, validation, and display are all registry-driven and an org adds a field with one INSERT, no deploy. Values are validated against the registry on write (type, required, select-option membership); unknown keys are rejected so the JSON can't drift from the registry.

RLS mirrors the program module: read on `program.read`, write on `program.write`, both via `private.has_permission(org_id, …)` on the session client. The registry is org-scoped (not global like `entity_types`) because the fields themselves are per-tenant.

### 6b. Per-org lifecycle

`participant_stages` (already present as groundwork) becomes the read source: `(org_id, key, label, sort_order, is_active, is_terminal)`. `students.stage_id → participant_stages`. The AA seed reproduces today's funnel exactly (discover, learn, practice, connect, launch, alumni=terminal-active, withdrawn=terminal-inactive). Every consumer that currently branches on the stage *string* (health/verdict, the action queue, board rollups) switches to the stage's `is_active`/`is_terminal` attributes, so a tenant's differently-named stages work without code edits. The `stage` enum column is dropped after the 27 rows are migrated.

### 6c. Program spine parentage

`cohorts.program_id → programs` (nullable during migration, then required for new groups). AA's single cohort backfills to a seeded AA program. `cohort_members.ended_on date` (nullable) expresses continuous vs. fixed membership. Sessions/attendance are already generic — no change beyond terminology.

### 6d. Terminology

Extend the B3 term-key set: `participant` (student), `group` (cohort), `session`, `stage`, `program`. The program nav, list headers, and profile labels read `getTermLabel(key, fallback)` / `getNavTermLabels()`. AA leaves `org_terminology` empty (defaults: Student/Cohort/…); Safespace seeds Student leader/Chapter/… (the runbook's Appendix 5 already does student→"Student leader", cohort→"Chapter").

### 6e. The AA data migration (trivial by volume, load-bearing by ordering)

27 students, 1 cohort, 8 enrollments, 5 sessions, 0 attendance/applications. The migration: (1) seed AA `custom_field_defs` for grade/school/guardian_name/guardian_email/guardian_phone/dob; (2) copy each student's column values into `custom_fields`; (3) seed AA `participant_stages` + map `stage` string → `stage_id`; (4) seed an AA program + point the cohort at it. Only after the code reads/writes the new shape (deploy first, same discipline as Phase C) are the old columns dropped. Custom-field write validation must be live before the column drop so nothing writes a stray value.

## 7. Staged build order

Each commit named, each independently useful; deploy-before-migrate throughout (Phase C's rule).

- **D1 `feat(custom-fields): registry + reader + validated writer`** — `custom_field_defs` table + `students.custom_fields` column + `lib/admin/customFields.ts` (registry read, value read/merge, write validation) + the registry-driven form component. No columns dropped. Ships dormant (AA has no defs yet).
- **D2 `feat(program): AA custom-field defs + backfill`** (Remi applies the seed) — seed AA's six field defs, backfill the 8 students' values, wire the students list/profile/create form to render custom fields from the registry alongside the fixed columns. Both shapes readable.
- **D3 `refactor(program): stage_id + per-org stages`** — `participant_stages` read path, `students.stage_id`, AA stage seed + row migration, switch health/queue/board to stage attributes. Enum column kept until D5.
- **D4 `feat(program): program_id parent + continuous membership`** — `cohorts.program_id`, AA program seed, group form picks a program; `cohort_members.ended_on`.
- **D5 `chore(program): drop AA-specific columns`** (Remi applies) — after D2–D4 deployed and smoked, drop `grade`/`school`/`guardian_*`/`dob` and the `stage` enum column. Audit-then-drop, same shape as Step 13 (Appendix-style: a reversible statement set kept open during the smoke).
- **D6 `feat(terminology): program term keys`** — extend the term-key set and route program surfaces through the label reader.

## 8. Definition of done (observable)

1. An org admin adds a custom field (`custom_field_defs` INSERT) and it appears on the participant create/edit form and profile with no deploy; a value round-trips through `custom_fields` and validates against the registry (wrong type / missing required / bad select option all rejected).
2. AA's grade/school/guardian/dob render and edit exactly as before, now sourced from custom fields; `information_schema` shows those six columns gone from `students`.
3. `students.stage` is an FK to `participant_stages`; the AA funnel behaves identically; a second org with differently-named stages drives the same health/queue/board logic with no code change.
4. A group belongs to a program (`cohorts.program_id` not null for new rows); an enrollment can be open-ended (`ended_on` null) or dated.
5. Program nav/labels read from `org_terminology`; AA shows Student/Cohort, a seeded Safespace shows Student leader/Chapter.
6. The RLS leak test covers `custom_field_defs` (cross-org read/write denied); `students.custom_fields` never leaks across orgs.
7. Safespace can create a student leader with its own custom fields and stages through the normal UI (no AA columns visible), on the same deploy.

## 9. Failure modes

- **Custom-field value drifts from the registry.** Mitigated by write-time validation against `custom_field_defs` (reject unknown keys / bad types) and by the column drop (D5) happening only after the writer is live.
- **A stage consumer still branches on the old string.** The D3 grep must find every `stage ===`/`stage in`/enum reference; missing one shows as a mis-rendered health state, not data loss. The stage enum column stays until D5 as a safety net.
- **Column drop before all readers move.** Same risk as Step 13; same mitigation — deploy D2–D4, smoke, then drop with a reversible set open in a tab.
- **JSONB with no per-field constraints.** Accepted trade-off; the registry + app validation is the integrity boundary. If a tenant later needs to *query* heavily by a custom field, the GIN index covers containment; a materialized/typed column is a later optimization, not a v1 need.
- **Guardian-as-custom-field is lossy for real relationships.** Acknowledged: guardians stay flat custom fields here. Promoting guardians to constituents with a relationship is a later spec, out of scope.

## 10. Open decisions

1. **JSONB vs. EAV for values.** Recommend JSONB-on-row (above): join-free reads, registry-driven integrity, GIN for filtering. EAV (`custom_field_values`) only if a tenant needs relational queries across many custom fields — not evidenced yet.
2. **Rename `students`/`cohorts` tables?** Recommend **no** — keep the physical names, relabel via terminology. Renaming touches ~19 files, RLS, views, and the entity registry for zero functional gain; "participant"/"group" live at the label layer.
3. **Custom fields on other entities now?** Recommend building the registry entity-generic but wiring only `students` in this spec; `constituents`/`partners` adopt it when a tenant needs it.
4. **Required-field enforcement retroactive?** Recommend new-required-fields validate on write only (not backfilled onto existing rows), so adding a required field can't brick existing records.
5. **Safespace hub vs. school groups.** Their "chapters across schools + a hub" maps to programs (the hub) → groups (chapters) with `partner_id` = the school. Confirm with Safespace whether the hub is a program or a group before D4.

## 11. Paste-ready kickoff prompt (D1)

```
BloomOS Phase D (participant spine): D1 — the custom-field registry.
Phase C is done (multi-tenancy gate open). This is the build.

Ground rules: one PR per commit point in specs/bloomos-participant-spine.md
§7. Deploy before migrate. No AA-specific column is dropped in D1. No
migration drops anything; the registry ships dormant (AA has no defs yet).

D1 scope:
- Migration: custom_field_defs (org-scoped, RLS read=program.read /
  write=program.write via private.has_permission, mirroring the students
  policies in create_students.sql). Add students.custom_fields jsonb not
  null default '{}' + a GIN index. Idempotent (if not exists), and add
  the leak-test rows in supabase/tests/rls-leak-test.sql.
- lib/admin/customFields.ts: getFieldDefs(orgId, entityType) (session
  client, request-cached), validateAndMerge(defs, current, incoming)
  (type + required + select-option checks; reject unknown keys), and a
  render helper. Pure validation split out for a vitest.
- A registry-driven <CustomFields> form section (renders defs in
  sort_order, typed inputs) mounted on the student create/edit form,
  reading nothing from the registry yet for AA (empty) so the UI is
  unchanged for AA.
- tests/custom-fields.test.ts: validation precedence and unknown-key
  rejection.

Verify: with a hand-inserted def row for the AA org, the field appears on
the student form, a value round-trips through students.custom_fields, and
a bad type / missing required / bad option are all rejected. Delete the
row; AA's form is unchanged. Stop after D1.
```
