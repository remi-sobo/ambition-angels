# Strategic Plan: Full Editability — Findings & Proposal

**Status:** proposal (research complete, no code changes yet)
**Ask:** "The whole strategic plan, with KPIs, initiatives, etc., needs to be editable."

## TL;DR

The plan is **already ~85% editable**. `PlanControls.tsx` + the `/api/admin/plan/*`
routes give inline editing for foundation, objectives, goals, initiatives, and
KPIs — create, rename, owner, status/override, targets, baselines, delete. What
"fully editable" actually requires is:

1. **Close the real gaps**: KPI and initiative re-parenting, reordering
   (`sort_order` has no UI), and a couple of missing fields.
2. **Add guardrails** so edits don't silently break things: `metric_key`
   validation, protection of the five narrative-bound KPI keys, and
   delete-impact confirmations (cascades are invisible today).
3. **Consolidate the four metric registries** so an edited plan and the code
   that consumes it can't drift.

No schema redesign is needed. The data model (`plan_foundation → plan_objectives
→ plan_goals → plan_initiatives`, `plan_kpis`, `plan_kpi_snapshots`,
`plan_reviews`) already supports everything; the work is API fields, UI
affordances, and validation.

---

## 1. What exists today

### Backend

- **Tables** (all org-scoped, RLS read=`reports.read` / write=`org.manage`):
  `plan_foundation` (1/org), `plan_objectives`, `plan_goals` (`objective_id`
  SET NULL), `plan_initiatives` (`goal_id` CASCADE), `plan_kpis` (attach to
  goal AND/OR objective, both CASCADE, `plan_kpis_attach_chk` requires ≥1),
  `plan_kpi_snapshots` (trend history, CASCADE on KPI delete), `plan_reviews`,
  `reed_plan_proposals`. `ops_projects.initiative_id` (SET NULL) is the only
  link from ops work into the plan.
- **Write routes** under `app/api/admin/plan/*` — foundation (PUT upsert),
  objectives/goals/initiatives/kpis (POST + PATCH + DELETE), reviews (POST),
  seed (POST, idempotent), kpis/refresh (POST), kpis/metrics (GET picker).
  All use the same gate: `getOrgContext()` → `ctxHasPermission(ctx,
  "org.manage")` → service-role client scoped `.eq("org_id", ctx.orgId)` →
  `audit()` (`governance.*` namespace). Parent references are re-verified
  in-org before write.
- **Auto KPIs**: `plan_kpis.source='auto'` rows are recomputed by
  `refreshOrgPlanMetrics` (`lib/admin/plan/metrics.ts`) from the `PLAN_METRICS`
  code registry (10 metric_keys: grants/pipeline/corporate/runway/teens/etc.),
  triggered by the refresh button and two crons (`weekly-digest`,
  `daily-reminders`). Refresh writes `current` + derived `status` +
  `last_updated_at` and upserts a snapshot. Unknown metric_key → **silently
  skipped** (`metrics.ts:181`).
- **Reed** already has a gated edit path: `propose_plan_element` writes inert
  rows to `reed_plan_proposals`; a human accept at
  `app/api/reed/proposals/[id]/route.ts` applies them into the real tables.

### Frontend (`app/admin/strategic-plan/`)

`PlanControls.tsx` is the editing engine, reused on the main page, objective
detail, and review page:

- **Foundation**: full edit form (mission, vision, values, behaviors, proof
  points) → PUT foundation.
- **Objectives**: create; inline-edit title/owner/three-year statement; status
  override with reason; delete.
- **Goals**: create; inline-edit title/owner/description/target date; reparent
  to another objective (dropdown); status override; delete.
- **Initiatives**: create; inline-edit title/owner; status toggle
  (todo/in_progress/done); delete.
- **KPIs**: create manual or auto-bound (picker from the metric catalog);
  inline-edit current (manual only), target, baseline, status, unit, owner,
  cadence; delete. Scorecard also inline-edits `current`.
- **Setup wizard** (5 steps) and **review close-out** already write through the
  same routes.

Read-only surfaces: narrative (funder deck), people (performance agreements),
scorecard (except `current`), StrategyGlance, cockpit widget.

---

## 2. The actual gaps

