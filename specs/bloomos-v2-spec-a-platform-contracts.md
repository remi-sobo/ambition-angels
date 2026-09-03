# Spec A — BloomOS V2 platform contracts

Contracts 2, 3, and 7. Data layer only, no UI.
Date: 2026-09-03 · Depends on: `docs/v2-recon.md`, `docs/v2-preservation-ledger.md` (gate closed, 178 rows, 0 NEEDS RULING)

---

## Problem statement

Three of the nine V2 contracts are data-layer commitments, and every screen in the redesign inherits them. If they land after the screens, each screen invents its own answer and the redesign reproduces the failure it was built to fix.

Concretely, today: runway is computed in at least three places (`lib/admin/finance.ts`, `lib/admin/strategy/money.ts`, and a copy pasted into `lib/agents/reed/tools.ts` with a comment admitting it). The Metric Catalog has a dozen definitions marked `computed` whose resolvers do not exist, so they silently never compute. Obligations live across three tables with no shared resolution, so filing the Kapor report in Compliance leaves it open in Grants, Tasks, and the board packet. And nothing blocks a funder report from exporting a number with a known conflict.

## Who's affected

Every V2 screen. Directly: Remi (Home → Today's obligation feed, Finance → Snapshot's runway, Impact's export gating), Shannon (the ops queue and acknowledgment obligations), and every tenant, since all three contracts are org-scoped by construction. Indirectly: SafeSpace and Young Life EPA, whose data correctness depends on obligations and metrics never leaking across `org_id`.

## Current behavior

Grounded in the Phase 0 recon and live schema reads.

**Obligations.** `public.v_action_items` already unions nine sources: `ops_tasks`, `grant_requirements`, `compliance_items`, pending gift acknowledgments, `fin_reconciliation_items`, expiring `documents`, stale metrics, pending `applications`, unrecorded `cohort_sessions`. It normalizes to a shared shape. It has no `why_it_matters`, no unified state enum, no `snoozed_until`, no dedup key, and no resolution path. Roughly 20 write call sites touch the three primary tables, including `app/api/mcp/[secret]/route.ts`, an external surface. `work_block_tasks.task_id` holds an FK into `ops_tasks` from the calendar feature shipped 2026-09-02; both block tables are at 0 rows today.

**Metrics.** `metric_definitions` has 72 rows and 6 of the contract's 10 fields. `METRIC_RESOLVERS` contains two live resolvers (`monthly_burn`, `gifts_this_month`); every other `source_kind='computed'` definition logs "no resolver" and skips. A second registry, `PLAN_METRICS` in `lib/admin/plan/metrics.ts`, computes ~7 numbers directly from raw tables. A third set of computes runs inline in finance and strategy modules. None of the spec's eight named program metrics exists under a matching `metric_key`. `monthly_donors` appears twice with different departments.

**Export gating.** None. `audit_log` exists, partitioned by month, with four partitions live. Nothing writes waivers to it. The return rate has three values on record (27% computed, 74% fact base, 86% shipped one-pager) and nothing prevents any of them shipping to a funder.

## Desired behavior

One obligation row, surfaced in many places, resolved once. One definition per number, and a number without a definition does not render. Nothing leaves the building with an unresolved item unless a named person waived it at a recorded time.

## Scope

**In.** The `v_obligations` view and its three RPCs. Additive columns on `ops_tasks`, `grant_requirements`, `compliance_items`, and `metric_definitions`. The resolver registry consolidation. The waiver table and its audit-log writes. Seeding the eight named metrics for AA.

**Out.** Every screen. The V2 shell. Migrating rows into a new `obligations` table (Option A, deferred not rejected). Backfilling `plan_kpis.metric_key` to route through the catalog (follows in the Impact destination spec). QuickBooks. The nine fundraising saved views.

---

## Architecture

### Contract 3 — obligations

**Decision: Option B.** A union view plus dispatch RPCs, not a new table.

Rationale, in order of weight. `work_block_tasks` points into `ops_tasks` from a feature four days old with zero rows, so Option A's breakage would be invisible in test and expensive in production. 374 of 441 `ops_tasks` rows are completed history and personal to-dos with subtasks, project links, and block links, not obligations; moving them means moving things that were never obligations. Roughly 20 write sites would need a single-cutover rewrite across four live orgs, one of them an external MCP surface. Option B costs zero data migration and zero day-one write-path changes, and the six extra sources already in `v_action_items` come along free, which is what Today's "Needs you" list wants anyway.

Option B's honest weakness: dedup becomes discipline rather than a constraint. Two mitigations below. Option A remains available as a Phase 3 consolidation once V2 owns the write paths; choosing B does not foreclose it.

**New view `public.v_obligations`.** Leave `v_action_items` untouched so V1 keeps working. `security_invoker=on`. Fields per the contract: `id` (synthetic, `source || ':' || source_id`), `type`, `title`, `why_it_matters`, `owner_id`, `due_date`, `state`, `related_entity_type`, `related_entity_id`, `source`, `created_by`, `resolved_at`, `snoozed_until`, plus `org_id` and `module` for routing.

**Sources.** The nine from `v_action_items`. **`connection_candidates` is excluded on purpose.** It carries `ops_task_id` and promotes into tasks, so it looks like a tenth source, but its 58 rows are Gmail-derived suggestions awaiting triage. An obligation is something you owe. A suggestion is something you might. Piping 58 unreviewed candidates into Today would bury the five things that actually need Remi. It surfaces as its own count in Work → Meetings, and only becomes an obligation once promoted. Record this in the ledger note on that row.

**Three RPCs**, all `security definer` with an explicit `has_permission(org_id, …)` check inside, since `private.has_permission` is not in the public schema:

- `resolve_obligation(p_source text, p_source_id uuid)` — dispatches per source. `ops_tasks` → `status='done'`, `completed_at`. `grant_requirements` → `status='submitted'`, `submitted_at`. `compliance_items` → `status='filed'`, `last_filed_at`, **and inserts a `compliance_filings` child row**, and rolls `due_date` forward per `recur`. Acknowledgments → `gifts.acknowledgment_status`. Each branch returns the resolved row's identity so the caller can confirm.
- `snooze_obligation(p_source text, p_source_id uuid, p_until date)` — writes the new `snoozed_until` column on the owning table.
- `upsert_obligation(...)` — the only path importers, automations, and Reed use. Looks up `type + related_entity_id + due_date` across the three primary tables before inserting. This is where dedup lives.

**Dedup mitigations.** `grant_requirements` can carry a genuine partial unique index on `(org_id, grant_id, kind, due_date)` today, additively; verify no existing duplicates first. `compliance_items` can carry one on `(org_id, kind, jurisdiction, due_date)`. `ops_tasks` cannot, because 417 of 441 rows have NULL linkage and plain tasks legitimately repeat; it relies on `upsert_obligation()`. Enforced by review, not by the database, and the spec says so rather than pretending otherwise.

**Additive columns.** `ops_tasks`: `why_it_matters text`, `obligation_source text`, `snoozed_until date`, `origin_path text` (the report-an-issue upgrade). `grant_requirements`: `owner_id uuid`, `snoozed_until date`, `why_it_matters text`. `compliance_items`: `snoozed_until date`, `why_it_matters text`. All nullable, no defaults, no renames.

### Contract 2 — metric definitions

Four additive columns on `metric_definitions`: `numerator`, `denominator`, `population`, `confirmed_state` (checked against `confirmed | unconfirmed | conflict | stale`, nullable so the 72 existing rows stay unclassified rather than being wrongly asserted).

A unique index on `(org_id, metric_key)` first, which requires cleaning the duplicate `monthly_donors` rows by hand. That cleanup is a data decision, not a migration; surface both rows for Remi to pick.

**Resolver consolidation.** One registry. `METRIC_RESOLVERS` absorbs the seven `PLAN_METRICS` computes and the inline finance and strategy computes. `lib/agents/reed/tools.ts` stops carrying its copied finance math and calls the catalog. Any definition marked `computed` without a resolver becomes a build-time error rather than a runtime skip, so the dozen silent no-ops surface immediately.

**Render blocking.** A shared `<Metric>` primitive refuses to render a number whose `metric_key` has no definition row. This is the contract's teeth and it belongs in Spec A, not in each destination.

**Seeding.** The eight named metrics for AA. Five seed as `source_kind='manual'` because their numerators live in the teen app, not this database. `finish_30_days` and `second_track_rate` seed as `confirmed_state='conflict'` deliberately, which is what blocks their export under Contract 7 until the 27/74/86 question is settled.

### Contract 7 — approve, close, export

**New table `export_waivers`**: `id, org_id, artifact_type, artifact_id, metric_key, waived_by, waived_at, reason`. `org_id` from session context, never a column default. RLS with `has_permission(org_id, 'reports.approve')`.

**Gating rule.** Any export, send, approval, or period close checks every metric referenced by the artifact. If any carries `confirmed_state` of `conflict` or `stale`, the action blocks. A user with the permission may waive, which writes an `export_waivers` row and an `audit_log` entry, and the waiver travels with the artifact so a shipped funder report can always be traced to the figure and the person.

**Drafting is never blocked.** Contract 7 rule 1 is explicit: BloomOS always drafts, flags unresolved items inline at the point where the number appears, and blocks only the exit.

---

## Staged build order

**A1 — schema.** All additive columns, the two partial unique indexes, `export_waivers`, and the `(org_id, metric_key)` index. One migration file, handed to Remi for manual application. Commit: `spec-a: additive columns for contracts 2, 3, 7`.

Blocking prerequisite: resolve the duplicate `monthly_donors` rows and any `grant_requirements` duplicates that would fail the new index. Report both before writing the migration.

**A2 — the view.** `v_obligations` with `security_invoker=on`, nine sources, `connection_candidates` excluded with a comment stating why. No RPCs yet. Verify per-org isolation by querying as each of the four orgs. Commit: `spec-a: v_obligations view`.

**A3 — the RPCs.** `resolve_obligation`, `snooze_obligation`, `upsert_obligation`. Each with an explicit permission check. The compliance branch must write `compliance_filings` and roll `recur`. Commit: `spec-a: obligation resolution RPCs`.

**A4 — resolver consolidation.** One registry, plan metrics absorbed, inline computes replaced, Reed's copied math removed, build-time error on missing resolvers. Commit: `spec-a: single metric resolver registry`.

**A5 — the Metric primitive and gating.** `<Metric>` refuses undefined keys. Export gating and the waiver flow. Commit: `spec-a: metric render gate and export waivers`.

**A6 — metric seeding.** The eight AA definitions, two seeded as `conflict`. Commit: `spec-a: seed contract 2 metrics`.

Each stage is one PR. A1's SQL is applied by Remi in the dashboard before A2 opens.

---

## Definition of done

1. `v_obligations` returns the Kapor interim report exactly once, and calling `resolve_obligation()` from any surface drops it from all seven.
2. Resolving a compliance item writes a `compliance_filings` row and advances `due_date` per `recur`.
3. `upsert_obligation()` called twice with the same `type + related_entity_id + due_date` produces one row, verified for all three primary tables.
4. Querying `v_obligations` as each of the four orgs returns only that org's rows.
5. `work_block_tasks.task_id` still resolves and the calendar's twelve invariants still hold.
6. Every `source_kind='computed'` definition has a resolver, verified by a build that fails otherwise.
7. Runway returns an identical value from Finance, Strategy, and Reed, because all three call one function.
8. A report referencing `finish_30_days` blocks on export, and waiving it writes both an `export_waivers` row and an `audit_log` entry naming the item, person, and time.
9. Report-an-issue still files into "BloomOS Upgrades" with the `claude-prompt` label, and now carries `origin_path`.

## Failure modes

**The dedup index fails to create** because duplicates already exist. Expected. A1 reports them before the migration rather than after.

**`upsert_obligation()` gets bypassed.** The likeliest real failure, since the existing 20 write sites keep working by design. Mitigation: A3 converts the automation paths specifically (`cron/stewardship-milestones`, `grants/[id]/seed-tasks`, `reed/suggestions/[id]`, `meetings/[id]/suggestions`) since those are the ones that create duplicates. Human-created tasks may keep the direct path.

**The render gate blocks a screen that used to work.** By design, and it will happen on the Impact screens first. That is the contract functioning, not a regression. Ship the empty state alongside the gate.

**Reed loses finance math mid-flight.** A4 removes the copy. If the catalog call fails, Reed must say it cannot compute rather than fall back to stale numbers.

**`connection_candidates` gets added to the view later by someone who reads the column list and assumes it belongs.** Mitigated by the comment in the view definition and the ledger note.

## Open decisions

1. **Duplicate `monthly_donors`.** Two rows, different departments. Which survives, or do both become distinct keys? Blocks A1.
2. **`origin_path` placement.** New column on `ops_tasks`, or reuse `linked_label`. Recommend the new column; `linked_label` means something else.
3. **Waiver permission key.** `reports.approve` does not exist yet in `role_permissions`. Recommend adding it in A1 rather than overloading `org.manage`.

---

## Appendix — Phase 1 kickoff prompt

> Spec A, stage A1. Read `docs/v2-recon.md`, `docs/v2-preservation-ledger.md`, and this spec first.
>
> **Before writing any SQL**, run and report three read-only checks:
> 1. The two `monthly_donors` rows in `metric_definitions`, full column values, so Remi can pick one.
> 2. Any rows in `grant_requirements` that would violate a unique index on `(org_id, grant_id, kind, due_date)`, and any in `compliance_items` violating `(org_id, kind, jurisdiction, due_date)`.
> 3. Whether `reports.approve` exists in `role_permissions` for any org.
>
> Then produce **one** reviewable migration file containing: the additive columns listed in the architecture section, the two partial unique indexes, the `(org_id, metric_key)` index, and the `export_waivers` table with RLS enabled and `has_permission(org_id, 'reports.approve')` policies in the same file.
>
> Constraints: no renames, no drops, no type changes. `export_waivers.org_id` has no column default and is set from session context. Every new column is nullable. Do not apply the migration; hand it over for manual application in the Supabase dashboard.
>
> Open a PR with the migration and the three check results. Do not start A2.
