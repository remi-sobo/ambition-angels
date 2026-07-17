# BloomOS — Import layer + connector framework (Phase E, spec #5)

Status: draft for review, 2026-07-17
Depends on: Phase D complete (participant spine — `custom_field_defs` registry live, `validateAndMerge` is the write gate, AA columns dropped). Live schema reads of project `kzzdtibbwsucloaoqpqa`.
Companion docs: `specs/bloomos-core-fence.md` (§5 lists this as its own spec; the fence classifies `hs_*` as AA-site "retiring via the future connector framework"), `specs/bloomos-migration-runbook.md` ("E. Import layer" — `external_refs` + staged `imports`/`import_rows`, HubSpot refactored as connector #1), `specs/bloomos-participant-spine.md` (§2: "custom fields are the target its field-mapping writes into, so this must land first" — it has).

## 1. Problem statement

No tenant can get existing data **into** BloomOS except by hand. AA's 27 students arrived via a one-off migration; its donors arrived through a bespoke HubSpot pipeline (`hs_*` mirror tables + `fr_sync_hubspot_to_spine()`) that ~28 files read directly; every other record was typed into a form. For Safespace — first external tenant, now unblocked by Phase D — "onboarding" currently means Remi writing INSERT statements against their spreadsheet. That doesn't scale to tenant three, and it bypasses every integrity gate the spine just built (custom-field validation, per-org stages, org-scoped writes).

The missing piece is a **staged import layer**: upload a file, map its columns to the org's fields (spine columns + the custom-field registry), preview validated rows with duplicate verdicts, commit with per-row provenance. The same staging machinery then generalizes into a **connector framework** — a connector is just a fetcher that fills the staging table from an API instead of a file — which is how the HubSpot pipeline eventually stops being a special case.

## 2. Who's affected

- **Safespace onboarding**: their student-leader roster (system unknown — runbook open question; a spreadsheet export is the safe assumption) must land as participants with their custom fields and stages, without Remi writing SQL.
- **Remi**: today the only human who can move data in, via migrations and the HubSpot sync he alone understands. The import wizard makes tenant onboarding a product motion, not an engineering one.
- **Every future tenant**: the first thing any org asks after "can I rename Student?" is "can I upload my donor list?" — constituents ride the same machinery.
- **The `hs_*` fork**: 4 mirror tables + a sync engine + ~28 direct readers, classified AA-site by the fence. The connector framework is the named retirement path (late phases here, long tail explicitly staged).

## 3. Current behavior

- **Participants**: no bulk path at all. `create_students.sql` seeded AA's 27; the only ongoing writes are the roster form and intake-accept. Safespace's roster has no way in.
- **Constituents**: one path — the HubSpot chunked sync (`lib/hubspot/sync-engine.ts`: contacts → companies → deals → engagements into `hs_contacts`/`hs_companies`/`hs_deals`/`hs_engagements`, job state in `hs_sync_jobs`, then `fr_sync_hubspot_to_spine()` projects into `constituents`/`opportunities`/`gifts`/`interactions`). It is AA-specific, config-less, and its mirror is read directly by finance close, prospect pages, `promote-hs-contact`, Reed tools, funder research, and more.
- **Provenance is per-table and inconsistent**: `constituents.external_ids` (jsonb map), `gifts`/`recurring_plans` `(external_source, external_id)` unique pairs, `students.external_source`/`external_id` single pair. Nothing records *which import produced which row*.
- **Dedupe is ad hoc per path**: intake-accept matches on email/guardian-email, the career-quiz import on email overlap, HubSpot on its own ids. No shared verdict logic, no preview before write.
- One narrow precedent exists: `POST /api/admin/fundraising/prospects/import` bulk-promotes hs-mirror contacts to the bench — id-list-shaped, not a file import, but proof the "select → commit" motion works in this UI.

## 4. Desired behavior

- An org admin opens **Imports**, uploads a CSV, picks the target entity (participant or constituent), and maps columns to fields. The field list is *the org's own vocabulary*: universal spine columns plus that org's `custom_field_defs` — Safespace maps `Chapter School` to their `chapter_school` custom field with zero code.
- **Stage before write.** Rows parse into a staging table, validate (spine rules + `validateAndMerge` against the registry — the same gate the forms use), and get a duplicate verdict (match on external ref, then email). The preview shows create / skip / invalid counts and per-row errors *before anything touches a spine table*.
- **Commit is org-scoped, audited, resumable, and idempotent.** Each committed row stamps the created entity id back onto the staging row and writes an `external_refs` ledger entry. Re-uploading the same file skips everything it already created. A crash mid-commit resumes where it stopped — per-row status, never all-or-nothing silently.
- **One provenance ledger.** `external_refs (org_id, entity_type, entity_id, source, external_id)` — every imported record traceable to its source and import run. New machinery writes it uniformly; existing per-table columns keep working (convergence is out of scope).
- **Connectors are the generalization, not a rewrite.** A connector = a fetcher (pages records from an API) + a mapper (source record → the same normalized row shape CSV produces) + the shared staging/commit/status machinery. CSV is connector #0. HubSpot becomes connector #1 in the late phases: first its projection adopts `external_refs`, then its sync runs surface as import runs. Direct `hs_*` readers retire incrementally after that — the long tail, explicitly not a v1 promise.

## 5. Scope

**In:**
- `imports` + `import_rows` staging schema, `external_refs` ledger, RLS + leak-test rows.
- CSV parsing, column-mapping model, row normalization + validation (`lib/admin/imports/`), duplicate verdicts. Pure functions split out for vitest.
- The import wizard UI (upload → map → preview → commit) for **participants** and **constituents**, permission-gated per target entity's module.
- Commit path: batch entity writes through the existing validators, `external_refs` stamps, audit entries, per-row status, resume.
- HubSpot convergence, staged late: projection writes `external_refs`; sync runs registered as import runs (status/counts in the same UI).

**Out (deliberate):**
- Live connectors for Airtable/Salesforce/anything-Safespace-might-run — CSV export covers day one; a real connector is a follow-up once the runbook question ("what do you run today?") is answered.
- Retiring the ~28 direct `hs_*` readers. E6 establishes the framework seam; the reader-by-reader migration is its own tracked follow-up (spec #5b if it grows).
- Converging `constituents.external_ids` / `gifts.(external_source, external_id)` onto `external_refs`.
- Import targets beyond participants + constituents (gifts, partners, attendance history).
- Scheduled/recurring file imports, exports of any kind, two-way sync.

## 6. Architecture sketch

### 6a. Data flow

```
CSV file ──► POST /api/admin/imports            (create run: entity_type, filename, header)
              │
   wizard: map columns ──► PATCH …/imports/[id]  (persist mapping jsonb)
              │
          POST …/imports/[id]/stage              (parse → import_rows: raw jsonb,
              │                                   normalized jsonb, status, error,
              │                                   dedupe verdict + matched id)
          preview UI                             (create / skip / invalid counts,
              │                                   per-row errors)
          POST …/imports/[id]/commit             (per-row: insert entity via the
              │                                   existing validated write shape,
              │                                   stamp created_entity_id,
              ▼                                   write external_refs, audit)
   students / constituents  +  external_refs
```

### 6b. Schema

```
imports (
  id uuid pk, org_id uuid not null references orgs(id),   -- no default, ever
  entity_type text not null,          -- 'student' | 'constituent' (registry keys)
  source text not null default 'csv', -- 'csv' now; 'hubspot' at E6
  filename text, status text not null default 'mapping',
    -- mapping → staged → committing → done | failed
  mapping jsonb not null default '{}',-- column → field key (spine or custom)
  counts jsonb not null default '{}', -- {total, valid, invalid, created, skipped}
  created_by uuid, created_at, finished_at
)
import_rows (
  id uuid pk, org_id uuid not null, import_id uuid references imports on delete cascade,
  row_num int not null,
  raw jsonb not null,                 -- the CSV row as parsed (PII — see retention)
  normalized jsonb,                   -- mapped + coerced field values
  status text not null default 'pending',
    -- pending → valid | invalid → committed | skipped
  verdict text,                       -- 'create' | 'skip' (matched) — set at stage
  matched_entity_id uuid, created_entity_id uuid,
  error text,
  unique (import_id, row_num)
)
external_refs (
  id uuid pk, org_id uuid not null,
  entity_type text not null, entity_id uuid not null,
  source text not null, external_id text not null,   -- csv: content hash of the raw row (E2 amendment: an import-id-scoped ref could never match on re-upload, breaking DoD #2)
  created_at,
  unique (org_id, entity_type, source, external_id)
)
```

RLS mirrors the module the target entity lives in: `program.read/write` for participant imports, `fundraising.read/write` for constituent imports, resolved from `entity_type` at the policy layer via the same `private.has_permission(org_id, …)` pattern. `external_refs` readable by any module reader of its entity type.

### 6c. Validation and dedupe (pure core, `lib/admin/imports/`)

- **Normalize**: apply `mapping` to a raw row → `{ spine: {...}, custom: {...} }`. Spine fields validate with the same rules the API routes enforce (name required, email shape, stage must be one of the org's `participant_stages`, dates ISO). Custom fields go through `validateAndMerge(defs, {}, incoming, { requireAll: false })` — **one integrity gate, already tested**; the import adds no second validator. (`requireAll` stays off for imports — legacy rosters predate required fields, same reasoning as spec #4 §10.4.)
- **Dedupe verdicts**, computed at stage time against the org's rows: (1) `external_refs` hit on `(source, external_id)` → `skip` (idempotent re-upload); (2) email match — participants also check the `guardian_email` custom field, same rule intake-accept uses — → `skip` with `matched_entity_id`; (3) otherwise `create`. Update-in-place is deliberately **not** a v1 verdict (§10.2).
- **Commit** walks `valid` rows only, skipping any already `committed` (resume-safe); each insert reuses the entity's existing insert shape (org from the import row, never a default) and writes its `external_refs` entry in the same batch.

### 6d. The connector seam (E5–E6)

A connector implements `{ fetchPage(cursor) → records, mapRecord(record) → normalized row }` and reuses everything from staging down. E5: `fr_sync_hubspot_to_spine()` starts writing `external_refs` for what it creates (uniform provenance, zero reader changes). E6: each HubSpot sync run creates an `imports` row (`source 'hubspot'`) with live counts, so sync status appears in the same UI as file imports and `hs_sync_jobs` stops being load-bearing for visibility. The `hs_*` mirror becomes connector-internal staging; its 28 direct readers are untouched here and retire on their own track.

## 7. Staged build order

Each a PR, each independently useful; deploy-before-migrate throughout.

- **E1 `feat(imports): staging schema + external_refs`** — the three tables, RLS, leak-test rows, `test-rls.sh` entries. Ships dormant.
- **E2 `feat(imports): parse + map + validate + verdict engine`** — `lib/admin/imports/` pure core (CSV parse, normalize, validate, dedupe) + `tests/imports.test.ts` (mapping edge cases, registry rejection, verdict precedence, idempotent re-upload). No UI.
- **E3 `feat(imports): wizard + commit (participants)`** — `/admin/imports`: upload → map (spine + registry fields) → preview → commit → summary. Audit entries, resume, row cap.
- **E4 `feat(imports): constituents target`** — second `entity_type` through the same wizard; email dedupe against `constituents`.
- **E5 `refactor(hubspot): projection writes external_refs`** — provenance convergence, no reader changes.
- **E6 `refactor(hubspot): sync runs as import runs`** — connector seam; sync visible in the imports UI. Reader retirement explicitly deferred.

## 8. Definition of done (observable)

1. Remi uploads a CSV roster for a test org: maps two spine columns and two custom fields, preview shows correct create/skip/invalid counts, commit creates the participants org-scoped with `custom_fields` populated — verified by the same students UI Phase D built.
2. Re-uploading the identical file yields **zero** new rows (all `skip` via `external_refs`).
3. A row with a bad custom-field option or missing required name lands `invalid` with a per-row reason; committed rows are unaffected (no all-or-nothing failure).
4. Killing the commit mid-run and re-committing finishes the remainder; no entity is created twice.
5. A constituent CSV works end-to-end through the same wizard.
6. `supabase/tests/rls-leak-test.sql` proves cross-org invisibility of `imports`, `import_rows`, and `external_refs`.
7. (E6) A HubSpot sync appears as an import run with live counts, and every spine row it creates has an `external_refs` entry.

## 9. Failure modes to watch for

- **Half-committed import.** A crash mid-commit strands an import in `committing`. Mitigation: per-row `committed` stamps make commit re-entrant; the UI surfaces "N of M committed — resume". Never a silent partial.
- **Dedupe false positives** (siblings sharing a guardian email would silently skip the second child). Mitigation: verdicts are *previewed*, per-row, with the matched record named — the human sees "skipping: matches Jaiye O." before commit; skip is conservative (no update-in-place), so a wrong verdict loses no data and the row can be hand-added.
- **CSV parsing edge cases** (quoted commas, BOM, CRLF, Excel encodings). Mitigation: a proven parser (§10.1), not a hand-rolled split; fixture tests for each known trap.
- **Serverless body/time limits** on big files. Mitigation: row cap (2,000/import in v1 — AA is 27 students; Safespace is dozens) and chunked staging; the cap is surfaced, not silent.
- **PII at rest in `import_rows.raw`** (guardian emails, DOBs, full rosters). Mitigation: raw payloads are nulled after the run completes + a retention window (§10.3); the ledger keeps ids, not data.
- **The import becomes a validation bypass.** Any second validator will drift from the registry. Mitigation: commit path calls `validateAndMerge` and the same insert shapes the API routes use — asserted by test 8.3.
- **E6 destabilizes finance/prospects** (28 hs_* readers). Mitigation: E5/E6 change writes and visibility only; every direct reader keeps its current shape until the separately-tracked retirement.

## 10. Open decisions

1. **CSV parser dependency.** Recommend `papaparse` (battle-tested, zero native deps, ~45 kB server-side) over hand-rolling. Decide at E2.
2. **Update-matched-rows verdict.** Recommend **not in v1** — create/skip only. Update-in-place needs field-level merge rules (which side wins per column?) that no tenant has asked for yet; skip + preview is safe and reversible.
3. **Raw-row retention.** Recommend: null `import_rows.raw` on run completion + a 30-day sweep for abandoned runs. Rows keep `normalized` (already validated, smaller) for the audit trail.
4. **Where the wizard lives.** Recommend `/admin/imports` as its own thin page (linked from Students, Donors, and Settings) rather than per-module embeds — one motion, three doors.
5. **Safespace's current system** — still the runbook's open question. CSV covers a spreadsheet or any system with export; if the answer is Airtable/CRM, a live connector becomes E7, shaped by the E6 seam.
6. **`hs_*` reader retirement** — after E6, inventory the ~28 readers and decide one spec (#5b) vs. module-by-module chores.

## 11. Paste-ready kickoff prompt (E1)

```
BloomOS Phase E (import layer): E1 — staging schema + external_refs.
Phase D is done (participant spine live). This is the build.

Ground rules: one PR per commit point in specs/bloomos-import-layer.md §7.
Deploy before migrate. E1 ships dormant — no UI, no writers.

E1 scope:
- Migration: imports, import_rows, external_refs per §6b. org_id NOT NULL,
  no defaults (tenant-default ratchet applies). RLS via
  private.has_permission(org_id, …) keyed to the target entity's module
  (program.* for student imports, fundraising.* for constituent imports).
  Idempotent (if not exists).
- Leak-test rows in supabase/tests/rls-leak-test.sql for all three tables;
  append the migration to scripts/test-rls.sh's ordered list.
- No code changes beyond types if needed.

Verify: RLS suite green; cross-org SELECT on all three tables returns zero
rows for a non-member. Stop after E1.
```