### G1 — KPIs can't be moved (worst gap)

`PATCH /api/admin/plan/kpis/[id]` accepts no `goal_id`/`objective_id`. Moving a
measure to a different goal today means delete + recreate, which **cascades
away its `plan_kpi_snapshots` trend history** and breaks the scorecard
sparkline. This directly contradicts "the whole plan is editable."

### G2 — Initiatives can't be moved

`PATCH /api/admin/plan/initiatives/[id]` accepts no `goal_id`. Same
delete-recreate workaround, which also nulls any `ops_projects.initiative_id`
pointing at it (projects silently lose their strategy tag on the area walk).

### G3 — No reordering anywhere

`sort_order` exists on objectives/goals/initiatives/kpis and the objectives
PATCH even accepts it, but no UI exposes it, and the goals/initiatives/kpis
PATCH routes don't accept it. The plan renders in insert order forever.

### G4 — Unvalidated `metric_key` (silent breakage)

`POST/PATCH kpis` accepts `metric_key` as free text (80 chars). A KPI saved
with `source='auto'` and a key not in `PLAN_METRICS` is never refreshed — no
error, just a frozen number. Renaming a bound key has the same effect.

### G5 — Auto-KPI fields are only client-side protected

The UI hides `current`/`status` editing for auto KPIs (provenance
`editable:false`), but the API happily accepts writes — which the next cron
refresh silently overwrites. Also `source` can be flipped manual↔auto with no
consequence check.

### G6 — Destructive deletes have no impact preview

- Delete a **goal** → CASCADE-deletes its initiatives, goal-attached KPIs, and
  their snapshots; detached initiatives' ops projects lose their link.
- Delete an **objective** → goals survive unparented (SET NULL) but
  objective-attached KPIs CASCADE-delete.
- Delete an **initiative** → linked `ops_projects.initiative_id` set NULL.
- Delete a **KPI** → its snapshot history is gone.

Today this is a bare `confirm()`/nothing. Users editing freely will lose data
without knowing.

### G7 — Five KPI keys are load-bearing for the funder narrative

`lib/admin/strategy/narrative.ts` hardcodes `dollars_raised_fy26`,
`dollars_ceiling_fy26`, `cash_runway_months`, `corporate_raised`,
`aig_multiyear_commitments`, plus the `floor_source_*` prefix.
`lib/admin/strategy/readiness.ts` blockers B1/B2 check the same keys. Rename or
delete any of these via the (soon fully editable) UI and the narrative loses
its floor/ceiling/gap and the readiness checklist flips to failing — with no
warning at edit time.

### G8 — Status vocabulary drift

