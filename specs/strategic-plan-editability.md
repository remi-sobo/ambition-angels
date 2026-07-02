# Strategic Plan Editability — Recon + Proposal

**Goal:** the whole strategic plan on BloomOS — foundation, objectives, goals, initiatives, KPIs — fully editable, safely.

**Headline finding:** the plan is already almost entirely DB-backed and editable. No plan *content* is hardcoded in the frontend; every entity has create/update/delete API routes gated on `org.manage` with audit logging, and `PlanControls.tsx` provides inline editing for most fields. What's missing is a specific set of CRUD gaps (reordering, re-parenting, metric rebinding), edit affordances in a few surfaces, and guardrails around the parts where an edit can silently break downstream consumers.

---

## 1. Current state (recon summary)

### Backend

**Tables** (all org-scoped, RLS read=`reports.read` / write=`org.manage`, `updated_at` triggers):

| Table | Content | Notes |
|---|---|---|
| `plan_foundation` | mission, vision, values, behaviors, proof_points | one row/org |
| `plan_objectives` | title, three_year_statement, owner, status(+override), sort_order | |
| `plan_goals` | title, description, owner, target_date, status(+override), sort_order, objective_id | objective FK `ON DELETE SET NULL` |
| `plan_initiatives` | title, description, owner, status (`todo/in_progress/done`), sort_order, goal_id | goal FK `ON DELETE CASCADE` |
| `plan_kpis` | title, unit, target, baseline(+date), current, owner, cadence, source (`auto/manual`), metric_key, status | attaches to goal OR objective, both FKs `CASCADE` |
| `plan_kpi_snapshots` | per-KPI daily value history (sparklines) | `CASCADE` on KPI delete |
| `plan_reviews` | review ritual log; latest `next_review_at` drives nudges | POST-only today |

**API routes** (`app/api/admin/plan/*`) — what each entity supports today:

| Entity | Create | Rename | Re-parent | Reorder | Delete | Other editable |
|---|---|---|---|---|---|---|
| Foundation | PUT upsert | — | — | — | ✗ | all fields |
| Objective | ✓ | ✓ | n/a | ✓ (API only, no UI) | ✓ (hard) | statement, owner, status override |
| Goal | ✓ | ✓ | ✓ (`objective_id`) | ✗ | ✓ (hard) | description, owner, target_date, status override |
| Initiative | ✓ | ✓ | ✗ | ✗ | ✓ (hard) | description, owner, status |
| KPI | ✓ | ✓ | ✗ | ✗ | ✓ (hard) | target, baseline(+date), current, unit, owner, cadence, status, source, metric_key (API only — no UI) |
| Review | ✓ | — | — | — | ✗ | notes, next_review_at at create only |

Every write route: `getOrgContext()` + `ctxHasPermission("org.manage")`, service-role client manually scoped by `org_id`, `audit()` record with before/after. Reed only *proposes* (inert `reed_plan_proposals`); a human accept (also `org.manage`-gated) applies — and proposals can only **create** elements, never edit/delete.

**KPI values:** `source='auto'` KPIs are computed by `PLAN_METRICS` in `lib/admin/plan/metrics.ts:33` (10 metric_keys, money math shared with the narrative via `lib/admin/strategy/money.ts`), refreshed by button + daily/weekly crons; each refresh and each manual `current` edit upserts a `plan_kpi_snapshots` row. `source='manual'` KPIs are hand-entered (inline on scorecard and plan).

### Frontend

All pages are force-dynamic server components reading live from Supabase — nothing cached, edits show on next load. Editing lives in `app/admin/strategic-plan/_components/PlanControls.tsx` (`EditableText` click-to-edit idiom + form panels). Already editable in the UI: foundation (full form), objective title/owner/statement/override/delete, goal title/owner/description/date/**re-parent**/override/delete, initiatives add/edit/status/delete, KPI current/target/baseline/status/unit/owner/cadence/title/delete, new-KPI (manual or auto-bound via metric picker), setup wizard (gap-closing quick-adds), scorecard inline manual values, review completion.

