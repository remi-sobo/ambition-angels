# Strategic Plan — Full Editability (research + proposal)

**Status: proposal** · July 2026

The ask: everything in the strategic plan — foundation, objectives, goals, KPIs,
initiatives — should be editable in BloomOS. This doc maps what is already
editable, what is not, where edits have downstream implications, and a phased
plan to close the gaps.

## 0. Where we already are

PR #293 (merged 2026-06-30) wired inline editing across the plan tree and
hardened write auth to `org.manage`. As of main, the following is editable in
place on `/admin/strategic-plan` (Area/Mine lenses) and `/objective/[id]`:

- **Foundation** — mission, vision, values, behaviors, proof points (panel editor).
- **Objectives** — title, owner, 3-year statement, status override (+ reason), delete.
- **Goals** — title, description, owner, target date, status override, move to
  another objective, delete.
- **KPIs** — title, current value (manual), target, baseline, unit, owner,
  cadence, status, delete; create manual or auto (bound to a registry metric);
  attach unassigned live metrics to a goal.
- **Initiatives** — title, owner, add, delete, check off (todo/done).

All plan tables live in Supabase (`plan_foundation`, `plan_objectives`,
`plan_goals`, `plan_kpis`, `plan_initiatives`, `plan_kpi_snapshots`,
`plan_reviews`), with RLS (`reports.read` read / `org.manage` write) and full
CRUD routes under `app/api/admin/plan/*`. Nothing content-bearing on the
Narrative, Scorecard, Review, Setup, or People surfaces is hardcoded — they
read the same tables live (spec principle #0 in
`specs/strategy-plan-funder-readiness.md`: "everything editable at its source").

**Headline: no schema changes are needed.** Every remaining gap is a route
whitelist and/or UI affordance; the columns already exist.

## 1. Remaining gaps

### 1a. Fields that exist but cannot be written through any route

| Field | Effect of the gap |
|---|---|
| `plan_goals.sort_order` | Goals can't be reordered — only the seed ever sets it. |
| `plan_initiatives.sort_order` | Initiatives can't be reordered at all. |
| `plan_initiatives.goal_id` (PATCH) | An initiative can't be moved to another goal after creation. |
| `plan_kpis.goal_id` / `objective_id` (PATCH) | A KPI can't be re-parented after creation. |
| `plan_reviews` (PATCH/DELETE) | A logged review is immutable — a typo in notes or a wrong next-review date can't be fixed. |

### 1b. Fields writable via API but with no UI affordance

- **Objective `sort_order`** — the POST/PATCH routes accept it; no reorder control exists.
- **KPI `source` and `metric_key`** — PATCH accepts both, but there is no UI to
  convert manual↔auto or rebind an auto KPI to a different registry metric.
- **KPI `baseline_date`** — writable, never surfaced.
- **Initiative `description`** — writable, but the initiative row doesn't
  render or edit it (the `PlanInitiative` client type omits it).
- **Initiative `in_progress`** — the checkbox only toggles todo↔done; the
  middle state (shared vocabulary with ops tasks) is unreachable from the plan UI.

### 1c. Structural blind spot: objective-level KPIs

The schema deliberately allows a KPI to attach to an **objective** instead of a
goal (`plan_kpis_attach_chk`), and the POST route supports it — but the plan
tree only groups KPIs by `goal_id` (`kpisByGoal`), so an objective-attached KPI
is invisible and uneditable on the plan page. `NewKpiForm` only creates
goal-attached KPIs. (The overview rollup *does* count them via `objective_id`,
so such a KPI would move an objective's health while being un-findable.)

### 1d. Seed footgun

`POST /api/admin/plan/seed` upserts the hardcoded AA mission / vision / values /
behaviors **on every run** (`onConflict: org_id`) — re-clicking "Load AA
strategy" after editing the foundation silently reverts those edits. The OGSM
tree itself is safe (seeded only when the org has zero objectives). The seed
also never writes `proof_points`.

### 1e. Hardcoded content that limits editing indirectly

- **`lib/admin/plan/owners.ts`** — `PEOPLE` is hardcoded to remi/shannon, and
  the scorecard hardcodes `OWNER_ORDER = ["Remi","Shannon"]`. A new team
  member typed as an owner won't resolve as a person (no initials chip, wrong
  sort, weaker "Mine" lens matching).
- **`MovementHow.tsx`** — the funder narrative says "**Eight** doors" as a
  literal while the angle list is dynamic; edit the angles to ≠8 and the copy lies.
- **`MovementPlan.tsx`** — fallback proof stats (3,500+ / 87% / 1,100+ / 14%)
  are frozen in code; they render only when `proof_points` is unset, but they
  can drift from reality.
- **`StrategyRoom.tsx`** (public `/strategy`) — ships verbatim fallback copies
  of all 8 angles + meta; only rendered if the DB read fails, but it's a second
  copy of funder-facing copy that can drift. The room itself is fully editable
  at `/admin/fundraising/strategy`.
- **Readiness checks** (`lib/admin/strategy/readiness.ts`) — the check set
  (B1–B4, A1–A5) is code. This is by design (it's a linter; every value it
  grades is editable at its source via `fixHref`) — propose leaving it in code.

## 2. Implications — what edits can break downstream

The plan is consumed by the overview rollup/StrategyHealthWidget, the glance,
the executive briefing, Reed (read-only tools + proposal-accept writes), the
scorecard, the funder Narrative, funder readiness, ops (projects attach to
initiatives), and two crons that refresh auto metrics. The research verdict:

- **Titles are never load-bearing.** No consumer keys off objective/goal/KPI
  titles or assumes a count (the "4 objectives" everywhere is derived).
  Renaming anything is safe.
- **Deletes degrade gracefully.** Objective delete unlinks goals
  (`SET NULL`); initiative delete detaches ops projects (`SET NULL`); goal
  delete cascades its KPIs/initiatives; KPI delete cascades its snapshot
  history (worth a warning — history is lost).
- **The one sharp edge is `metric_key`.** The Narrative's money movement and
  the auto-refresh are wired by hardcoded keys (`dollars_raised_fy26`,
  `dollars_ceiling_fy26`, `cash_runway_months`, `corporate_raised`,
  `aig_multiyear_commitments`, and the `floor_source_*` prefix). Renaming or
  deleting one of these KPIs, or flipping its `source` off `auto`, silently
  blanks "What We Raise" / "How We Raise It" and trips the readiness blockers
  — with no visible explanation. Also, `floor_source_*` KPIs are deliberately
  hidden from the plan tree, so re-keying a normal KPI into that prefix makes
  it vanish.
- **Auto KPIs' `current` is system-owned.** A manual write is possible via
  PATCH but the next cron refresh overwrites it (UI already blocks this — keep it).

So: full editability is safe to grant **except** that `metric_key` needs
guardrails, not a free-text field.

## 3. Proposal

### Phase A — complete field-level CRUD (backend + UI, no migrations)

Routes (each ~5-line whitelist additions, same org-scoped validation idiom):
1. `goals/[id]` PATCH: accept `sort_order` (int).
2. `initiatives/[id]` PATCH: accept `sort_order` (int) and `goal_id`
   (UUID, re-validated in-org — same check as the create route).
3. `kpis/[id]` PATCH: accept `goal_id` / `objective_id` (validated in-org,
   preserving the at-least-one attach invariant: reject a patch that would
   null both).
4. `initiatives` POST already takes `description` — no route change needed there.

UI (`PlanControls.tsx`, reusing existing idioms):
5. **Reorder** — ↑/↓ controls on objective and goal cards and initiative rows
   (swap `sort_order` with the neighbor; drag-and-drop is not worth the
   dependency for lists this size). Order KPI reads by `created_at` today —
   leave as-is or add later if asked.
6. **Move** — a "move to goal…" dropdown on KPI rows and initiative rows,
   mirroring the goal→objective dropdown added in #293.
7. **Objective-level measures** — render KPIs with `objective_id` and no
   `goal_id` in a "Measures" strip on the objective card, and let `NewKpiForm`
   take `objectiveId` as an alternative to `goalId`. This closes the blind
   spot in §1c.
8. **KPI details drawer (⋯)** — add `baseline_date`, a manual↔auto toggle, and
   a metric **picker** (registry options from `/api/admin/plan/kpis/metrics`)
   instead of any free-text `metric_key` entry.
9. **Initiatives** — inline-edit `description`; a small status cycler
   (todo → in progress → done) instead of the binary checkbox.
10. **Seed hardening** — only upsert foundation fields that are currently
    empty (or skip the upsert when a foundation row exists); include
    `proof_points` in the seed.

### Phase B — guardrails for the `metric_key` contract

1. `metric_key` becomes picker-only in the UI (Phase A #8) so users can't
   typo a key; clearing / rebinding is explicit.
2. **"Wired" badge**: KPI rows whose `metric_key` is one of the narrative keys
   (or `floor_source_*`) get a small "wired to Narrative" marker, and delete /
   re-key asks for confirmation naming what will break. Export the key list
   from `lib/admin/strategy/narrative.ts` (single source) instead of
   duplicating it.
3. **Readiness check**: a new blocker/advisory in `readiness.ts` — "Narrative
   wiring intact" — that lists any missing/unbound narrative keys with a
   `fixHref` to the plan. Today the failure is silent blanks; this makes it a
   named, fixable check like everything else.
4. KPI delete confirmation mentions snapshot history loss when snapshots exist.

### Phase C — de-hardcode people and counts

1. Derive `PEOPLE` (owners.ts) and the scorecard's `OWNER_ORDER` from the org's
   admin users / members instead of the hardcoded remi/shannon list, so new
   owners resolve, sort, and match the "Mine" lens without a code change.
2. `MovementHow`: derive the "Eight doors" count from the active angle list.
3. Optional, low priority: `plan_reviews` PATCH (notes, next_review_at) +
   DELETE, gated on `org.manage`, so a logged review can be corrected; keep
   `conducted_by` / `conducted_at` immutable.
4. Not proposed: making the readiness check set or the Strategy Room fallback
   copy database-driven — the checks are a linter by design, and the fallbacks
   only render on DB failure. Cheap alternative for the fallbacks: a comment
   pointing at the seeding migration as the source of truth.

### Phase D — tests (there are currently none for the plan module)

1. Route-level unit tests for the new PATCH whitelists (reorder, re-parent,
   attach-invariant rejection, cross-org parent rejection).
2. A **wiring test**: assert every key in the narrative `METRIC` map and
   `FLOOR_SOURCE_PREFIX` usage exists in `PLAN_METRIC_META` / the registry —
   so the contract in §2 can't silently drift in code either.
3. Seed idempotency test: a seeded-then-edited foundation survives a re-seed.

### Sequencing and size

Phase A is one PR (routes + PlanControls + seed), the bulk of the ask.
Phase B is a small follow-up PR and is what makes "everything editable" *safe*.
Phases C and D are independent and can trail. No migrations anywhere; RLS and
audit logging already cover every write path.