Objectives/KPIs: `not_started|on_track|at_risk|behind|done`. Goals:
no `not_started` (DB check + route both). Initiatives: `todo|in_progress|done`.
A generic editor must respect per-entity vocabularies (today's hardcoded
`STATUSES` consts per route are actually fine — just don't unify them naively).

### G9 — Four registries must stay in sync by hand

`PLAN_METRICS` (compute), `AUTO_METRIC_CATALOG` (picker labels),
`PLAN_METRIC_HEALTH` (status rules), `MANUAL_SOURCE` in `provenance.ts`
(source-of-truth labels) all key off the same metric_key strings with
"keep in sync" comments. Every new live metric is a 3–4 file change.

### Minor

- Initiative `description` is PATCH-able but has no UI affordance.
- Owner identity is free text; `owners.ts` only resolves `remi`/`shannon`;
  scorecard hardcodes `OWNER_ORDER`. Fine for now, worth noting for multi-seat.
- The seed route's canned plan has drifted from the live 2026 reseed migration
  — harmless (seed no-ops when objectives exist) but confusing; mark it legacy.
- Override reasons use `window.prompt`, errors use `alert()` — crude but works.

### Resilient (no work needed)

Daily briefing (`gather.ts` + `strategySource`), cockpit `StrategyHealthWidget`
/ `getStrategyRollup` / `getStrategyGlance`, Reed's read tools and proposal
apply route, ops area-walk labels, `countStaleKpis`, review logging — all
count/tree-shape driven; they map whatever rows exist. Add/rename/delete just
changes their numbers.

---

## 3. Proposal

### Phase 1 — Close the editing gaps (small, ships the ask)

1. **KPI re-parenting**: accept `goal_id` / `objective_id` (nullable) in
   `PATCH kpis/[id]`; verify the new parent is in-org (same check as POST);
   reject when both would end up null (`plan_kpis_attach_chk`). UI: parent
   dropdown in the KpiRow `⋯` details, mirroring the goal-reparent dropdown.
   Snapshots survive because the row survives.
2. **Initiative re-parenting**: accept `goal_id` in `PATCH initiatives/[id]`
   (in-org check); UI dropdown in GoalCard's initiative row. Ops project links
   survive because the row survives.
3. **Reordering**: accept `sort_order` in the goals/initiatives/kpis PATCH
   routes (objectives already do); UI = simple ↑/↓ buttons on each card/row
   (drag-and-drop is not worth a dependency here).
4. **Initiative description**: expose the existing field with `EditableText`.

### Phase 2 — Guardrails (makes "everything editable" safe)

5. **Validate `metric_key` server-side**: on POST/PATCH, if `source='auto'`,
   require `metric_key ∈ AUTO_METRIC_KEYS` (registry export already exists in
   `metrics.ts`); if `source='manual'`, allow free keys but strip the
   `floor_source_` prefix guard below. Apply the same validation in Reed's
   `applyProposal` so the two write paths can't diverge.
6. **Protect system-bound keys**: treat the five narrative keys +
   `floor_source_*` as *bound*. In the UI, badge them ("powers the funder
   narrative"), and on rename/delete require an explicit typed confirmation.
   Server-side, reject `metric_key` changes on these rows unless a
   `confirm: true` flag is sent. (A fuller fix — making the narrative bindings
   data-driven — is Phase 3 territory and probably not worth it for one org.)
7. **Delete-impact preview**: add `GET /api/admin/plan/impact?type=goal&id=…`
   returning child counts (initiatives, KPIs, snapshot rows, linked ops
   projects, open Reed proposals referencing it). Replace bare `confirm()`
   with a small dialog listing what goes away (reuse the `TaskEditModal`
   delete-confirm pattern). Same endpoint serves objectives, goals,
   initiatives, KPIs.
8. **Enforce auto-KPI read-only fields server-side**: reject `current`/`status`
   writes when the row is `source='auto'` (the refresh owns them); flipping
   `source` to manual first is the escape hatch and makes intent explicit.

### Phase 3 — Consolidation (reduces future drift, optional)

9. **Single metric registry**: merge `PLAN_METRICS`, `AUTO_METRIC_CATALOG`,
   `PLAN_METRIC_HEALTH`, and provenance `MANUAL_SOURCE` into one
   `lib/admin/plan/registry.ts` record (`{key, label, unit, description,
   compute?, health?, provenance?}`), with the client catalog derived from it
   (compute fns stripped). One place to add a live metric.
10. **Retire/refresh the seed route**: either update its canned content to
    match the live 2026 plan or mark it dev-only; the divergence will bite the
    next tenant onboarding.
11. **Owner picker from memberships** (only if/when a third seat exists).

### Explicitly out of scope

- No schema changes beyond nothing (all phases are route + UI work).
- Narrative *structure* (three movements) stays code-defined; its numbers are
  already data-driven via targets + finance actuals.
- The legacy `lib/kpis.ts` scorecard system is separate and untouched.

### Effort

Phase 1 ≈ a day (4 small route diffs + PlanControls additions). Phase 2 ≈ 1–2
days (impact endpoint + dialog is most of it). Phase 3 ≈ a day. Each phase is
independently shippable; Phases 1–2 together fully deliver the ask.

### Test plan

- Unit (vitest, `tests/`): metric_key validation matrix (auto+unknown key
  rejected, manual free key allowed, bound-key rename requires confirm);
  reparent in-org checks; attach-check rejection; auto-KPI current-write
  rejection.
- Existing `tests/migrations.test.ts` and RLS leak tests are unaffected (no
  new tables/policies).
- Manual QA on a real session: move a KPI between goals and confirm the
  scorecard sparkline history survives; delete a goal via the new dialog and
  confirm the listed cascade matches reality; run "Refresh metrics" after a
  reparent.