Hardcoded plan *content* exists in exactly two places: the one-time seed route (`app/api/admin/plan/seed/route.ts:27-181`) and a narrative fallback proof-point list shown only when `plan_foundation.proof_points` is empty (`MovementPlan.tsx:88-94`). Everything else hardcoded is labels/enums, not content.

### Downstream consumers (blast radius of edits)

- **Structure-resilient:** briefing, glance, overview rollup, scorecard, review page, people page — all walk the tree dynamically, no fixed objective count, worst-leaf-wins health with override support. Renaming/adding/removing elements is safe here.
- **metric_key-coupled (fragile):** `lib/admin/strategy/narrative.ts:39-51` reads `dollars_raised_fy26`, `dollars_ceiling_fy26`, `cash_runway_months`, `corporate_raised`, `aig_multiyear_commitments`, and the `floor_source_%` prefix **by key**. Renaming or deleting these keys silently degrades the funder narrative and flips the readiness `floor_set` blocker. `provenance.ts:21-40` also keys ~17 manual-source labels by metric_key.
- **Unvalidated metric_key:** POST/PATCH accept any ≤80-char string. A `source='auto'` KPI with a key not in `PLAN_METRICS` is silently skipped on every refresh (`metrics.ts:181`) — it looks live but never updates.
- **Cascade deletes are lossy:** deleting a KPI wipes its snapshot history; deleting a goal cascades initiatives + KPIs; deleting an objective cascades its direct KPIs (goals survive, unparented); deleting an initiative nulls `ops_projects.initiative_id` links. All hard deletes, no undo beyond the audit log.
- **Two divergent hardcoded plans:** the TS seed route holds an *older* 2026 OGSM; `supabase/migrations/2026_ogsm_reseed.MANUAL.sql` holds the current one (destructive delete+reinsert, bypasses the audit log). Neither is the editing path going forward.
- **Not affected:** the public `/strategy` room (reads `strategy_angles`/`strategy_room_meta`, already editable in Fundraising → Strategy) and the legacy `kpi_settings`/`kpi_snapshots` registry are separate systems.

---

## 2. Gaps to close

**Backend**
1. Goals and initiatives have no `sort_order` handling in POST or PATCH (objectives do, but only via API).
2. Initiatives can't be re-parented (`goal_id` not PATCHable); KPIs can't be re-parented (`goal_id`/`objective_id` not PATCHable).
3. `metric_key` is free text — no validation against `PLAN_METRICS` for auto KPIs.
4. Reviews are POST-only — a typo'd note or wrong `next_review_at` can't be corrected.
5. Deletes are unguarded hard deletes with silent cascades.

**Frontend**
6. No reorder UI anywhere (even for objectives, where the API exists).
7. No re-parent UI for initiatives or KPIs.
8. An existing KPI's metric binding (`source` + `metric_key`) can't be changed in the UI — you can't rewire a manual KPI to live data or fix a mis-bound one without delete/recreate (losing history).
9. The editable tree only renders in the Area/Mine lenses; the Org lens is display-only with no edit affordance.
10. No warning when renaming/deleting a KPI whose metric_key the narrative depends on.
11. Scorecard `OWNER_ORDER = ["Remi","Shannon"]` hardcoded (`scorecard/page.tsx:13`).

---

## 3. Proposal

### Phase 1 — Complete the CRUD surface (backend, ~small)

- **Reorder:** accept `sort_order` (integer) in POST + PATCH for goals and initiatives, mirroring the objectives handler. No new tables; columns already exist with defaults.
- **Re-parent:** PATCH `goal_id` on initiatives and `goal_id`/`objective_id` on KPIs. Validate the new parent exists in the caller's org (same pattern as initiative-create's goal check); for KPIs enforce the attach constraint (at least one parent) and, when moving to a goal, derive/clear `objective_id` consistently with how Reed's `applyProposal` does it.
- **Reviews:** add PATCH (notes, next_review_at) + DELETE on `plan_reviews/[id]`, `org.manage`, audited.
- **metric_key validation:** on POST/PATCH, if `source='auto'`, require `metric_key ∈ PLAN_METRICS` (export the key list; `metricCatalog.ts` already mirrors it) — reject otherwise with a clear error. Manual KPIs keep free-text keys (they're used for provenance labels and the `floor_source_` convention).
- All new writes follow the existing pattern: `org.manage` gate, org-scoped service-role queries, `audit()` before/after.

### Phase 2 — Edit everything in the UI (~medium)

- **Reorder controls:** up/down buttons on `ObjectiveCard`, `GoalCard`, and initiative rows (swap `sort_order` with the neighbor, `router.refresh()`). Matches the existing idiom; drag-and-drop is not worth a new dependency here.
- **Move controls:** a parent `<select>` on initiatives (target goal) and KPIs (target goal/objective), reusing the exact pattern `GoalCard` already has for re-parenting to an objective.
- **Metric rebinding on `KpiRow`:** an "Edit source" affordance exposing `source` (manual/auto) and, for auto, the metric picker already built for `NewKpiForm` (`GET /api/admin/plan/kpis/metrics`). This closes the delete-and-recreate hole and preserves snapshot history.
- **Org lens edit path:** keep the Org lens as the health overview, but add an explicit "Edit plan" affordance per objective that deep-links into the Area lens (or objective detail) where the editable tree lives. Cheaper and cleaner than duplicating edit controls in the glance view.
- **Guarded deletes:** replace bare `confirm()` with a dialog that states the cascade — child goal/initiative/KPI counts, snapshot-history loss, and linked `ops_projects` (fetch counts via a small `GET .../delete-impact` or return them from a dry-run param). One shared component for all four entities.

### Phase 3 — Safety rails for the fragile edges (~small-medium)

- **Protected-key warnings:** centralize the narrative-critical keys (the `METRIC` map in `narrative.ts:39-45` + `floor_source_` prefix) in one exported constant; when the UI edits/deletes a KPI carrying one of these keys, show a specific warning ("this measure feeds the funder narrative floor/ceiling — renaming its key will blank that number"). Server-side, log a distinct audit action for protected-key changes.
- **Readiness as the tripwire:** the readiness panel already blocks presenting when the floor decomposition breaks (`readiness.ts:76-91`); after edits to floor/floor-source KPIs, surface a "check readiness" hint so breakage is caught immediately rather than in front of a funder.
- **Undo story:** deletes stay hard (audit log already captures before-state), but add a one-click **"Snapshot plan"** action that dumps the full OGSM tree to a `plan_versions` (org_id, captured_at, tree jsonb) row, plus an automatic snapshot before any delete of an objective or goal. Restore can start as "view JSON / manual re-entry" and grow into one-click restore later. This is much cheaper than row-level versioning and covers the real risk (fat-fingered subtree deletion).

### Phase 4 — De-hardcode the leftovers (~small, optional)

- Scorecard `OWNER_ORDER`: derive section order from the data (e.g. owners sorted by KPI count, or an org-level setting) instead of `["Remi","Shannon"]`.
- Retire the stale OGSM content in the seed route: keep the foundation upsert, but either update the tree to match the current plan or replace the seed with "foundation + empty plan + setup wizard" now that the wizard exists. Two divergent hardcoded plans (TS seed vs `2026_ogsm_reseed.MANUAL.sql`) is a trap for the next tenant.
- Initiative status vocabulary (`todo/in_progress/done` vs everyone else's `not_started/…/done`) is a known quirk; leave it — several consumers map it already and unifying buys little.

### Explicitly out of scope

- Reed proposal *edits* (proposals stay create-only; humans edit directly once Phase 1–2 lands).
- The public `/strategy` room and fundraising `strategy_angles` (already editable, separate system).
- The legacy `kpi_settings` registry (separate system; worth a later look at its weaker `isAuthed()`-only PATCH gate, but unrelated to the plan).

### Suggested sequencing

Phases 1+2 together are the user-visible deliverable ("everything editable") and can ship as one PR each or one combined PR: 1 is a handful of route changes with tests, 2 is mostly composition of existing components. Phase 3 should land before heavy editing starts in earnest — the protected-key warning is the single highest-value guardrail. Phase 4 is cleanup, any time.
